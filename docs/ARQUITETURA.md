# Arquitetura

## Visão geral

```
src/
  domain/units.ts          constantes físicas, unidades e datas (Data Juliana)
  data/                    catálogos com proveniência: corpos, lançadores, sonda, conceitos didáticos
  simulation/
    orbital/               vetores, Kepler, Lambert, efemérides, transferência, porkchop, Hohmann (referência)
    rocket/                montagem do veículo (compatibilidade) e desempenho (fases de queima, capacidade)
    mission/               plano, checklist, orçamento, lançamento, cruzeiro, eventos solares, comunicação,
                           captura, operações em Marte, relatório, RNG com semente
    validation/            suíte de validação científica (imprime desvios)
  state/                   redutor da missão (fonte única de verdade) e contexto React
  services/                clientes do navegador para /api, runner do porkchop (Web Worker + cache)
  workers/                 worker do porkchop
  render/                  cenas Three.js (hangar, sistema solar, lançamento, Marte)
  components/              peças de interface reutilizáveis (Painel de Física, métricas, ThreeView)
  features/                uma pasta por etapa da missão
  app/App.tsx              navegação por etapas
api/                       proxies serverless (Vercel) e middleware do Vite
e2e/                       testes Playwright
legacy/                    documentação do projeto original
```

As camadas só dependem "para baixo": `features` → `state` → `simulation` → `data`/`domain`. Nada em `simulation` importa React, DOM ou Three.js, por isso toda a física roda em Node nos testes e dentro do Web Worker.

## Fonte única de verdade

`src/state/mission.ts` guarda **decisões** (configuração do veículo e da sonda, data e tempo de voo, órbita de captura, efemérides escolhidas, semente) e **fatos ocorridos** (resultado do lançamento, estado do cruzeiro, captura, operações, diário). Tudo o que pode ser recalculado não é guardado: `derivePlan(design, selection, ephemeris)` produz, a cada renderização, a transferência de Lambert, C3, DLA, capacidade do lançador, margem de massa, Δv da sonda, orçamento, energia em Marte, enlace e checklist.

Consequências:

- mudar a data no planejamento muda na mesma hora a capacidade no hangar, o checklist e o Painel de Física, porque todos leem o mesmo `plan`;
- o lançamento só lê o plano; o cruzeiro parte do estado real deixado pelo lançamento (erro de injeção, propelente gasto, antena danificada);
- o redutor é puro e determinístico (RNG `mulberry32` com sub-sementes por evento), o que permite testar a missão inteira sem interface.

Depois do lançamento o projeto fica travado: ações de edição são ignoradas pelo redutor, não só desabilitadas na interface.

## Fluxo de uma missão

1. **Centro de missões**: briefing, semente, modo avançado.
2. **Hangar**: `assembleVehicle` valida compatibilidade (família de estágios, motores, propulsores, coifa, carregamento); `vehiclePerformance` calcula as fases de queima; `payloadCapacity` busca por bisseção a carga máxima para a C3 e a DLA da trajetória atual. A cena 3D é gerada a partir do mesmo `AssembledVehicle` e permite selecionar partes por clique.
3. **Planejamento**: o porkchop roda no Web Worker (`services/porkchopRunner.ts`), com cache por parâmetros e efemérides e fallback assíncrono sem Worker. Clicar no gráfico ou usar as setas muda `selection`.
4. **Checklist**: itens GO / WARNING / NO-GO derivados do plano. Lançamento forçado exige confirmação.
5. **Lançamento**: `simulateLaunch` gera eventos e falhas a partir do desempenho e das incompatibilidades; a cena 3D é dirigida por `launchTelemetry`, isto é, pelos mesmos números.
6. **Cruzeiro**: propagação kepleriana heliocêntrica; TCMs calculadas por Lambert até o ponto de mira no plano B; eventos solares de treinamento; enlace por Friis com conjunção solar.
7. **Chegada**: previsão do periapse a partir do estado real; MOI com o Δv que a sonda ainda tem.
8. **Operações em Marte**: 8 turnos de 30 sóis com energia, gravador, horas de DSN e ciência por tema.
9. **Relatório**: montado a partir do diário e dos estados finais, nunca de valores planejados.

## Integrações externas

O navegador nunca chama a NASA. `api/handlers.ts` contém a lógica dos proxies (validação, tempo limite, normalização, cabeçalhos de cache) e é usada tanto pelas funções da Vercel (`api/horizons.ts`, `api/donki.ts`) quanto pelo middleware do Vite. Ver [DADOS_NASA.md](DADOS_NASA.md).

## Decisões

- [ADR 0001](adr/0001-react-typescript-vite.md): migração de JavaScript sem bundler para React + TypeScript + Vite.
- Three.js puro (sem react-three-fiber): as cenas são classes imperativas com `update()` e `dispose()`, embrulhadas por `components/ThreeView.tsx`. Menos dependências e controle direto do ciclo de vida.
- Sem biblioteca de estado: `useReducer` + contexto bastam, e o redutor puro é testável.
- Efemérides como descritor serializável (`{ kind: 'standish' }` ou tabelas do Horizons), para atravessar o limite do Worker.
