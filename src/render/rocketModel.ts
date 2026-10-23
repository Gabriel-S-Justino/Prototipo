// Modelo 3D procedural do lançador montado. Dimensões em metros a partir do catálogo (1 unidade = 1 m).
// É geometria ilustrativa, não CAD dos veículos reais.
import * as THREE from 'three';
import type { AssembledVehicle } from '../simulation/rocket/vehicle';

export type RocketPart = 'core' | 'boosters' | 'upper' | 'fairing' | 'probe';

export interface RocketModel {
  group: THREE.Group;
  parts: Record<RocketPart, THREE.Group>;
  boosterMeshes: THREE.Object3D[];
  fairingHalves: THREE.Object3D[];
  height: number;
  /** Pontos de exaustão (coordenadas locais) do núcleo e do estágio superior. */
  nozzles: { core: THREE.Vector3; upper: THREE.Vector3; boosters: THREE.Vector3[] };
}

const FAMILY_COLOR: Record<string, number> = { atlas: 0xd9893f, falcon: 0xeef2f7, vulcan: 0xe58c3a };

function metal(color: number, roughness = 0.45, metalness = 0.35) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function nozzle(radius: number, height: number) {
  const geo = new THREE.CylinderGeometry(radius * 0.35, radius, height, 24, 1, true);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3b3f47, roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide }));
  return mesh;
}

