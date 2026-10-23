// Cena de chegada e operações em Marte: planeta, órbita de captura (escala real em raios de Marte) e sonda.
import * as THREE from 'three';
import type { SceneHandle } from '../components/ThreeView';
import { RADIUS } from '../domain/units';
import { createStage, line, planetTexture, starfield } from './common';

export interface MarsSceneProps {
  periAltKm: number | null;
  apoAltKm: number | null;
  /** Fração da órbita (0–1) para posicionar a sonda; null mostra a aproximação. */
  phase: number | null;
  dustStorm: boolean;
  status: 'aproximacao' | 'orbita' | 'perdida';
}

const R = 2; // raio de Marte em unidades de cena

export function createMarsScene(container: HTMLElement, initial: MarsSceneProps): SceneHandle<MarsSceneProps> {
  const stage = createStage(container, { position: [0, 9, 16], far: 3000 });
  const { scene } = stage;
  scene.background = new THREE.Color(0x02040a);
  scene.add(starfield(800));
  scene.add(new THREE.AmbientLight(0x3a2a22, 0.6));
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
  sun.position.set(30, 10, 20);
  scene.add(sun);
  const mars = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32), new THREE.MeshStandardMaterial({ map: planetTexture(['#4f1f10', '#9c4428', '#d8875a'], 11), roughness: 0.95 }));
  scene.add(mars);
  const haze = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 48, 24), new THREE.MeshBasicMaterial({ color: 0xd09060, transparent: true, opacity: 0.0 }));
  scene.add(haze);
  const probe = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0x5cc8ff }));
  scene.add(probe);
  let orbitLine: THREE.Line | null = null;
  let props = initial;
  let a = 0;
  let e = 0;

  const apply = (p: MarsSceneProps) => {
    props = p;
    if (orbitLine) { scene.remove(orbitLine); orbitLine.geometry.dispose(); orbitLine = null; }
    (haze.material as THREE.MeshBasicMaterial).opacity = p.dustStorm ? 0.35 : 0;
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
      orbitLine = line(pts, 0x5cc8ff, 0.7);
      orbitLine.rotation.x = 0.35;
      scene.add(orbitLine);
      stage.camera.position.set(0, Math.max(9, a * 0.9), Math.max(16, a * 1.6));
    }
  };
  apply(initial);
  let t = 0;
  stage.onFrame((dt) => {
    mars.rotation.y += dt * 0.05;
    t += dt;
    if (props.status === 'orbita' && orbitLine) {
      // Anomalia média uniforme → posição por Kepler (ilustrativo, período comprimido).
      const M = (t * 0.6) % (Math.PI * 2);
      let E = M;
      for (let k = 0; k < 8; k++) E = M + e * Math.sin(E);
      const x = a * (Math.cos(E) - e);
      const z = a * Math.sqrt(1 - e * e) * Math.sin(E);
      const v = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.35);
      probe.position.copy(v);
      probe.visible = true;
    } else if (props.status === 'aproximacao') {
      const s = (t * 0.15) % 1;
      probe.position.set(-14 + s * 12, 2 - s * 1.5, 6 - s * 4);
      probe.visible = true;
    } else probe.visible = false;
  });
  return { update: apply, dispose: stage.dispose };
}
