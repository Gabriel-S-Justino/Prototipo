// Cena do lançamento. Tudo o que acontece aqui é comandado pela telemetria da simulação (launchTelemetry):
// ignições, separações, coifa e falhas. A cena não decide resultados, só os mostra de forma cinematográfica:
// céu com espalhamento atmosférico, plataforma com torre e para-raios, plumas, fumaça, vapor e a curvatura
// da Terra (Blue Marble, NASA) quando o veículo sai da atmosfera.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { SceneHandle } from '../components/ThreeView';
import type { LaunchTelemetry } from '../simulation/mission/launch';
import type { AssembledVehicle } from '../simulation/rocket/vehicle';
import { remoteTexture, TEXTURES } from './assets';
import { clamp01, createStage, planetTexture, starfield } from './common';
import { createPlume, fuelOf, Particles, type Plume } from './effects';
import { concreteMaterial, steelMaterial } from './materials';
import { buildRocket, type RocketModel } from './rocketModel';

export interface LaunchSceneProps {
  vehicle: AssembledVehicle;
  telemetry: LaunchTelemetry;
}

const ALT_SCALE = 3; // unidades de cena por km (comprimido)
const EARTH_R = 6371 * ALT_SCALE;

/** Posição ilustrativa do veículo: sobe e, com a curva de gravidade, avança para leste (+x). */
export function trajectoryPoint(altKm: number) {
  const y = altKm * ALT_SCALE;
  const x = (ALT_SCALE * altKm * altKm) / 160;
  const pitch = Math.min(1.15, (altKm / 180) * 1.15);
  return { x, y, pitch };
}

