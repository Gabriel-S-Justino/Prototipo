// Modelo 3D da sonda montada no hangar: cada escolha do ProbeBuilder muda a geometria visível
// (tamanho dos tanques, painéis ou RTG, antena, motor e instrumentos). Unidades em metros.
import * as THREE from 'three';
import { ANTENNAS, POWER, TANKS, type ProbeConfig } from '../data/probe';
import { mliMaterial, nozzleMaterial, solarCellMaterial } from './materials';

export interface ProbeModel {
  group: THREE.Group;
  /** Altura total estivada (m), para posicionar na coifa. */
  height: number;
  /** Abre (1) ou recolhe (0) painéis, antenas e mastros. */
  deploy(f: number): void;
}

const white = () => new THREE.MeshStandardMaterial({ color: 0xeef0f3, roughness: 0.45, metalness: 0.1 });
const alu = () => new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.35, metalness: 0.9 });
const black = () => new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6, metalness: 0.3 });

/** Altura do barramento conforme a capacidade dos tanques (mais propelente, sonda mais alta). */
export function busHeight(tankId: string) {
  const cap = TANKS[tankId]?.capacity ?? 1200;
  return 1.6 + (cap / 1800) * 1.1;
}

/** Envergadura de cada asa solar (m) a partir da área total do catálogo (duas asas, 1,6 m de largura). */
export function wingSpan(powerId: string) {
  const p = POWER[powerId];
  return p?.kind === 'solar' ? (p.area ?? 0) / 2 / 1.6 : 0;
}

function dishGeometry(diameter: number) {
  const r = diameter / 2;
  const depth = r * 0.28;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = (i / 16) * r;
    pts.push(new THREE.Vector2(x, (x * x) / (r * r) * depth));
  }
  return new THREE.LatheGeometry(pts, 48);
}

