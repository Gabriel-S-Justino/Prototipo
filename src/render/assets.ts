// Texturas reais (NASA, domínio público) servidas de public/textures. Veja docs/CREDITOS_VISUAIS.md.
// O carregamento é assíncrono: a cena começa com uma textura procedural e troca pela real quando a imagem chega.
// Se a imagem falhar (sem rede, bloqueio), a procedural fica: a cena nunca quebra por causa de um arquivo.
import * as THREE from 'three';

export const TEXTURES = {
  earthDay: 'textures/earth_day_2k.jpg',
  earthNight: 'textures/earth_night_2k.jpg',
  earthOcean: 'textures/earth_ocean_1k.jpg',
  mars: 'textures/mars_1440.jpg',
  stars: 'textures/stars_tycho_2k.jpg',
} as const;

const images = new Map<string, Promise<HTMLImageElement>>();

function base() {
  try {
    return import.meta.env?.BASE_URL ?? '/';
  } catch {
    return '/';
  }
}

export function loadImage(path: string): Promise<HTMLImageElement> {
  let p = images.get(path);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => { images.delete(path); reject(new Error(`falha ao carregar ${path}`)); };
      img.src = base() + path;
    });
    images.set(path, p);
  }
  return p;
}

/**
 * Textura que começa com `placeholder` (ou 1 pixel cinza) e passa a usar a imagem real quando ela carrega.
 * As imagens ficam em cache entre cenas; cada cena recebe o próprio objeto Texture (o contexto WebGL é por cena).
 */
export function remoteTexture(path: string, options: { srgb?: boolean; placeholder?: THREE.Texture; anisotropy?: number; onLoad?: () => void } = {}): THREE.Texture {
  const tex = options.placeholder ?? new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  tex.colorSpace = options.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = options.anisotropy ?? 8;
  tex.needsUpdate = true;
  if (typeof Image === 'undefined') return tex;
  loadImage(path).then((img) => {
    // Troca a imagem: DataTexture e Texture comum compartilham o mesmo caminho de upload a partir de `image`.
    const real = tex as THREE.Texture & { isDataTexture?: boolean };
    real.isDataTexture = false;
    real.image = img;
    real.flipY = true;
    real.generateMipmaps = true;
    real.minFilter = THREE.LinearMipmapLinearFilter;
    real.magFilter = THREE.LinearFilter;
    real.needsUpdate = true;
    options.onLoad?.();
  }).catch(() => {
    // Mantém a textura procedural.
  });
  return tex;
}
