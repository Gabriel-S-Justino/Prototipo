# PROJECT-STATE

## Fase atual
P1 completo: o jogo roda do briefing ao relatório em HTML, CSS e JS puro. Próximo: P2.

## Concluído
- P0: dados (`js/data`), física (`js/physics`), regras (`js/game`) e 25 testes `node --test`.
- P1: briefing com mapa de Δv, hangar com estágios, mapa orbital em canvas (órbitas, trajetória atual e prevista, periélio/afélio, ângulo de fase, fantasma de Marte, vistas Terra/Marte), time warp com parada na janela e no encontro, queima de partida e correções com prévia ao vivo, captura, 6 turnos de operações, relatório com lições e Painel de Física por fase.
- Versão Next.js removida (referência no histórico: commit `bdf802e`).

## Verificado no navegador
Missão de referência: janela em 16/11/2026, partida de 3.610 m/s, encontro em 31/07/2027, captura de 893 m/s, 108 de ciência, missão cumprida com 2 estrelas. Roteiro de falha: TWR 1,05 não decola; partida fora da janela erra Marte por ~50 milhões de km e a nave se perde. Sem erros no console; sem rolagem horizontal a 390 px.

## Próximo passo
P2 do `Desenvolvimento_guiado.md`: eventos em cartas no cruzeiro, equipe, JPL Horizons com fallback, caixas "Na vida real", conjunção solar.

## Decisões
- Data inicial do jogo: 13/10/2026; a janela Terra→Marte do modelo cai em ~16/11/2026.
- Subida até LEO custa 9.400 m/s fixos; partida 3.613 m/s; captura elíptica 907 m/s.
- Zona de encontro = 2 × SOI de Marte (jogabilidade).
- Antena de alto ganho: 80 Gbit/turno a 1 UA (60 não chegava a 100 de ciência com Marte se afastando até 2,5 UA).
- Lançamento sem animação: o diário de bordo mostra a separação dos estágios (YAGNI).

## Pendências
- `Contexto.md`: título oficial, critérios de avaliação e link do desafio.
- Deploy no GitHub Pages.

## Fora do MVP
Backend, banco, login, multiplayer, IA, física 3D, n-corpos, pouso pilotado. A camada visual 3D foi adicionada separadamente e não altera a simulação.


## Atualização — camada 3D
- Mantido o fluxo original do jogo e seus módulos de física/game.
- Adicionada visualização solar 3D com texturas planetárias e posições para os planetas já modelados pelo jogo.
- Adicionado hangar 3D procedural construído com base nos IDs da configuração atual do foguete e da sonda.
- Mantido o mapa orbital 2D como alternativa para trajetórias e previsões.
- Deploy estático Vercel; Three.js/texturas carregados externamente, sem bundler.
- Limitação: não foi possível validar visualmente em navegador real neste ambiente; executar testes e conferir WebGL/CDN antes da apresentação.
