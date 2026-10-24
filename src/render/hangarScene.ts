// Cena do hangar: interior de um prédio de montagem vertical inspirado no Vehicle Assembly Building (VAB)
// do Centro Espacial Kennedy. O foguete fica sobre a plataforma de lançamento móvel, cercado por plataformas
// de trabalho retráteis, sob a ponte rolante. Trocar uma peça no painel faz a ponte rolante descer a peça nova
// até o lugar; o abastecimento aparece como gelo nos tanques. Clicar numa parte a seleciona.
import * as THREE from 'three';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import type { SceneHandle } from '../components/ThreeView';
import type { ProbeConfig } from '../data/probe';
import type { AssembledVehicle } from '../simulation/rocket/vehicle';
import { clamp01, createStage, disposeObject, easeInOut, studioEnvironment } from './common';
import { concreteMaterial, hazardMaterial, skinMaterial, steelMaterial } from './materials';
import { buildRocket, highlight, type RocketModel, type RocketPart } from './rocketModel';

export interface HangarSceneProps {
  vehicle: AssembledVehicle;
  probe?: ProbeConfig;
  selected: RocketPart | null;
  onSelect: (part: RocketPart) => void;
}

// Baia alta (m). O VAB real tem 160 m; aqui a baia foi reduzida para enquadrar veículos de até ~80 m.
const BAY = { halfX: 30, halfZ: 56, height: 122 };
const DECK = 7; // altura do convés da plataforma móvel
const ORDER: RocketPart[] = ['core', 'boosters', 'upper', 'probe', 'fairing'];

/** Partes cuja geometria muda entre duas configurações (para animar só o que foi trocado). */
export function changedParts(a: AssembledVehicle, b: AssembledVehicle, pa?: ProbeConfig, pb?: ProbeConfig): RocketPart[] {
  const ca = a.config;
  const cb = b.config;
  const out: RocketPart[] = [];
  const coreChanged = ca.coreId !== cb.coreId;
  if (coreChanged) out.push('core');
  if (coreChanged || ca.boosterId !== cb.boosterId || ca.boosterCount !== cb.boosterCount) out.push('boosters');
  if (coreChanged || ca.upperId !== cb.upperId || ca.upperEngineId !== cb.upperEngineId || ca.upperEngineCount !== cb.upperEngineCount) out.push('upper');
  if (JSON.stringify(pa) !== JSON.stringify(pb)) out.push('probe');
  if (out.includes('upper') || ca.fairingId !== cb.fairingId) out.push('fairing');
  return ORDER.filter((p) => out.includes(p));
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[], shadows = false) {
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}
const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

/** Feixe de luz volumétrico falso: plano aditivo com gradiente que some na ponta e nas bordas. */
function lightShaft(width: number, length: number, color: THREE.Color, intensity: number) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: color }, intensity: { value: intensity }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 color; uniform float intensity, time; varying vec2 vUv;
      void main(){
        float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float fade = pow(1.0 - vUv.y, 1.6);
        float flicker = 0.85 + 0.15 * sin(vUv.x * 40.0 + time * 0.7);
        gl_FragColor = vec4(color * intensity * edge * fade * flicker, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), mat);
  return mesh;
}

/** Figura humana simples (macacão branco e capacete amarelo) para dar escala. */
function worker(color = 0xe9ecef) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.95, 4, 8), suit);
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc89f7c, roughness: 0.7 }));
  head.position.y = 1.55;
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2c416, roughness: 0.4 }));
  hat.position.y = 1.6;
  g.add(body, head, hat);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

