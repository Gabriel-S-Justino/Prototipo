// Utilitários de renderização Three.js compartilhados pelas cenas.
// Cada cena passa por um pipeline cinematográfico: render HDR → bloom → tone mapping ACES → vinheta e grão.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  /** Passe final (vinheta, grão, aberração cromática); uniforms expostos para efeitos como tremor e flash. */
  grade: ShaderPass;
  quality: Quality;
  /** Insere um passe antes do bloom (por exemplo, contorno de seleção). */
  addPass(pass: Pass): void;
  onFrame(fn: (dt: number, time: number) => void): void;
  dispose(): void;
}

export type Quality = 'alta' | 'baixa';

export interface StageOptions {
  fov?: number;
  near?: number;
  far?: number;
  position: [number, number, number];
  target?: [number, number, number];
  exposure?: number;
  bloom?: { strength?: number; radius?: number; threshold?: number };
  vignette?: number;
  shadows?: boolean;
}

/**
 * Qualidade gráfica: "baixa" em aparelhos modestos (poucos núcleos ou celular) ou com ?qualidade=baixa na URL.
 * Na baixa o render usa resolução 1× e sombras menores; o visual continua o mesmo, só mais serrilhado.
 */
export function detectQuality(): Quality {
  try {
    const param = new URLSearchParams(window.location.search).get('qualidade');
    if (param === 'baixa' || param === 'alta') return param;
    const cores = navigator.hardwareConcurrency ?? 8;
    if (cores <= 4 || /Mobi|Android/i.test(navigator.userAgent)) return 'baixa';
  } catch {
    // Sem window/navigator (testes): usa a alta.
  }
  return 'alta';
}

/** Vinheta, grão de filme e leve aberração cromática nas bordas, aplicados depois do tone mapping. */
const GradeShader = {
  name: 'CinematicGrade',
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.9 },
    grain: { value: 0.035 },
    aberration: { value: 0.0007 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 0.8, 0.6) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, aberration, flash;
    uniform vec3 flashColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * aberration * (1.0 + r2 * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col *= mix(1.0, smoothstep(0.85, 0.15, r2 * 1.6), vignette);
      col += (hash(vUv * 1000.0 + fract(time * 7.0)) - 0.5) * grain;
      col = mix(col, flashColor, clamp(flash, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createStage(container: HTMLElement, options: StageOptions): Stage {
  const quality = detectQuality();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'alta' ? 1.75 : 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.exposure ?? 1;
  renderer.shadowMap.enabled = options.shadows ?? true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(options.fov ?? 45, 1, options.near ?? 0.1, options.far ?? 5000);
  camera.position.set(...options.position);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(...(options.target ?? [0, 0, 0]));

  // Pipeline HDR: a cena é renderizada em ponto flutuante; o OutputPass aplica ACES e sRGB no fim.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const b = options.bloom ?? {};
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength ?? 0.8, b.radius ?? 0.55, b.threshold ?? 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.vignette.value = options.vignette ?? 0.9;
  composer.addPass(grade);

  const resize = () => {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 440;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    // O bloom em meia resolução custa um quarto e fica igualmente suave.
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(container);

  // Não renderiza o que não está na tela (aba em segundo plano ou cena fora da área visível).
  let onScreen = true;
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((entries) => { onScreen = entries.some((e) => e.isIntersecting); }) : null;
  io?.observe(container);

  const callbacks: ((dt: number, time: number) => void)[] = [];
  const timer = new THREE.Timer();
  let raf = 0;
  const loop = (now?: number) => {
    raf = requestAnimationFrame(loop);
    if (!onScreen || document.hidden) return;
    timer.update(now);
    const dt = Math.min(0.1, timer.getDelta());
    const t = timer.getElapsed();
    for (const fn of callbacks) fn(dt, t);
    controls.update();
    grade.uniforms.time.value = t;
    composer.render(dt);
  };
  loop();
  const stage: Stage = {
    renderer, scene, camera, controls, composer, bloom, grade, quality,
    addPass: (pass) => composer.insertPass(pass, composer.passes.indexOf(bloom)),
    onFrame: (fn) => callbacks.push(fn),
    dispose: () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      io?.disconnect();
      controls.dispose();
      disposeObject(scene);
      for (const tex of [scene.background, scene.environment]) if (tex instanceof THREE.Texture) tex.dispose();
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
      renderer.dispose();
      // dispose() não devolve o contexto ao navegador; sem isto cada troca de tela deixava um contexto vivo.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
  // Em desenvolvimento, expõe a cena para inspeção no console (window.__stage).
  if (import.meta.env?.DEV) (window as unknown as { __stage?: Stage }).__stage = stage;
  return stage;
}

/** Libera geometrias, materiais e as texturas dos materiais de uma subárvore. */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      const uniforms = (m as THREE.ShaderMaterial).uniforms;
      if (uniforms) for (const u of Object.values(uniforms)) if (u?.value instanceof THREE.Texture) u.value.dispose();
      m.dispose();
    }
  });
}

/** Mapa de ambiente de estúdio (reflexos em metais) gerado na GPU, sem arquivo HDR. */
export function studioEnvironment(renderer: THREE.WebGLRenderer, intensity = 1): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  room.traverse((o) => {
    (o as THREE.Mesh).geometry?.dispose?.();
    ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.();
  });
  pmrem.dispose();
  env.userData.intensity = intensity;
  return env;
}