function lattice(height: number, width: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const matrices: THREE.Matrix4[] = [];
  const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, rz = 0) =>
    matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz)));
  const h = width / 2;
  for (const x of [-h, h]) for (const z of [-h, h]) add(x, height / 2, z, 0.5, height, 0.5);
  const step = 5;
  const diag = Math.hypot(width, step);
  const ang = Math.atan2(width, step);
  for (let y = step; y <= height; y += step) {
    for (const z of [-h, h]) add(0, y, z, width, 0.35, 0.35);
    for (const x of [-h, h]) add(x, y, 0, 0.35, 0.35, width);
    for (const z of [-h, h]) add(0, y - step / 2, z, 0.25, diag, 0.25, 0, (y / step) % 2 ? ang : -ang);
    for (const x of [-h, h]) add(x, y - step / 2, 0, 0.25, diag, 0.25, (y / step) % 2 ? ang : -ang, 0);
  }
  const mesh = new THREE.InstancedMesh(box, mat, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

/** Terreno costeiro procedural (vegetação rasteira, areia, estradas, lagoas) ao redor da plataforma. */
function terrainTexture(): THREE.Texture | null {
  if (typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent)) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#4a5a33';
  ctx.fillRect(0, 0, 1024, 1024);
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 1024;
    const y = rnd() * 1024;
    const r = 4 + rnd() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const k = rnd();
    g.addColorStop(0, k < 0.3 ? 'rgba(40,58,30,0.5)' : k < 0.6 ? 'rgba(98,104,62,0.4)' : k < 0.75 ? 'rgba(150,140,100,0.35)' : 'rgba(30,45,25,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // Lagoas e canais.
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = 'rgba(38,62,70,0.9)';
    ctx.beginPath();
    ctx.ellipse(rnd() * 1024, rnd() * 1024, 20 + rnd() * 80, 8 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Estrada de acesso (crawlerway) e pátio de concreto.
  ctx.strokeStyle = '#b9b3a2';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(512, 512);
  ctx.lineTo(512, 1024);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 700);
  ctx.bezierCurveTo(300, 650, 600, 800, 1024, 720);
  ctx.stroke();
  ctx.fillStyle = '#a9a597';
  ctx.beginPath();
  ctx.arc(512, 512, 26, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Brilho atmosférico na borda da Terra vista de cima (casca externa com fresnel). */
function atmosphereShell(radius: number, color: THREE.Color, power = 3, strength = 1.6) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uPower: { value: power }, uStrength: { value: strength }, uSun: { value: new THREE.Vector3(1, 0.5, 0.3).normalize() } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vWN;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vWN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPower, uStrength; uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vWN;
      void main(){ float rim = pow(1.0 - abs(dot(vN, vV)), uPower); float lit = clamp(dot(vWN, uSun) * 0.7 + 0.45, 0.0, 1.0);
        gl_FragColor = vec4(uColor * rim * uStrength * lit, rim * lit); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 64), mat);
}

export function createLaunchScene(container: HTMLElement, initial: LaunchSceneProps): SceneHandle<LaunchSceneProps> {
  const stage = createStage(container, {
    fov: 38, position: [62, 8, 100], target: [0, 34, 0], near: 0.5, far: EARTH_R * 2.2,
    exposure: 0.75, bloom: { strength: 0.6, radius: 0.5, threshold: 3 },
  });
  const { scene, camera, controls, renderer } = stage;
  const hi = stage.quality === 'alta';
  controls.enablePan = false;
  controls.maxDistance = 400;
  controls.minDistance = 20;

  // ── Céu com espalhamento Rayleigh/Mie, Sol baixo da manhã ──
  const sky = new Sky();
  sky.scale.setScalar(9000);
  const skyU = sky.material.uniforms;
  skyU.turbidity.value = 5;
  skyU.rayleigh.value = 1.6;
  skyU.mieCoefficient.value = 0.004;
  skyU.mieDirectionalG.value = 0.85;
  skyU.cloudCoverage.value = 0.25;
  skyU.cloudDensity.value = 0.35;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(68), THREE.MathUtils.degToRad(140));
  skyU.sunPosition.value.copy(sunDir);
  scene.add(sky);
  // Espaço: domo negro e mapa estelar (Tycho, NASA) que surgem com a altitude.
  const space = new THREE.Mesh(new THREE.SphereGeometry(8500, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(space);
  const starMat = new THREE.MeshBasicMaterial({ map: remoteTexture(TEXTURES.stars), side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Mesh(new THREE.SphereGeometry(8000, 48, 24), starMat);
  scene.add(stars);
  const fallbackStars = starfield(7800, 2500);
  (fallbackStars.material as THREE.PointsMaterial).opacity = 0;
  scene.add(fallbackStars);

  // Ambiente para reflexos (gerado a partir do próprio céu).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  Object.assign(envSky.material.uniforms.sunPosition.value, sunDir);
  envSky.material.uniforms.turbidity.value = 5;
  envSky.material.uniforms.rayleigh.value = 1.6;
  envSky.material.uniforms.cloudCoverage.value = 0;
  envScene.add(envSky);
  scene.environment = pmrem.fromScene(envScene).texture;
  scene.environmentIntensity = 0.6;
  envSky.geometry.dispose();
  envSky.material.dispose();
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(0xffe7c4, 3.2);
  sun.position.copy(sunDir).multiplyScalar(300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 120, bottom: -40, near: 10, far: 700 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xa9c8ff, 0x3a3326, 0.6);
  scene.add(hemi);

  // ── Solo, oceano e Terra curva ──
  const ground = new THREE.Group();
  scene.add(ground);
  const terrainTex = terrainTexture();
  const terrain = new THREE.Mesh(new THREE.CircleGeometry(3000, 96), new THREE.MeshStandardMaterial({ color: terrainTex ? 0xffffff : 0x3b4a2c, map: terrainTex, roughness: 1, transparent: true }));
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  ground.add(terrain);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x0d2a3d, roughness: 0.12, metalness: 0.1, transparent: true }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(3700, 0.3, 0);
  ground.add(ocean);
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R, 160, 80),
    new THREE.MeshStandardMaterial({ map: remoteTexture(TEXTURES.earthDay, { placeholder: planetTexture(['#123d7a', '#1f6fb8', '#3c8f4a'], 7) }), roughness: 0.85, metalness: 0, transparent: true, opacity: 0 }),
  );
  // Gira a esfera para que a Flórida (28,5° N, 80,6° O) fique sob a plataforma.
  earth.rotation.set(THREE.MathUtils.degToRad(-28.5), THREE.MathUtils.degToRad(80.6 - 90), 0, 'YXZ');
  earth.position.y = -EARTH_R - 2;
  scene.add(earth);
  const limb = atmosphereShell(EARTH_R * 1.012, new THREE.Color(0.35, 0.6, 1.0), 4, 2.2);
  limb.position.copy(earth.position);
  (limb.material as THREE.ShaderMaterial).uniforms.uSun.value.copy(sunDir);
  limb.visible = false;
  scene.add(limb);

  // ── Complexo de lançamento: base de concreto, fosso de chamas, torre, para-raios, caixa d'água ──
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(60, 64, 2, 64), concreteMaterial(120, 14));
  pad.position.y = -1;
  pad.receiveShadow = true;
  scene.add(pad);
  const trench = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 60), new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 1 }));
  trench.position.set(0, 0.05, 20);
  scene.add(trench);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 6, 22), steelMaterial('#55595f', 0.7, [2, 2]));
  deck.position.y = 3;
  deck.castShadow = deck.receiveShadow = true;
  scene.add(deck);
  const towerMat = steelMaterial('#9a9ea4', 0.55);
  const model: RocketModel = buildRocket(initial.vehicle, { probe: null });
  const rocketH = model.height;
  const tower = lattice(Math.ceil((rocketH + 12) / 5) * 5, 8, towerMat);
  // A torre fica atrás do veículo (do ponto de vista da câmera inicial), com o braço de serviço voltado para ele.
  const towerZ = -(model.spans.boosters.r || model.spans.core.r) - 9;
  tower.position.set(0, 6, towerZ);
  scene.add(tower);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, Math.abs(towerZ) - 3), towerMat);
  const armPivot = new THREE.Group();
  armPivot.position.set(0, 6 + model.spans.upper.y1 - 2, towerZ + 4);
  arm.position.z = (Math.abs(towerZ) - 3) / 2;
  armPivot.add(arm);
  scene.add(armPivot);
  const mastMat = steelMaterial('#c9ccd0', 0.5);
  const mastPositions = [new THREE.Vector3(-45, 0, -40), new THREE.Vector3(45, 0, -40), new THREE.Vector3(0, 0, 55)];
  const mastH = rocketH + 40;
  for (const p of mastPositions) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, mastH, 10), mastMat);
    mast.position.set(p.x, mastH / 2, p.z);
    mast.castShadow = true;
    scene.add(mast);
  }
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2b2e33, transparent: true, opacity: 0.7 });
  for (let i = 0; i < mastPositions.length; i++) {
    const a = mastPositions[i].clone().setY(mastH);
    const b = mastPositions[(i + 1) % mastPositions.length].clone().setY(mastH);
    const pts = Array.from({ length: 24 }, (_, k) => {
      const t = k / 23;
      return a.clone().lerp(b, t).setY(mastH - Math.sin(t * Math.PI) * 18);
    });
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }
  const waterTower = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), steelMaterial('#d9dbde', 0.4));
  tank.position.y = 46;
  waterTower.add(tank);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 46, 8), towerMat);
    const a = (i / 4) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 5, 23, Math.sin(a) * 5);
    waterTower.add(leg);
  }
  waterTower.position.set(-120, 0, -150);
  scene.add(waterTower);

  // ── Foguete, plumas e luz dos motores ──
  const rocket = model.group;
  const rocketRoot = new THREE.Group();
  rocketRoot.position.y = 6;
  rocketRoot.add(rocket);
  scene.add(rocketRoot);
  rocket.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  model.setFrost(1, 1);

  const plumes: { plume: Plume; group: 'core' | 'booster' | 'upper'; index: number }[] = [];
  const attachPlume = (parent: THREE.Object3D, at: THREE.Vector3, exitR: number, fuel: ReturnType<typeof fuelOf>, length: number, seaLevel: boolean, group: 'core' | 'booster' | 'upper', index = 0) => {
    const p = createPlume(exitR, fuel, length, seaLevel);
    p.group.position.copy(at);
    parent.add(p.group);
    plumes.push({ plume: p, group, index });
  };
  for (const n of model.nozzles.core) attachPlume(model.parts.core, n, model.engines.core.exitR, fuelOf(initial.vehicle.core.engineId), 38, true, 'core');
  model.boosterMeshes.forEach((b, i) => {
    const solid = initial.vehicle.booster?.kind === 'solido';
    for (const n of model.nozzles.boosters[i]) attachPlume(b, n, model.engines.booster!.exitR, fuelOf(initial.vehicle.booster?.engineId, solid), solid ? 44 : 38, true, 'booster', i);
  });
  for (const n of model.nozzles.upper) attachPlume(model.parts.upper, n, model.engines.upper.exitR, fuelOf(initial.vehicle.config.upperEngineId), 30, false, 'upper');

  const engineLight = new THREE.PointLight(0xff9a4a, 0, 300, 2);
  scene.add(engineLight);

  // Partículas: chama, fumaça persistente do rastro, nuvem de vapor do sistema de supressão sonora, centelhas.
  const fire = new Particles(hi ? 1400 : 700, 'fire', 900);
  fire.drag = 1.2;
  const smoke = new Particles(hi ? 5000 : 2200, 'smoke', 900);
  smoke.drag = 0.35;
  smoke.buoyancy = 1.2;
  const steam = new Particles(hi ? 1800 : 900, 'steam', 900);
  steam.drag = 0.5;
  steam.buoyancy = 2.5;
  const sparks = new Particles(600, 'spark', 300);
  sparks.drag = 0.3;
  sparks.buoyancy = -9.8;
  for (const p of [fire, smoke, steam, sparks]) {
    p.material.uniforms.uSunDir.value.copy(sunDir);
    scene.add(p.points);
  }

  const debris: { obj: THREE.Object3D; v: THREE.Vector3; spin: THREE.Vector3 }[] = [];
  const detach = (obj: THREE.Object3D, push: THREE.Vector3) => {
    const world = new THREE.Vector3();
    obj.getWorldPosition(world);
    const q = new THREE.Quaternion();
    obj.getWorldQuaternion(q);
    obj.parent?.remove(obj);
    obj.position.copy(world);
    obj.quaternion.copy(q);
    scene.add(obj);
    debris.push({ obj, v: push, spin: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4) });
    // Sopro de gás na separação.
    for (let i = 0; i < 40; i++) steam.spawn({ position: world.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4)), velocity: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), life: 2 + Math.random(), size: [3, 14] });
  };
  let boostersDetached = false;
  let coreDetached = false;
  let fairingDetached = false;
  let exploded = false;
  let flash = 0;
  let props = initial;

  const apply = (p: LaunchSceneProps) => {
    props = p;
    const t = p.telemetry;
    if (!t.boostersAttached && !boostersDetached && model.boosterMeshes.length) {
      boostersDetached = true;
      for (const b of model.boosterMeshes) detach(b, new THREE.Vector3(b.position.x * 1.2, -4, b.position.z * 1.2));
    }
    if (t.stage >= 1 && !coreDetached) {
      coreDetached = true;
      detach(model.parts.core, new THREE.Vector3(0, -10, 0));
    }
    if (!t.fairingAttached && !fairingDetached) {
      fairingDetached = true;
      for (const h of model.fairingHalves) detach(h, new THREE.Vector3(8 * (h.userData.side as number), -2, 0));
    }
    if (t.failed && !exploded) {
      exploded = true;
      flash = 1;
      const c = new THREE.Vector3();
      model.parts.upper.getWorldPosition(c);
      c.y += model.spans.core.y1 * 0.6;
      for (let i = 0; i < fire.capacity; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(10 + Math.random() * 45);
        fire.spawn({ position: c.clone().addScaledVector(v, 0.05), velocity: v, life: 1.2 + Math.random() * 1.6, size: [6, 30] });
      }
      for (let i = 0; i < 900; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(6 + Math.random() * 25);
        smoke.spawn({ position: c.clone(), velocity: v, life: 8 + Math.random() * 6, size: [8, 45] });
      }
      for (let i = 0; i < sparks.capacity; i++) sparks.spawn({ position: c.clone(), velocity: new THREE.Vector3().randomDirection().multiplyScalar(20 + Math.random() * 60), life: 2 + Math.random() * 2, size: [1.5, 0.5] });
      for (const part of [model.parts.upper, model.parts.fairing, model.parts.probe]) {
        if (part.parent === rocket) detach(part, new THREE.Vector3().randomDirection().multiplyScalar(12));
      }
      if (!coreDetached) detach(model.parts.core, new THREE.Vector3(0, -6, 0));
      rocket.visible = true;
    }
  };
  apply(initial);

  const delta = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const nozzleWorld = new THREE.Vector3();
  const lastRocketPos = new THREE.Vector3(0, 6, 0);
  const shake = new THREE.Vector3();
  let fireAcc = 0;
  let smokeAcc = 0;
  stage.onFrame((dt, time) => {
    const t = props.telemetry;
    const alt = t.altitudeKm;
    const traj = trajectoryPoint(alt);
    if (!exploded) {
      rocketRoot.position.set(traj.x, 6 + traj.y, 0);
      rocketRoot.rotation.z = -traj.pitch;
    }
    // Câmera: o alvo segue o veículo; a posição acompanha com atraso (sensação de perseguição).
    camera.position.sub(shake);
    delta.copy(rocketRoot.position).sub(lastRocketPos);
    lastRocketPos.copy(rocketRoot.position);
    const follow = clamp01(alt / 0.6);
    controls.target.add(delta);
    controls.target.lerp(aim.copy(rocketRoot.position).add(new THREE.Vector3(0, model.height * 0.45, 0)), Math.min(1, dt * 1.5));
    camera.position.addScaledVector(delta, follow);
    if (follow < 1) camera.position.y = Math.max(camera.position.y, 2);
    // Fora da atmosfera a câmera sobe para trás e acima do veículo, mostrando a curvatura da Terra.
    const orbital = clamp01((alt - 25) / 50);
    if (orbital > 0 && !exploded) {
      aim.copy(rocketRoot.position).add(new THREE.Vector3(-40, 45, 85));
      camera.position.lerp(aim, Math.min(1, dt * 0.6 * orbital));
    }

    // Atmosfera → espaço.
    const k = clamp01((alt - 15) / 70);
    skyU.rayleigh.value = 1.6 * (1 - k) + 0.05 * k;
    skyU.mieCoefficient.value = 0.004 * (1 - k);
    skyU.time.value = time;
    (space.material as THREE.MeshBasicMaterial).opacity = clamp01((alt - 25) / 60);
    starMat.opacity = clamp01((alt - 45) / 60) * 0.55;
    (fallbackStars.material as THREE.PointsMaterial).opacity = starMat.map && starMat.map.image && (starMat.map.image as { width?: number }).width! > 1 ? 0 : starMat.opacity;
    for (const o of [sky, space, stars, fallbackStars]) o.position.copy(camera.position);
    hemi.intensity = 0.6 * (1 - k) + 0.08;
    const groundFade = 1 - clamp01((alt - 8) / 30);
    (terrain.material as THREE.MeshStandardMaterial).opacity = groundFade;
    (ocean.material as THREE.MeshStandardMaterial).opacity = groundFade;
    ground.visible = groundFade > 0;
    pad.visible = tower.visible = alt < 60;
    const earthMat = earth.material as THREE.MeshStandardMaterial;
    earthMat.opacity = clamp01((alt - 6) / 25);
    earth.visible = earthMat.opacity > 0;
    limb.visible = alt > 20;
    // O braço de serviço gira para longe na ignição.
    armPivot.rotation.y += ((t.engineOn || alt > 0 ? -1.4 : 0) - armPivot.rotation.y) * Math.min(1, dt * 0.8);

    // Motores: quais grupos estão queimando agora (decidido pela telemetria).
    const burning = t.engineOn && !t.failed;
    const expansion = 1 + clamp01(alt / 60) * 2.2;
    let lightPower = 0;
    for (const p of plumes) {
      const on = burning && (p.group === 'upper' ? t.stage === 1 : t.stage === 0 && (p.group === 'core' || t.boostersAttached));
      p.plume.set(on, 1, p.group === 'upper' ? 3.2 : expansion, time);
      if (on) lightPower += 1;
    }
    // Sino de vácuo incandescente quando o estágio superior queima.
    for (const m of model.nozzleMaterials.upper) m.emissiveIntensity += ((burning && t.stage === 1 ? 1.6 : 0) - m.emissiveIntensity) * Math.min(1, dt * 1.5);
    model.parts.core.localToWorld(nozzleWorld.copy(model.nozzles.core[0]));
    if (t.stage >= 1) model.parts.upper.localToWorld(nozzleWorld.copy(model.nozzles.upper[0]));
    const flicker = 0.85 + 0.15 * Math.sin(time * 37) * Math.sin(time * 13.1);
    engineLight.position.copy(nozzleWorld).add(new THREE.Vector3(0, -6, 0));
    engineLight.intensity = Math.min(lightPower, 4) * 9000 * flicker * (1 - k * 0.9);
    for (const p of [smoke, steam]) {
      p.material.uniforms.uGlowPos.value.copy(nozzleWorld);
      p.material.uniforms.uGlow.value = lightPower > 0 ? Math.min(lightPower, 6) * flicker : 0;
    }

    // Emissão de partículas a partir das saídas dos motores em queima.
    if (burning) {
      fireAcc += dt * (hi ? 450 : 220);
      smokeAcc += dt * (alt < 45 ? (hi ? 150 : 70) : 0);
      const sources: THREE.Vector3[] = [];
      const down = new THREE.Vector3(0, -1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), rocketRoot.rotation.z);
      if (t.stage === 0) {
        sources.push(nozzleWorld.clone());
        if (t.boostersAttached) model.boosterMeshes.forEach((b, i) => sources.push(b.localToWorld(model.nozzles.boosters[i][0].clone())));
      } else sources.push(nozzleWorld.clone());
      const speed = Math.max(0, t.speed);
      while (fireAcc >= 1) {
        fireAcc -= 1;
        const src = sources[Math.floor(Math.random() * sources.length)];
        const v = down.clone().multiplyScalar(60 + Math.random() * 40).add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
        fire.spawn({ position: src.clone().addScaledVector(down, 2 + Math.random() * 6), velocity: v, life: 0.22 + Math.random() * 0.2, size: [2.5, alt < 1 ? 9 : 6] });
      }
      while (smokeAcc >= 1) {
        smokeAcc -= 1;
        const src = sources[Math.floor(Math.random() * sources.length)];
        const nearGround = rocketRoot.position.y < 120;
        if (nearGround) {
          // Nuvem de solo: fumaça e vapor saindo pelo fosso de chamas e se espalhando pelo chão.
          const a = Math.random() * Math.PI * 2;
          const sp = 20 + Math.random() * 35;
          const v = new THREE.Vector3(Math.cos(a) * sp * 0.5, 2 + Math.random() * 6, Math.abs(Math.sin(a)) * sp + 10);
          steam.spawn({ position: new THREE.Vector3((Math.random() - 0.5) * 10, 2, 8 + Math.random() * 10), velocity: v, life: 6 + Math.random() * 5, size: [6, 26] });
          smoke.spawn({ position: src.clone().addScaledVector(down, 8), velocity: new THREE.Vector3(Math.cos(a) * sp, Math.random() * 4, Math.sin(a) * sp), life: 8 + Math.random() * 5, size: [5, 22] });
        }
        // Rastro: fumaça que fica para trás enquanto o veículo sobe.
        smoke.spawn({
          position: src.clone().addScaledVector(down, 10 + Math.random() * 14).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)),
          velocity: down.clone().multiplyScalar(Math.min(30, speed * 0.01)).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)),
          life: 14 + Math.random() * 10,
          size: [4, 14 + alt * 0.4],
        });
      }
    }
    // Vapor da ventilação dos tanques criogênicos antes da ignição.
    if (!burning && alt < 0.01 && !exploded && Math.random() < dt * 30) {
      const y = 6 + model.spans.core.y1 * (0.5 + Math.random() * 0.4);
      steam.spawn({ position: new THREE.Vector3(model.spans.core.r + 0.3, y, (Math.random() - 0.5) * 2), velocity: new THREE.Vector3(1 + Math.random() * 2, -1.5, (Math.random() - 0.5)), life: 3 + Math.random() * 2, size: [1, 7] });
    }
    smoke.material.uniforms.uOpacity.value = 1 - k * 0.6;
    for (const p of [fire, smoke, steam, sparks]) p.update(dt, time);

    for (const d of debris) {
      d.v.y -= 9.8 * dt * 0.6;
      d.obj.position.addScaledVector(d.v, dt);
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.z += d.spin.z * dt;
    }

    // Tremor de câmera perto do solo e clarão da explosão.
    const near = burning ? clamp01(1 - camera.position.distanceTo(nozzleWorld) / 260) * (1 - clamp01(alt / 8)) : 0;
    shake.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(near * 0.9 + flash * 3);
    camera.position.add(shake);
    flash = Math.max(0, flash - dt * 1.2);
    stage.grade.uniforms.flash.value = flash * 0.85;
  });
  return { update: apply, dispose: stage.dispose };
}
