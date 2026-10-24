// Corpos celestes fotorrealistas: Sol com granulação animada, Terra com dia/noite (Blue Marble e Black Marble,
// NASA), nuvens e reflexo do Sol nos oceanos, Marte (mosaico Viking, NASA) e cascas de atmosfera.
import * as THREE from 'three';
import { remoteTexture, TEXTURES } from './assets';
import { glowTexture, planetTexture, starfield } from './common';

const noiseGlsl = /* glsl */ `
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                   mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
               mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                   mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
  }
  float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise3(p); p *= 2.03; a *= 0.5; } return v; }
`;

/** Esfera celeste com o mapa estelar Tycho (NASA); pontos procedurais enquanto a imagem não chega. */
export function skySphere(radius: number, brightness = 0.32): THREE.Group {
  const g = new THREE.Group();
  const fallback = starfield(radius * 0.98, 1800);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, color: new THREE.Color(brightness, brightness, brightness) });
  // O mapa dá o brilho difuso da Via Láctea; os pontos mantêm as estrelas nítidas em telas grandes.
  mat.map = remoteTexture(TEXTURES.stars, { onLoad: () => { (fallback.material as THREE.PointsMaterial).opacity = 0.55; } });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
  // O mapa está em coordenadas galácticas aproximadas; uma inclinação deixa a Via Láctea na diagonal da cena.
  sphere.rotation.set(0.4, 0, 1.0);
  g.add(sphere, fallback);
  return g;
}

