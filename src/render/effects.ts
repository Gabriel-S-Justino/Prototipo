// Efeitos de propulsão: partículas (fogo, fumaça, vapor, centelhas) e plumas volumétricas dos motores.
// As partículas são pontos com shader próprio (sprites macios com ruído e rampa de cor por idade);
// a pluma é um cone aditivo com ruído animado e discos de choque (diamantes de Mach) nos motores de nível do mar.
import * as THREE from 'three';

export type ParticleKind = 'fire' | 'smoke' | 'steam' | 'spark';

const particleVertex = /* glsl */ `
  attribute float aAge;
  attribute float aSize;
  attribute float aSeed;
  uniform float uScale;
  varying float vAge;
  varying float vSeed;
  varying vec3 vWorld;
  void main() {
    vAge = aAge;
    vSeed = aSeed;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aAge >= 1.0 ? 0.0 : aSize * uScale / max(0.5, -mv.z);
  }
`;

const particleFragment = /* glsl */ `
  uniform int uKind;
  uniform float uTime;
  uniform vec3 uGlowPos;
  uniform float uGlow;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  varying float vAge;
  varying float vSeed;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    // Bordas irregulares: ruído em duas oitavas, girado por partícula.
    float a = vSeed * 6.2831;
    vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * p * 3.0 + vSeed * 17.0;
    float n = noise(q + uTime * 0.15) * 0.65 + noise(q * 2.3) * 0.35;
    float soft = smoothstep(0.5, 0.05, d) * (0.55 + 0.6 * n);
    vec3 col;
    float alpha;
    if (uKind == 0) {
      // Fogo: branco-amarelado → laranja → vermelho escuro, em HDR para o bloom.
      vec3 hot = vec3(1.0, 0.92, 0.75) * 6.0;
      vec3 mid = vec3(1.0, 0.45, 0.12) * 3.0;
      vec3 cool = vec3(0.5, 0.12, 0.04) * 0.8;
      col = vAge < 0.3 ? mix(hot, mid, vAge / 0.3) : mix(mid, cool, (vAge - 0.3) / 0.7);
      alpha = soft * (1.0 - vAge) * uOpacity;
    } else if (uKind == 3) {
      col = vec3(1.0, 0.7, 0.3) * 8.0;
      alpha = smoothstep(0.5, 0.0, d) * (1.0 - vAge) * uOpacity;
    } else {
      // Fumaça e vapor: iluminados pelo Sol (lado claro) e pelo brilho dos motores quando perto da chama.
      float base = uKind == 2 ? 0.95 : 0.72;
      vec3 c = vec3(base, base * 0.98, base * 0.95);
      float sun = 0.55 + 0.45 * clamp(dot(normalize(vec3(p.x, -p.y, 0.4)), uSunDir), 0.0, 1.0);
      float dist = length(vWorld - uGlowPos);
      vec3 glow = vec3(1.0, 0.5, 0.18) * uGlow * 60.0 / (dist * dist + 30.0);
      col = c * sun * (0.65 + 0.35 * n) + glow;
      float fadeIn = smoothstep(0.0, 0.06, vAge);
      alpha = soft * fadeIn * pow(1.0 - vAge, 1.3) * uOpacity * (uKind == 2 ? 0.55 : 0.8);
    }
    gl_FragColor = vec4(col, alpha);
  }
`;

export interface SpawnOptions {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  size: [number, number];
}

/** Sistema de partículas com buffer circular; atualização na CPU, desenho em um único draw call. */
export class Particles {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private next = 0;
  drag = 0.6;
  buoyancy = 0;
  alive = 0;

  constructor(readonly capacity: number, kind: ParticleKind, scale = 600) {
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(1);
    this.life = new Float32Array(capacity).fill(1);
    this.size = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    const seed = new Float32Array(capacity).map(() => Math.random());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const kinds: Record<ParticleKind, number> = { fire: 0, smoke: 1, steam: 2, spark: 3 };
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uKind: { value: kinds[kind] }, uTime: { value: 0 }, uScale: { value: scale },
        uGlowPos: { value: new THREE.Vector3() }, uGlow: { value: 0 }, uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.4).normalize() }, uOpacity: { value: 1 },
      },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: kind === 'fire' || kind === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  spawn(o: SpawnOptions) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos[i * 3] = o.position.x;
    this.pos[i * 3 + 1] = o.position.y;
    this.pos[i * 3 + 2] = o.position.z;
    this.vel[i * 3] = o.velocity.x;
    this.vel[i * 3 + 1] = o.velocity.y;
    this.vel[i * 3 + 2] = o.velocity.z;
    this.age[i] = 0;
    this.life[i] = o.life;
    this.size0[i] = o.size[0];
    this.size1[i] = o.size[1];
    this.size[i] = o.size[0];
  }

  update(dt: number, time: number) {
    const damp = Math.exp(-this.drag * dt);
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i] >= 1) continue;
      alive++;
      this.age[i] = Math.min(1, this.age[i] + dt / this.life[i]);
      this.vel[i * 3] *= damp;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * damp + this.buoyancy * dt;
      this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // A fumaça não atravessa o chão: espalha-se horizontalmente.
      if (this.pos[i * 3 + 1] < 0.5) {
        this.pos[i * 3 + 1] = 0.5;
        this.vel[i * 3 + 1] = Math.abs(this.vel[i * 3 + 1]) * 0.1;
      }
      const a = this.age[i];
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * Math.sqrt(a);
    }
    this.alive = alive;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAge.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    this.material.uniforms.uTime.value = time;
  }
}

