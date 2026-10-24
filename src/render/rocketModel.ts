// Modelo 3D do lançador montado, gerado a partir do catálogo de peças (1 unidade = 1 m).
// Cada peça do hangar muda a geometria: diâmetro e comprimento dos estágios, tipo e número de motores,
// tipo e quantidade de propulsores laterais, formato da coifa e a sonda. As cores e acabamentos seguem
// os veículos de referência (espuma laranja, pintura branca, compósito), sem logotipos de empresas.
// É uma representação fiel em proporções, não CAD dos veículos reais.
import * as THREE from 'three';
import type { ProbeConfig } from '../data/probe';
import type { AssembledVehicle } from '../simulation/rocket/vehicle';
import { frostMaterial, nozzleMaterial, skinMaterial, steelMaterial, textDecal } from './materials';
import { buildProbe, type ProbeModel } from './probeModel';

export type RocketPart = 'core' | 'boosters' | 'upper' | 'fairing' | 'probe';

/** Geometria de um motor: raio de saída, comprimento do sino e acabamento. */
export interface EngineLook {
  exitR: number;
  length: number;
  chambers: number;
  kind: 'regen' | 'ablative' | 'niobium' | 'srb';
  /** Motor de vácuo (pluma larga, sino incandescente). */
  vacuum: boolean;
}

export const ENGINE_LOOK: Record<string, EngineLook> = {
  // O RD-180 tem duas câmaras e dois sinos sobre uma única turbobomba.
  'rd-180': { exitR: 0.72, length: 2.9, chambers: 2, kind: 'regen', vacuum: false },
  'merlin-1d': { exitR: 0.46, length: 1.6, chambers: 1, kind: 'regen', vacuum: false },
  'be-4': { exitR: 0.95, length: 3.1, chambers: 1, kind: 'regen', vacuum: false },
  'merlin-1d-vac': { exitR: 1.55, length: 3.9, chambers: 1, kind: 'niobium', vacuum: true },
  'rl10a-4-2': { exitR: 0.58, length: 2.2, chambers: 1, kind: 'regen', vacuum: true },
  'rl10c-1': { exitR: 0.72, length: 2.4, chambers: 1, kind: 'regen', vacuum: true },
  'rl10c-1-1': { exitR: 0.9, length: 3.0, chambers: 1, kind: 'niobium', vacuum: true },
};

const SRB_LOOK: Record<string, { r: number; length: number }> = {
  'aj-60a': { r: 0.79, length: 20 },
  'gem-63xl': { r: 0.8, length: 22 },
};

/** Comprimento da coifa (m) e se ela encapsula o estágio superior inteiro (Atlas V 5 m). */
export const FAIRING_LOOK: Record<string, { length: number; encapsulates: boolean }> = {
  'atlas-4m': { length: 12.2, encapsulates: false },
  'atlas-5m': { length: 20.7, encapsulates: true },
  'falcon-5m': { length: 13.1, encapsulates: false },
  'vulcan-5m': { length: 15.5, encapsulates: false },
};

const INTERSTAGE: Record<string, number> = { atlas: 3.2, falcon: 6.5, vulcan: 4.2 };

/** Acabamento de cada família: espuma isolante laranja (Vulcan), bronze (Atlas V) e branco (Falcon). */
function coreSkin(family: string, length: number) {
  if (family === 'vulcan') return skinMaterial({ color: '#d0762f', style: 'foam', length, tile: 8, rings: 2, roughness: 0.85, text: 'MISSION ARCHITECT' });
  if (family === 'atlas') return skinMaterial({ color: '#c1824f', style: 'foam', length, tile: 8, rings: 3, roughness: 0.75, text: 'MISSION ARCHITECT' });
  return skinMaterial({ color: '#f2f3f4', style: 'paint', length, tile: 10, rings: 3, panels: 12, roughness: 0.42, text: 'MISSION ARCHITECT' });
}

