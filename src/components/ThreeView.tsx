import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface SceneHandle<P> {
  update(props: P): void;
  dispose(): void;
}

/** Verifica suporte a WebGL sem lançar erro (jsdom e navegadores sem GPU retornam null). */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
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
    try {
      handle.current = create(ref.current, props);
    } catch (e) {
      setError((e as Error).message);
    }
    return () => {
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
          {fallback}
        </div>
      ) : null}
      {children}
    </div>
  );
}