export type PlumeFuel = 'kerosene' | 'methane' | 'hydrolox' | 'solid';

const PLUME_COLOR: Record<PlumeFuel, [THREE.Color, THREE.Color]> = {
  kerosene: [new THREE.Color(1.0, 0.85, 0.55), new THREE.Color(1.0, 0.42, 0.1)],
  methane: [new THREE.Color(0.85, 0.85, 1.0), new THREE.Color(0.55, 0.45, 0.95)],
  hydrolox: [new THREE.Color(0.75, 0.8, 1.0), new THREE.Color(0.45, 0.35, 0.9)],
  solid: [new THREE.Color(1.0, 0.95, 0.8), new THREE.Color(1.0, 0.6, 0.25)],
};

export function fuelOf(engineId: string | undefined, srb = false): PlumeFuel {
  if (srb) return 'solid';
  if (!engineId) return 'kerosene';
  if (engineId.startsWith('rl10')) return 'hydrolox';
  if (engineId === 'be-4') return 'methane';
  return 'kerosene';
}

const plumeVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const plumeFragment = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform float uTime;
  uniform float uThrottle;
  uniform float uDiamonds;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    // vUv.y = 1 na saída do motor e 0 na ponta da pluma.
    float along = 1.0 - vUv.y;
    float facing = abs(dot(vNormalV, vViewDir));
    float body = pow(facing, 1.5);
    float turb = noise(vec2(vUv.x * 12.0, along * 6.0 - uTime * 9.0)) * 0.6 + noise(vec2(vUv.x * 30.0, along * 18.0 - uTime * 16.0)) * 0.4;
    float fade = pow(1.0 - along, 1.6) * smoothstep(0.0, 0.04, along + 0.02);
    float diamonds = uDiamonds > 0.0 ? 0.55 + 0.45 * pow(abs(sin(along * uDiamonds * 3.1416)), 6.0) : 1.0;
    vec3 col = mix(uCore, uEdge, smoothstep(0.0, 0.7, along + (1.0 - body) * 0.5));
    float k = body * fade * (0.55 + 0.6 * turb) * diamonds * uThrottle * uIntensity;
    gl_FragColor = vec4(col * k * 9.0, 1.0);
  }
`;

export interface Plume {
  group: THREE.Group;
  set(on: boolean, throttle: number, expansion: number, time: number): void;
}

/**
 * Pluma de um motor: cone externo turbulento + núcleo brilhante. `expansion` > 1 alarga a pluma com a
 * queda da pressão atmosférica (no vácuo ela fica larga e quase transparente).
 */
export function createPlume(exitR: number, fuel: PlumeFuel, length: number, seaLevel: boolean): Plume {
  const group = new THREE.Group();
  const [core, edge] = PLUME_COLOR[fuel];
  const intensity = fuel === 'hydrolox' ? 0.35 : fuel === 'methane' ? 0.7 : 1;
  const make = (rTop: number, rBottom: number, len: number, k: number, diamonds: number) => {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, len, 24, 12, true);
    geo.translate(0, -len / 2, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uCore: { value: core.clone() }, uEdge: { value: edge.clone() }, uTime: { value: 0 }, uThrottle: { value: 0 }, uDiamonds: { value: diamonds }, uIntensity: { value: intensity * k } },
      vertexShader: plumeVertex,
      fragmentShader: plumeFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  const outer = make(exitR * 0.95, exitR * 2.6, length, 0.6, seaLevel && fuel !== 'solid' ? 5 : 0);
  const inner = make(exitR * 0.7, exitR * 0.5, length * 0.35, 1.4, 0);
  group.visible = false;
  return {
    group,
    set(on, throttle, expansion, time) {
      group.visible = on && throttle > 0.01;
      if (!group.visible) return;
      const e = Math.max(1, expansion);
      outer.scale.set(e, 1 + (e - 1) * 0.6, e);
      inner.scale.set(Math.sqrt(e), 1, Math.sqrt(e));
      for (const m of [outer, inner]) {
        const u = (m.material as THREE.ShaderMaterial).uniforms;
        u.uTime.value = time;
        // Tremulação leve da combustão.
        u.uThrottle.value = throttle * (0.92 + 0.08 * Math.sin(time * 47 + m.id));
        // No vácuo a pluma fica mais tênue e os diamantes somem.
        if (m === outer) u.uDiamonds.value = seaLevel && fuel !== 'solid' && e < 1.6 ? 5 : 0;
        u.uIntensity.value = intensity * (m === outer ? 0.6 : 1.4) / Math.sqrt(e);
      }
    },
  };
}