export interface RocketModel {
  group: THREE.Group;
  parts: Record<RocketPart, THREE.Group>;
  boosterMeshes: THREE.Object3D[];
  fairingHalves: THREE.Object3D[];
  height: number;
  /** Saídas dos motores, em coordenadas locais de cada grupo (núcleo, superior, cada propulsor). */
  nozzles: { core: THREE.Vector3[]; upper: THREE.Vector3[]; boosters: THREE.Vector3[][] };
  engines: { core: EngineLook; upper: EngineLook; booster: EngineLook | null };
  /** Materiais dos sinos (para incandescência na queima). */
  nozzleMaterials: { core: THREE.MeshStandardMaterial[]; upper: THREE.MeshStandardMaterial[] };
  /** Faixa vertical (m) de cada parte, para enquadramento e plataformas do hangar. */
  spans: Record<RocketPart, { y0: number; y1: number; r: number }>;
  /** Mostra o gelo de condensação proporcional ao abastecimento (0–1) do núcleo e do superior. */
  setFrost(coreLoad: number, upperLoad: number): void;
  probe: ProbeModel | null;
}

/** Perfil de sino (parábola) para LatheGeometry; y = 0 na garganta, crescendo para baixo. */
function bellGeometry(exitR: number, length: number, segments = 32) {
  const throat = exitR * 0.28;
  const pts: THREE.Vector2[] = [new THREE.Vector2(throat * 1.6, length * 0.08), new THREE.Vector2(throat, 0)];
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(throat + (exitR - throat) * Math.sqrt(t), -length * t));
  }
  return new THREE.LatheGeometry(pts, segments);
}

/** Posições dos motores no fundo de um estágio. */
export function engineLayout(engineId: string, count: number, stageR: number): [number, number][] {
  const look = ENGINE_LOOK[engineId];
  const n = count * (look?.chambers ?? 1);
  if (n === 1) return [[0, 0]];
  if (n === 2) {
    const d = Math.min(stageR * 0.5, (look?.exitR ?? 0.5) * 1.15);
    return [[-d, 0], [d, 0]];
  }
  if (n === 9) {
    // Octaweb: 8 ao redor e 1 no centro.
    return [[0, 0], ...Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2) * stageR * 0.66, Math.sin((i / 8) * Math.PI * 2) * stageR * 0.66] as [number, number])];
  }
  return Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * stageR * 0.55, Math.sin((i / n) * Math.PI * 2) * stageR * 0.55] as [number, number]);
}

/** Perfil da coifa: saia (se mais larga que o estágio), cilindro e ogiva tangente até a ponta. */
function fairingProfile(R: number, baseR: number, length: number) {
  const pts: THREE.Vector2[] = [];
  const skirt = baseR < R - 0.05 ? 1.4 : 0;
  pts.push(new THREE.Vector2(baseR * 0.98, 0));
  if (skirt) pts.push(new THREE.Vector2(R, skirt));
  const ogive = Math.min(length * 0.42, R * 2.6);
  const cyl = length - ogive - skirt;
  pts.push(new THREE.Vector2(R, skirt + cyl));
  // Ogiva tangente: raio do arco ρ = (R² + L²) / (2R).
  const rho = (R * R + ogive * ogive) / (2 * R);
  for (let i = 1; i <= 20; i++) {
    const x = (i / 20) * ogive;
    const r = Math.sqrt(rho * rho - x * x) + R - rho;
    pts.push(new THREE.Vector2(Math.max(0.25, r), skirt + cyl + x));
  }
  pts.push(new THREE.Vector2(0, length));
  return pts;
}

/** Faixa de texto vertical sobre um cilindro. */
function decalStrip(text: string, r: number, y0: number, len: number) {
  const tex = textDecal(text);
  if (!tex) return null;
  const strip = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.003, r * 1.003, len, 10, 1, true, -0.17, 0.34),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  strip.position.y = y0 + len / 2;
  return strip;
}

