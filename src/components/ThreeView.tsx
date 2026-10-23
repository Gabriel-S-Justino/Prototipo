import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface SceneHandle<P> {
  update(props: P): void;
  dispose(): void;
}

let probed: boolean | null = null;

/**
 * Verifica suporte a WebGL sem lançar erro (jsdom e navegadores sem GPU retornam null).
 * O teste roda uma vez por página e libera o contexto na hora: os navegadores limitam
 * quantos contextos WebGL ficam ativos, e cada sonda esquecida ocupava uma vaga.
 */
export function webglAvailable(): boolean {
  if (probed !== null) return probed;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    probed = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    probed = false;
  }
  return probed;
}

/**
 * Monta uma cena Three.js dentro de um contêiner e a atualiza quando as props mudam.
 * A cena só consome resultados da simulação; nenhum cálculo de missão acontece aqui.
 */
export function ThreeView<P>({ create, props, label, className, children, fallback }: {
  create: (container: HTMLElement, props: P) => SceneHandle<P>;
  props: P;
  label: string;
  className?: string;
  children?: ReactNode;
  fallback?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<SceneHandle<P> | null>(null);
  const [supported] = useState(webglAvailable);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported || !ref.current) return;
    const container = ref.current;
    // A GPU pode descartar o contexto (driver reiniciado, aba em segundo plano, memória): avisa em vez de congelar a cena.
    const lost = (event: Event) => {
      event.preventDefault();
      setError('o navegador descartou o contexto WebGL; recarregue a página');
    };
    container.addEventListener('webglcontextlost', lost, true);
    try {
      handle.current = create(container, props);
    } catch (e) {
      setError((e as Error).message);
    }
    return () => {
      container.removeEventListener('webglcontextlost', lost, true);
      handle.current?.dispose();
      handle.current = null;
    };
    // A cena é criada uma vez; mudanças chegam por update().
  }, [supported, create]);

  useEffect(() => {
    handle.current?.update(props);
  }, [props]);

  return (
    <div ref={ref} className={`view3d ${className ?? ''}`} role="img" aria-label={label}>
      {!supported || error ? (
        <div className="fallback">
          <p>
            {error ? `A visualização 3D falhou (${error}).` : 'Este navegador não oferece WebGL: a visualização 3D está desativada.'}
            <br />
            Todos os dados da simulação continuam nos painéis.
          </p>
          {!supported ? (
            <p className="small">
              Para ativar: ligue a aceleração por hardware nas configurações do navegador e reinicie-o, desative extensões que bloqueiam WebGL
              e confira em <a href="https://get.webgl.org/" target="_blank" rel="noreferrer">get.webgl.org</a>.
            </p>
          ) : null}
          {fallback}
        </div>
      ) : null}
      {children}
    </div>
  );
}
