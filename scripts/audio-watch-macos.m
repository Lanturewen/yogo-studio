// Observe target input activity; meter PCM in memory only while the target captures.
#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>
#import <CoreAudio/CoreAudio.h>
#include <libproc.h>
#include <stdatomic.h>
#include <signal.h>
#include <math.h>
#include <unistd.h>

static volatile sig_atomic_t exiting=0;
static AudioQueueRef queue=NULL;
static _Atomic(float) rms=0;
static _Atomic(bool) capturing=false;
static _Atomic(bool) requesting=false;
static _Atomic(double) lastSample=0;
static double retryAt=0;
static void interrupt(int sig){(void)sig;exiting=1;}
static OSStatus read_value(AudioObjectID object, AudioObjectPropertySelector selector, UInt32 *value) {
 AudioObjectPropertyAddress a={selector,kAudioObjectPropertyScopeGlobal,kAudioObjectPropertyElementMain};
 UInt32 size=sizeof(*value);return AudioObjectGetPropertyData(object,&a,0,NULL,&size,value);
}
static void input(void *ctx,AudioQueueRef q,AudioQueueBufferRef b,const AudioTimeStamp *time,UInt32 packets,const AudioStreamPacketDescription *desc){
 (void)ctx;(void)time;(void)packets;(void)desc;
 if(!atomic_load(&capturing))return;
 const int16_t *samples=b->mAudioData;UInt32 count=b->mAudioDataByteSize/sizeof(int16_t);double sum=0;
 for(UInt32 i=0;i<count;i++){double n=samples[i]/32768.0;sum+=n*n;}
 atomic_store(&rms,count?(float)sqrt(sum/count):0);
 atomic_store(&lastSample,CFAbsoluteTimeGetCurrent());
 AudioQueueEnqueueBuffer(q,b,0,NULL);
}
static void stop_meter(void){
 atomic_store(&capturing,false);
 if(queue){AudioQueueStop(queue,true);AudioQueueDispose(queue,true);queue=NULL;}
 atomic_store(&rms,0);atomic_store(&lastSample,0);
}
static NSString *start_meter(void){
 AVAuthorizationStatus auth=[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
 if(auth==AVAuthorizationStatusNotDetermined){
  if(!atomic_exchange(&requesting,true)){
   [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted){(void)granted;atomic_store(&requesting,false);}];
  }
  return @"请允许麦克风访问，以显示真实音量波形";
 }
 if(auth!=AVAuthorizationStatusAuthorized)return @"麦克风权限未开启，请在系统设置的隐私与安全性中允许当前启动应用访问麦克风";
 if(queue)return nil;
 if(CFAbsoluteTimeGetCurrent()<retryAt)return @"音量采集暂不可用，正在重试";
 AudioStreamBasicDescription format={.mSampleRate=16000,.mFormatID=kAudioFormatLinearPCM,.mFormatFlags=kLinearPCMFormatFlagIsSignedInteger|kLinearPCMFormatFlagIsPacked,.mBytesPerPacket=2,.mFramesPerPacket=1,.mBytesPerFrame=2,.mChannelsPerFrame=1,.mBitsPerChannel=16};
 OSStatus err=AudioQueueNewInput(&format,input,NULL,NULL,NULL,0,&queue);
 if(!err){
  for(int i=0;i<3&&!err;i++){
   AudioQueueBufferRef buffer=NULL;err=AudioQueueAllocateBuffer(queue,1600,&buffer);
   if(!err)err=AudioQueueEnqueueBuffer(queue,buffer,0,NULL);
  }
 }
 if(!err){atomic_store(&capturing,true);err=AudioQueueStart(queue,NULL);}
 if(err){stop_meter();retryAt=CFAbsoluteTimeGetCurrent()+5;return [NSString stringWithFormat:@"麦克风音量采集失败 (%d)",(int)err];}
 return nil;
}
static BOOL matches(NSString *file,NSArray *targets){
 for(NSDictionary *target in targets){
  if([[file lastPathComponent] caseInsensitiveCompare:target[@"name"]]!=NSOrderedSame)continue;
  NSString *part=target[@"path"];
  if(!part.length||[file rangeOfString:part options:NSCaseInsensitiveSearch].location!=NSNotFound)return YES;
 }
 return NO;
}
int main(int argc,char **argv){@autoreleasepool{
 setvbuf(stdout,NULL,_IOLBF,0);signal(SIGTERM,interrupt);signal(SIGINT,interrupt);signal(SIGPIPE,interrupt);
 NSMutableArray *targets=[NSMutableArray array];BOOL once=NO;
 for(int i=1;i<argc;i++){
  if(!strcmp(argv[i],"--once"))once=YES;
  else if(!strcmp(argv[i],"--target")&&i+2<argc){NSString *name=@(argv[++i]);NSString *path=@(argv[++i]);[targets addObject:@{@"name":name,@"path":path}];}
 }
 do{@autoreleasepool{
  NSMutableArray *sessions=[NSMutableArray array];NSString *error=nil,*meterError=nil;BOOL active=NO;
  AudioObjectPropertyAddress a={kAudioHardwarePropertyProcessObjectList,kAudioObjectPropertyScopeGlobal,kAudioObjectPropertyElementMain};
  UInt32 size=0;OSStatus err=AudioObjectGetPropertyDataSize(kAudioObjectSystemObject,&a,0,NULL,&size);
  AudioObjectID *ids=calloc(size?size:1,1);
  if(!ids)break;
  if(!err&&size)err=AudioObjectGetPropertyData(kAudioObjectSystemObject,&a,0,NULL,&size,ids);
  if(err)error=[NSString stringWithFormat:@"Core Audio process inspection unavailable (%d); requires macOS 14.2+",(int)err];
  else for(UInt32 i=0;i<size/sizeof(*ids);i++){
   UInt32 pid=0,running=0;if(read_value(ids[i],kAudioProcessPropertyPID,&pid))continue;
   char file[PROC_PIDPATHINFO_MAXSIZE]={0};if(proc_pidpath((int)pid,file,sizeof(file))<=0)continue;
   NSString *path=@(file);if(!matches(path,targets))continue;
   if(read_value(ids[i],kAudioProcessPropertyIsRunningInput,&running))continue;
   active|=running!=0;
   [sessions addObject:[@{@"active":(running?@YES:@NO),@"processName":path.lastPathComponent,@"executablePath":path,@"level":[NSNull null],@"levelKind":@"unavailable"} mutableCopy]];
  }
  free(ids);
  // Diagnostic --once never opens a microphone or requests permission.
  if(active&&!once)meterError=start_meter();else{stop_meter();retryAt=0;}
  double sampleAge=CFAbsoluteTimeGetCurrent()-atomic_load(&lastSample);
  if(queue&&sampleAge<0.5){
   for(NSMutableDictionary *session in sessions)if([session[@"active"] boolValue]){session[@"level"]=@(atomic_load(&rms));session[@"levelKind"]=@"microphone-rms";}
  }
  NSMutableDictionary *message=[@{@"protocol":@1,@"sessions":sessions,@"devices":[NSNull null],@"meterActive":(queue?@YES:@NO)} mutableCopy];
  if(error)message[@"error"]=error;if(meterError)message[@"meterError"]=meterError;
  NSData *json=[NSJSONSerialization dataWithJSONObject:message options:0 error:NULL];
  if(json){fwrite(json.bytes,1,json.length,stdout);putchar('\n');}
  if(once)break;
  // 20 Hz during capture, 5 Hz idle. Audio buffers are 50ms, 4.8KB total.
  CFRunLoopRunInMode(kCFRunLoopDefaultMode,active?0.05:0.2,false);
 }}while(!exiting&&getppid()!=1);
 stop_meter();return 0;
}}
