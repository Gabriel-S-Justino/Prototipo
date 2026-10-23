// Cena do lançamento. Tudo o que acontece aqui é comandado pela telemetria da simulação (launchTelemetry):
// separações, ignições, coifa e falhas. A cena não decide resultados.
import * as THREE from 'three';
import type { SceneHandle } from '../components/ThreeView';
import type { LaunchTelemetry } from '../simulation/mission/launch';
import type { AssembledVehicle } from '../simulation/rocket/vehicle';
import { createStage, starfield } from './common';
import { buildRocket, type RocketModel } from './rocketModel';

export interface LaunchSceneProps {
  vehicle: AssembledVehicle;
  telemetry: LaunchTelemetry;
}

const ALT_SCALE = 3; // unidades de cena por km (comprimido)

export function createLaunchScene(container: HTMLElement, initial: LaunchSceneProps): SceneHandle<LaunchSceneProps> {
  const stage = createStage(container, { position: [55, 30, 70], target: [0, 30, 0], far: 6000 });
  const { scene, camera, controls } = stage;
  controls.enablePan = false;
  const sky = new THREE.Color();
  scene.background = sky;
  const stars = starfield(2500, 3000);
  scene.add(stars);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x2b1d10, 0.9));
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
  sunLight.position.set(80, 120, 60);
  scene.add(sunLight);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2000, 64), new THREE.MeshStandardMaterial({ color: 0x1f2a1c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 2, 32), new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.9 }));
  pad.position.y = -1;
  scene.add(pad);

  const model: RocketModel = buildRocket(initial.vehicle);
  const rocket = model.group;
  scene.add(rocket);

  // Partículas de exaustão (pontos com mistura aditiva).
  const N = 900;
  const positions = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const velocities = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const plume = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffb35c, size: 1.6, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(plume);
  const smokeGeo = new THREE.BufferGeometry();
  const smokePos = new Float32Array(N * 3);
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ color: 0xbfc4cc, size: 4, transparent: true, opacity: 0.35, depthWrite: false }));
  scene.add(smoke);
  let smokeIdx = 0;

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
    debris.push({ obj, v: push, spin: new THREE.Vector3(Math.random() * 0.6, 0, Math.random() * 0.6) });
  };
  let boostersDetached = false;
  let coreDetached = false;
  let fairingDetached = false;
  let exploded = false;
  let props = initial;

  const apply = (p: LaunchSceneProps) => {
    props = p;
    const t = p.telemetry;
    if (!t.boostersAttached && !boostersDetached) {
      boostersDetached = true;
      for (const b of model.boosterMeshes) detach(b, new THREE.Vector3(b.position.x * 0.6, -2, b.position.z * 0.6));
    }
    if (t.stage >= 1 && !coreDetached) {
      coreDetached = true;
      detach(model.parts.core, new THREE.Vector3(0, -6, 0));
    }
    if (!t.fairingAttached && !fairingDetached) {
      fairingDetached = true;
      for (const h of model.fairingHalves) detach(h, new THREE.Vector3(5 * (h.userData.side as number), -1, 0));
    }
    if (t.failed && !exploded) {
      exploded = true;
      for (let i = 0; i < N; i++) {
        life[i] = 1.5 + Math.random();
        positions.set([rocket.position.x, rocket.position.y + 30, rocket.position.z], i * 3);
        velocities.set([(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60], i * 3);
      }
      (plume.material as THREE.PointsMaterial).color.setHex(0xff5a36);
    }
  };
  apply(initial);

  let spawn = 0;
  stage.onFrame((dt) => {
    const t = props.telemetry;
    const alt = t.altitudeKm;
    const y = alt * ALT_SCALE;
    rocket.position.y = y;
    // Inclinação progressiva (arco de gravidade ilustrativo).
    rocket.rotation.z = -Math.min(1.1, (alt / 200) * 1.1);
    controls.target.set(rocket.position.x, y + 30, rocket.position.z);
    camera.position.y += (y + 40 - camera.position.y) * Math.min(1, dt * 2);
    // Céu escurece com a altitude.
    const k = Math.min(1, alt / 80);
    sky.setRGB(0.36 * (1 - k) + 0.01 * k, 0.55 * (1 - k) + 0.015 * k, 0.85 * (1 - k) + 0.04 * k);
    (stars.material as THREE.PointsMaterial).opacity = k;
    ground.visible = alt < 150;
    // Exaustão: só emite partículas quando a simulação diz que há motor ligado.
    const emitter = new THREE.Vector3();
    (t.stage >= 1 ? model.parts.upper : model.parts.core).localToWorld(emitter.copy(t.stage >= 1 ? model.nozzles.upper : model.nozzles.core));
    if (t.engineOn && !t.failed) spawn += dt * 900;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0 && spawn >= 1) {
        spawn -= 1;
        life[i] = 0.5 + Math.random() * 0.4;
        positions.set([emitter.x + (Math.random() - 0.5) * 2, emitter.y, emitter.z + (Math.random() - 0.5) * 2], i * 3);
        velocities.set([(Math.random() - 0.5) * 6, -40 - Math.random() * 30, (Math.random() - 0.5) * 6], i * 3);
        if (alt < 3) {
          smokePos.set([emitter.x + (Math.random() - 0.5) * 30, Math.random() * 4, emitter.z + (Math.random() - 0.5) * 30], (smokeIdx++ % N) * 3);
        }
      }
      if (life[i] > 0) {
        life[i] -= dt;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        if (life[i] <= 0) positions[i * 3 + 1] = -9999;
      }
    }
    spawn = Math.min(spawn, 50);
    geo.attributes.position.needsUpdate = true;
    smokeGeo.attributes.position.needsUpdate = true;
    for (const d of debris) {
      d.v.y -= 9.8 * dt * 0.6;
      d.obj.position.addScaledVector(d.v, dt);
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.z += d.spin.z * dt;
    }
  });
  return { update: apply, dispose: stage.dispose };
}
