// Fontes oficiais NASA/JPL e registro explícito de modelos verificados.
// NASA 3D Resources é um catálogo de arquivos, não uma API JSON única de componentes.
export const NASA_RESOURCES = Object.freeze({
  modelsCatalog: 'https://science.nasa.gov/3d-resources/',
  githubCatalog: 'https://github.com/nasa/NASA-3D-Resources',
  perseveranceModel: 'https://github.com/nasa/NASA-3D-Resources/blob/master/3D%20Models/Mars%202020%20Perseverance%20Rover/Mars%202020%20Perseverance%20Rover.glb',
  perseveranceModelRaw: 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Mars%202020%20Perseverance%20Rover/Mars%202020%20Perseverance%20Rover.glb',
  eyesSolarSystem: 'https://eyes.nasa.gov/apps/solar-system/',
  imagesApi: 'https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf'
});

// Só inclua ativos com origem identificada. Este modelo é um rover, NÃO uma peça de foguete.
// Os componentes do simulador não têm equivalentes oficiais verificados neste repositório.
export const NASA_MODEL_MANIFEST = Object.freeze({
  'perseverance-rover': Object.freeze({
    id: 'perseverance-rover',
    name: 'Mars 2020 Perseverance Rover',
    url: NASA_RESOURCES.perseveranceModelRaw,
    source: NASA_RESOURCES.perseveranceModel,
    provider: 'NASA 3D Resources / NASA-JPL-Caltech',
    assetType: 'rover',
    official: true,
    local: false,
    attribution: 'NASA/JPL-Caltech; consulte os termos e créditos do ativo original.'
  })
});

export function getOfficialModel(id) {
  return Object.hasOwn(NASA_MODEL_MANIFEST, id) ? NASA_MODEL_MANIFEST[id] : null;
}

export function validateModelManifest(manifest = NASA_MODEL_MANIFEST) {
  const errors = [];
  for (const [key, model] of Object.entries(manifest)) {
    if (!model || key !== model.id) errors.push(`Manifest key/id mismatch: ${key}`);
    if (!/^https:\/\//.test(model?.url || '')) errors.push(`Invalid HTTPS model URL: ${key}`);
    if (!/^https:\/\//.test(model?.source || '')) errors.push(`Missing source URL: ${key}`);
    if (model?.official !== true) errors.push(`Model is not explicitly verified as official: ${key}`);
    if (!model?.provider || !model?.assetType) errors.push(`Missing provenance metadata: ${key}`);
  }
  return errors;
}

/** Carrega um modelo GLB/GLTF; requer Three.js e GLTFLoader. */
export async function loadNasaModel(url, { signal } = {}) {
  if (typeof url !== 'string' || !/^https:\/\//.test(url) && !url.startsWith('/')) {
    throw new TypeError('Informe uma URL HTTPS ou um caminho local de modelo GLB/GLTF.');
  }
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  return await new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Carregamento cancelado', 'AbortError'));
    const onAbort = () => reject(new DOMException('Carregamento cancelado', 'AbortError'));
    signal?.addEventListener('abort', onAbort, { once: true });
    loader.load(url, (gltf) => { signal?.removeEventListener('abort', onAbort); resolve(gltf); }, undefined, (error) => { signal?.removeEventListener('abort', onAbort); reject(error); });
  });
}
