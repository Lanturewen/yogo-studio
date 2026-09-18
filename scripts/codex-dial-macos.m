#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <signal.h>
#include <unistd.h>

static volatile sig_atomic_t exiting=0;
static CFMachPortRef eventTap=NULL;
static int decreaseKey=27; // ANSI -
static int increaseKey=24; // ANSI =

static void emit(NSString *type,NSString *detail) {
 NSDictionary *message=@{@"protocol":@1,@"type":type,@"detail":detail?:@""};
 NSData *json=[NSJSONSerialization dataWithJSONObject:message options:0 error:NULL];
 if(json){fwrite(json.bytes,1,json.length,stdout);putchar('\n');fflush(stdout);}
}
static BOOL readString(AXUIElementRef element,CFStringRef attribute,NSString **out) {
 CFTypeRef value=NULL;if(AXUIElementCopyAttributeValue(element,attribute,&value)!=kAXErrorSuccess||!value)return NO;
 BOOL ok=CFGetTypeID(value)==CFStringGetTypeID();if(ok&&out)*out=[(__bridge NSString *)value copy];CFRelease(value);return ok;
}
static BOOL readFrame(AXUIElementRef element,CGPoint *position,CGSize *size) {
 CFTypeRef pValue=NULL,sValue=NULL;BOOL ok=AXUIElementCopyAttributeValue(element,kAXPositionAttribute,&pValue)==kAXErrorSuccess&&pValue&&AXValueGetValue(pValue,kAXValueCGPointType,position)&&AXUIElementCopyAttributeValue(element,kAXSizeAttribute,&sValue)==kAXErrorSuccess&&sValue&&AXValueGetValue(sValue,kAXValueCGSizeType,size);
 if(pValue)CFRelease(pValue);if(sValue)CFRelease(sValue);return ok;
}
static void findComposer(AXUIElementRef element,int depth,AXUIElementRef *best,CGFloat *bestY) {
 if(depth>48)return;NSString *role=nil;readString(element,kAXRoleAttribute,&role);
 if([role isEqualToString:(__bridge NSString *)kAXTextAreaRole]){CGPoint p={0};CGSize s={0};if(readFrame(element,&p,&s)&&s.width>=200&&s.height>0&&p.y>=*bestY){if(*best)CFRelease(*best);*best=(AXUIElementRef)CFRetain(element);*bestY=p.y;}}
 CFTypeRef children=NULL;if(AXUIElementCopyAttributeValue(element,kAXChildrenAttribute,&children)==kAXErrorSuccess&&children&&CFGetTypeID(children)==CFArrayGetTypeID()){CFArrayRef array=(CFArrayRef)children;for(CFIndex i=0;i<CFArrayGetCount(array);i++)findComposer((AXUIElementRef)CFArrayGetValueAtIndex(array,i),depth+1,best,bestY);}if(children)CFRelease(children);
}
static BOOL focusComposer(pid_t pid) {
 AXUIElementRef app=AXUIElementCreateApplication(pid),composer=NULL;CGFloat bestY=-1;findComposer(app,0,&composer,&bestY);BOOL ok=composer&&AXUIElementSetAttributeValue(composer,kAXFocusedAttribute,kCFBooleanTrue)==kAXErrorSuccess;if(composer)CFRelease(composer);CFRelease(app);return ok;
}
static void postShortcut(CGKeyCode code) {CGEventFlags flags=kCGEventFlagMaskControl|kCGEventFlagMaskAlternate|kCGEventFlagMaskShift;CGEventRef down=CGEventCreateKeyboardEvent(NULL,code,true),up=CGEventCreateKeyboardEvent(NULL,code,false);CGEventSetFlags(down,flags);CGEventSetFlags(up,flags);CGEventPost(kCGHIDEventTap,down);CGEventPost(kCGHIDEventTap,up);CFRelease(down);CFRelease(up);}
static void adjustReasoning(BOOL increase) {
 NSRunningApplication *front=NSWorkspace.sharedWorkspace.frontmostApplication;
 if(![front.bundleIdentifier isEqualToString:@"com.openai.codex"])return;
 BOOL focused=focusComposer(front.processIdentifier);
 CGKeyCode code=increase?increaseKey:decreaseKey;NSString *detail=increase?@"提高":@"降低";
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(focused?15:0)*NSEC_PER_MSEC),dispatch_get_main_queue(),^{postShortcut(code);emit(@"adjust",detail);});
}
static CGEventRef onKey(CGEventTapProxy proxy,CGEventType type,CGEventRef event,void *context) {
 (void)proxy;(void)context;if(type==kCGEventTapDisabledByTimeout||type==kCGEventTapDisabledByUserInput){CGEventTapEnable(eventTap,true);return event;}if(type!=kCGEventKeyDown)return event;
 CGEventFlags flags=CGEventGetFlags(event)&(kCGEventFlagMaskCommand|kCGEventFlagMaskControl|kCGEventFlagMaskAlternate|kCGEventFlagMaskShift);if(flags)return event;
 CGKeyCode code=(CGKeyCode)CGEventGetIntegerValueField(event,kCGKeyboardEventKeycode);if(code!=decreaseKey&&code!=increaseKey)return event;
 NSRunningApplication *front=NSWorkspace.sharedWorkspace.frontmostApplication;if(![front.bundleIdentifier isEqualToString:@"com.openai.codex"])return event;
 adjustReasoning(code==increaseKey);return NULL;
}
static void stop(int sig){(void)sig;exiting=1;CFRunLoopStop(CFRunLoopGetMain());}
int main(int argc,char **argv){@autoreleasepool{
 setvbuf(stdout,NULL,_IOLBF,0);signal(SIGTERM,stop);signal(SIGINT,stop);signal(SIGPIPE,stop);
 int oneShot=0;for(int i=1;i<argc;i++){if(!strcmp(argv[i],"--decrease-keycode")&&i+1<argc)decreaseKey=atoi(argv[++i]);else if(!strcmp(argv[i],"--increase-keycode")&&i+1<argc)increaseKey=atoi(argv[++i]);else if(!strcmp(argv[i],"--adjust")&&i+1<argc){NSString *value=@(argv[++i]);oneShot=[value isEqualToString:@"increase"]?1:[value isEqualToString:@"decrease"]?-1:0;if(!oneShot)return 2;}else return 2;}
 // Background retries must never reopen the system authorization dialog.
 if(!AXIsProcessTrusted()){emit(@"error",@"需要辅助功能权限来聚焦 Codex 输入框");return 3;}
 if(oneShot){adjustReasoning(oneShot>0);return 0;}
 CGEventMask mask=CGEventMaskBit(kCGEventKeyDown);eventTap=CGEventTapCreate(kCGSessionEventTap,kCGHeadInsertEventTap,kCGEventTapOptionDefault,mask,onKey,NULL);
 if(!eventTap){emit(@"error",@"无法监听波轮按键；请允许输入监控权限");return 4;}CFRunLoopSourceRef source=CFMachPortCreateRunLoopSource(NULL,eventTap,0);CFRunLoopAddSource(CFRunLoopGetMain(),source,kCFRunLoopCommonModes);CGEventTapEnable(eventTap,true);
 emit(@"ready",@"- / = → Codex 原生命令");CFRunLoopRun();CFRunLoopRemoveSource(CFRunLoopGetMain(),source,kCFRunLoopCommonModes);CFRelease(source);CFRelease(eventTap);eventTap=NULL;return exiting?0:1;
}}
