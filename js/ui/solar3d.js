// Visualização 3D da órbita solar. A posição orbital vem do mesmo modelo do jogo;
// escalas dos corpos e texturas são apenas para visualização, não escala física.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLANETS } from '../data/planets.js';
import { AU } from '../data/constants.js';
import { planetState, positionAt } from '../physics/orbit.js';

const TEXTURE_BASE = 'https://www.solarsystemscope.com/textures/download/';
const TEXTURES = {
  mercury: '2k_mercury.jpg',
  venus: '2k_venus_surface.jpg',
  earth: '2k_earth_daymap.jpg',
  mars: '2k_mars.jpg'
};
const SCALE = 8; // 1 UA visualizada como 8 unidades Three.js.

function fallbackTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const palettes = {
    mercury: ['#4b4a49','#b9b1a7','#77716c'],
    venus: ['#7d4b20','#e9bd75','#a46b36'],
    earth: ['#061b46','#2672a9','#5f9f60'],
    mars: ['#54271b','#d17a4b','#9c4931']
  };
  const colors = palettes[kind] || palettes.mars;
  const grad = ctx.createLinearGradient(0,0,0,512);
  grad.addColorStop(0,colors[0]); grad.addColorStop(.5,colors[1]); grad.addColorStop(1,colors[2]);
  ctx.fillStyle=grad;ctx.fillRect(0,0,1024,512);
  for(let i=0;i<220;i++){
    const x=Math.random()*1024,y=Math.random()*512;
    ctx.fillStyle=`rgba(${kind==='earth'?'70,145,90':'35,25,18'},${Math.random()*.25})`;
    ctx.beginPath();ctx.ellipse(x,y,Math.random()*45+5,Math.random()*18+3,Math.random(),0,Math.PI*2);ctx.fill();
  }
  if(kind==='earth'){
    ctx.fillStyle='#49865c';
    for(let i=0;i<35;i++){ctx.beginPath();ctx.ellipse(Math.random()*1024,Math.random()*512,Math.random()*55+8,Math.random()*20+3,Math.random(),0,Math.PI*2);ctx.fill();}
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

export function mountSolar3D(container, initialTime, initialView='sun', missionState=null) {
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x02050c);
  scene.fog=new THREE.FogExp2(0x02050c,.0035);
  const camera=new THREE.PerspectiveCamera(48,1,.1,500);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.055;controls.minDistance=2.5;controls.maxDistance=90;controls.enablePan=true;
  const ambient=new THREE.HemisphereLight(0x91b7e8,0x080910,.32);scene.add(ambient);
  const sunLight=new THREE.PointLight(0xffd7a0,180,0,1.25);sunLight.position.set(0,0,0);scene.add(sunLight);
  const starGeo=new THREE.BufferGeometry(), starData=[];
  for(let i=0;i<2400;i++){
    const radius=65+Math.random()*180,theta=Math.random()*Math.PI*2,phi=Math.acos(2*Math.random()-1);
    starData.push(radius*Math.sin(phi)*Math.cos(theta),radius*Math.cos(phi),radius*Math.sin(phi)*Math.sin(theta));
  }
  starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starData,3));
  const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xc5d9ff,size:.14,sizeAttenuation:true,transparent:true,opacity:.82}));
  scene.add(stars);
  const loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
  const disposeTextures=[];
  const sunTexture=loader.load(TEXTURE_BASE+'2k_sun.jpg',undefined,undefined,()=>{});
  disposeTextures.push(sunTexture);
  const sunMaterial=new THREE.MeshBasicMaterial({color:0xffd59a,map:sunTexture});
  const sun=new THREE.Mesh(new THREE.SphereGeometry(1.15,64,48),sunMaterial);scene.add(sun);
  const corona=new THREE.Mesh(new THREE.SphereGeometry(1.28,48,32),new THREE.MeshBasicMaterial({color:0xff9b38,transparent:true,opacity:.11,side:THREE.BackSide,depthWrite:false}));
  scene.add(corona);
  const planetObjects=new Map(), orbitObjects=[];
  const radii={mercury:.12,venus:.22,earth:.24,mars:.18};
  for(const p of PLANETS){
    const orbitRadius=p.a*SCALE;
    const orbitPoints=[];
    for(let i=0;i<361;i++){const a=i/360*Math.PI*2;orbitPoints.push(new THREE.Vector3(Math.cos(a)*orbitRadius,0,Math.sin(a)*orbitRadius));}
    const orbitGeometry=new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbit=new THREE.LineLoop(orbitGeometry,new THREE.LineBasicMaterial({color:0x4a6388,transparent:true,opacity:.44}));
    scene.add(orbit);orbitObjects.push(orbit);
    const map=loader.load(TEXTURE_BASE+(TEXTURES[p.id]||''),undefined,undefined,()=>{});
    disposeTextures.push(map);
    const material=new THREE.MeshStandardMaterial({map,color:new THREE.Color(p.color),roughness: p.id === 'earth' ? 0.88 : 1,metalness:0});
    if(p.id==='earth') material.color.set(0xc7d9ff);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(radii[p.id]||.2,64,48),material);
    mesh.castShadow=true;mesh.receiveShadow=true;
    const pivot=new THREE.Group();pivot.add(mesh);scene.add(pivot);
    mesh.userData.planetId=p.id;
    planetObjects.set(p.id,{planet:p,pivot,mesh,orbitRadius});
    if(p.id==='earth'){
      const cloudMap=loader.load(TEXTURE_BASE+'2k_earth_clouds.jpg',undefined,undefined,()=>{});disposeTextures.push(cloudMap);
      const clouds=new THREE.Mesh(new THREE.SphereGeometry(radii.earth*1.012,64,48),new THREE.MeshStandardMaterial({map:cloudMap,transparent:true,opacity:.22,depthWrite:false,roughness:1}));
      mesh.add(clouds);
      const moonPivot=new THREE.Group();mesh.add(moonPivot);moonPivot.rotation.x=.2;
      const moon=new THREE.Mesh(new THREE.SphereGeometry(.065,24,16),new THREE.MeshStandardMaterial({color:0xb5b5b2,roughness:1}));
      moon.position.set(.62,0,0);moonPivot.add(moon);planetObjects.get('earth').moonPivot=moonPivot;
    }
    if(p.id==='mars'){
      const polar=new THREE.Mesh(new THREE.SphereGeometry(radii.mars*1.002,32,16,0,Math.PI*2,0,.22),new THREE.MeshBasicMaterial({color:0xd9d5c6,transparent:true,opacity:.7}));
      polar.position.y=radii.mars*.9;mesh.add(polar);
    }
  }
  const saturnVisual=makeOuterPlanet('Saturno',0xd3bc8c,0.43,12.5,'saturn');
  const jupiterVisual=makeOuterPlanet('Júpiter',0xb78e6a,.62,10.8,'jupiter');
  function makeOuterPlanet(name,color,radius,distance,id){
    const pivot=new THREE.Group();scene.add(pivot);
    const outerMap=loader.load(TEXTURE_BASE+(id==='saturn'?'2k_saturn.jpg':'2k_jupiter.jpg'),undefined,undefined,()=>{});
    disposeTextures.push(outerMap);
    const mat=new THREE.MeshStandardMaterial({color,map:outerMap,roughness:1});
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,48,32),mat);mesh.userData.planetId=id;pivot.add(mesh);
    if(id==='saturn'){
      const ring=new THREE.Mesh(new THREE.RingGeometry(radius*1.25,radius*2.1,96),new THREE.MeshStandardMaterial({color:0xcdbb91,roughness:1,side:THREE.DoubleSide,transparent:true,opacity:.72}));
      ring.rotation.x=Math.PI/2.35;mesh.add(ring);
    } else {
      const bandMaterial=new THREE.MeshStandardMaterial({color:0xe0c7a4,roughness:1});
      for(let i=0;i<4;i++){const band=new THREE.Mesh(new THREE.TorusGeometry(radius*.99-i*.06,.018,6,64),bandMaterial);band.position.y=(i-1.5)*radius*.22;mesh.add(band);}
    }
    const points=[];for(let i=0;i<=240;i++){const a=i/240*Math.PI*2;points.push(new THREE.Vector3(Math.cos(a)*distance,0,Math.sin(a)*distance));}
    const orbit=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x354966,transparent:true,opacity:.35}));scene.add(orbit);orbitObjects.push(orbit);
    const obj={planet:null,pivot,mesh,orbitRadius:distance,visualOnly:true,phase:id==='saturn'?2.3:1.1};
    planetObjects.set(id,obj);return obj;
  }
  const trajectoryGeometry=new THREE.BufferGeometry();
  const trajectoryLine=new THREE.Line(trajectoryGeometry,new THREE.LineBasicMaterial({color:0xffb36a,transparent:true,opacity:.9}));
  scene.add(trajectoryLine);
  const earthMarker=new THREE.Mesh(new THREE.SphereGeometry(.045,12,8),new THREE.MeshBasicMaterial({color:0x7fe8ff}));
  const shipMarker=new THREE.Mesh(new THREE.OctahedronGeometry(.11,1),new THREE.MeshBasicMaterial({color:0xffb36a}));
  scene.add(earthMarker,shipMarker);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  let currentTime=initialTime, currentView=initialView, currentMission=missionState, currentEphemerides=null, raf=0;
  function updatePositions(t){
    currentTime=t;
    for(const [id,obj] of planetObjects){
      if(obj.planet){
        const jpl = currentEphemerides && (id === 'earth' ? currentEphemerides.earth : id === 'mars' ? currentEphemerides.mars : null);
        const pos = jpl?.positionAu ? jpl.positionAu.map((value) => value * AU) : planetState(obj.planet,t).r;
        obj.pivot.position.set(pos[0]/AU*SCALE,0,-pos[1]/AU*SCALE);
        obj.mesh.rotation.y+=.0015;
      } else {
        const a=(t/86400/365.25)*(id==='saturn'?.025:.07)+obj.phase;
        obj.pivot.position.set(Math.cos(a)*obj.orbitRadius,0,Math.sin(a)*obj.orbitRadius);
      }
    }
    const earth=planetObjects.get('earth');
    if(earth){earthMarker.position.copy(earth.pivot.position);earthMarker.position.y=.36;}
    // A nave usa o estado real da missão e o mesmo propagador orbital do mapa 2D.
    const mars=planetObjects.get('mars'), earthPos=earthMarker.position;
    shipMarker.visible=Boolean(currentMission && ['leo','cruise','encounter','operations'].includes(currentMission.phase));
    trajectoryLine.visible=Boolean(currentMission?.phase==='cruise' && currentMission.ship?.el);
    if(trajectoryLine.visible){
      const points=[];
      const end=currentTime+220*86400;
      for(let i=0;i<=120;i++){const pos=positionAt(currentMission.ship.el,currentTime+(end-currentTime)*i/120);points.push(new THREE.Vector3(pos[0]/AU*SCALE,.025,-pos[1]/AU*SCALE));}
      trajectoryGeometry.setFromPoints(points);
    }
    if(currentMission?.ship?.frame==='sun' && currentMission.ship.el){
      const pos=positionAt(currentMission.ship.el,currentTime);
      shipMarker.position.set(pos[0]/AU*SCALE,.12,-pos[1]/AU*SCALE);
    } else if(currentMission?.ship?.frame==='mars' && currentMission.ship.el){
      const pos=positionAt(currentMission.ship.el,currentTime);
      const marsJpl=currentEphemerides?.mars?.positionAu;
      const marsPos=marsJpl ? marsJpl.slice(0,2).map(value=>value*AU) : planetState(PLANETS.find(p=>p.id==='mars'),currentTime).r;
      shipMarker.position.set((marsPos[0]+pos[0])/AU*SCALE,.12,-(marsPos[1]+pos[1])/AU*SCALE);
    } else {
      shipMarker.position.set(earthPos.x+.12,.12,earthPos.z);
    }
    shipMarker.rotation.y+=.012;
  }
  function setView(view){
    currentView=view||'sun';
    const targetObj=planetObjects.get(currentView);
    if(currentView==='earth'&&targetObj){controls.target.copy(targetObj.pivot.position);camera.position.copy(targetObj.pivot.position).add(new THREE.Vector3(2.4,1.7,3.4));controls.minDistance=.7;controls.maxDistance=20;}
    else if(currentView==='mars'&&targetObj){controls.target.copy(targetObj.pivot.position);camera.position.copy(targetObj.pivot.position).add(new THREE.Vector3(2.2,1.5,3));controls.minDistance=.7;controls.maxDistance=20;}
    else {controls.target.set(0,0,0);camera.position.set(19,16,24);controls.minDistance=2.5;controls.maxDistance=90;}
    controls.update();
  }
  function resize(){const w=Math.max(container.clientWidth,1),h=Math.max(container.clientHeight,1);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  renderer.domElement.addEventListener('dblclick',event=>{
    const rect=renderer.domElement.getBoundingClientRect();pointer.x=(event.clientX-rect.left)/rect.width*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects([...planetObjects.values()].map(o=>o.mesh),false)[0];
    if(hit?.object?.userData?.planetId)setView(hit.object.userData.planetId);
  });
  camera.position.set(19,16,24);controls.target.set(0,0,0);controls.update();
  const clock=new THREE.Clock();
  function animate(){raf=requestAnimationFrame(animate);clock.getDelta();stars.rotation.y+=.000035;sun.rotation.y+=.0008;updatePositions(currentTime);controls.update();renderer.render(scene,camera);}
  updatePositions(initialTime);setView(initialView);animate();
  function dispose(){cancelAnimationFrame(raf);observer.disconnect();controls.dispose();scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});disposeTextures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();}
  return {updateTime(t, latestMission=currentMission){currentMission=latestMission;updatePositions(t);},setEphemerides(data){currentEphemerides=data;updatePositions(currentTime);},setView,resize,dispose};
}
