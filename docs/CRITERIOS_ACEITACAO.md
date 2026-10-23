# Critérios de aceitação (seção 17 da especificação)

Legenda: **Implementado** · **Parcial** · **Bloqueado** · **Não implementado**. "Evidência" aponta o teste ou a verificação que sustenta a marcação.

## Produto

| Critério | Situação | Evidência |
|---|---|---|
| Projeto original analisado e elementos úteis reaproveitados | Implementado | [ADR 0001](adr/0001-react-typescript-vite.md); física de Hohmann e testes de órbita portados |
| Uma única aplicação integrada | Implementado | `App.tsx` + redutor único; e2e do fluxo completo |
| A missão completa pode ser iniciada | Implementado | `e2e/mission.spec.ts`; `state/mission.test.ts` (missão completa) |
| O jogador configura o foguete | Implementado | Hangar com 5 presets e troca de cada peça; `App.test.tsx` |
| Componentes alteram os resultados | Implementado | `rocket.test.ts` (massa, custo, capacidade); checklist reage a incompatibilidades |
| Selecionar uma oportunidade de lançamento | Implementado | Porkchop clicável/teclado, ajuste fino e tabela de comparação |
| Trajetória afeta desempenho e capacidade | Implementado | `state/mission.test.ts` (mudança de data reduz capacidade); C3 e DLA entram em `payloadCapacity` |
| Checklist reflete o estado real | Implementado | Itens derivados de `derivePlan`; testes de NO-GO |
| Lançamento com eventos coerentes | Implementado | `mission.test.ts` (ordem dos eventos, falhas específicas); cena dirigida pela mesma telemetria |
| Gerenciar a missão durante o voo | Implementado | TCMs, respostas a eventos solares, avanço de tempo; e2e |
| Operações em Marte consomem recursos previstos | Implementado | Energia, gravador, DSN e custo por turno; `mission.test.ts` |
| Relatório reflete o histórico efetivo | Implementado | `buildReport` usa diário e estados finais; teste de relatório de falha e de sucesso |

## Física e dados

| Critério | Situação | Evidência |
|---|---|---|
| Unidades documentadas e consistentes | Implementado | [FISICA.md](FISICA.md); testes de ida e volta e de 1/r² |
| Integração com o JPL Horizons com tratamento de falhas | **Parcial** | Código, proxy e 7 testes de falha com respostas simuladas; **nenhuma consulta real** (rede bloqueada no ambiente) |
| Solucionador de Lambert testado | Implementado | Exemplo de Curtis, propagação de volta, casos inválidos |
| Porkchop com resultados calculados | Implementado | 9.400 Lambert por grade; teste do mínimo da janela de 2026 |
| Capacidade depende da configuração e do destino | Implementado | `rocket.test.ts`, `state/mission.test.ts` |
| Referências dos lançadores documentadas | **Parcial** | Fonte e confiança por peça; valores não reconferidos nos documentos durante a entrega; desvio de +55% no Falcon 9 e −15% no Falcon Heavy; meta de ±8% das curvas da NASA não verificada |
| Dados reais diferenciados dos cenários didáticos | Implementado | Selos de proveniência; eventos rotulados "cenário de treinamento"; custos com asterisco "fictício" |
| Limitações científicas explicitadas | Implementado | [FISICA.md](FISICA.md#limitações-conhecidas), Painel de Física |

## Interface

| Critério | Situação | Evidência |
|---|---|---|
| Hangar 3D com interação funcional | Implementado | Clique seleciona a peça e abre o editor; órbita/zoom de câmera; reconstrução a cada mudança. Verificado em capturas do Chromium headless |
| Trajetória visualizada | Implementado | Cena do sistema solar no planejamento e no cruzeiro (rastro real e previsão) |
| Lançamento com sequência visual coerente | Implementado | Cena dirigida por `launchTelemetry` (mesmos tempos de MECO, separações, SECO) |
| Interface evita excesso de informação | Parcial | Painel de Física recolhível, modo Simples/Avançado; avaliação subjetiva, sem teste com usuários |
| Principais fluxos funcionam em desktop | Implementado | e2e em 1280 × 720; telas revisadas em 1400 × 900. Celular não testado |
| Estados de erro e carregamento compreensíveis | Implementado | Progresso do porkchop, mensagens de indisponibilidade da NASA, avisos de regra recusada, fallback sem WebGL |

## Qualidade

| Critério | Situação | Evidência |
|---|---|---|
| Testes existentes preservados ou substituídos com justificativa | Implementado | [TESTES.md](TESTES.md#testes-do-projeto-original) |
| Novos testes realmente executados | Implementado | 115 Vitest + 2 Playwright, executados nesta entrega |
| Sem erros críticos conhecidos no fluxo principal | Implementado | O e2e achou um travamento ao entrar no cruzeiro (distância zero no enlace); corrigido e coberto por teste de regressão |
| Instruções de instalação e execução | Implementado | [COMO_EXECUTAR.md](COMO_EXECUTAR.md) |
| Documentação corresponde à implementação | Implementado | Docs escritas a partir do código desta entrega |
| Limitações remanescentes registradas | Implementado | [RELATORIO_ENTREGA.md](RELATORIO_ENTREGA.md#8-pendências) |
