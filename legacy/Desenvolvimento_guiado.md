# DESENVOLVIMENTO GUIADO — MISSION ARCHITECT (ESTILO KERBAL SPACE PROGRAM)

## 1. ENTRADA
Antes de implementar, leia: `Contexto.md → Arquitetura.md`.
`Arquitetura.md` é a especificação das regras, das peças e da física. Não invente regras fora dela.

## 2. REGRAS PRINCIPAIS
1. **Só HTML, CSS e JavaScript puro.** Nenhum framework, biblioteca, TypeScript, bundler ou dependência do npm. Se pensar em instalar algo, a resposta é não.
2. **YAGNI sempre.** Implemente apenas o que o passo atual pede. Nada de abstrações, opções ou arquivos "para o futuro". Na dúvida, escreva menos código.
3. **Física didática.** Toda fórmula usada na simulação também aparece no Painel de Física com os números atuais.
4. **Autonomia de implementação ≠ autonomia de escopo.** Pode criar, refatorar, testar e corrigir. Não pode aumentar escopo nem trocar a stack.

## 3. PRIMEIRO PASSO
O repositório tem uma versão anterior em Next.js/TypeScript. Ela **sai**:
```bash
git rm -r --ignore-unmatch app components hooks game types tests data public eslint.config.mjs next.config.ts next-env.d.ts tsconfig.json vitest.config.ts package-lock.json AGENTS.md
rm -rf node_modules .next tsconfig.tsbuildinfo
```
Mantenha os `.md` do projeto. As regras de operação (energia, buffer de dados, entrega de ciência, score) da versão anterior podem ser consultadas no histórico do git (`git show bdf802e:game/turn.ts`) e portadas para JS quando chegar a hora; não porte nada que esta arquitetura não peça.

Crie `package.json`:
```json
{ "name": "mission-architect", "private": true, "type": "module", "scripts": { "test": "node --test" } }
```
Rodar localmente: `python3 -m http.server 8000` e abrir `http://localhost:8000`.

## 4. ORDEM
Cada passo termina com `npm test` passando e o jogo abrindo sem erros no console.

### P0 — física e dados (sem tela)
1. `js/data/constants.js` e `js/data/planets.js` com os valores da seção 7 e a fonte citada em comentário.
2. `js/physics/orbit.js`: funções da seção 10, uma por vez, cada uma com teste.
3. `js/physics/rocket.js`: `stageStats`, `totalDeltaV`, `burn`.
4. `js/data/parts.js` e `js/data/mission.js` (seções 8 e 9).
5. `js/game/mission.js`: `validateDesign`, `launch`, `executeBurn`, `advance`, `capture`, `runOperationsTurn`, `finish`.
6. `js/game/scoring.js` e `js/game/lessons.js`.
7. Testes da seção 16.

**Pronto quando:** o foguete de referência dá ≈ 15.784 m/s; a partida na janela ideal com 3.613 m/s encontra Marte; a captura com 907 m/s funciona; partir 60 dias fora da janela erra Marte.

### P1 — jogo jogável
1. `index.html` com as áreas: cabeçalho (fase e data), área principal, Painel de Física à direita (embaixo no celular).
2. `css/style.css`: tema espacial escuro, variáveis de cor, layout em grid, legível a partir de 360 px de largura.
3. Briefing com o mapa de Δv em SVG.
4. Hangar: cartas de peças, pilha do foguete em SVG, tabela por estágio, checklist, botão "Lançar".
5. Lançamento: animação simples (barra de Δv consumida estágio por estágio, desacoplamentos no log) até LEO.
6. Mapa orbital (`js/ui/map.js`): Sol, órbitas, planetas em movimento, nave, trajetória atual e prevista, periélio/afélio, ângulo de fase, fantasma de Marte, zoom Terra/Marte.
7. Time warp com parada automática na janela, no encontro e no fim do cruzeiro.
8. Manobras: controles de Δv prograde/radial com prévia ao vivo e botão "Executar queima".
9. Encontro e captura com o Δv necessário calculado e explicado.
10. Operações: 6 turnos com energia, dados, atraso de sinal e ciência; distância Terra–Marte real a cada turno.
11. Relatório com lições.
12. Painel de Física com os conceitos da tabela da seção 13 aparecendo conforme a fase.

**Pronto quando:** um estudante que nunca viu o jogo monta o foguete, chega a Marte e entende, pelo Painel de Física, por que precisou esperar a janela.

### P2 — profundidade
Eventos em cartas no cruzeiro (tempestade solar, micrometeoroide, anomalia no computador) com testes d20; equipe 3 de 6; JPL Horizons com fallback; caixas "Na vida real"; conjunção solar bloqueando a comunicação.

### P3 — polimento
Lua e Vênus como destinos, carreira com reputação em `localStorage`, sons, acessibilidade por teclado.

Não iniciar P2 antes de P1 completo, nem P3 antes de P2.

## 5. CICLO
`inspecionar → planejar → implementar → testar → abrir no navegador → revisar → corrigir`
Commits pequenos, um por passo numerado.

## 6. FONTE ÚNICA DA VERDADE
A física vive só em `js/physics/`; as regras só em `js/game/`. A UI nunca recalcula Δv, órbita ou score: ela chama essas funções e mostra o resultado.

## 7. SIMULAÇÃO
- Posições vêm de fórmulas analíticas (Kepler), nunca de integração passo a passo: assim o time warp não acumula erro.
- Determinismo: sem `Math.random()` em `js/physics` e `js/game`. Eventos de P2 usam um gerador com semente (mulberry32).
- Unidades SI dentro do código; conversão só na hora de mostrar.

## 8. DIDÁTICA (checklist para cada conceito)
- Nome do conceito e fórmula.
- Uma frase em português simples, sem jargão sem explicação.
- Os números atuais aplicados na fórmula.
- Uma consequência visível no jogo ("é por isso que a linha tracejada agora chega a Marte").
- Termos do KSP explicados no primeiro uso: prograde, retrograde, periélio/afélio (periapse/apoapse), Δv, TWR, SOI.

## 9. DADOS OFICIAIS
Antes de usar qualquer número: classifique como constante física, dado NASA/JPL ou balanceamento de jogo, e registre a origem em comentário. Informação ausente vira pendência em `PROJECT-STATE.md`.

## 10. TESTES
`node --test`, sem bibliotecas. Obrigatórios os da seção 16 da arquitetura. Funções de UI não precisam de teste automatizado; abra o jogo e jogue uma missão completa a cada passo de P1.

## 11. SEGURANÇA
Use `textContent`, não `innerHTML`, para qualquer texto vindo de dados ou API. Sem segredos no repositório.

## 12. DEPENDÊNCIAS
Nenhuma. Se uma tarefa parece exigir biblioteca, escreva a versão mínima em JS puro ou corte a tarefa.

## 13. ESTADO
Atualize `PROJECT-STATE.md` a cada passo: fase, concluído, em andamento, próximo passo, decisões, ajustes de balanceamento, bugs, fora do MVP.

## 14. DEFINITION OF DONE
Funciona no navegador sem erros no console, `npm test` passa, segue a arquitetura, sem dependência nova, sem código não usado, textos em português e física explicada no painel.

## 15. REVISÃO FINAL
Roteiro de demo de 3 minutos: montar um foguete com TWR baixo → não decola → corrigir → partir antes da janela → ver a trajetória errar Marte → esperar a janela → acertar → capturar → ciência → relatório. Deploy no GitHub Pages.

## 16. PRIORIDADE
`funcionar > estabilidade > clareza didática > UX > dados > polimento > extras`
Quando o MVP estiver completo, não adicione complexidade sem retorno.