export function buildRocket(vehicle: AssembledVehicle, options: { cutaway?: boolean } = {}): RocketModel {
  const group = new THREE.Group();
  const parts = { core: new THREE.Group(), boosters: new THREE.Group(), upper: new THREE.Group(), fairing: new THREE.Group(), probe: new THREE.Group() } as Record<RocketPart, THREE.Group>;
  for (const [name, g] of Object.entries(parts)) {
    g.name = name;
    g.userData.part = name;
    group.add(g);
  }
  const coreR = vehicle.core.diameter / 2;
  const coreColor = FAMILY_COLOR[vehicle.core.family] ?? 0xcccccc;

  // Núcleo
  const engineH = 3.2;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(coreR, coreR, vehicle.core.length, 40), metal(coreColor, 0.6, 0.15));
  core.position.y = engineH + vehicle.core.length / 2;
  core.castShadow = true;
  parts.core.add(core);
  const ringMat = metal(0x2b2f36, 0.5, 0.6);
  for (const y of [engineH + 0.4, engineH + vehicle.core.length - 0.4]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(coreR * 1.02, coreR * 1.02, 0.8, 40), ringMat);
    ring.position.y = y;
    parts.core.add(ring);
  }
  const n = vehicle.core.engineCount;
  for (let i = 0; i < n; i++) {
    const nz = nozzle(n > 2 ? coreR * 0.28 : coreR * 0.42, engineH);
    const a = (i / n) * Math.PI * 2;
    const rr = n === 1 ? 0 : n === 2 ? coreR * 0.45 : i === 0 && n === 9 ? 0 : coreR * 0.62;
    const ang = n === 9 ? ((i - 1) / 8) * Math.PI * 2 : a;
    nz.position.set(n === 9 && i === 0 ? 0 : Math.cos(ang) * rr, engineH / 2, n === 9 && i === 0 ? 0 : Math.sin(ang) * rr);
    parts.core.add(nz);
  }

  // Propulsores laterais
  const boosterMeshes: THREE.Object3D[] = [];
  const boosterNozzles: THREE.Vector3[] = [];
  const nb = vehicle.booster ? vehicle.config.boosterCount : 0;
  if (vehicle.booster && nb > 0) {
    const liquid = vehicle.booster.kind === 'liquido';
    const bR = liquid ? coreR : 0.8;
    const bL = liquid ? vehicle.core.length : 19;
    for (let i = 0; i < nb; i++) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(bR, bR, bL, 28), metal(liquid ? coreColor : 0xf2f2f2, 0.55, 0.1));
      body.position.y = bL / 2 + engineH;
      body.castShadow = true;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(bR, liquid ? 3 : 2.5, 28), metal(liquid ? 0x22252b : 0xf2f2f2));
      cone.position.y = engineH + bL + (liquid ? 1.5 : 1.25);
      const nz = nozzle(bR * 0.7, engineH);
      nz.position.y = engineH / 2;
      b.add(body, cone, nz);
      const a = (i / nb) * Math.PI * 2 + Math.PI / 4;
      const d = coreR + bR + 0.15;
      b.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      b.userData.part = 'boosters';
      parts.boosters.add(b);
      boosterMeshes.push(b);
      boosterNozzles.push(new THREE.Vector3(b.position.x, 0, b.position.z));
    }
  }

  // Interestágio e estágio superior
  const baseUpper = engineH + vehicle.core.length;
  const upR = vehicle.upper.diameter / 2;
  const inter = new THREE.Mesh(new THREE.CylinderGeometry(upR, coreR, 2.5, 40), metal(0x1d2129, 0.6, 0.4));
  inter.position.y = baseUpper + 1.25;
  parts.core.add(inter);
  const upLen = vehicle.upper.length;
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(upR, upR, upLen, 40), metal(vehicle.upper.family === 'falcon' ? 0xeef2f7 : 0xd6d9de, 0.35, 0.55));
  upper.position.y = baseUpper + 2.5 + upLen / 2;
  upper.castShadow = true;
  parts.upper.add(upper);
  const ue = vehicle.config.upperEngineCount;
  for (let i = 0; i < ue; i++) {
    const nz = nozzle(upR * 0.32, 2.2);
    nz.position.set(ue === 1 ? 0 : (i === 0 ? -1 : 1) * upR * 0.35, baseUpper + 1.4, 0);
    parts.upper.add(nz);
  }

  // Sonda e coifa
  const topUpper = baseUpper + 2.5 + upLen;
  const fR = vehicle.fairing.diameter / 2;
  const adapter = new THREE.Mesh(new THREE.CylinderGeometry(0.6, upR * 0.6, 1, 24), metal(0x8a919c, 0.4, 0.7));
  adapter.position.y = topUpper + 0.5;
  parts.probe.add(adapter);
  const bus = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 1.8), metal(0xc9a227, 0.25, 0.9));
  bus.position.y = topUpper + 2.1;
  parts.probe.add(bus);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.4, 32, 12, 0, Math.PI * 2, 0, Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide }));
  dish.rotation.x = Math.PI;
  dish.position.y = topUpper + 4.4;
  parts.probe.add(dish);
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1b2e5a, roughness: 0.25, metalness: 0.6, emissive: 0x050b1a });
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 1.4), panelMat);
    panel.position.set(s * 1.0, topUpper + 2.1, 0);
    parts.probe.add(panel);
  }
  const fairH = 9;
  const fairingHalves: THREE.Object3D[] = [];
  const fairMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f9, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide, transparent: !!options.cutaway, opacity: options.cutaway ? 0.28 : 1 });
  for (const s of [0, 1]) {
    const half = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(fR, fR, fairH * 0.6, 40, 1, true, s * Math.PI, Math.PI), fairMat);
    cyl.position.y = topUpper + fairH * 0.3;
    const ogive = new THREE.Mesh(new THREE.ConeGeometry(fR, fairH * 0.4, 40, 1, true, s * Math.PI, Math.PI), fairMat);
    ogive.position.y = topUpper + fairH * 0.6 + fairH * 0.2;
    half.add(cyl, ogive);
    half.userData.side = s === 0 ? 1 : -1;
    parts.fairing.add(half);
    fairingHalves.push(half);
  }
  const height = topUpper + fairH;
  return { group, parts, boosterMeshes, fairingHalves, height, nozzles: { core: new THREE.Vector3(0, 0, 0), upper: new THREE.Vector3(0, baseUpper + 0.2, 0), boosters: boosterNozzles } };
}

/** Destaca uma parte (emissão azul) e remove o destaque das demais. */
export function highlight(model: RocketModel, part: RocketPart | null) {
  for (const [name, g] of Object.entries(model.parts)) {
    g.traverse((obj) => {
      const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && 'emissive' in mat) {
        mat.emissive.setHex(name === part ? 0x0b4f7a : name === 'probe' ? 0x050b1a : 0x000000);
      }
    });
  }
}
