// Utilitários de renderização Three.js compartilhados pelas cenas.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  onFrame(fn: (dt: number, time: number) => void): void;
  dispose(): void;
}

export function createStage(container: HTMLElement, options: { fov?: number; near?: number; far?: number; position: [number, number, number]; target?: [number, number, number] }): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(options.fov ?? 45, 1, options.near ?? 0.1, options.far ?? 5000);
  camera.position.set(...options.position);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(...(options.target ?? [0, 0, 0]));
  const resize = () => {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 440;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(container);
  const callbacks: ((dt: number, time: number) => void)[] = [];
  const clock = new THREE.Clock();
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, clock.getDelta());
    for (const fn of callbacks) fn(dt, clock.elapsedTime);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();
  return {
    renderer, scene, camera, controls,
    onFrame: (fn) => callbacks.push(fn),
    dispose: () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
      // dispose() não devolve o contexto ao navegador; sem isto cada troca de tela deixava um contexto vivo.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

/** Campo de estrelas determinístico (pontos numa esfera). */
export function starfield(radius: number, count = 2500): THREE.Points {
  const positions = new Float32Array(count * 3);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const phi = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions.set([radius * s * Math.cos(phi), radius * u, radius * s * Math.sin(phi)], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xcfd8ff, size: radius / 600, sizeAttenuation: true, transparent: true, opacity: 0.8 }));
}

/** Textura procedural de planeta (ruído de valor em camadas), para não depender de CDNs externos. */
export function planetTexture(palette: [string, string, string], seed: number, bands = false): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
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
        const b = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
        v += amp * (a * (1 - ty) + b * ty);
        amp /= 2;
      }
      if (bands) v = 0.5 * v + 0.5 * (0.5 + 0.5 * Math.sin((y / h) * Math.PI * 9 + v * 3));
      const lat = Math.abs(y / h - 0.5) * 2;
      const idx = (y * w + x) * 4;
      const t = Math.min(1, Math.max(0, v));
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const from = t < 0.5 ? c[0] : c[1];
      const to = t < 0.5 ? c[1] : c[2];
      const ice = lat > 0.88 ? (lat - 0.88) / 0.12 : 0;
      for (let ch = 0; ch < 3; ch++) img.data[idx + ch] = (from[ch] + (to[ch] - from[ch]) * k) * (1 - ice) + 235 * ice;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Rótulo em sprite com texto (canvas). */
export function label(text: string, color = '#e6edf7', scale = 1): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 48px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  ctx.fillText(text, 8, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(4 * scale, 1 * scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function line(points: THREE.Vector3[], color: number, opacity = 1, dashed = false): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.3, transparent: true, opacity })
    : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  const l = new THREE.Line(geometry, material);
  if (dashed) l.computeLineDistances();
  return l;
}
