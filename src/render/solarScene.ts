// Cena do Sistema Solar interno: Sol, Terra, Marte, órbitas, trajetória e nave.
// Escala de distâncias: 1 UA = 10 unidades (linear). Tamanhos de Sol e planetas ampliados (fora de escala).
import * as THREE from 'three';
import type { SceneHandle } from '../components/ThreeView';
import { AU_KM } from '../domain/units';
import type { Vec3 } from '../simulation/orbital/vector';
import { createStage, label, line, planetTexture, starfield } from './common';

export const AU_UNITS = 10;
/** Eclíptica (x, y, z) → cena (x, z, -y): o plano da eclíptica fica "deitado". */
export const toScene = (r: Vec3) => new THREE.Vector3((r[0] / AU_KM) * AU_UNITS, (r[2] / AU_KM) * AU_UNITS, -(r[1] / AU_KM) * AU_UNITS);

export interface SolarSceneProps {
  earth: Vec3;
  mars: Vec3;
  earthOrbit: Vec3[];
  marsOrbit: Vec3[];
  /** Trajetória planejada (tracejada) e prevista/real (contínua). */
  planned?: Vec3[];
  predicted?: Vec3[];
  traveled?: Vec3[];
  spacecraft?: Vec3 | null;
  highlightMars?: boolean;
  /** Marcadores de partida e chegada. */
  markers?: { at: Vec3; text: string; color?: string }[];
}

export function createSolarScene(container: HTMLElement, initial: SolarSceneProps): SceneHandle<SolarSceneProps> {
  const stage = createStage(container, { position: [0, 31, 26], far: 2000 });
  const { scene } = stage;
  scene.background = new THREE.Color(0x02040a);
  scene.add(starfield(600));
  scene.add(new THREE.AmbientLight(0x334466, 0.35));
  const sunLight = new THREE.PointLight(0xfff2d6, 900, 0, 1.6);
  scene.add(sunLight);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.2, 48, 24), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.8, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.18 }));
  scene.add(sun, glow);

  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.45, 48, 24), new THREE.MeshStandardMaterial({ map: planetTexture(['#123d7a', '#1f6fb8', '#3c8f4a'], 7), roughness: 0.8 }));
  const mars = new THREE.Mesh(new THREE.SphereGeometry(0.36, 48, 24), new THREE.MeshStandardMaterial({ map: planetTexture(['#5a2412', '#a4462a', '#d27b4b'], 3), roughness: 0.95 }));
  const marsRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.68, 48), new THREE.MeshBasicMaterial({ color: 0xff8a5c, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
  marsRing.rotation.x = -Math.PI / 2;
  const earthLabel = label('Terra', '#9cd2ff', 0.8);
  const marsLabel = label('Marte', '#ffb08a', 0.8);
  scene.add(earth, mars, marsRing, earthLabel, marsLabel);
  const craft = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0x5cc8ff }));
  const craftLabel = label('Sonda', '#5cc8ff', 0.7);
  scene.add(craft, craftLabel);

  let dynamic: THREE.Object3D[] = [];
  const clearDynamic = () => {
    for (const o of dynamic) {
      scene.remove(o);
      (o as THREE.Line).geometry?.dispose?.();
    }
    dynamic = [];
  };
  const addLine = (pts: Vec3[] | undefined, color: number, opacity: number, dashed = false) => {
    if (!pts || pts.length < 2) return;
    const l = line(pts.map(toScene), color, opacity, dashed);
    scene.add(l);
    dynamic.push(l);
  };

  const apply = (p: SolarSceneProps) => {
    clearDynamic();
    addLine(p.earthOrbit, 0x2d6db3, 0.6);
    addLine(p.marsOrbit, 0xb4553a, 0.6);
    addLine(p.planned, 0x9aa8bf, 0.7, true);
    addLine(p.traveled, 0x5cc8ff, 1);
    addLine(p.predicted, 0x5cc8ff, 0.45, true);
    for (const m of p.markers ?? []) {
      const s = label(m.text, m.color ?? '#cfd8e6', 0.6);
      s.position.copy(toScene(m.at)).add(new THREE.Vector3(1.4, 0.6, 0));
      scene.add(s);
      dynamic.push(s);
    }
    earth.position.copy(toScene(p.earth));
    mars.position.copy(toScene(p.mars));
    marsRing.position.copy(mars.position);
    marsRing.visible = !!p.highlightMars;
    earthLabel.position.copy(earth.position).add(new THREE.Vector3(1.6, 0.8, 0));
    marsLabel.position.copy(mars.position).add(new THREE.Vector3(1.6, 0.8, 0));
    craft.visible = craftLabel.visible = !!p.spacecraft;
    if (p.spacecraft) {
      craft.position.copy(toScene(p.spacecraft));
      craftLabel.position.copy(craft.position).add(new THREE.Vector3(1.4, 0.6, 0));
    }
  };
  apply(initial);
  stage.onFrame((dt, t) => {
    earth.rotation.y += dt * 0.6;
    mars.rotation.y += dt * 0.55;
    craft.rotation.y += dt * 1.5;
    glow.scale.setScalar(1 + Math.sin(t * 2) * 0.03);
  });
  return { update: apply, dispose: stage.dispose };
}
