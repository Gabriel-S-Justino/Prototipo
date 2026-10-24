// Cena do Sistema Solar interno: Sol, Terra, Marte, órbitas, trajetória e nave.
// Escala de distâncias: 1 UA = 10 unidades (linear). Tamanhos de Sol e planetas ampliados (fora de escala).
// Texturas reais da NASA (Blue Marble, Black Marble, mosaico Viking, mapa estelar Tycho).
import * as THREE from 'three';
import type { SceneHandle } from '../components/ThreeView';
import { DEFAULT_PROBE, type ProbeConfig } from '../data/probe';
import { AU_KM } from '../domain/units';
import type { Vec3 } from '../simulation/orbital/vector';
import { createStage, disposeObject, glowTexture, label, line } from './common';
import { createEarth, createMars, createSun, skySphere } from './planets';
import { buildProbe } from './probeModel';

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
  /** Configuração da sonda (o modelo exibido no cruzeiro). */
  probe?: ProbeConfig;
}

export function createSolarScene(container: HTMLElement, initial: SolarSceneProps): SceneHandle<SolarSceneProps> {
  const stage = createStage(container, { position: [0, 31, 26], far: 3000, exposure: 1, bloom: { strength: 0.9, radius: 0.6, threshold: 1.1 }, shadows: false });
  const { scene } = stage;
  stage.grade.uniforms.aberration.value = 0;
  scene.background = new THREE.Color(0x000000);
  scene.add(skySphere(1400));
  scene.add(new THREE.AmbientLight(0x223044, 0.08));
  const origin = new THREE.Vector3();
  const sunLight = new THREE.PointLight(0xfff4e0, 3.2, 0, 0);
  scene.add(sunLight);
  const sun = createSun(1.2);
  scene.add(sun.group);

  const earth = createEarth(0.55, origin);
  const mars = createMars(0.42, origin);
  scene.add(earth.group, mars.group);
  const marsRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.74, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.6, 0.35), side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  marsRing.rotation.x = -Math.PI / 2;
  const earthLabel = label('Terra', '#9cd2ff', 0.8);
  const marsLabel = label('Marte', '#ffb08a', 0.8);
  scene.add(marsRing, earthLabel, marsLabel);

  // Nave: o modelo da sonda (ampliado, pois em escala real seria invisível) com um brilho que a localiza.
  const craft = new THREE.Group();
  let probeModel = buildProbe(initial.probe ?? DEFAULT_PROBE);
  probeModel.deploy(1);
  probeModel.group.scale.setScalar(0.045);
  craft.add(probeModel.group);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(120,210,255,1)'), color: new THREE.Color(1.5, 2.4, 3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  beacon.scale.setScalar(0.9);
  craft.add(beacon);
  const craftLabel = label('Sonda', '#5cc8ff', 0.7);
  scene.add(craft, craftLabel);
  let probeKey = JSON.stringify(initial.probe ?? DEFAULT_PROBE);

  let dynamic: THREE.Object3D[] = [];
  const clearDynamic = () => {
    for (const o of dynamic) {
      scene.remove(o);
      disposeObject(o);
    }
    dynamic = [];
  };
  const addLine = (pts: Vec3[] | undefined, color: THREE.Color | number, opacity: number, dashed = false) => {
    if (!pts || pts.length < 2) return;
    const l = line(pts.map(toScene), 0xffffff, opacity, dashed);
    (l.material as THREE.LineBasicMaterial).color = new THREE.Color(color);
    scene.add(l);
    dynamic.push(l);
  };

  const apply = (p: SolarSceneProps) => {
    clearDynamic();
    addLine(p.earthOrbit, new THREE.Color(0.25, 0.55, 1.1), 0.55);
    addLine(p.marsOrbit, new THREE.Color(1.1, 0.45, 0.28), 0.55);
    addLine(p.planned, new THREE.Color(0.75, 0.8, 0.9), 0.7, true);
    addLine(p.traveled, new THREE.Color(0.5, 1.6, 2.2), 1);
    addLine(p.predicted, new THREE.Color(0.4, 1.2, 1.7), 0.45, true);
    for (const m of p.markers ?? []) {
      const s = label(m.text, m.color ?? '#cfd8e6', 0.6);
      s.position.copy(toScene(m.at)).add(new THREE.Vector3(1.4, 0.6, 0));
      scene.add(s);
      dynamic.push(s);
    }
    earth.group.position.copy(toScene(p.earth));
    mars.group.position.copy(toScene(p.mars));
    marsRing.position.copy(mars.group.position);
    marsRing.visible = !!p.highlightMars;
    earthLabel.position.copy(earth.group.position).add(new THREE.Vector3(1.6, 0.8, 0));
    marsLabel.position.copy(mars.group.position).add(new THREE.Vector3(1.6, 0.8, 0));
    craft.visible = craftLabel.visible = !!p.spacecraft;
    if (p.spacecraft) {
      craft.position.copy(toScene(p.spacecraft));
      craftLabel.position.copy(craft.position).add(new THREE.Vector3(1.4, 0.6, 0));
    }
    const key = JSON.stringify(p.probe ?? DEFAULT_PROBE);
    if (key !== probeKey) {
      probeKey = key;
      craft.remove(probeModel.group);
      disposeObject(probeModel.group);
      probeModel = buildProbe(p.probe ?? DEFAULT_PROBE);
      probeModel.deploy(1);
      probeModel.group.scale.setScalar(0.045);
      craft.add(probeModel.group);
    }
  };
  apply(initial);
  stage.onFrame((dt, t) => {
    earth.update(dt);
    mars.update(dt);
    sun.update(t);
    // A sonda aponta os painéis para o Sol e gira devagar.
    craft.lookAt(origin);
    probeModel.group.rotation.y += dt * 0.3;
    beacon.material.opacity = 0.75 + 0.25 * Math.sin(t * 3);
  });
  return { update: apply, dispose: stage.dispose };
}
