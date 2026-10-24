// Materiais PBR procedurais (texturas desenhadas em canvas): pintura, espuma isolante, compósito, metal térmico,
// folha de isolamento multicamada (MLI), células solares e concreto. Nada é baixado: os desenhos ficam em cache
// por estilo e cada cena cria as próprias texturas a partir deles.
import * as THREE from 'three';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;

const canvases = new Map<string, HTMLCanvasElement | null>();

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Desenha (uma vez por chave) num canvas; devolve null onde não há canvas 2D (testes em jsdom). */
function cachedCanvas(key: string, w: number, h: number, draw: Draw, seed = 7): HTMLCanvasElement | null {
  if (canvases.has(key)) return canvases.get(key)!;
  let canvas: HTMLCanvasElement | null = null;
  try {
    if (typeof document !== 'undefined' && !/jsdom/i.test(navigator.userAgent)) {
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) draw(ctx, w, h, rng(seed));
      else canvas = null;
    }
  } catch {
    canvas = null;
  }
  canvases.set(key, canvas);
  return canvas;
}

function toTexture(canvas: HTMLCanvasElement | null, srgb: boolean, repeat: [number, number] = [1, 1]): THREE.Texture | null {
  if (!canvas) return null;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 8;
  return tex;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, n: number, size: number, color: (r: number) => string) {
  for (let i = 0; i < n; i++) {
    const r = rnd();
    ctx.fillStyle = color(r);
    const s = size * (0.3 + rnd());
    ctx.fillRect(rnd() * w, rnd() * h, s, s * (0.5 + rnd()));
  }
}

function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, n: number, rMax: number, color: (r: number) => string) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = rMax * (0.2 + rnd());
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color(rnd()));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}

export type SkinStyle = 'paint' | 'foam' | 'composite' | 'metal';

export interface SkinOptions {
  color: string;
  style: SkinStyle;
  /** Altura física de um ladrilho da textura (m) e comprimento da peça (m), para repetir sem esticar. */
  tile?: number;
  length: number;
  /** Faixas de solda (anéis) por ladrilho. */
  rings?: number;
  /** Linhas verticais (painéis) ao redor da circunferência. */
  panels?: number;
  /** Texto vertical pintado (identificação do veículo). */
  text?: string;
  roughness?: number;
  metalness?: number;
}