/** Sol: fotosfera com granulação e escurecimento de limbo, coroa em camadas e brilho para o bloom. */
export function createSun(radius: number) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vP; varying vec3 vV; ${noiseGlsl}
      void main(){
        vec3 p = normalize(vP);
        float gran = fbm(p * 9.0 + vec3(0.0, uTime * 0.05, 0.0));
        float spots = smoothstep(0.42, 0.62, fbm(p * 2.2 - uTime * 0.01));
        float mu = clamp(dot(vN, vV), 0.0, 1.0);
        float limb = 0.35 + 0.65 * pow(mu, 0.45);
        vec3 col = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.92, 0.7), 0.5 + gran * 1.2);
        col *= (1.0 - spots * 0.55) * limb;
        gl_FragColor = vec4(col * 6.0, 1.0);
      }`,
  });
  const photosphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
  group.add(photosphere);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,200,120,1)'), color: new THREE.Color(2.2, 1.5, 0.9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(radius * 4.2);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,170,90,1)'), color: new THREE.Color(0.35, 0.2, 0.08), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  corona.scale.setScalar(radius * 9);
  group.add(glow, corona);
  return {
    group,
    update(time: number) {
      mat.uniforms.uTime.value = time;
      glow.material.rotation = time * 0.02;
      glow.scale.setScalar(radius * (4.2 + Math.sin(time * 1.3) * 0.12));
    },
  };
}

/** Casca de atmosfera com espalhamento aproximado (mais forte no limbo, só do lado iluminado). */
export function atmosphere(radius: number, color: THREE.Color, opts: { power?: number; strength?: number; sunPosition?: THREE.Vector3 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uPower: { value: opts.power ?? 3.5 }, uStrength: { value: opts.strength ?? 1.5 }, uSun: { value: opts.sunPosition ?? new THREE.Vector3() }, uDirectional: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vWN;
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vWN = normalize(mat3(modelMatrix)*normal);
        vec4 mv = viewMatrix*w; vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPower, uStrength, uDirectional; uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vWN;
      void main(){
        float rim = pow(1.0 - abs(dot(vN, vV)), uPower);
        vec3 L = uDirectional > 0.5 ? normalize(uSun) : normalize(uSun - vW);
        float lit = smoothstep(-0.35, 0.5, dot(vWN, L));
        gl_FragColor = vec4(uColor * rim * uStrength * lit, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
  return mesh;
}

let cloudCanvas: HTMLCanvasElement | null | undefined;
/** Nuvens procedurais (ruído fractal com faixas de latitude), geradas uma vez por página. */
function cloudTexture(): THREE.Texture | null {
  if (cloudCanvas === undefined) {
    cloudCanvas = null;
    try {
      if (typeof document !== 'undefined' && !/jsdom/i.test(navigator.userAgent)) {
        const w = 512;
        const h = 256;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (ctx) {
          const img = ctx.createImageData(w, h);
          const grid = (n: number, seed: number) => { let s = seed; return Array.from({ length: (n + 1) * (n + 1) }, () => ((s = (s * 16807) % 2147483647) / 2147483647)); };
          const layers = [6, 12, 24, 48, 96].map((n, i) => ({ n, g: grid(n, 1234 + i * 977) }));
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let v = 0;
            let amp = 0.5;
            for (const { n, g } of layers) {
              const fx = (x / w) * n;
              const fy = (y / h) * n;
              const ix = Math.floor(fx) % n;
              const iy = Math.floor(fy);
              const tx = fx - Math.floor(fx);
              const ty = fy - iy;
              const at = (i: number, j: number) => g[Math.min(j, n) * (n + 1) + (i % n)];
              const sx = tx * tx * (3 - 2 * tx);
              const sy = ty * ty * (3 - 2 * ty);
              v += amp * ((at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy);
              amp /= 2;
            }
            const lat = Math.abs(y / h - 0.5) * 2;
            // Mais nuvens nas latitudes médias e na zona de convergência equatorial.
            const band = 0.75 + 0.25 * Math.cos(lat * Math.PI * 3);
            const a = Math.max(0, Math.min(1, (v * band - 0.47) * 3.2));
            const i = (y * w + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
            img.data[i + 3] = a * 235;
          }
          ctx.putImageData(img, 0, 0);
          cloudCanvas = c;
        }
      }
    } catch {
      cloudCanvas = null;
    }
  }
  if (!cloudCanvas) return null;
  const tex = new THREE.CanvasTexture(cloudCanvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Terra com dia e noite: o lado escuro mostra as luzes das cidades; o oceano reflete o Sol.
 * `sun` é a posição do Sol (luz pontual) ou, com `directional`, a direção da luz.
 */
export function createEarth(radius: number, sun: THREE.Vector3, directional = false) {
  const group = new THREE.Group();
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;
  const day = remoteTexture(TEXTURES.earthDay, { placeholder: planetTexture(['#123d7a', '#1f6fb8', '#3c8f4a'], 7) });
  const night = remoteTexture(TEXTURES.earthNight, { placeholder: black });
  const ocean = remoteTexture(TEXTURES.earthOcean, { srgb: false, placeholder: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uDay: { value: day }, uNight: { value: night }, uOcean: { value: ocean }, uSun: { value: sun }, uDirectional: { value: directional ? 1 : 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vWN; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vWN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D uDay, uNight, uOcean; uniform vec3 uSun; uniform float uDirectional; varying vec2 vUv; varying vec3 vWN; varying vec3 vW;
      void main(){
        vec3 N = normalize(vWN);
        vec3 L = uDirectional > 0.5 ? normalize(uSun) : normalize(uSun - vW);
        vec3 V = normalize(cameraPosition - vW);
        float ndl = dot(N, L);
        vec3 day = texture2D(uDay, vUv).rgb;
        vec3 night = texture2D(uNight, vUv).rgb;
        float water = texture2D(uOcean, vUv).r;
        float lit = max(ndl, 0.0);
        vec3 col = day * (lit * 1.6 + 0.012);
        // Luzes das cidades só no lado noturno, apagando no crepúsculo.
        col += night * 2.4 * smoothstep(0.08, -0.18, ndl);
        // Reflexo especular do Sol nos oceanos.
        vec3 H = normalize(L + V);
        col += vec3(1.0, 0.92, 0.8) * water * pow(max(dot(N, H), 0.0), 140.0) * 1.1 * step(0.0, ndl);
        // Tom avermelhado no terminador.
        col *= mix(vec3(1.0), vec3(1.0, 0.75, 0.55), smoothstep(0.25, 0.0, ndl) * step(0.0, ndl));
        // Espalhamento azul na borda do disco.
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col += vec3(0.25, 0.5, 1.0) * fres * smoothstep(-0.2, 0.4, ndl) * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), mat);
  group.add(surface);
  const cloudsTex = cloudTexture();
  let clouds: THREE.Mesh | null = null;
  if (cloudsTex) {
    clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.012, 96, 48), new THREE.MeshStandardMaterial({ map: cloudsTex, transparent: true, roughness: 1, metalness: 0, depthWrite: false }));
    group.add(clouds);
  }
  const atmo = atmosphere(radius * 1.06, new THREE.Color(0.3, 0.55, 1.0), { power: 3, strength: 1.4, sunPosition: sun });
  (atmo.material as THREE.ShaderMaterial).uniforms.uDirectional.value = directional ? 1 : 0;
  group.add(atmo);
  return {
    group, surface,
    update(dt: number) {
      surface.rotation.y += dt * 0.08;
      if (clouds) clouds.rotation.y += dt * 0.095;
    },
  };
}

/** Marte: mosaico de cores Viking (NASA) com relevo derivado da própria imagem e atmosfera fina de poeira. */
export function createMars(radius: number, sun: THREE.Vector3, directional = false) {
  const group = new THREE.Group();
  const map = remoteTexture(TEXTURES.mars, { placeholder: planetTexture(['#5a2412', '#a4462a', '#d27b4b'], 3) });
  const bump = remoteTexture(TEXTURES.mars, { srgb: false, placeholder: planetTexture(['#5a2412', '#a4462a', '#d27b4b'], 3) });
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2.5, roughness: 0.95, metalness: 0 }));
  surface.castShadow = surface.receiveShadow = false;
  group.add(surface);
  const atmo = atmosphere(radius * 1.035, new THREE.Color(0.95, 0.55, 0.35), { power: 4, strength: 0.9, sunPosition: sun });
  (atmo.material as THREE.ShaderMaterial).uniforms.uDirectional.value = directional ? 1 : 0;
  group.add(atmo);
  return {
    group, surface, atmosphere: atmo,
    update(dt: number) {
      surface.rotation.y += dt * 0.05;
    },
  };
}