/** Campo de estrelas determinístico (pontos numa esfera); reserva para quando o mapa estelar não carrega. */
export function starfield(radius: number, count = 2500): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const phi = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions.set([radius * s * Math.cos(phi), radius * u, radius * s * Math.sin(phi)], i * 3);
    // Temperatura de cor: estrelas azuladas, brancas e alaranjadas.
    const k = rnd();
    const m = 0.4 + rnd() ** 4 * 2.2;
    colors.set(k < 0.3 ? [0.7 * m, 0.8 * m, m] : k < 0.8 ? [m, m, m] : [m, 0.8 * m, 0.6 * m], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ size: radius / 500, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
}

/** Textura procedural de planeta (ruído de valor em camadas); usada enquanto a textura real da NASA carrega. */
export function planetTexture(palette: [string, string, string], seed: number, bands = false): THREE.Texture {
  const w = 256;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  const grid = (n: number) => {
    let s = seed * 9301 + n * 49297;
    return Array.from({ length: (n + 1) * (n + 1) }, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  };
  const layers = [4, 8, 16, 32].map((n) => ({ n, g: grid(n) }));
  const c = palette.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      let amp = 0.5;
      for (const { n, g } of layers) {
        const fx = (x / w) * n;
        const fy = (y / h) * n;
        const ix = Math.floor(fx) % n;
        const iy = Math.floor(fy);
        const tx = fx - Math.floor(fx);
        const ty = fy - iy;
        const at = (i: number, j: number) => g[(Math.min(j, n) * (n + 1)) + (i % n)];
        const a = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
        const bb = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
        v += amp * (a * (1 - ty) + bb * ty);
        amp /= 2;
      }
      if (bands) v = 0.5 * v + 0.5 * (0.5 + 0.5 * Math.sin((y / h) * Math.PI * 9 + v * 3));
      const lat = Math.abs(y / h - 0.5) * 2;
      const idx = ((h - 1 - y) * w + x) * 4;
      const t = Math.min(1, Math.max(0, v));
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const from = t < 0.5 ? c[0] : c[1];
      const to = t < 0.5 ? c[1] : c[2];
      const ice = lat > 0.88 ? (lat - 0.88) / 0.12 : 0;
      for (let ch = 0; ch < 3; ch++) data[idx + ch] = (from[ch] + (to[ch] - from[ch]) * k) * (1 - ice) + 235 * ice;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Rótulo em sprite com texto (canvas). */
export function label(text: string, color = '#e6edf7', scale = 1): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '600 44px "Inter", system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 10;
    ctx.fillText(text.toUpperCase(), 8, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false, opacity: 0.85 }));
  sprite.scale.set(4 * scale, 1 * scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function line(points: THREE.Vector3[], color: number, opacity = 1, dashed = false): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.3, transparent: true, opacity, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false });
  const l = new THREE.Line(geometry, material);
  if (dashed) l.computeLineDistances();
  return l;
}

/** Textura radial suave (brilho) para sprites. */
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.45)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
