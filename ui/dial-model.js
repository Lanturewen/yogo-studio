import * as THREE from 'three';
export function makeDial(){
 const group=new THREE.Group(),knob=new THREE.Group();group.add(knob);
 const metal=new THREE.MeshStandardMaterial({color:'#cf8c2d',metalness:.65,roughness:.32});
 const face=new THREE.MeshStandardMaterial({color:'#dc9b38',metalness:.35,roughness:.42});
 const groove=new THREE.MeshStandardMaterial({color:'#a16a21',metalness:.55,roughness:.48});
 const cylinder=(r,h,material,y,parent=knob)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,64),material);mesh.position.y=y;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 cylinder(.46,.5,metal,.28);cylinder(.448,.035,face,.548);
 for(let i=0;i<28;i++){const a=i/28*Math.PI*2,mesh=new THREE.Mesh(new THREE.BoxGeometry(.038,.32,.02),groove);mesh.position.set(Math.sin(a)*.455,.28,Math.cos(a)*.455);mesh.rotation.y=a;knob.add(mesh);}
 const marker=cylinder(.04,.008,new THREE.MeshStandardMaterial({color:'#fff1ce',roughness:.6}),.572);marker.position.z=-.29;
 const ring=new THREE.Mesh(new THREE.RingGeometry(.99,1.01,96),new THREE.MeshStandardMaterial({color:'#f1ead8',metalness:.5,roughness:.45,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.012;group.add(ring);
 group.userData.knob=knob;return group;
}
export function showDial(host,environment){
 if(!host)return;
 try{
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.append(renderer.domElement);
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
 const scene=new THREE.Scene();scene.environment=environment;scene.environmentIntensity=.65;
 scene.add(new THREE.HemisphereLight(0xffffff,0x65543c,1.4));const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(-3,5,4);scene.add(key);
 const model=makeDial();scene.add(model);
 const plate=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.3,.12,96),new THREE.MeshStandardMaterial({color:'#c8c3b4',metalness:.45,roughness:.42}));plate.position.y=-.075;scene.add(plate);
 const camera=new THREE.PerspectiveCamera(32,1,.1,30);camera.position.set(2.7,3.6,4.2);camera.lookAt(0,.1,0);
 let target=0,current=0,pointer=null,downX=0,pressed=false,visible=false,dirty=true;
 new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}}).observe(host);
 new IntersectionObserver(e=>{visible=e[0].isIntersecting;dirty=true;}).observe(host);
 host.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer=e.clientX;downX=e.clientX;host.setPointerCapture(e.pointerId);});
 host.addEventListener('pointermove',e=>{if(pointer===null)return;target+=(e.clientX-pointer)*.02;pointer=e.clientX;dirty=true;});
 host.addEventListener('pointerup',e=>{if(pointer!==null&&Math.abs(e.clientX-downX)<5){pressed=true;setTimeout(()=>{pressed=false;dirty=true;},180);}pointer=null;dirty=true;});
 host.addEventListener('pointercancel',()=>{pointer=null;pressed=false;});host.addEventListener('lostpointercapture',()=>{pointer=null;});
 host.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Enter',' '].includes(e.key)){e.preventDefault();if(e.key.startsWith('Arrow'))target+=e.key==='ArrowLeft'?-.2:.2;else{pressed=true;setTimeout(()=>{pressed=false;dirty=true;},180);}dirty=true;}});
 function animate(){requestAnimationFrame(animate);if(!visible||document.hidden)return;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('reduce-motion');const next=reduced?target:current+(target-current)*.2;if(Math.abs(next-current)>.0001){current=next;dirty=true;}model.userData.knob.rotation.y=current;model.userData.knob.position.y=pressed?-.085:0;if(dirty){renderer.render(scene,camera);dirty=false;}}
 host.dataset.ready='true';animate();
 }catch{host.textContent='3D 波轮暂不可用';}
}
