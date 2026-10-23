// Cena do hangar: foguete montado, câmera orbital, destaque e seleção de partes por clique.
import * as THREE from 'three';
import type { SceneHandle } from '../components/ThreeView';
import type { AssembledVehicle } from '../simulation/rocket/vehicle';
import { createStage } from './common';
import { buildRocket, highlight, type RocketModel, type RocketPart } from './rocketModel';

export interface HangarSceneProps {
  vehicle: AssembledVehicle;
  selected: RocketPart | null;
  onSelect: (part: RocketPart) => void;
}

export function createHangarScene(container: HTMLElement, initial: HangarSceneProps): SceneHandle<HangarSceneProps> {
  const stage = createStage(container, { position: [38, 30, 52], target: [0, 28, 0], far: 1000 });
  const { scene, camera, renderer } = stage;
  scene.background = new THREE.Color(0x070b14);
  scene.fog = new THREE.Fog(0x070b14, 120, 320);
  scene.add(new THREE.HemisphereLight(0x9fc3ff, 0x1a1208, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(40, 80, 30);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -40; key.shadow.camera.right = 40; key.shadow.camera.top = 80; key.shadow.camera.bottom = -10;
  scene.add(key);
  const rim = new THREE.SpotLight(0x5cc8ff, 900, 200, Math.PI / 6, 0.6);
  rim.position.set(-40, 50, -40);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.MeshStandardMaterial({ color: 0x0f1522, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(200, 40, 0x1f3a5c, 0x13223a);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  scene.add(grid);
  // Torre de serviço estilizada.
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.7, metalness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 75, 0.5), towerMat);
    beam.position.set(-14 + (i % 2) * 4, 37.5, -4 + Math.floor(i / 2) * 4);
    scene.add(beam);
  }

  let model: RocketModel | null = null;
  let props = initial;
  let assembly = 1;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const rebuild = (vehicle: AssembledVehicle) => {
    if (model) {
      scene.remove(model.group);
      model.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    }
    model = buildRocket(vehicle, { cutaway: true });
    model.group.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    scene.add(model.group);
    assembly = 0;
    highlight(model, props.selected);
  };
  rebuild(initial.vehicle);

  stage.onFrame((dt) => {
    if (!model || assembly >= 1) return;
    assembly = Math.min(1, assembly + dt * 1.6);
    const e = 1 - (1 - assembly) ** 3;
    // Animação de montagem: as partes descem até o lugar, de baixo para cima.
    (['core', 'boosters', 'upper', 'probe', 'fairing'] as RocketPart[]).forEach((p, i) => {
      const local = Math.min(1, Math.max(0, e * 1.6 - i * 0.15));
      model!.parts[p].position.y = (1 - local) * 25;
    });
  });

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
      const changed = next.vehicle !== props.vehicle && JSON.stringify(next.vehicle.config) !== JSON.stringify(props.vehicle.config);
      props = next;
      if (changed) rebuild(next.vehicle);
      else if (model) highlight(model, next.selected);
    },
    dispose() {
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', up);
      stage.dispose();
    },
  };
}
