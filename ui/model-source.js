import {makeDial,showDial} from './dial-model.js';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import CameraControls from 'camera-controls';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

// Proportions and visible features follow the ATK front reference and underside photos.
// This is a visual reconstruction, not a measured CAD model.
const host=document.getElementById('keyboard-viewer');
try { init(); } catch(error) {
  host.classList.add('viewer-failed');
  document.getElementById('viewer-fallback').hidden=false;
  document.getElementById('viewer-hint').textContent='3D 暂不可用';
  console.error('Keyboard renderer:',error);
}
function init(){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
 host.append(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
 const scene=new THREE.Scene(),model=new THREE.Group();scene.add(model);
 const camera=new THREE.OrthographicCamera(-20,20,12,-12,.1,200);camera.position.set(0,29,32);camera.lookAt(0,0,0);
 CameraControls.install({THREE});
 const controls=new CameraControls(camera,host);
 controls.smoothTime=.24;controls.draggingSmoothTime=.065;
 controls.azimuthRotateSpeed=.65;controls.polarRotateSpeed=.5;
 controls.minPolarAngle=0;controls.maxPolarAngle=Math.PI;
 controls.mouseButtons.right=controls.mouseButtons.middle=controls.mouseButtons.wheel=CameraControls.ACTION.NONE;
 controls.touches.two=controls.touches.three=CameraControls.ACTION.NONE;
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
 const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;scene.environmentIntensity=.4;room.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xffffff,0xc5bfae,.65));
 const light=new THREE.DirectionalLight(0xfff6df,1.6);light.position.set(-12,28,14);light.castShadow=true;
 light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-24,right:24,top:20,bottom:-20,near:1,far:80});light.shadow.bias=-.0003;light.shadow.normalBias=.035;scene.add(light);
 const rim=new THREE.DirectionalLight(0xe0edff,1.1);rim.position.set(15,15,-17);scene.add(rim);
 const mat=(color,metalness=0,roughness=.5)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
 const shell=mat('#c6c1b2',.25,.52),edge=mat('#a59e8d',.55,.4),keyMat=mat('#cfc8b8',0,.7),orange=mat('#d68a24',.35,.34),grey=mat('#9c9d98',.35,.4),dark=mat('#33342f',.25,.5);
 const capRim=mat('#e2ddcf',0,.62),capFace=mat('#c9c4b7',0,.76);
 const rubber=mat('#b27729',0,.85);
 const box=(w,h,d,r,material,x,y,z,parent=model)=>{const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,r),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 const cylinder=(radius,height,material,x,y,z,segments=48)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,segments),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;model.add(mesh);return mesh;};
 box(35,1.12,12.8,.22,shell,0,-.25,0);
 box(34.88,.075,12.68,.24,edge,0,-.805,0);
 box(34.78,.12,12.58,.23,shell,0,-.895,0);
 box(30.62,.12,11.72,.18,dark,-1.67,.34,0);
 // Actual 84-key compact ANSI arrangement. Widths are standard key units.
 const rows=[
  ['esc','f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12','pri','ins','del'],
  ['~','1','2','3','4','5','6','7','8','9','0','−','=', ['backspace',2],'home'],
  [['tab',1.5],'Q','W','E','R','T','Y','U','I','O','P','[',']',['\\',1.5],'end'],
  [['caps lock',1.75],'A','S','D','F','G','H','J','K','L',';',"'",['enter',2.25],'pgup'],
  [['shift',2.25],'Z','X','C','V','B','N','M',',','.','/',['shift',1.75],'↑','pgdn'],
  [['ctrl',1.25],['opt',1.25],['cmd',1.25],['',6.25],'cmd','fn','opt','←','↓','→']
 ];
 const keyLights=[];
 function textTexture(text,color='#916523',background=null,w=256,h=128){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
  if(background){ctx.fillStyle=background;ctx.fillRect(0,0,w,h);}ctx.fillStyle=color;ctx.font=`${text.length>7?26:34}px "Segoe UI",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return texture;
 }
 function topDecal(texture,w,d,x,y,z,bottom=false){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.6,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));mesh.rotation.x=bottom?Math.PI/2:-Math.PI/2;mesh.position.set(x,y,z);model.add(mesh);return mesh;}
 function capGeometry(w,d){
  // Concentric rounded-rectangle rings: tapered wall, shoulder, and a shallow concave face.
  const rings=[[w-.12,d-.12,0,.18],[w,d,.12,.22],[w-.02,d-.02,.36,.24],[w-.21,d-.21,.43,.34],[w-.43,d-.43,.36,.38],[w*.30,d*.30,.32,.14]];
  const vertices=[],indices=[],n=64;
  for(const [rw,rd,y,r0] of rings){const r=Math.min(r0,rw/2,rd/2);for(let i=0;i<n;i++){const quadrant=Math.floor(i/16),angle=quadrant*Math.PI/2+(i%16)/16*Math.PI/2;
   const cx=(quadrant===0||quadrant===3?1:-1)*(rw/2-r),cz=(quadrant<2?1:-1)*(rd/2-r);
   vertices.push(cx+Math.cos(angle)*r,y,cz+Math.sin(angle)*r);
  }}
  for(let k=0;k<rings.length-1;k++)for(let i=0;i<n;i++){const j=(i+1)%n,a=k*n+i,b=k*n+j,c=(k+1)*n+i,d=(k+1)*n+j;indices.push(a,c,b,b,c,d);}
  const center=vertices.length/3;vertices.push(0,.32,0);for(let i=0;i<n;i++)indices.push((rings.length-1)*n+i,center,(rings.length-1)*n+(i+1)%n);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);for(let k=0;k<rings.length-1;k++)geometry.addGroup(k*n*6,n*6,k<2?0:k===2?1:2);geometry.addGroup((rings.length-1)*n*6,n*3,2);geometry.computeVertexNormals();return geometry;
 }
 rows.forEach((row,j)=>{let units=0;row.forEach(item=>{const [label,width]=Array.isArray(item)?item:[item,1];const x=-16.86+(units+width/2)*1.9,z=-4.76+j*1.9;units+=width;
   const glowMat=new THREE.MeshBasicMaterial({color:0x000000,toneMapped:false});
   box(width*1.9-.015,.06,1.89,.02,glowMat,x,.435,z);keyLights.push(glowMat);
   const geometry=capGeometry(width*1.9-.16,1.74);
   const cap=new THREE.Mesh(geometry,[keyMat,capRim,capFace]);cap.position.set(x,.49,z);cap.castShadow=true;cap.receiveShadow=true;model.add(cap);
   if(label){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#ac791a';ctx.textAlign='center';ctx.textBaseline='middle';
    const upper={f1:'☼',f2:'☀',f3:'▣',f4:'●',f5:'♩',f6:'♪',f7:'◀',f8:'▶Ⅱ',f9:'▶',f10:'◀',f11:'♪',f12:'♫','1':'!','2':'@','3':'#','4':'$','5':'%','6':'^','7':'&','8':'*','9':'(','0':')','−':'_','=':'+','backspace':'⌫',tab:'⇥',enter:'↵',shift:'↑',ctrl:'⌃',opt:'⌥',cmd:'⌘'}[label];
    ctx.font=(label.length>7?'38':'46')+'px "Segoe UI",sans-serif';ctx.fillText(label,256,upper?164:128);if(upper){ctx.font='32px "Segoe UI",sans-serif';ctx.fillText(upper,256,74);}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;topDecal(texture,Math.min(width*1.65,2.7),1.2,x,.817,z);
   }
 });});
 const dial=makeDial();dial.position.set(15.4,.32,-.82);model.add(dial);
 for(const [z,material] of [[1.68,orange],[3.48,grey]]){box(1.56,.16,1.56,.18,dark,15.4,.365,z);box(1.49,.24,1.49,.2,material,15.4,.49,z);cylinder(.45,.025,material,15.4,.622,z);cylinder(.065,.012,keyMat,15.4,.642,z,20);}
 topDecal(textTexture('YOGO 75','#787466'),2.6,.58,15.37,.326,5.25);
 // Screen frame and four real mounting points surround a textured diffuser.
 box(2.85,.10,2.85,.07,mat('#bead7c',.48,.4),15.4,.385,-4.30);
 for(const x of [14.13,16.67])for(const z of [-5.57,-3.03]){cylinder(.11,.05,edge,x,.466,z,24);cylinder(.06,.012,dark,x,.5,z,16);box(.075,.015,.018,.006,grey,x,.51,z);}
 const screenCanvas=document.createElement('canvas');screenCanvas.width=256;screenCanvas.height=256;const screenCtx=screenCanvas.getContext('2d');
 const screenTexture=new THREE.CanvasTexture(screenCanvas);screenTexture.colorSpace=THREE.SRGBColorSpace;
 const screenMaterial=new THREE.MeshStandardMaterial({map:screenTexture,emissiveMap:screenTexture,emissive:0xffffff,emissiveIntensity:.38,roughness:.53,metalness:.05});
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(2.27,2.27),screenMaterial);screen.rotation.x=-Math.PI/2;screen.position.set(15.4,.45,-4.30);model.add(screen);
 // Bottom: recessed ID plate, polished insert, alternate triangular/circular feet and perimeter screws.
 box(11.4,.04,3.25,.14,mat('#b7b09b',.55,.45),0,-.968,0);
 box(3.1,.035,2.92,.10,mat('#d6d1bf',.95,.18),-3.9,-1.001,0);
 topDecal(textTexture('YOGO 75 PRO','#5c5b51'),5.8,1.0,1.35,-1.003,0,true);
 for(const [x,z,triangle] of [[-15.8,-4.85,true],[15.8,-4.85,false],[-15.8,4.85,false],[15.8,4.85,true]]){
  const pad=cylinder(.57,.18,rubber,x,-1.03,z,triangle?3:48);if(triangle)pad.rotation.y=Math.PI/2;
 }
 for(const x of [-16.8,-5.6,5.6,16.8])for(const z of [-5.96,5.96]){cylinder(.11,.025,dark,x,-.97,z,20);box(.115,.01,.018,.004,grey,x,-.988,z);}
 // Official rear detail: one recessed capsule, mode selector / USB-C / WIN-MAC.
 const rear=new THREE.Group();rear.position.set(-11,-.24,-6.405);model.add(rear);
 box(6.7,.79,.045,.38,edge,0,0,0,rear);box(6.48,.65,.055,.30,dark,0,0,-.03,rear);
 box(1.35,.36,.09,.17,grey,-2.12,0,-.075,rear);box(.65,.48,.13,.23,shell,-2.28,0,-.14,rear);
 box(1.6,.54,.055,.22,edge,0,0,-.08,rear);box(1.43,.39,.06,.17,mat('#121412'),0,0,-.12,rear);box(1.02,.065,.04,.02,grey,0,0,-.165,rear);
 box(.86,.34,.09,.16,grey,2.08,0,-.075,rear);box(.47,.42,.13,.20,shell,1.91,0,-.14,rear);
 const rearLabel=new THREE.Mesh(new THREE.PlaneGeometry(6.25,.23),new THREE.MeshBasicMaterial({map:textTexture('2.4G   USB   BT                 WIN / MAC','#4d4c46',null,1024,64),transparent:true}));rearLabel.rotation.y=Math.PI;rearLabel.position.set(-11,.23,-6.44);model.add(rearLabel);
 let dirty=true,auto=false,lastTime=0,inView=true,disposed=false;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('reduce-motion');
 function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
  renderer.setSize(w,h,false);const aspect=w/h,width=Math.max(40,24*aspect);
  camera.left=-width/2;camera.right=width/2;camera.top=width/aspect/2;camera.bottom=-camera.top;camera.updateProjectionMatrix();dirty=true;
 }
 new ResizeObserver(resize).observe(host);resize();
 new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView)dirty=true;}).observe(host);
 function frameData(pixels,keys){
  screenCtx.fillStyle='#5d5136';screenCtx.fillRect(0,0,256,256);
  screenCtx.save();screenCtx.filter='blur(7px)';screenCtx.globalCompositeOperation='screen';
  pixels.forEach((p,i)=>{const peak=Math.max(...p);if(!peak)return;const x=29+(i%6)*39.6,y=29+Math.floor(i/6)*39.6;const gradient=screenCtx.createRadialGradient(x,y,1,x,y,24);gradient.addColorStop(0,`rgba(${p.join(',')},.98)`);gradient.addColorStop(.4,`rgba(${p.join(',')},.75)`);gradient.addColorStop(1,`rgba(${p.join(',')},0)`);screenCtx.fillStyle=gradient;screenCtx.fillRect(x-26,y-26,52,52);});screenCtx.restore();
  for(let y=0;y<256;y+=8){screenCtx.fillStyle='rgba(255,242,198,.24)';screenCtx.fillRect(0,y,256,2);screenCtx.fillStyle='rgba(20,18,10,.15)';screenCtx.fillRect(0,y+3,256,2);}
  const sheen=screenCtx.createLinearGradient(0,0,256,256);sheen.addColorStop(0,'#ffffff18');sheen.addColorStop(.6,'#ffffff00');screenCtx.fillStyle=sheen;screenCtx.fillRect(0,0,256,256);screenTexture.needsUpdate=true;
  keyLights.forEach((material,i)=>{const p=keys?.[i]||[0,0,0];material.color.setRGB(p[0]/255,p[1]/255,p[2]/255,THREE.SRGBColorSpace);});dirty=true;
 }
 frameData(Array.from({length:36},()=>[0,0,0]));
 function view(kind,transition=true){controls.normalizeRotations();controls.rotateTo(0,kind==='back'?Math.PI:0,transition&&!reduced());dirty=true;}
 function stopAuto(){auto=false;document.getElementById('model-auto').setAttribute('aria-pressed','false');}
 controls.addEventListener('controlstart',()=>{stopAuto();host.classList.add('dragging');});
 controls.addEventListener('controlend',()=>host.classList.remove('dragging'));
 host.addEventListener('dblclick',()=>{stopAuto();view('front');});
 host.addEventListener('keydown',event=>{const directions={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.15],ArrowDown:[0,.15]};if(directions[event.key]){event.preventDefault();stopAuto();controls.rotate(...directions[event.key],!reduced());}else if(event.key==='Home'){event.preventDefault();stopAuto();view('front');}});
 document.querySelectorAll('[data-model-view]').forEach(button=>button.onclick=()=>{stopAuto();view(button.dataset.modelView);});
 document.getElementById('model-auto').onclick=()=>{auto=!auto&&!reduced();document.getElementById('model-auto').setAttribute('aria-pressed',String(auto));dirty=true;};
 function motionPreference(){if(reduced()){stopAuto();controls.stop();}controls.smoothTime=reduced()?0:.24;controls.draggingSmoothTime=reduced()?0:.065;dirty=true;}
 matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',motionPreference);
 new MutationObserver(motionPreference).observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme']});motionPreference();
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();document.getElementById('viewer-fallback').hidden=false;document.getElementById('viewer-hint').textContent='3D 已暂停，请重新打开';disposed=true;});
 function animate(time){if(disposed)return;requestAnimationFrame(animate);const delta=Math.min((time-lastTime)/1000,.25);lastTime=time;if(document.hidden||!inView)return;
  if(auto&&!reduced())controls.rotate(delta*.22,0,false);
  if(controls.update(delta))dirty=true;
  if(dirty){renderer.render(scene,camera);dirty=false;}
 }
 renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
 view('front',false);requestAnimationFrame(animate);showDial(document.getElementById('dial-viewer'),environment.texture);
 window.yogoModel={setFrame:frameData,getViewState:()=>({azimuth:controls.azimuthAngle,polar:controls.polarAngle,projection:camera.projectionMatrix.toArray(),modelScale:model.scale.toArray(),litKeys:keyLights.filter(m=>m.color.r+m.color.g+m.color.b>.02).length})};host.dataset.ready='true';host.dataset.keyCount=String(keyLights.length);
}
