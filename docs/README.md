# Documentação do Mission Architect

O Mission Architect é um simulador didático de engenharia de missão a Marte. O jogador monta o lançador e a sonda, escolhe a janela de lançamento num gráfico de oportunidades (porkchop) calculado por Lambert, passa pelo checklist, acompanha o lançamento, gerencia o cruzeiro (correções de trajetória, eventos solares, comunicação), faz a inserção orbital e opera a sonda em Marte por 8 turnos. Ao final, um relatório mostra o que aconteceu de fato.

Todas as telas leem o mesmo estado (`src/state/mission.ts`) e o mesmo plano derivado (`derivePlan`): o que o checklist, o hangar, o Painel de Física e as cenas 3D mostram sai do mesmo cálculo.

| Documento | Conteúdo |
|---|---|
| [COMO_EXECUTAR.md](COMO_EXECUTAR.md) | Instalação, execução local, build e deploy |
| [ARQUITETURA.md](ARQUITETURA.md) | Módulos, fluxo de dados e decisões |
| [FISICA.md](FISICA.md) | Modelos, equações, unidades e hipóteses |
| [FOGUETES.md](FOGUETES.md) | Catálogo de lançadores, modelo de desempenho e calibração |
| [DADOS_NASA.md](DADOS_NASA.md) | Horizons, DONKI, proveniência e limitações |
| [TESTES.md](TESTES.md) | Como rodar os testes e o que eles cobrem |
| [CRITERIOS_ACEITACAO.md](CRITERIOS_ACEITACAO.md) | Situação de cada critério de aceitação da especificação |
| [RELATORIO_ENTREGA.md](RELATORIO_ENTREGA.md) | Relatório final da entrega (os 9 itens pedidos) |
| [adr/0001-react-typescript-vite.md](adr/0001-react-typescript-vite.md) | Decisão de migrar para React + TypeScript + Vite |

Os documentos do projeto original foram preservados em [`legacy/`](../legacy).

## Convenções de dados

Todo número que vem de fora do código carrega uma marca de proveniência (`src/data/provenance.ts`):

- **publicado**: valor de documento oficial (fabricante, NASA, guia do usuário do lançador);
- **derivado**: calculado a partir de valores publicados;
- **estimado**: fonte secundária ou estimativa pública, sem confirmação oficial;
- **didático**: escolhido para o jogo (custos, regras de turno, eventos de treinamento).

Custos e orçamento são **fictícios**. Eventos solares do cruzeiro e a tempestade de poeira são **cenários de treinamento**, sempre rotulados assim na interface.