export function buildRocket(vehicle: AssembledVehicle, options: { cutaway?: boolean; probe?: ProbeConfig | null } = {}): RocketModel {
  const group = new THREE.Group();
  const parts = { core: new THREE.Group(), boosters: new THREE.Group(), upper: new THREE.Group(), fairing: new THREE.Group(), probe: new THREE.Group() } as Record<RocketPart, THREE.Group>;
  for (const [name, g] of Object.entries(parts)) {
    g.name = name;
    g.userData.part = name;
    group.add(g);
  }
  const family = vehicle.core.family;
  const coreR = vehicle.core.diameter / 2;
  const coreLook = ENGINE_LOOK[vehicle.core.engineId] ?? ENGINE_LOOK['merlin-1d'];
  const nozzleMaterials = { core: [] as THREE.MeshStandardMaterial[], upper: [] as THREE.MeshStandardMaterial[] };
  const frostMeshes: { mesh: THREE.Mesh; y0: number; len: number; stage: 'core' | 'upper' }[] = [];

  // ── Primeiro estágio ──
  const engineH = coreLook.length * 0.92;
  const coreLen = vehicle.core.length;
  const coreBody = new THREE.Mesh(new THREE.CylinderGeometry(coreR, coreR, coreLen, 64, 1), coreSkin(family, coreLen));
  coreBody.position.y = engineH + coreLen / 2;
  coreBody.castShadow = coreBody.receiveShadow = true;
  parts.core.add(coreBody);
  const decal = decalStrip('MISSION ARCHITECT', coreR, engineH + coreLen * 0.25, coreLen * 0.5);
  if (decal) parts.core.add(decal);
  // Seção de empuxo: saia escura e escudo térmico do fundo.
  const thrustSection = new THREE.Mesh(new THREE.CylinderGeometry(coreR * 1.01, coreR * 1.04, 1.4, 64), steelMaterial(family === 'falcon' ? '#2a2c30' : '#3a3b3e', 0.55));
  thrustSection.position.y = engineH + 0.7;
  parts.core.add(thrustSection);
  const heatShield = new THREE.Mesh(new THREE.CircleGeometry(coreR * 1.02, 48), new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.9 }));
  heatShield.rotation.x = Math.PI / 2;
  heatShield.position.y = engineH;
  parts.core.add(heatShield);
  // Gelo de condensação sobre o tanque de oxigênio (metade superior do estágio).
  const coreFrost = new THREE.Mesh(new THREE.CylinderGeometry(coreR * 1.006, coreR * 1.006, 1, 64, 1, true), frostMaterial());
  parts.core.add(coreFrost);
  frostMeshes.push({ mesh: coreFrost, y0: engineH + coreLen * 0.45, len: coreLen * 0.53, stage: 'core' });

  const coreNozzles: THREE.Vector3[] = [];
  for (const [x, z] of engineLayout(vehicle.core.engineId, vehicle.core.engineCount, coreR)) {
    const mat = nozzleMaterial(coreLook.kind);
    nozzleMaterials.core.push(mat);
    const bell = new THREE.Mesh(bellGeometry(coreLook.exitR, coreLook.length), mat);
    bell.position.set(x, engineH, z);
    bell.castShadow = true;
    parts.core.add(bell);
    coreNozzles.push(new THREE.Vector3(x, engineH - coreLook.length, z));
  }
  // Aletas de grade (Falcon) no topo do primeiro estágio.
  if (family === 'falcon') {
    const finMat = steelMaterial('#4a4d52', 0.45);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.12), finMat);
      fin.position.set(Math.cos(a) * (coreR + 0.6), engineH + coreLen - 1.2, Math.sin(a) * (coreR + 0.6));
      fin.rotation.y = -a + Math.PI / 2;
      parts.core.add(fin);
    }
  }

  // ── Interestágio ──
  const upR = vehicle.upper.diameter / 2;
  const interH = INTERSTAGE[family] ?? 3;
  const baseUpper = engineH + coreLen;
  const fairingLook = FAIRING_LOOK[vehicle.fairing.id] ?? { length: 12, encapsulates: false };
  const encapsulated = fairingLook.encapsulates;
  const interMat = family === 'falcon'
    ? skinMaterial({ color: '#1c1d20', style: 'composite', length: interH, tile: 6, rings: 1, panels: 4, roughness: 0.55 })
    : skinMaterial({ color: family === 'atlas' ? '#e9eaec' : '#f1f1f1', style: 'paint', length: interH, tile: 6, rings: 1, roughness: 0.5 });
  const inter = new THREE.Mesh(new THREE.CylinderGeometry(encapsulated ? coreR : Math.max(upR, coreR * 0.98), coreR, interH, 64, 1, true), interMat);
  inter.position.y = baseUpper + interH / 2;
  inter.castShadow = true;
  parts.core.add(inter);

  // ── Estágio superior ──
  const upLook = ENGINE_LOOK[vehicle.config.upperEngineId] ?? ENGINE_LOOK['rl10c-1'];
  const upLen = vehicle.upper.length;
  const upY0 = baseUpper + interH;
  const upperMat = vehicle.upper.family === 'falcon'
    ? skinMaterial({ color: '#f2f3f4', style: 'paint', length: upLen, tile: 10, rings: 2, panels: 12, roughness: 0.4 })
    : skinMaterial({ color: '#d9dcdf', style: 'metal', length: upLen, tile: 6, rings: 2, panels: 16, roughness: 0.32, metalness: 0.75 });
  const upperBody = new THREE.Mesh(new THREE.CylinderGeometry(upR, upR, upLen, 64), upperMat);
  upperBody.position.y = upY0 + upLen / 2;
  upperBody.castShadow = upperBody.receiveShadow = true;
  parts.upper.add(upperBody);
  const upperFrost = new THREE.Mesh(new THREE.CylinderGeometry(upR * 1.008, upR * 1.008, 1, 64, 1, true), frostMaterial());
  parts.upper.add(upperFrost);
  frostMeshes.push({ mesh: upperFrost, y0: upY0, len: upLen * 0.45, stage: 'upper' });
  const upperNozzles: THREE.Vector3[] = [];
  for (const [x, z] of engineLayout(vehicle.config.upperEngineId, vehicle.config.upperEngineCount, upR)) {
    const mat = nozzleMaterial(upLook.kind);
    nozzleMaterials.upper.push(mat);
    const bell = new THREE.Mesh(bellGeometry(upLook.exitR, upLook.length), mat);
    // O motor de vácuo fica recolhido dentro do interestágio.
    bell.position.set(x, upY0 + 0.4, z);
    parts.upper.add(bell);
    upperNozzles.push(new THREE.Vector3(x, upY0 + 0.4 - upLook.length, z));
  }

  // ── Propulsores laterais ──
  const boosterMeshes: THREE.Object3D[] = [];
  const boosterNozzles: THREE.Vector3[][] = [];
  const nb = vehicle.booster ? vehicle.config.boosterCount : 0;
  let boosterLook: EngineLook | null = null;
  let boosterR = 0;
  if (vehicle.booster && nb > 0) {
    const liquid = vehicle.booster.kind === 'liquido';
    const srb = SRB_LOOK[vehicle.booster.id] ?? { r: 0.8, length: 20 };
    boosterR = liquid ? coreR : srb.r;
    const bL = liquid ? coreLen : srb.length;
    boosterLook = liquid ? ENGINE_LOOK[vehicle.booster.engineId ?? 'merlin-1d'] : { exitR: srb.r * 0.72, length: 1.9, chambers: 1, kind: 'srb', vacuum: false };
    const bEngineH = boosterLook.length * 0.92;
    for (let i = 0; i < nb; i++) {
      const b = new THREE.Group();
      const skin = liquid ? coreSkin(family, bL) : skinMaterial({ color: '#f4f4f2', style: 'paint', length: bL, tile: 5, rings: 2, panels: 4, roughness: 0.55 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(boosterR, boosterR, bL, 40), skin);
      body.position.y = bL / 2 + bEngineH;
      body.castShadow = body.receiveShadow = true;
      const noseL = liquid ? 4.5 : 3.2;
      const nosePts = fairingProfile(boosterR, boosterR, noseL);
      const nose = new THREE.Mesh(new THREE.LatheGeometry(nosePts, 40), liquid ? skinMaterial({ color: '#f2f3f4', style: 'paint', length: noseL, roughness: 0.4 }) : skin);
      nose.position.y = bEngineH + bL;
      b.add(body, nose);
      const nozzles: THREE.Vector3[] = [];
      const layout = liquid ? engineLayout(vehicle.booster.engineId ?? 'merlin-1d', vehicle.booster.engineCount ?? 9, boosterR) : [[0, 0] as [number, number]];
      for (const [x, z] of layout) {
        const mat = nozzleMaterial(boosterLook.kind);
        const bell = new THREE.Mesh(bellGeometry(boosterLook.exitR, boosterLook.length, 24), mat);
        bell.position.set(x, bEngineH, z);
        b.add(bell);
        nozzles.push(new THREE.Vector3(x, bEngineH - boosterLook.length, z));
      }
      // Ligações estruturais com o núcleo.
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.6), steelMaterial('#55585e'));
      strut.position.set(0, bEngineH + bL * 0.85, 0);
      b.add(strut);
      const a = nb === 2 ? (i === 0 ? 0 : Math.PI) : (i / nb) * Math.PI * 2 + Math.PI / 4;
      const d = coreR + boosterR + (liquid ? 0.3 : 0.12);
      b.position.set(Math.cos(a) * d, engineH - bEngineH, Math.sin(a) * d);
      strut.position.x = -Math.cos(a) * (boosterR + 0.05);
      strut.position.z = -Math.sin(a) * (boosterR + 0.05);
      b.userData.part = 'boosters';
      parts.boosters.add(b);
      boosterMeshes.push(b);
      boosterNozzles.push(nozzles);
    }
  }

  // ── Sonda e adaptador ──
  const topUpper = upY0 + upLen;
  const fR = vehicle.fairing.diameter / 2;
  const adapter = new THREE.Mesh(new THREE.CylinderGeometry(1.15, upR * 0.75, 1, 40), steelMaterial('#8c9199', 0.35));
  adapter.position.y = topUpper + 0.5;
  parts.probe.add(adapter);
  let probe: ProbeModel | null = null;
  if (options.probe) {
    probe = buildProbe(options.probe);
    probe.group.position.y = topUpper + 1;
    parts.probe.add(probe.group);
  }

  // ── Coifa ──
  const fairingBase = encapsulated ? upY0 - 0.2 : topUpper;
  const fairLen = fairingLook.length;
  const profile = fairingProfile(fR, encapsulated ? coreR : upR, fairLen);
  const fairingHalves: THREE.Object3D[] = [];
  for (const s of [0, 1]) {
    const mat = skinMaterial({ color: '#f5f6f7', style: 'paint', length: fairLen, tile: fairLen, rings: 1, panels: 2, roughness: 0.38 });
    mat.side = THREE.DoubleSide;
    if (options.cutaway) {
      mat.transparent = true;
      mat.opacity = 1;
    }
    const half = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.LatheGeometry(profile, 48, s * Math.PI, Math.PI), mat);
    shell.position.y = fairingBase;
    shell.castShadow = true;
    // Junta de separação (trilho escuro).
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, fairLen * 0.62, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.5 }));
    rail.position.set(0, fairingBase + fairLen * 0.31, (s === 0 ? 1 : -1) * fR);
    half.add(shell, rail);
    half.userData.side = s === 0 ? 1 : -1;
    parts.fairing.add(half);
    fairingHalves.push(half);
  }

  const height = fairingBase + fairLen;
  const spans: RocketModel['spans'] = {
    core: { y0: 0, y1: baseUpper + interH, r: coreR },
    boosters: { y0: 0, y1: nb ? engineH + (vehicle.booster?.kind === 'liquido' ? coreLen + 4.5 : (SRB_LOOK[vehicle.booster!.id]?.length ?? 20)) : 0, r: nb ? coreR + boosterR * 2 + 0.3 : 0 },
    upper: { y0: upY0, y1: topUpper, r: upR },
    probe: { y0: topUpper, y1: topUpper + (probe?.height ?? 4) + 1, r: 2 },
    fairing: { y0: fairingBase, y1: height, r: fR },
  };

  const setFrost = (coreLoad: number, upperLoad: number) => {
    for (const f of frostMeshes) {
      const load = f.stage === 'core' ? coreLoad : upperLoad;
      // Abaixo de ~55% de carga o nível do líquido fica abaixo do tanque de oxigênio.
      const k = Math.max(0, Math.min(1, (load - 0.5) / 0.5));
      f.mesh.visible = k > 0.02;
      f.mesh.scale.y = Math.max(0.001, f.len * k);
      f.mesh.position.y = f.y0 + (f.len * k) / 2;
    }
  };
  setFrost(vehicle.config.coreLoad, vehicle.config.upperLoad);

  return {
    group, parts, boosterMeshes, fairingHalves, height, spans, probe, setFrost,
    nozzles: { core: coreNozzles, upper: upperNozzles, boosters: boosterNozzles },
    engines: { core: coreLook, upper: upLook, booster: boosterLook },
    nozzleMaterials,
  };
}

/** Destaca uma parte (leve emissão ciano) e remove o destaque das demais. */
export function highlight(model: RocketModel, part: RocketPart | null, strength = 1) {
  for (const [name, g] of Object.entries(model.parts)) {
    g.traverse((obj) => {
      const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && 'emissive' in mat && !model.nozzleMaterials.core.includes(mat) && !model.nozzleMaterials.upper.includes(mat)) {
        mat.emissive.setRGB(0.0, 0.09 * strength, 0.16 * strength);
        mat.emissiveIntensity = name === part ? 1 : 0;
      }
    });
  }
}