export function createHangarScene(container: HTMLElement, initial: HangarSceneProps): SceneHandle<HangarSceneProps> {
  const stage = createStage(container, {
    fov: 50, position: [16, 12, 50], target: [0, 34, 0], far: 900,
    exposure: 0.9, bloom: { strength: 0.4, radius: 0.5, threshold: 2.2 }, vignette: 1,
  });
  const { scene, camera, renderer, controls } = stage;
  const hi = stage.quality === 'alta';
  controls.maxDistance = 95;
  controls.minDistance = 10;
  controls.maxPolarAngle = Math.PI * 0.53;
  scene.background = new THREE.Color(0x15171a);
  scene.fog = new THREE.FogExp2(0x1f2124, 0.0048);
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.35;

  // ── Iluminação: luminárias industriais no teto, luz do dia pelas frestas da porta e contraluz frio ──
  scene.add(new THREE.HemisphereLight(0xdfe6ef, 0x3a342c, 0.3));
  stage.grade.uniforms.aberration.value = 0.0006;
  const key = new THREE.SpotLight(0xfff1dc, 7000, 260, Math.PI / 5, 0.55, 1.6);
  key.position.set(18, BAY.height - 8, 22);
  key.target.position.set(0, 25, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
  key.shadow.bias = -0.0004;
  key.shadow.camera.near = 20;
  key.shadow.camera.far = 220;
  scene.add(key, key.target);
  const daylight = new THREE.DirectionalLight(0xbfd6ff, 1.6);
  daylight.position.set(-10, 60, -80);
  daylight.target.position.set(0, 20, 0);
  scene.add(daylight, daylight.target);
  const rimL = new THREE.SpotLight(0x8fc4ff, 4000, 200, Math.PI / 7, 0.7, 1.6);
  rimL.position.set(-26, 70, -26);
  rimL.target.position.set(0, 40, 0);
  const rimR = new THREE.SpotLight(0xffd2a1, 3000, 200, Math.PI / 7, 0.7, 1.6);
  rimR.position.set(26, 12, -20);
  rimR.target.position.set(0, 30, 0);
  scene.add(rimL, rimL.target, rimR, rimR.target);

  // ── Piso, paredes e estrutura metálica ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(BAY.halfX * 2, BAY.halfZ * 2), concreteMaterial(BAY.halfX * 2, 10));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xe0b324, roughness: 0.7 });
  for (const x of [-21, 21]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.35, BAY.halfZ * 2 - 4), lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(x, 0.02, 0);
    scene.add(l);
  }
  const wallMat = skinMaterial({ color: '#4b4f55', style: 'metal', length: BAY.height, tile: 12, rings: 1, panels: 40, roughness: 0.7, metalness: 0.5 });
  const sideGeo = new THREE.PlaneGeometry(BAY.halfZ * 2, BAY.height);
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(sideGeo, wallMat);
    wall.position.set(s * BAY.halfX, BAY.height / 2, 0);
    wall.rotation.y = -s * Math.PI / 2;
    wall.receiveShadow = true;
    scene.add(wall);
  }
  const front = new THREE.Mesh(new THREE.PlaneGeometry(BAY.halfX * 2, BAY.height), wallMat);
  front.position.set(0, BAY.height / 2, BAY.halfZ);
  front.rotation.y = Math.PI;
  scene.add(front);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(BAY.halfX * 2, BAY.halfZ * 2), steelMaterial('#2c2e32', 0.8));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = BAY.height;
  scene.add(ceiling);

  const steel = steelMaterial('#9aa0a7', 0.55);
  const colGeo = new THREE.BoxGeometry(1.1, 1, 1.1);
  const cols: THREE.Matrix4[] = [];
  const girders: THREE.Matrix4[] = [];
  const braces: THREE.Matrix4[] = [];
  for (const s of [-1, 1]) {
    for (let z = -BAY.halfZ + 4; z <= BAY.halfZ - 4; z += 8) cols.push(at(s * (BAY.halfX - 0.6), BAY.height / 2, z, 1, BAY.height, 1));
    for (let y = 14; y < BAY.height; y += 14) {
      girders.push(at(s * (BAY.halfX - 0.8), y, 0, 0.9, 1.2, BAY.halfZ * 2));
      for (let z = -BAY.halfZ + 4; z < BAY.halfZ - 4; z += 8) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(s * (BAY.halfX - 0.9), y - 7, z + 4), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan2(8, 14) * (z % 16 === 0 ? 1 : -1), 0, 0)), new THREE.Vector3(0.35, 16, 0.35));
        braces.push(m);
      }
    }
  }
  for (let x = -BAY.halfX + 4; x <= BAY.halfX - 4; x += 8) cols.push(at(x, BAY.height / 2, BAY.halfZ - 0.6, 1, BAY.height, 1));
  scene.add(instanced(colGeo, steel, cols), instanced(colGeo, steel, girders), instanced(colGeo, steel, braces));

  // ── Porta da baia alta: painéis horizontais com frestas de luz do dia ──
  const door = new THREE.Group();
  const doorW = 40;
  const doorH = 112;
  const doorPanel = skinMaterial({ color: '#7d8289', style: 'metal', length: 9, tile: 9, rings: 1, panels: 20, roughness: 0.6, metalness: 0.6 });
  const slitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xcfe3ff).multiplyScalar(2.5), toneMapped: true });
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(doorW, 9, 0.5), doorPanel);
    p.position.set(0, 4.5 + i * 9.3, -BAY.halfZ);
    door.add(p);
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 1, 0.18), slitMat);
    slit.position.set(0, 9.15 + i * 9.3, -BAY.halfZ + 0.3);
    door.add(slit);
  }
  for (const s of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(BAY.halfX - doorW / 2, BAY.height, 1), wallMat);
    jamb.position.set(s * (doorW / 2 + (BAY.halfX - doorW / 2) / 2), BAY.height / 2, -BAY.halfZ - 0.2);
    door.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW, BAY.height - doorH, 1), wallMat);
  lintel.position.set(0, doorH + (BAY.height - doorH) / 2, -BAY.halfZ - 0.2);
  door.add(lintel);
  scene.add(door);
  const shafts: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const shaft = lightShaft(doorW * 0.9, 70, new THREE.Color(0x9cc2ff), 0.03 + i * 0.004);
    const y = 20 + i * 20;
    shaft.position.set(0, y - 18, -BAY.halfZ + 30);
    shaft.rotation.x = -Math.PI / 2 + 0.55;
    shafts.push(shaft);
    scene.add(shaft);
  }

  // ── Luminárias do teto e ponte rolante ──
  const lampGeo = new THREE.CylinderGeometry(0.7, 0.9, 0.5, 16);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0d6).multiplyScalar(3) });
  const lamps: THREE.Matrix4[] = [];
  for (let x = -22; x <= 22; x += 11) for (let z = -24; z <= 24; z += 12) lamps.push(at(x, BAY.height - 3, z));
  scene.add(instanced(lampGeo, lampMat, lamps));

  const crane = new THREE.Group();
  const craneMat = steelMaterial('#c9a227', 0.5);
  for (const z of [-2.4, 2.4]) {
    const girder = new THREE.Mesh(new THREE.BoxGeometry(BAY.halfX * 2 - 2, 2.6, 1.2), craneMat);
    girder.position.set(0, 0, z);
    crane.add(girder);
  }
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 6.4), steelMaterial('#3e4247', 0.5));
  trolley.position.y = -1.8;
  crane.add(trolley);
  crane.position.set(0, BAY.height - 10, 0);
  scene.add(crane);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, BAY.halfZ * 2), steel);
    rail.position.set(s * (BAY.halfX - 1.4), BAY.height - 9.5, 0);
    scene.add(rail);
  }
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.4, metalness: 0.9 });
  const cables = [-0.6, 0.6].map((x) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), cableMat);
    c.position.x = x;
    scene.add(c);
    return c;
  });
  const hook = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 1.2), steelMaterial('#d8a21b', 0.45));
  const hookMesh = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.18, 8, 16, Math.PI * 1.4), steelMaterial('#5a5e64', 0.35));
  hookMesh.position.y = -1.9;
  hook.add(block, hookMesh);
  scene.add(hook);
  let hookY = 70;

  // ── Plataforma de lançamento móvel (convés, pedestais, postes de fixação) ──
  const ml = new THREE.Group();
  const deckMat = steelMaterial('#5b5f65', 0.65, [3, 3]);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(34, DECK - 1.5, 26), deckMat);
  deck.position.y = 1.5 + (DECK - 1.5) / 2;
  deck.castShadow = deck.receiveShadow = true;
  ml.add(deck);
  for (const x of [-14, 0, 14]) for (const z of [-10, 10]) {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 3), steelMaterial('#3c3f44'));
    ped.position.set(x, 0.75, z);
    ml.add(ped);
  }
  const edge = hazardMaterial(14);
  for (const z of [-13.01, 13.01]) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(34, 0.7), edge);
    stripe.position.set(0, DECK - 0.4, z);
    if (z < 0) stripe.rotation.y = Math.PI;
    ml.add(stripe);
  }
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 1 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = DECK + 0.02;
  ml.add(hole);
  scene.add(ml);

  // Equipamentos de solo e pessoas (escala).
  const crates: THREE.Matrix4[] = [];
  for (let i = 0; i < 9; i++) crates.push(at(-24 + (i % 3) * 2.6, 1.1 + Math.floor(i / 3) * 0 + (i % 2) * 0, 18 + Math.floor(i / 3) * 2.6, 2.4, 2.2, 2.4));
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), steelMaterial('#2f5d8a', 0.6), crates, true));
  const carts: THREE.Matrix4[] = [at(22, 0.7, -14, 4, 1.4, 2), at(23, 0.7, 20, 3, 1.4, 2), at(-22, 1, -20, 2, 2, 6)];
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), steelMaterial('#c7c9cc', 0.5), carts, true));
  const people = [
    [12, 0, 18, 0.4], [14, 0, 17, -1.2], [-9, DECK, 9, 2.4], [8, DECK, -10, 0.3], [-20, 0, 6, 1.6], [3, 0, 22, 3],
  ].map(([x, y, z, r]) => {
    const p = worker(Math.random() < 0.3 ? 0x2b4f87 : 0xe9ecef);
    p.position.set(x, y, z);
    p.rotation.y = r;
    scene.add(p);
    return p;
  });

  // Poeira em suspensão iluminada pelos feixes.
  const DUST = hi ? 1600 : 700;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) dustPos.set([(Math.random() - 0.5) * 50, Math.random() * 100, (Math.random() - 0.5) * 56], i * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xfff2dd, size: 0.12, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(dust);

  // ── Plataformas de trabalho retráteis (dos dois lados), recalculadas para o diâmetro do veículo ──
  const platforms = new THREE.Group();
  scene.add(platforms);
  const platformHalves: { mesh: THREE.Group; side: number; closed: number }[] = [];
  const buildPlatforms = (m: RocketModel) => {
    disposeObject(platforms);
    platforms.clear();
    platformHalves.length = 0;
    const railMat = steelMaterial('#e0b324', 0.5);
    const platMat = steelMaterial('#b9bdc3', 0.6, [4, 1]);
    const levels: number[] = [];
    for (let y = DECK + 12; y < DECK + m.height - 2; y += 11) levels.push(y);
    for (const y of levels) {
      const local = y - DECK;
      let r = 0;
      for (const span of Object.values(m.spans)) if (local >= span.y0 && local <= span.y1) r = Math.max(r, span.r);
      const inner = (r || 2.5) + 1.2;
      for (const side of [-1, 1]) {
        const g = new THREE.Group();
        const len = BAY.halfX - 1.5 - inner;
        const plat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 14), platMat);
        plat.position.x = side * (inner + len / 2);
        plat.castShadow = plat.receiveShadow = true;
        const lip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 14), hazardMaterial(6));
        lip.position.x = side * inner;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 14), railMat);
        rail.position.set(side * (inner + 0.2), 1.1, 0);
        const posts: THREE.Matrix4[] = [];
        for (let z = -7; z <= 7; z += 1.75) posts.push(at(side * (inner + 0.2), 0.55, z, 0.07, 1.1, 0.07));
        for (let x = inner + 1.5; x < inner + len; x += 1.75) for (const z of [-7, 7]) posts.push(at(side * x, 0.55, z, 0.07, 1.1, 0.07));
        const truss = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, 0.4), steel);
        truss.position.set(side * (inner + len / 2), -1.1, 6.8);
        const truss2 = truss.clone();
        truss2.position.z = -6.8;
        g.add(plat, lip, rail, instanced(new THREE.BoxGeometry(1, 1, 1), railMat, posts), truss, truss2);
        g.position.y = y;
        platforms.add(g);
        platformHalves.push({ mesh: g, side, closed: 1 });
      }
    }
  };

  // ── Foguete e animação de montagem ──
  let model: RocketModel | null = null;
  let props = initial;
  let anims: { part: RocketPart; delay: number; t: number }[] = [];
  // Relógio real (não limitado por quadro): a montagem dura o mesmo tempo em máquinas lentas.
  let clockNow = 0;
  const LIFT = 34;
  const outline = new OutlinePass(new THREE.Vector2(512, 512), scene, camera);
  outline.visibleEdgeColor.set(0x5cd0ff);
  outline.hiddenEdgeColor.set(0x0d3550);
  outline.edgeStrength = 2.2;
  outline.edgeGlow = 0;
  outline.edgeThickness = 1;
  outline.pulsePeriod = 2.5;
  stage.addPass(outline);

  const rocketRoot = new THREE.Group();
  rocketRoot.position.y = DECK;
  scene.add(rocketRoot);
  let fairingOpen = 0;

  const rebuild = (vehicle: AssembledVehicle, probe: ProbeConfig | undefined, animate: RocketPart[]) => {
    if (model) {
      rocketRoot.remove(model.group);
      disposeObject(model.group);
    }
    model = buildRocket(vehicle, { cutaway: true, probe: probe ?? null });
    model.group.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    rocketRoot.add(model.group);
    buildPlatforms(model);
    anims = animate.map((part, i) => ({ part, delay: i * 1.1, t: clockNow }));
    for (const a of anims) model.parts[a.part].position.y = LIFT;
    highlight(model, props.selected, 0.6);
    outline.selectedObjects = props.selected ? [model.parts[props.selected]] : [];
  };
  rebuild(initial.vehicle, initial.probe, ORDER);

  const desiredTarget = new THREE.Vector3(0, 34, 0);
  const frameSelected = (part: RocketPart | null) => {
    if (!model || !part) return;
    const s = model.spans[part];
    if (!s || s.y1 <= s.y0) return;
    desiredTarget.set(0, DECK + (s.y0 + s.y1) / 2, 0);
  };
  frameSelected(initial.selected);

  stage.onFrame((dt, time) => {
    clockNow = time;
    for (const s of shafts) (s.material as THREE.ShaderMaterial).uniforms.time.value = time;
    // Poeira subindo devagar.
    const arr = dustGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < DUST; i++) {
      arr[i * 3 + 1] += dt * (0.15 + (i % 7) * 0.03);
      arr[i * 3] += Math.sin(time * 0.3 + i) * dt * 0.08;
      if (arr[i * 3 + 1] > 100) arr[i * 3 + 1] = 0;
    }
    dustGeo.attributes.position.needsUpdate = true;
    people[0].rotation.y = 0.4 + Math.sin(time * 0.4) * 0.5;

    // Enquadramento suave da parte selecionada (move alvo e câmera juntos).
    const delta = desiredTarget.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 2.2));
    controls.target.add(delta);
    camera.position.add(delta);
    // Mantém a câmera dentro do prédio.
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -BAY.halfX + 2, BAY.halfX - 2);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -BAY.halfZ + 2, BAY.halfZ - 2);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, 1.5, BAY.height - 14);

    if (!model) return;
    let active: { part: RocketPart; k: number } | null = null;
    for (const a of anims) {
      const k = clamp01((time - a.t - a.delay) / 2.2);
      model.parts[a.part].position.y = LIFT * (1 - easeInOut(k));
      if (k > 0 && k < 1 && !active) active = { part: a.part, k };
    }
    if (anims.length && anims.every((a) => time - a.t - a.delay >= 2.2)) anims = [];
    // Plataformas recuam enquanto a ponte rolante trabalha e fecham ao redor do veículo no fim.
    const closing = anims.length ? 0 : 1;
    for (const p of platformHalves) {
      p.closed += (closing - p.closed) * Math.min(1, dt * 1.5);
      p.mesh.position.x = p.side * (1 - p.closed) * 9;
    }
    // A ponte rolante acompanha a peça em movimento.
    const span = active ? model.spans[active.part] : null;
    const targetHook = span ? DECK + span.y1 + model.parts[active!.part].position.y + 3 : BAY.height - 30;
    hookY += (targetHook - hookY) * Math.min(1, dt * 4);
    hook.position.set(0, hookY, 0);
    const top = crane.position.y - 2.9;
    for (const c of cables) {
      c.scale.y = Math.max(0.1, top - (hookY + 1.3));
      c.position.y = (top + hookY + 1.3) / 2;
    }
    // A coifa abre quando a sonda é a parte em edição, para mostrar a montagem dentro dela.
    const wantOpen = props.selected === 'probe' ? 1 : 0;
    fairingOpen += (wantOpen - fairingOpen) * Math.min(1, dt * 2.5);
    for (const half of model.fairingHalves) {
      const s = half.userData.side as number;
      half.position.x = s * fairingOpen * 4.5;
      half.rotation.z = -s * fairingOpen * 0.05;
    }
    // Pulso suave no destaque da seleção.
    highlight(model, props.selected, 0.25 + 0.15 * Math.sin(time * 2.5));
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pick = (event: PointerEvent) => {
    if (!model) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(model.group, true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.part) o = o.parent;
      if (o?.userData.part) {
        props.onSelect(o.userData.part as RocketPart);
        return;
      }
    }
  };
  let downAt = 0;
  const down = () => { downAt = performance.now(); };
  const up = (e: PointerEvent) => { if (performance.now() - downAt < 250) pick(e); };
  renderer.domElement.addEventListener('pointerdown', down);
  renderer.domElement.addEventListener('pointerup', up);

  return {
    update(next) {
      const prev = props;
      props = next;
      const changed = next.vehicle !== prev.vehicle || next.probe !== prev.probe ? changedParts(prev.vehicle, next.vehicle, prev.probe, next.probe) : [];
      if (changed.length) rebuild(next.vehicle, next.probe, changed);
      else if (model) {
        model.setFrost(next.vehicle.config.coreLoad, next.vehicle.config.upperLoad);
        outline.selectedObjects = next.selected ? [model.parts[next.selected]] : [];
      }
      if (next.selected !== prev.selected) frameSelected(next.selected);
    },
    dispose() {
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', up);
      stage.dispose();
    },
  };
}
