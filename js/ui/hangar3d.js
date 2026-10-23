// Hangar 3D procedural: geometry is generated from the same design IDs as the
// engineering/game layer. It is a visual preview, not a CAD or flight-certified model.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ROCKET_PARTS, PROBE_PARTS, DECOUPLER } from '../data/parts.js';
import { getOfficialModel } from '../data/nasa-resources.js';

const partById=new Map(ROCKET_PARTS.map(p=>[p.id,p]));
const probeById=new Map(PROBE_PARTS.map(p=>[p.id,p]));
const TANKS={
  'tank-s':{radius:.42,height:.8},
  'tank-m':{radius:.56,height:1.12},
  'tank-l':{radius:.78,height:1.55}
};

function steel(color,roughness=.42,metalness=.68){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function cylinder(radiusTop,radiusBottom,height,material,segments=48){return new THREE.Mesh(new THREE.CylinderGeometry(radiusTop,radiusBottom,height,segments,1),material);}
function addRings(parent,radius,y,height,material,count=2){
  for(let i=0;i<count;i++){const ring=cylinder(radius*1.015,radius*1.015,.035,material,48);ring.position.y=y-height*.42+i*height*.84;parent.add(ring);}
}
function addRivets(parent,radius,y,height,material){
  const geo=new THREE.SphereGeometry(.022,8,6);
  for(let row=0;row<Math.max(2,Math.floor(height*5));row++){
    const yy=y-height/2+(row+.5)*height/Math.max(2,Math.floor(height*5));
    for(let i=0;i<16;i++){const a=i/16*Math.PI*2;const rivet=new THREE.Mesh(geo,material);rivet.position.set(Math.cos(a)*(radius+.006),yy,Math.sin(a)*(radius+.006));parent.add(rivet);}
  }
}
function makeEngine(parent,engineId,radius,y){
  const engineMat=steel(0x424d5d,.26,.88), inner=steel(0x111820,.3,.9), copper=steel(0x9e6b48,.34,.8);
  const size=engineId==='engine-main'?1.0:engineId==='engine-upper'?.68:.46;
  const bell=new THREE.Mesh(new THREE.CylinderGeometry(radius*.42,radius*size,.58,48,1,true),engineMat);bell.position.y=y-.28;parent.add(bell);
  const throat=cylinder(radius*.38,radius*.38,.12,copper,48);throat.position.y=y+.04;parent.add(throat);
  const innerBell=new THREE.Mesh(new THREE.CylinderGeometry(radius*.32,radius*(size-.07),.48,48,1,true),inner);innerBell.position.y=y-.28;parent.add(innerBell);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(radius*size,.035,10,48),copper);rim.rotation.x=Math.PI/2;rim.position.y=y-.57;parent.add(rim);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;const pipe=cylinder(.025,.025,.35,copper,8);pipe.position.set(Math.cos(a)*radius*.72,y+.08,Math.sin(a)*radius*.72);parent.add(pipe);}
}
function makeTank(parent,part,y,materials){
  const spec=TANKS[part.id]||{radius:.5,height:1};
  const {radius,height}=spec;
  const body=cylinder(radius*.96,radius,height,materials.tank,64);body.position.y=y;parent.add(body);
  const domeTop=new THREE.Mesh(new THREE.SphereGeometry(radius*.96,48,24,0,Math.PI*2,0,Math.PI/2),materials.tank);domeTop.position.y=y+height/2;parent.add(domeTop);
  const domeBottom=new THREE.Mesh(new THREE.SphereGeometry(radius,48,24,0,Math.PI*2,Math.PI/2,Math.PI/2),materials.dark);domeBottom.position.y=y-height/2;parent.add(domeBottom);
  addRings(parent,radius,y,height,materials.ring,3);
  addRivets(parent,radius,y,height,materials.rivet);
  // Longitudinal structural stringers and small inspection panels.
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const bar=cylinder(.012,.012,height*.78,materials.ring,6);bar.position.set(Math.cos(a)*(radius+.005),y,Math.sin(a)*(radius+.005));parent.add(bar);}
  const panel=new THREE.Mesh(new THREE.BoxGeometry(radius*.38,height*.15,.018),materials.panel);panel.position.set(radius*.68,y-height*.18,0);panel.rotation.y=Math.PI/2;parent.add(panel);
  return height;
}
function makeDecoupler(parent,radius,y,materials){
  const band=cylinder(radius*1.04,radius*1.04,.13,materials.dark,64);band.position.y=y;parent.add(band);
  const seam=cylinder(radius*1.045,radius*1.045,.025,materials.orange,64);seam.position.y=y+.045;parent.add(seam);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const bolt=new THREE.Mesh(new THREE.SphereGeometry(.025,8,6),materials.rivet);bolt.position.set(Math.cos(a)*radius*1.05,y,Math.sin(a)*radius*1.05);parent.add(bolt);}
}
function makeProbe(parent,design,topY,materials){
  const probeIds=design.probe||[];
  const core=probeIds.includes('probe-core');
  const hasSolar=probeIds.some(id=>id.startsWith('solar-'));
  const hasAntenna=probeIds.some(id=>id.startsWith('antenna-')||id==='laser');
  const baseRadius=.32;
  const bus=cylinder(baseRadius,baseRadius*.88,.52,materials.panel,40);bus.position.y=topY+.26;parent.add(bus);
  const goldFoil=steel(0xb38a42,.42,.62), dark=steel(0x172638,.3,.65);
  for(let i=0;i<4;i++){const band=cylinder(baseRadius*1.02,baseRadius*1.02,.035,materials.ring,40);band.position.y=topY+.08+i*.12;parent.add(band);}
  const instrumentGeo=new THREE.BoxGeometry(.15,.14,.15);
  for(let i=0;i<Math.min(5,probeIds.length);i++){
    const id=probeIds[i], part=probeById.get(id);
    if(!part)continue;
    if(part.category==='instrument'){
      const inst=new THREE.Mesh(instrumentGeo,steel(id==='camera'?0x111b2c:id==='radar'?0x71869c:0x8d9caa,.28,.75));
      inst.position.set((i%2?1:-1)*(.2+(i%3)*.03),topY+.54+(i%2)*.12,((i%3)-1)*.13);parent.add(inst);
      if(id==='camera'){const lens=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.04,20),steel(0x2f91a8,.2,.6));lens.rotation.x=Math.PI/2;lens.position.set(inst.position.x,inst.position.y,inst.position.z+.09);parent.add(lens);}
    }
  }
  if(hasAntenna){
    const mast=cylinder(.018,.018,.42,materials.ring,12);mast.position.y=topY+.78;parent.add(mast);
    const dish=new THREE.Mesh(new THREE.SphereGeometry(.22,32,16,0,Math.PI*2,0,Math.PI/2),steel(0xd8dfe6,.25,.82));dish.rotation.x=Math.PI;dish.position.y=topY+1.0;parent.add(dish);
    const feed=cylinder(.018,.018,.16,materials.dark,12);feed.position.set(0,topY+.91,.12);parent.add(feed);
  }
  if(hasSolar){
    for(const side of [-1,1]){
      const arm=cylinder(.025,.025,.6,materials.dark,12);arm.rotation.z=Math.PI/2;arm.position.set(side*.48,topY+.32,0);parent.add(arm);
      const panel=new THREE.Mesh(new THREE.BoxGeometry(.78,.38,.035),materials.solar);panel.position.set(side*.91,topY+.32,0);parent.add(panel);
      for(let j=1;j<4;j++){const line=new THREE.Mesh(new THREE.BoxGeometry(.008,.36,.04),materials.solarLine);line.position.set(side*.91+(j-2)*.19,topY+.32,0);parent.add(line);}
      const cross=new THREE.Mesh(new THREE.BoxGeometry(.75,.012,.042),materials.solarLine);cross.position.set(side*.91,topY+.32,0);parent.add(cross);
    }
  }
  if(core){const light=new THREE.Mesh(new THREE.SphereGeometry(.06,16,12),new THREE.MeshBasicMaterial({color:0x68d9e7}));light.position.set(.08,topY+.34,.3);parent.add(light);}
  const fairing=new THREE.Mesh(new THREE.ConeGeometry(.36,.72,48),materials.white);fairing.position.y=topY+.84;parent.add(fairing);
  const fairingBase=cylinder(.36,.36,.08,materials.ring,48);fairingBase.position.y=topY+.49;parent.add(fairingBase);
}
export function mountHangar3D(container,design){
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x080d14);scene.fog=new THREE.Fog(0x080d14,18,42);
  const camera=new THREE.PerspectiveCamera(40,1,.1,100);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.06;controls.minDistance=4;controls.maxDistance=22;controls.target.set(0,3.3,0);
  scene.add(new THREE.HemisphereLight(0xc9e3ff,0x191714,.8));
  // Ambiente industrial para reflexos PBR coerentes nos metais polidos.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), .04);
  scene.environment = environment.texture;
  const key=new THREE.DirectionalLight(0xffe1bf,4.2);key.position.set(5,12,8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-10;key.shadow.camera.right=10;key.shadow.camera.top=14;key.shadow.camera.bottom=-5;scene.add(key);
  const rim=new THREE.SpotLight(0x68c7f0,110,28,Math.PI/4,.5,1.5);rim.position.set(-6,9,-4);rim.target.position.set(0,3,0);scene.add(rim,rim.target);
  const fill=new THREE.PointLight(0xffa76d,25,18);fill.position.set(5,3,4);scene.add(fill);
  const materials={
    tank:steel(0xc8d3df,.34,.76),white:steel(0xe8edf2,.32,.45),dark:steel(0x3a4654,.3,.82),
    ring:steel(0x7f91a3,.25,.88),rivet:steel(0xe4e9ee,.22,.78),panel:steel(0x8293a5,.3,.7),
    orange:steel(0xe0783d,.36,.58),solar:steel(0x164b7e,.24,.75),solarLine:steel(0x64b6df,.2,.68)
  };
  // Piso de concreto industrial texturizado: sem grade de editor; juntas largas,
  // manchas de uso e variação de rugosidade geradas em textura repetível.
  const floorCanvas=document.createElement('canvas');floorCanvas.width=1024;floorCanvas.height=1024;
  const fctx=floorCanvas.getContext('2d');fctx.fillStyle='#343a3e';fctx.fillRect(0,0,1024,1024);
  for(let i=0;i<18000;i++){const v=35+Math.random()*55;fctx.fillStyle=`rgba(${v},${v+2},${v+4},${Math.random()*.13})`;const x=Math.random()*1024,y=Math.random()*1024;fctx.fillRect(x,y,Math.random()*3+1,Math.random()*3+1);}
  for(let i=0;i<22;i++){const x=Math.random()*1024,y=Math.random()*1024,r=8+Math.random()*45;const g=fctx.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,'rgba(8,12,15,.22)');g.addColorStop(1,'rgba(8,12,15,0)');fctx.fillStyle=g;fctx.beginPath();fctx.arc(x,y,r,0,Math.PI*2);fctx.fill();}
  fctx.strokeStyle='rgba(12,17,21,.65)';fctx.lineWidth=3;
  for(let x=0;x<=1024;x+=256){fctx.beginPath();fctx.moveTo(x,0);fctx.lineTo(x,1024);fctx.stroke();}
  for(let y=0;y<=1024;y+=256){fctx.beginPath();fctx.moveTo(0,y);fctx.lineTo(1024,y);fctx.stroke();}
  const floorTexture=new THREE.CanvasTexture(floorCanvas);floorTexture.wrapS=floorTexture.wrapT=THREE.RepeatWrapping;floorTexture.repeat.set(3,3);floorTexture.colorSpace=THREE.SRGBColorSpace;
  const floorMat=new THREE.MeshStandardMaterial({map:floorTexture,color:0x9aa0a3,roughness:.94,metalness:.08});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(36,36),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=-.08;floor.receiveShadow=true;scene.add(floor);
  // Large hangar frame, trusses, wall panels, ceiling lights and floor markings.
  const frame=steel(0x46515a,.58,.72), wall= new THREE.MeshStandardMaterial({color:0x354047,roughness:.86,metalness:.18,side:THREE.DoubleSide});
  function beam(w,h,d,x,y,z,mat=frame){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
  for(const x of [-6,6]){beam(.22,8,.22,x,3.9,-4.5);beam(.22,8,.22,x,3.9,4.5);beam(.22,8,.22,x,3.9,0);}
  for(const z of [-4.5,0,4.5])beam(12,.2,.22,0,7.8,z);
  for(let y=1;y<=7;y+=1.5){beam(12,.055,.08,0,y,-4.48);beam(.08,.055,9,-5.98,y,0);beam(.08,.055,9,5.98,y,0);}
  for(const x of [-4,-2,0,2,4])beam(.07,.07,9,x,7.65,0);
  for(const x of [-4,0,4]){const lamp=new THREE.Mesh(new THREE.BoxGeometry(1.4,.08,.28),new THREE.MeshStandardMaterial({color:0xe4f3ff,emissive:0x7ea9c8,emissiveIntensity:1.6}));lamp.position.set(x,7.55,1.2);scene.add(lamp);}
  // Parede de fundo inspirada em um hangar aeroespacial industrial: faixa superior
  // envidraçada e iluminada, treliças cruzadas e um portão de duas folhas ao centro.
  const glass = new THREE.MeshStandardMaterial({color:0xc7d9e2, emissive:0x9ab9c9, emissiveIntensity:0.48, roughness:.28, metalness:.18, side:THREE.DoubleSide});
  const doorMat = new THREE.MeshStandardMaterial({color:0x252d33, roughness:.78, metalness:.38, side:THREE.DoubleSide});
  const doorInset = new THREE.MeshStandardMaterial({color:0x5a4c2b, roughness:.7, metalness:.34});
  // Parede inferior e portão central com painéis verticais largos.
  const backLower=new THREE.Mesh(new THREE.PlaneGeometry(12,4.15),wall);backLower.position.set(0,2.075,-4.62);scene.add(backLower);
  const door=new THREE.Mesh(new THREE.PlaneGeometry(4.15,3.35),doorMat);door.position.set(0,1.82,-4.55);scene.add(door);
  for(let x=-1.9;x<=1.91;x+=.38){beam(.035,3.25,.045,x,1.82,-4.49,doorInset);}
  beam(.08,3.55,.08,-2.12,1.85,-4.42,frame);beam(.08,3.55,.08,2.12,1.85,-4.42,frame);beam(4.35,.12,.08,0,3.58,-4.42,frame);
  // Janelas altas, segmentadas por travessas para uma fachada luminosa como a referência.
  const glassPanel=new THREE.Mesh(new THREE.PlaneGeometry(12,3.35),glass);glassPanel.position.set(0,6.0,-4.60);scene.add(glassPanel);
  for(let x=-6;x<=6.001;x+=1){beam(.075,3.45,.09,x,6.0,-4.48,frame);}
  for(let y=4.45;y<=7.6;y+=.72)beam(12,.065,.09,0,y,-4.48,frame);
  function diagonal(x1,y1,z1,x2,y2,z2,mat=frame,thickness=.065){
    const a=new THREE.Vector3(x1,y1,z1),b=new THREE.Vector3(x2,y2,z2),delta=new THREE.Vector3().subVectors(b,a);
    const m=new THREE.Mesh(new THREE.BoxGeometry(thickness,delta.length(),thickness),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
  }
  for(let x=-5.5;x<5.6;x+=2){diagonal(x,4.38,-4.43,x+2,7.62,-4.43);diagonal(x,7.62,-4.43,x+2,4.38,-4.43);}
  // Paredes laterais com grandes X estruturais, níveis de passarela e luzes técnicas.
  for(const side of [-1,1]){
    for(let z=-4;z<4.1;z+=2){
      diagonal(side*5.92,.35,z,side*5.92,7.45,z+2,frame,.075);
      diagonal(side*5.92,7.45,z,side*5.92,.35,z+2,frame,.075);
    }
    for(let y=1.5;y<=6.5;y+=2.5){beam(.16,.075,9.0,side*5.86,y,0,frame);}
    for(const z of [-3,0,3]){
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.18,.72,.55),new THREE.MeshStandardMaterial({color:0xe5f2f8,emissive:0xd7edff,emissiveIntensity:2.2,roughness:.25}));lamp.position.set(side*5.72,3.05,z);scene.add(lamp);
      const glow=new THREE.SpotLight(0xd9edff,42,8,Math.PI/5,.55,1.4);glow.position.set(side*5.45,3.0,z);glow.target.position.set(0,1.2,z);scene.add(glow,glow.target);
    }
  }
  // Amarelo de segurança e faixas de circulação no piso.
  const stripeMat=new THREE.MeshBasicMaterial({color:0xd59b47});
  for(const x of [-2.2,2.2]){const stripe=new THREE.Mesh(new THREE.BoxGeometry(.18,.012,7.2),stripeMat);stripe.position.set(x,-.025,0);scene.add(stripe);}
  for(const z of [-3.3,3.3]){const line=new THREE.Mesh(new THREE.BoxGeometry(10,.01,.035),new THREE.MeshBasicMaterial({color:0xc8cdd0}));line.position.set(0,-.02,z);scene.add(line);}
  // Modelo oficial Perseverance (NASA/JPL-Caltech) carregado como GLB do catálogo NASA.
  // A geometria é apenas visual e não altera a massa nem os parâmetros físicos do foguete do jogador.
  let hangarDisposed = false;
  const roverPlatform = new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.2,.12,48),steel(0x303d4b,.65,.55));
  roverPlatform.position.set(3.45,.02,0);scene.add(roverPlatform);
  const roverLoader = new GLTFLoader();
  const roverAsset = getOfficialModel('perseverance-rover');
  roverLoader.load(roverAsset.url, (gltf) => {
    if (hangarDisposed) {
      gltf.scene.traverse((node) => { if (node.geometry) node.geometry.dispose(); if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => material.dispose()); });
      return;
    }
    const rover = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(rover);
    const size = bounds.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    rover.scale.setScalar(2.0 / maxDimension);
    const scaledBounds = new THREE.Box3().setFromObject(rover);
    rover.position.set(3.45, .09 - scaledBounds.min.y, 0);
    rover.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    scene.add(rover);
  }, undefined, (error) => {
    console.warn('O modelo GLB oficial da Perseverance não carregou; o hangar permanece funcional.', error);
    // Fallback explicitamente ilustrativo: não é modelo NASA nem réplica validada.
    const fallback = new THREE.Group(); fallback.position.set(3.45,.15,0); scene.add(fallback);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(.95,.25,.62), steel(0xc6c9c5,.65,.25)); chassis.position.y=.48; fallback.add(chassis);
    for (const x of [-.34,.34]) for (const z of [-.38,.38]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.13,20), steel(0x343b40,.88,.1)); wheel.rotation.x=Math.PI/2; wheel.position.set(x,.22,z); fallback.add(wheel);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.55,12), steel(0xc6c9c5,.5,.35)); mast.position.set(0,.88,-.08); fallback.add(mast);
    const cameraHead = new THREE.Mesh(new THREE.BoxGeometry(.25,.13,.16), steel(0x2b465a,.35,.55)); cameraHead.position.set(0,1.15,-.08); fallback.add(cameraHead);
  });

  const rocket=new THREE.Group();scene.add(rocket);
  const stageData=(design.stages||[]).map((ids,index)=>({index,parts:ids.map(id=>partById.get(id)).filter(Boolean)}));
  let y=.95,maxRadius=.5;
  for(const stage of stageData){
    const engines=stage.parts.filter(p=>p.kind==='engine');
    const tanks=stage.parts.filter(p=>p.kind==='tank');
    let engineRadius=.22;
    if(engines.length){
      const engine=engines[0];engineRadius=engine.id==='engine-main'?.42:engine.id==='engine-upper'?.31:.22;
      const count=Math.min(engines.length,3);
      for(let i=0;i<count;i++){
        const a=count===1?0:i/count*Math.PI*2;
        const e=new THREE.Group();e.position.set(count===1?0:Math.cos(a)*engineRadius*1.35,y, count===1?0:Math.sin(a)*engineRadius*1.35);
        rocket.add(e);makeEngine(e,engine.id,engineRadius,0);
      }
    }
    y += engines.length ? 0.65 : 0.15;
    for(const tank of tanks){
      const h=makeTank(rocket,tank,y+(TANKS[tank.id]?.height||1)/2,materials);
      maxRadius=Math.max(maxRadius,(TANKS[tank.id]?.radius||.5));
      y+=h;
    }
    // Interstage adapter corresponds to the original game's automatic decoupler.
    if(stage.index<stageData.length-1){makeDecoupler(rocket,maxRadius,y,materials);y+=.16;}
  }
  if((design.probe||[]).length)y+=.05;
  makeProbe(rocket,design,y,materials);
  const rocketHeight=Math.max(y+1,2.5);
  const floorPad=new THREE.Mesh(new THREE.CylinderGeometry(maxRadius*1.8,maxRadius*1.9,.12,64),steel(0x303d4b,.65,.55));floorPad.position.y=.02;rocket.add(floorPad);
  // Launch clamps are fixed to the hangar floor and sized to the vehicle.
  for(const side of [-1,1]){
    const arm=new THREE.Mesh(new THREE.BoxGeometry(.13,.9,.16),frame);arm.position.set(side*(maxRadius+.18),.5,0);rocket.add(arm);
    const jaw=new THREE.Mesh(new THREE.BoxGeometry(.42,.12,.3),frame);jaw.position.set(side*(maxRadius+.12),.12,0);rocket.add(jaw);
  }
  // Label plate adds scale and a clear visual focal point.
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=128;
  const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#101c2b';ctx.fillRect(0,0,512,128);ctx.fillStyle='#76e2dc';ctx.font='bold 44px sans-serif';ctx.fillText('MISSION ARCHITECT',20,55);ctx.fillStyle='#b9c7d8';ctx.font='22px monospace';ctx.fillText('PROCEDURAL ROCKET · NASA ROVER ASSET',22,94);
  const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.7,.92),new THREE.MeshBasicMaterial({map:labelTexture}));sign.position.set(-4.05,5.9,-4.48);scene.add(sign);
  const centerY=rocketHeight/2;controls.target.set(0,centerY,0);camera.position.set(8,centerY+3,12);controls.update();
  const clock=new THREE.Clock();let raf=0;
  function resize(){const w=Math.max(container.clientWidth,1),h=Math.max(container.clientHeight,1);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  function animate(){raf=requestAnimationFrame(animate);clock.getDelta();controls.update();renderer.render(scene,camera);}
  animate();
  function dispose(){hangarDisposed=true;cancelAnimationFrame(raf);observer.disconnect();controls.dispose();scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});labelTexture.dispose();floorTexture.dispose();environment.dispose();pmrem.dispose();renderer.dispose();renderer.domElement.remove();}
  return {resize,dispose};
}