/** Revestimento de um tanque/estágio: cor, rugosidade e relevo coerentes (soldas, rebites, manchas). */
export function skinMaterial(o: SkinOptions): THREE.MeshStandardMaterial {
  const tile = o.tile ?? 10;
  const rings = o.rings ?? 2;
  const panels = o.panels ?? 8;
  const key = `${o.style}|${o.color}|${rings}|${panels}`;
  const W = 512;
  const H = 512;
  const colorCanvas = cachedCanvas(`c|${key}`, W, H, (ctx, w, h, rnd) => {
    ctx.fillStyle = o.color;
    ctx.fillRect(0, 0, w, h);
    if (o.style === 'foam') {
      // Espuma isolante (SOFI): manchas de aplicação e poros.
      blotches(ctx, w, h, rnd, 260, 40, (r) => (r < 0.5 ? `rgba(120,50,10,${0.05 + r * 0.12})` : `rgba(255,190,120,${0.04 + (r - 0.5) * 0.1})`));
      speckle(ctx, w, h, rnd, 9000, 1.4, (r) => (r < 0.5 ? 'rgba(80,30,0,0.18)' : 'rgba(255,210,160,0.15)'));
      for (let y = 0; y < h; y += 3) {
        ctx.fillStyle = `rgba(0,0,0,${0.015 + rnd() * 0.02})`;
        ctx.fillRect(0, y, w, 1);
      }
    } else if (o.style === 'composite') {
      // Fibra de carbono: trama fina diagonal.
      for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = (x + y) % 8 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
        ctx.fillRect(x, y, 4, 4);
      }
      blotches(ctx, w, h, rnd, 60, 50, (r) => `rgba(255,255,255,${0.01 + r * 0.02})`);
    } else if (o.style === 'metal') {
      for (let y = 0; y < h; y++) {
        ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.05})`;
        ctx.fillRect(0, y, w, 1);
      }
    } else {
      blotches(ctx, w, h, rnd, 90, 70, (r) => `rgba(${r < 0.5 ? '90,90,100' : '255,255,255'},${0.015 + r * 0.03})`);
      speckle(ctx, w, h, rnd, 1500, 1, () => 'rgba(0,0,0,0.04)');
    }
    // Soldas circunferenciais e juntas de painel.
    for (let i = 0; i < rings; i++) {
      const y = Math.round(((i + 0.5) / rings) * h);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, y, w, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, y + 2, w, 1);
      for (let x = 4; x < w; x += 10) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y - 5, 2, 2);
        ctx.fillRect(x, y + 6, 2, 2);
      }
    }
    for (let i = 0; i < panels; i++) {
      const x = Math.round((i / panels) * w);
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fillRect(x, 0, 1, h);
    }
  });
  const bumpCanvas = cachedCanvas(`b|${key}`, W, H, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    if (o.style === 'foam') speckle(ctx, w, h, rnd, 14000, 1.6, (r) => (r < 0.5 ? '#6a6a6a' : '#999'));
    if (o.style === 'composite') for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
      ctx.fillStyle = (x + y) % 8 === 0 ? '#8a8a8a' : '#777';
      ctx.fillRect(x, y, 4, 4);
    }
    for (let i = 0; i < rings; i++) {
      const y = Math.round(((i + 0.5) / rings) * h);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(0, y, w, 3);
      for (let x = 4; x < w; x += 10) {
        ctx.fillStyle = '#c8c8c8';
        ctx.fillRect(x, y - 5, 2, 2);
        ctx.fillRect(x, y + 6, 2, 2);
      }
    }
    for (let i = 0; i < panels; i++) {
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(Math.round((i / panels) * w), 0, 2, h);
    }
  });
  const roughCanvas = cachedCanvas(`r|${key}`, 256, 256, (ctx, w, h, rnd) => {
    const base = Math.round((o.roughness ?? 0.5) * 255);
    ctx.fillStyle = `rgb(${base},${base},${base})`;
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, rnd, 80, 40, (r) => `rgba(${r < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r * 0.06})`);
  });
  const repeat: [number, number] = [1, Math.max(1, o.length / tile)];
  const map = toTexture(colorCanvas, true, repeat);
  const bumpMap = toTexture(bumpCanvas, false, repeat);
  const roughnessMap = toTexture(roughCanvas, false, repeat);
  const mat = new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : new THREE.Color(o.color),
    map,
    bumpMap,
    bumpScale: o.style === 'foam' ? 1.6 : 0.8,
    roughnessMap,
    roughness: roughnessMap ? 1 : o.roughness ?? 0.5,
    metalness: o.metalness ?? (o.style === 'metal' ? 0.85 : 0.05),
  });
  if (o.text) {
    const tex = textDecal(o.text);
    if (tex) {
      mat.userData.decal = tex;
    }
  }
  return mat;
}

/** Texto vertical (tinta preta) num canvas transparente, aplicado como uma faixa sobre o tanque. */
export function textDecal(text: string): THREE.Texture | null {
  const canvas = cachedCanvas(`t|${text}`, 128, 1024, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '800 92px "Inter", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#15181d';
    ctx.fillText(text, 0, 0, h * 0.95);
    ctx.restore();
  });
  const tex = toTexture(canvas, true);
  if (tex) tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Sino de motor: metal escurecido com coloração térmica (azul-bronze perto da garganta). */
export function nozzleMaterial(kind: 'regen' | 'ablative' | 'niobium' | 'srb'): THREE.MeshStandardMaterial {
  const canvas = cachedCanvas(`n|${kind}`, 64, 256, (ctx, w, h, rnd) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (kind === 'regen') {
      g.addColorStop(0, '#4a3a2c');
      g.addColorStop(0.15, '#5b4a6b');
      g.addColorStop(0.4, '#3a3d44');
      g.addColorStop(1, '#2a2c31');
    } else if (kind === 'niobium') {
      g.addColorStop(0, '#3b3d42');
      g.addColorStop(1, '#22252a');
    } else if (kind === 'srb') {
      g.addColorStop(0, '#2c2c2e');
      g.addColorStop(1, '#1b1b1d');
    } else {
      g.addColorStop(0, '#3d3127');
      g.addColorStop(1, '#2b2723');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Tubos de refrigeração regenerativa (riscas verticais).
    if (kind === 'regen') for (let x = 0; x < w; x += 2) {
      ctx.fillStyle = `rgba(${x % 4 ? '0,0,0' : '255,255,255'},${0.05 + rnd() * 0.05})`;
      ctx.fillRect(x, 0, 1, h);
    }
  });
  const map = toTexture(canvas, true);
  return new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : 0x34363c,
    map,
    roughness: kind === 'niobium' ? 0.55 : 0.38,
    metalness: kind === 'srb' ? 0.2 : 0.85,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0xff5a1a),
    emissiveIntensity: 0,
  });
}

/** Folha de isolamento multicamada dourada, enrugada (corpo de sondas). */
export function mliMaterial(color: 'gold' | 'silver' = 'gold'): THREE.MeshStandardMaterial {
  const draw: Draw = (ctx, w, h, rnd) => {
    ctx.fillStyle = color === 'gold' ? '#c99a3c' : '#b9bec7';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const a = rnd() * Math.PI;
      const l = 8 + rnd() * 40;
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,240,190,0.25)' : 'rgba(70,40,0,0.25)';
      ctx.lineWidth = 0.5 + rnd() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < 4; i++) ctx.fillRect(0, (i * h) / 4, w, 1);
  };
  const map = toTexture(cachedCanvas(`mli|${color}`, 256, 256, draw, 3), true);
  const bump = toTexture(cachedCanvas(`mli|${color}`, 256, 256, draw, 3), false);
  return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : 0xc99a3c, map, bumpMap: bump, bumpScale: 2, roughness: 0.32, metalness: 1 });
}

/** Painel solar: células azul-escuras com barramentos prateados e moldura. */
export function solarCellMaterial(): THREE.MeshStandardMaterial {
  const canvas = cachedCanvas('solar', 256, 256, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#c9ccd2';
    ctx.fillRect(0, 0, w, h);
    const n = 8;
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 18 + rnd() * 10;
      ctx.fillStyle = `rgb(${v},${v + 14},${v + 52})`;
      ctx.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
      ctx.fillStyle = 'rgba(200,210,230,0.35)';
      ctx.fillRect(i * s + s / 2, j * s + 2, 0.7, s - 4);
    }
  });
  const map = toTexture(canvas, true, [3, 6]);
  return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : 0x1b2e5a, map, roughness: 0.22, metalness: 0.65, emissive: 0x020612 });
}

/** Piso de concreto industrial com juntas de dilatação e faixas de segurança amarelas. */
export function concreteMaterial(size: number, tile = 12): THREE.MeshStandardMaterial {
  const draw: Draw = (ctx, w, h, rnd) => {
    ctx.fillStyle = '#7c7b77';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, rnd, 160, 60, (r) => `rgba(${r < 0.6 ? '40,38,35' : '170,168,160'},${0.04 + r * 0.06})`);
    speckle(ctx, w, h, rnd, 6000, 1.2, (r) => (r < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)'));
    // Marcas de pneus e manchas de óleo.
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = 'rgba(20,20,20,0.06)';
      ctx.lineWidth = 6 + rnd() * 10;
      ctx.beginPath();
      ctx.moveTo(rnd() * w, 0);
      ctx.bezierCurveTo(rnd() * w, h / 3, rnd() * w, (2 * h) / 3, rnd() * w, h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,30,30,0.35)';
    ctx.fillRect(0, 0, w, 2);
    ctx.fillRect(0, 0, 2, h);
  };
  const map = toTexture(cachedCanvas('concrete', 512, 512, draw, 11), true, [size / tile, size / tile]);
  const rough = toTexture(cachedCanvas('concrete', 512, 512, draw, 11), false, [size / tile, size / tile]);
  return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : 0x7c7b77, map, roughnessMap: rough, roughness: 0.95, metalness: 0, bumpMap: rough, bumpScale: 0.6 });
}

/** Chapa de aço pintada (estrutura do hangar e da plataforma), com desgaste. */
export function steelMaterial(color: string, roughness = 0.6, repeat: [number, number] = [1, 1]): THREE.MeshStandardMaterial {
  const map = toTexture(cachedCanvas(`steel|${color}`, 256, 256, (ctx, w, h, rnd) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, rnd, 70, 40, (r) => `rgba(${r < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r * 0.05})`);
    speckle(ctx, w, h, rnd, 900, 1.5, () => 'rgba(0,0,0,0.12)');
  }, 5), true, repeat);
  return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : new THREE.Color(color), map, roughness, metalness: 0.5 });
}

/** Faixa zebrada amarela e preta (bordas de plataformas). */
export function hazardMaterial(repeat = 8): THREE.MeshStandardMaterial {
  const map = toTexture(cachedCanvas('hazard', 128, 32, (ctx, w, h) => {
    ctx.fillStyle = '#e3b21b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#16171a';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 16, h);
      ctx.lineTo(x + 16 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.fill();
    }
  }), true, [repeat, 1]);
  return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : 0xe3b21b, map, roughness: 0.6, metalness: 0.1 });
}

/** Gelo de condensação sobre tanques criogênicos abastecidos (LOX/LH2). */
export function frostMaterial(): THREE.MeshStandardMaterial {
  const map = toTexture(cachedCanvas('frost', 256, 256, (ctx, w, h, rnd) => {
    ctx.clearRect(0, 0, w, h);
    blotches(ctx, w, h, rnd, 400, 30, (r) => `rgba(245,250,255,${0.25 + r * 0.5})`);
    speckle(ctx, w, h, rnd, 5000, 1.5, () => 'rgba(255,255,255,0.6)');
  }, 13), true, [3, 4]);
  return new THREE.MeshStandardMaterial({ color: 0xf4f8ff, map, alphaMap: map ?? undefined, transparent: true, opacity: map ? 1 : 0.6, roughness: 0.9, metalness: 0, depthWrite: false });
}
