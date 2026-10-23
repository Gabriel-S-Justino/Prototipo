# Relatório de entrega

Branch: `claude/project-thread-8ssgpp` no repositório `gabriel-s-justino/prototipo`. A linha de base (`59a7cec`) é o conteúdo do ZIP original, sem alterações.

## 1. Resumo da fusão

**Preservado do ZIP (40%):** a física didática de Hohmann, vis-viva, ângulo de fase e captura elíptica (agora referência de comparação no planejamento); os 11 testes de órbita com os mesmos valores; o parser de vetores do Horizons e a ideia de proxy serverless; o fluxo briefing → hangar → planejamento → voo → Marte → relatório; o Painel de Física por etapa; o tom didático em português; a configuração de cabeçalhos da Vercel; a documentação original em `legacy/`.

**Introduzido pela nova visão (60%):** efemérides de Standish e tabelas do Horizons; Lambert por variáveis universais; porkchop de 9.400 trajetórias em Web Worker; C3 e DLA ligados à capacidade do lançador; catálogo modular de motores, estágios, propulsores e coifas com regras de compatibilidade; modelo de subida em fases com perdas; sonda configurável (propulsão, tanque, energia, antena, amplificador, gravador, instrumentos, blindagem); orçamento fictício; checklist GO/WARNING/NO-GO; lançamento com eventos e falhas; cruzeiro com TCMs por Lambert, erros de execução, eventos solares de treinamento, enlace por Friis e conjunção solar; captura com o periapse alcançado; 8 turnos de operações com energia, gravador e DSN; relatório baseado no histórico; cenas Three.js do hangar, sistema solar, lançamento e Marte; modo Simples/Avançado.

## 2. Arquitetura final

React 19 + TypeScript estrito + Vite, Three.js puro, Vitest e Playwright. Camadas `domain` → `data` → `simulation` → `state` → `features`, sem dependências para cima. O redutor puro em `src/state/mission.ts` é a fonte única de verdade, e `derivePlan` recalcula tudo o que é derivável. Proxies `/api` para a NASA. Detalhes em [ARQUITETURA.md](ARQUITETURA.md) e [ADR 0001](adr/0001-react-typescript-vite.md).

## 3. Funcionalidades implementadas

Todas as 8 etapas estão implementadas e foram percorridas pelo teste e2e no Chromium. Testadas automaticamente: física orbital, montagem e desempenho do foguete, checklist, lançamento (normal, forçado, falhas, déficit), cruzeiro (TCMs, eventos solares, captura e falha de captura), comunicação, operações em Marte, redutor completo, integrações (com respostas simuladas) e a interface principal. Situação item a item em [CRITERIOS_ACEITACAO.md](CRITERIOS_ACEITACAO.md).

Não testado automaticamente: o conteúdo visual das cenas 3D (verificado só por capturas de tela), o uso em celular e a consulta real à NASA.

## 4. Validação física

Executado (`npm run validate:science` e suítes de unidade):

- Hohmann Terra–Marte: 258,9 dias, igual à referência; partida de 3.613 m/s e captura de 907 m/s, iguais ao projeto original.
- Lambert: reproduz o exemplo 5.2 de Curtis com erro < 10⁻³ km/s; a solução propagada chega a r₂ com erro < 1 km.
- Efemérides de Standish: periélio da Terra em ±3 dias de 03/01/2027; oposição de Marte em ±4 dias de 19/02/2027; conjunção solar a 0,3 dia de 21/03/2028.
- Janela de 2026: partida em 31/10/2026 com 293 dias dá C3 = 9,144 km²/s² (Standish).
- Lançadores: Atlas V 401 e 541 superam as massas reais de MRO e Perseverance; **Falcon 9 superestimado em 55% e Falcon Heavy subestimado em 15%** em relação aos números "para Marte" da SpaceX (C3 não informada pela SpaceX).

**Não realizado:** comparação com vetores reais do Horizons e com as curvas de desempenho do NASA Launch Services Program, porque o ambiente bloqueou o acesso a `ssd.jpl.nasa.gov` e `api.nasa.gov`. A meta de ±8% para os lançadores não foi verificada.

## 5. Qualidade

- Vitest: 7 arquivos, 115 testes, todos passando.
- Playwright: 2 testes, ambos passando.
- TypeScript e build sem erros. Aviso: pacote de ~956 kB (Three.js), sem divisão de código.
- Falha encontrada e corrigida: ao entrar no cruzeiro, a sonda está no centro da Terra (cônicas remendadas) e o cálculo do enlace recebia distância zero, derrubando a página. Corrigido com distância mínima de enlace e coberto por teste de regressão de interface.
- Avisos conhecidos no console: `THREE.Clock` obsoleto (sem efeito funcional).

## 6. Documentação

Criados: `README.md` (raiz), `docs/README.md`, `docs/ARQUITETURA.md`, `docs/FISICA.md`, `docs/DADOS_NASA.md`, `docs/FOGUETES.md`, `docs/TESTES.md`, `docs/COMO_EXECUTAR.md`, `docs/CRITERIOS_ACEITACAO.md`, `docs/RELATORIO_ENTREGA.md`, `docs/adr/0001-react-typescript-vite.md`, `.env.example`. Movidos para `legacy/`: os documentos originais.

## 7. Execução

```bash
npm install
npm run dev          # http://localhost:5173
npm test
npm run test:e2e
npm run build && npm run preview
```

## 8. Pendências

| Pendência | Motivo |
|---|---|
| Consulta real ao Horizons e à DONKI e comparação com o modelo offline | Rede do ambiente bloqueou os domínios da NASA |
| Reconferir os números do catálogo de lançadores nos documentos oficiais e reduzir o desvio do Falcon 9 | Documentos não acessíveis no ambiente; o modelo de fases médias usa os mesmos fatores de perda para todos os veículos |
| Validar o deploy na Vercel (funções com imports `.ts`) | Não havia acesso de deploy |
| Divisão de código do Three.js | Fora do escopo crítico; só afeta o tempo de carregamento |
| Teste em celular e com leitores de tela | Só a acessibilidade essencial (rótulos, foco, teclado no porkchop) foi coberta |
| Texturas da NASA | A pasta `assets/nasa/` do ZIP estava vazia; as texturas são procedurais |

## 9. Entrega

Código na branch `claude/project-thread-8ssgpp`, com PR aberto para revisão, e um ZIP da versão final (sem `node_modules` e `dist`).
