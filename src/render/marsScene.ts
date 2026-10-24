// Cena de chegada e operações em Marte: planeta (mosaico Viking, NASA), órbita de captura em escala real
// de raios de Marte, Fobos e a sonda montada no hangar. A sonda aparece ampliada para ser visível.
import * as THREE from 'three';
import type { SceneHandle } from '../components/ThreeView';
import { DEFAULT_PROBE, type ProbeConfig } from '../data/probe';
import { RADIUS } from '../domain/units';
import { createStage, disposeObject, glowTexture, line } from './common';
import { createMars, skySphere } from './planets';
import { buildProbe, type ProbeModel } from './probeModel';

export interface MarsSceneProps {
  periAltKm: number | null;
  apoAltKm: number | null;
  /** Fração da órbita (0–1) para posicionar a sonda; null mostra a aproximação. */
  phase: number | null;
  dustStorm: boolean;
  status: 'aproximacao' | 'orbita' | 'perdida';
  probe?: ProbeConfig;
}

const R = 2; // raio de Marte em unidades de cena
const PROBE_SCALE = 0.035;

/** Fobos: rocha irregular (icosaedro deformado por ruído). */
function phobos() {
  const geo = new THREE.IcosahedronGeometry(0.11, 4);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 40) * Math.sin(v.y * 37) * Math.sin(v.z * 43);
    v.multiply(new THREE.Vector3(1.3, 0.9, 1)).multiplyScalar(1 + n * 0.12);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6f6259, roughness: 1, flatShading: true }));
}

export function createMarsScene(container: HTMLElement, initial: MarsSceneProps): SceneHandle<MarsSceneProps> {
  const stage = createStage(container, { position: [0, 6, 16], far: 3000, exposure: 1.05, bloom: { strength: 0.7, radius: 0.6, threshold: 1.2 }, shadows: false });
  const { scene } = stage;
  scene.background = new THREE.Color(0x000000);
  scene.add(skySphere(1200));
  scene.add(new THREE.AmbientLight(0x3a2a22, 0.05));
  const sunDir = new THREE.Vector3(30, 8, 18).normalize();
  const sunLight = new THREE.DirectionalLight(0xfff1dd, 3);
  sunLight.position.copy(sunDir).multiplyScalar(50);
  scene.add(sunLight);
  // Disco do Sol distante (visto de Marte, ~2/3 do tamanho aparente na Terra).
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,230,190,1)'), color: new THREE.Color(4, 3.4, 2.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sunGlow.position.copy(sunDir).multiplyScalar(900);
  sunGlow.scale.setScalar(60);
  scene.add(sunGlow);

  const mars = createMars(R, sunDir, true);
  mars.group.rotation.z = THREE.MathUtils.degToRad(25.2);
  scene.add(mars.group);
  const atmoU = (mars.atmosphere.material as THREE.ShaderMaterial).uniforms;
  const haze = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 64, 32), new THREE.MeshStandardMaterial({ color: 0xc98a5a, transparent: true, opacity: 0, roughness: 1, depthWrite: false }));
  scene.add(haze);
  const moon = phobos();
  scene.add(moon);

  const craft = new THREE.Group();
  let probeModel: ProbeModel = buildProbe(initial.probe ?? DEFAULT_PROBE);
  let probeKey = JSON.stringify(initial.probe ?? DEFAULT_PROBE);
  const mountProbe = () => {
    probeModel.deploy(1);
    probeModel.group.scale.setScalar(PROBE_SCALE);
    // Face dos instrumentos (+x do modelo) voltada para o planeta (−z do grupo após lookAt).
    probeModel.group.rotation.y = -Math.PI / 2;
    craft.add(probeModel.group);
  };
  mountProbe();
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(120,210,255,1)'), color: new THREE.Color(1.2, 2, 2.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  beacon.scale.setScalar(0.35);
  craft.add(beacon);
  scene.add(craft);

  let orbitLine: THREE.Line | null = null;
  let props = initial;
  let a = 0;
  let e = 0;

  const apply = (p: MarsSceneProps) => {
    props = p;
    if (orbitLine) { scene.remove(orbitLine); orbitLine.geometry.dispose(); orbitLine = null; }
    (haze.material as THREE.MeshStandardMaterial).opacity = p.dustStorm ? 0.45 : 0;
    atmoU.uStrength.value = p.dustStorm ? 2.2 : 0.9;
    if (p.periAltKm !== null && p.apoAltKm !== null && Number.isFinite(p.apoAltKm)) {
      const rp = ((RADIUS.mars + p.periAltKm) / RADIUS.mars) * R;
      const ra = ((RADIUS.mars + p.apoAltKm) / RADIUS.mars) * R;
      a = (rp + ra) / 2;
      e = (ra - rp) / (ra + rp);
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 256; k++) {
        const nu = (k / 256) * Math.PI * 2;
        const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
        pts.push(new THREE.Vector3(r * Math.cos(nu), 0, r * Math.sin(nu)));
      }
      orbitLine = line(pts, 0x5cc8ff, 0.6);
      (orbitLine.material as THREE.LineBasicMaterial).color.setRGB(0.5, 1.4, 2.0);
      orbitLine.rotation.x = 0.35;
      scene.add(orbitLine);
      stage.camera.position.set(0, Math.max(6, a * 0.7), Math.max(16, a * 1.6));
    }
    const key = JSON.stringify(p.probe ?? DEFAULT_PROBE);
    if (key !== probeKey) {
      probeKey = key;
      craft.remove(probeModel.group);
      disposeObject(probeModel.group);
      probeModel = buildProbe(p.probe ?? DEFAULT_PROBE);
      mountProbe();
    }
  };
  apply(initial);
  let t = 0;
  const center = new THREE.Vector3();
  stage.onFrame((dt, time) => {
    mars.update(dt);
    t += dt;
    // Fobos: órbita de 2,76 raios marcianos (período acelerado).
    const ph = time * 0.25;
    moon.position.set(Math.cos(ph) * R * 2.76, Math.sin(ph) * 0.05, Math.sin(ph) * R * 2.76);
    moon.rotation.y = -ph;
    beacon.material.opacity = 0.6 + 0.3 * Math.sin(time * 3);
    if (props.status === 'orbita' && orbitLine) {
      // Anomalia média uniforme → posição por Kepler (ilustrativo, período comprimido).
      const M = (t * 0.6) % (Math.PI * 2);
      let E = M;
      for (let k = 0; k < 8; k++) E = M + e * Math.sin(E);
      const x = a * (Math.cos(E) - e);
      const z = a * Math.sqrt(1 - e * e) * Math.sin(E);
      const v = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.35);
      craft.position.copy(v);
      craft.visible = true;
    } else if (props.status === 'aproximacao') {
      const s = (t * 0.15) % 1;
      craft.position.set(-14 + s * 12, 2 - s * 1.5, 6 - s * 4);
      craft.visible = true;
    } else craft.visible = false;
    craft.lookAt(center);
  });
  return { update: apply, dispose: stage.dispose };
}