export function buildProbe(config: ProbeConfig): ProbeModel {
  const group = new THREE.Group();
  group.name = 'sonda';
  const h = busHeight(config.tankId);
  const w = 1.9;
  const gold = mliMaterial('gold');
  const bus = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), gold);
  bus.position.y = h / 2 + 0.5;
  bus.castShadow = bus.receiveShadow = true;
  group.add(bus);
  // Arestas de alumínio e radiadores brancos (laterais ±z).
  const edge = alu();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, h + 0.04, 0.06), edge);
    e.position.set((sx * w) / 2, bus.position.y, (sz * w) / 2);
    group.add(e);
  }
  for (const sz of [-1, 1]) {
    const rad = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.7), white());
    rad.position.set(0, bus.position.y, sz * (w / 2 + 0.005));
    if (sz < 0) rad.rotation.y = Math.PI;
    group.add(rad);
  }
  // Blindagem extra: placas de tântalo (cinza-escuro) sobre o compartimento eletrônico.
  if (config.shield) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h * 0.35, w + 0.08), new THREE.MeshStandardMaterial({ color: 0x5b5f66, roughness: 0.4, metalness: 0.8 }));
    plate.position.y = 0.5 + h * 0.75;
    group.add(plate);
  }
  // Adaptador cônico e motor principal (bipropelente: sino maior; mono: só propulsores pequenos).
  const adapter = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 0.5, 32, 1, true), alu());
  adapter.position.y = 0.25;
  group.add(adapter);
  const thrusterMat = nozzleMaterial('regen');
  const bell = (r: number, l: number) => {
    const pts = [new THREE.Vector2(r * 0.3, 0), new THREE.Vector2(r * 0.45, -l * 0.3), new THREE.Vector2(r * 0.75, -l * 0.7), new THREE.Vector2(r, -l)];
    return new THREE.Mesh(new THREE.LatheGeometry(pts, 20), thrusterMat);
  };
  if (config.propulsionId === 'biprop') {
    const main = bell(0.28, 0.6);
    main.position.y = 0.5;
    group.add(main);
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const t = bell(0.06, 0.16);
    t.position.set(sx * 0.7, 0.55, sz * 0.7);
    group.add(t);
  }

  // Antena: refletor parabólico no topo (apontável) ou antena de baixo ganho.
  const antenna = ANTENNAS[config.antennaId];
  const top = 0.5 + h;
  const dishPivot = new THREE.Group();
  dishPivot.position.y = top;
  group.add(dishPivot);
  if (antenna?.diameter) {
    const dish = new THREE.Mesh(dishGeometry(antenna.diameter), new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide }));
    dish.position.y = 0.25;
    dish.castShadow = true;
    dishPivot.add(dish);
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, antenna.diameter * 0.32, 12), black());
    feed.position.y = 0.25 + antenna.diameter * 0.2;
    dishPivot.add(feed);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, antenna.diameter * 0.55, 6), alu());
      const r = antenna.diameter * 0.32;
      s.position.set(Math.cos(a) * r * 0.5, 0.25 + antenna.diameter * 0.2, Math.sin(a) * r * 0.5);
      s.lookAt(new THREE.Vector3(0, 0.25 + antenna.diameter * 0.38, 0).add(dishPivot.position));
      s.rotateX(Math.PI / 2);
      dishPivot.add(s);
    }
  } else {
    const lga = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 16), white());
    lga.position.y = 0.2;
    dishPivot.add(lga);
  }

  // Energia: duas asas solares articuladas ou um MMRTG com aletas na traseira.
  const power = POWER[config.powerId];
  const wings: THREE.Group[] = [];
  if (power?.kind === 'solar') {
    const span = wingSpan(config.powerId);
    const cells = solarCellMaterial();
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set((s * w) / 2, bus.position.y, 0);
      const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), alu());
      yoke.position.x = s * 0.25;
      hinge.add(yoke);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(span, 0.04, 1.6), cells);
      panel.position.x = s * (0.5 + span / 2);
      panel.castShadow = true;
      hinge.add(panel);
      hinge.userData.side = s;
      group.add(hinge);
      wings.push(hinge);
    }
  } else if (power?.kind === 'rtg') {
    const rtg = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 16), new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.7 }));
    rtg.add(core);
    for (let i = 0; i < 8; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.66, 0.32), core.material);
      const a = (i / 8) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
      fin.rotation.y = -a;
      rtg.add(fin);
    }
    rtg.position.set(0, 0.9, -(w / 2 + 0.55));
    rtg.rotation.x = 0.5;
    group.add(rtg);
  }

  // Instrumentos: câmeras na face de nadir (+x), radar com dipolos longos, magnetômetro em mastro.
  const booms: THREE.Object3D[] = [];
  const face = (w / 2) + 0.02;
  let slot = 0;
  const mount = (obj: THREE.Object3D) => {
    obj.position.set(face, 0.9 + (slot % 3) * 0.55, -0.55 + Math.floor(slot / 3) * 0.6);
    slot++;
    group.add(obj);
  };
  for (const id of config.instruments) {
    if (id === 'hirescam') {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.3, 24), white());
      tube.rotation.z = Math.PI / 2;
      tube.position.set(face + 0.2, 0.5 + h * 0.55, 0.35);
      const baffle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24), black());
      baffle.rotation.z = Math.PI / 2;
      baffle.position.set(face + 0.86, tube.position.y, tube.position.z);
      group.add(tube, baffle);
    } else if (id === 'ctx' || id === 'spectrometer') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.28), id === 'ctx' ? black() : gold);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.14, 12), black());
      lens.rotation.z = Math.PI / 2;
      lens.position.x = 0.2;
      const g = new THREE.Group();
      g.add(box, lens);
      mount(g);
    } else if (id === 'radar') {
      for (const s of [-1, 1]) {
        const dipole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5, 6), alu());
        dipole.rotation.x = Math.PI / 2;
        dipole.position.set(face, 0.7, s * 2.5);
        dipole.userData.boom = s;
        booms.push(dipole);
        group.add(dipole);
      }
    } else if (id === 'mag') {
      const mast = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 6), alu());
      pole.position.y = 1.1;
      const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), white());
      sensor.position.y = 2.2;
      mast.add(pole, sensor);
      mast.position.set(-w / 2, top - 0.1, w / 2);
      mast.userData.mast = true;
      booms.push(mast);
      group.add(mast);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), id === 'ngims' ? alu() : white());
      mount(box);
    }
  }

  const height = top + (antenna?.diameter ? antenna.diameter * 0.45 + 0.3 : 0.5);
  const deploy = (f: number) => {
    for (const wing of wings) {
      // Recolhida: asa dobrada junto ao corpo (vertical); aberta: estendida no plano horizontal.
      const s = wing.userData.side as number;
      wing.rotation.z = s * (1 - f) * (Math.PI / 2);
      wing.scale.set(0.25 + 0.75 * f, 1, 1);
    }
    for (const b of booms) {
      if (b.userData.mast) b.rotation.z = (1 - f) * -Math.PI / 2 * 0.98;
      else b.scale.set(1, 0.15 + 0.85 * f, 1);
    }
    dishPivot.rotation.z = f * 0.35;
  };
  deploy(0);
  return { group, height, deploy };
}
