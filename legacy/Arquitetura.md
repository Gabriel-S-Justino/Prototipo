# ARQUITETURA — MISSION ARCHITECT (ESTILO KERBAL SPACE PROGRAM)

## 1. FLUXO
Entrada: `Contexto.md`. Saída: arquitetura e regras. Depois: `Desenvolvimento_guiado.md`.
Este arquivo é a **especificação**. Se o código divergir dele, corrija o código ou atualize este arquivo com justificativa.

## 2. REQUISITOS DERIVADOS
**Funcionais:**
- F1. Briefing da missão Vigia Vermelho com o mapa de Δv da viagem.
- F2. Hangar: montar foguete em até 3 estágios + sonda com peças em forma de carta; Δv, TWR, massa e custo de cada estágio ao vivo.
- F3. Lançamento até a órbita baixa (LEO), consumindo 9.400 m/s dos estágios na ordem.
- F4. Mapa orbital em `<canvas>`: Sol, órbitas e posições de Mercúrio, Vênus, Terra e Marte, a nave e sua trajetória; data atual; aceleração do tempo.
- F5. Planejador de partida: ângulo de fase atual vs. ideal, contagem até a janela, queima prograde com trajetória prevista redesenhada ao mover o controle.
- F6. Cruzeiro com aproximação máxima de Marte prevista e correções de meio de curso.
- F7. Encontro com Marte (entrada na zona de encontro) e queima de captura.
- F8. Operações científicas com energia (1/d² do Sol) e comunicação (1/d² da Terra, atraso d/c).
- F9. Relatório com resultado, score, linha do tempo e lições explicando a física.
- F10. Painel de Física sempre visível, mostrando os conceitos da fase atual com fórmula e números atuais.
**Técnicos:** HTML, CSS e JS nativo; módulos ES; física pura sem acesso ao DOM. Exceção aprovada para esta versão: Three.js via import map para renderização 3D, sem bundler e sem framework de UI.
**Critérios que afetam arquitetura:** demo estável → sem rede no MVP; animação fluida → propagação analítica (Kepler), não integração numérica.

## 3. STACK (OBRIGATÓRIA)
- **HTML5** (`index.html` único), **CSS3** (`css/style.css`, variáveis CSS, flex/grid), **JavaScript** ES2020+ com `<script type="module">`.
- Desenho do mapa de missão: **Canvas 2D**, preservado para trajetórias e previsões exatas do jogo. Visualização solar e hangar: **Three.js/WebGL** como camada visual adicional. Ícones e diagramas pequenos: **SVG inline**.
- Testes: `node --test` (nativo do Node 18+). `package.json` existe só com `"type": "module"` e o script `test`; **sem `dependencies` nem `devDependencies`**.
- Servir localmente com qualquer servidor estático (ex.: `python3 -m http.server`), porque módulos ES não carregam via `file://`.
- Deploy: GitHub Pages (arquivos estáticos).

**Proibido:** frameworks de UI, TypeScript, CSS frameworks, bundlers e transpiladores. Exceções aprovadas: Three.js via import map e texturas de planeta em CDN, usados exclusivamente na camada visual 3D.

## 4. YAGNI — COMO APLICAR AQUI
- Um arquivo por responsabilidade real; não crie pastas, classes base, "managers", eventos customizados ou injeção de dependência sem necessidade presente.
- Prefira funções puras e objetos literais. Classes só se simplificarem o código de verdade.
- Estado do jogo: **um** objeto `state` em `js/main.js`, alterado só pelas funções de `js/game/`.
- Nenhuma opção de configuração que o MVP não use. Nenhum código comentado "para depois".
- Toda feature nova passa pelo portão da seção 17.

## 5. CAMADAS
```text
index.html + css/style.css
 ↓
js/ui/*        (desenha e lê cliques; não calcula física)
 ↓
js/game/*      (regras da missão, fases, score, lições)
 ↓
js/physics/*   (funções puras: órbitas, Kepler, foguete)
 ↓
js/data/*      (constantes, planetas, peças, missão, conceitos)
```
`js/physics` e `js/game` **não** tocam no DOM e podem ser testados no Node.

## 6. ESTRUTURA DE ARQUIVOS
```text
index.html
css/style.css
js/main.js                 estado, loop de animação, troca de telas
js/data/constants.js       G0, AU, C, MU (Sol, Terra, Marte), raios, SOI, data inicial
js/data/planets.js         elementos orbitais (fonte NASA/JPL citada)
js/data/parts.js           catálogo de peças (balanceamento de jogo)
js/data/mission.js         missão Vigia Vermelho
js/data/concepts.js        conceitos de física do painel didático
js/physics/orbit.js        posição dos planetas, elementos ↔ estado, Kepler, trajetória
js/physics/rocket.js       Δv por estágio, TWR, consumo de propelente
js/game/mission.js         fases, lançamento, queimas, encontro, captura, operações
js/game/scoring.js         resultado, score, estrelas
js/game/lessons.js         lições em português
js/ui/hangar.js            tela de montagem
js/ui/map.js               canvas do mapa orbital
js/ui/panels.js            HUD, controles de manobra, painel de física
js/ui/report.js            relatório
tests/orbit.test.js
tests/rocket.test.js
tests/mission.test.js
package.json               {"type":"module","scripts":{"test":"node --test"}}
```

## 7. CONSTANTES E DADOS REAIS (`js/data/constants.js`, `js/data/planets.js`)
Unidades internas: **SI** (m, s, kg). Exibição: km, UA, dias, toneladas.

| Constante | Valor |
|---|---|
| g₀ | 9,80665 m/s² |
| UA | 1,495978707 × 10¹¹ m |
| c | 299.792.458 m/s |
| GM Sol | 1,32712440018 × 10²⁰ m³/s² |
| GM Terra | 3,986004418 × 10¹⁴ m³/s² |
| GM Marte | 4,282837 × 10¹³ m³/s² |
| Raio Terra / Marte | 6.371 km / 3.389,5 km |
| SOI Terra / Marte | 924.000 km / 577.000 km |
| LEO | 200 km de altitude |
| Órbita de captura em Marte | periapse 300 km × apoapse 33.000 km |
| Data inicial do jogo | 13/10/2026 |

Planetas (órbitas circulares, longitude média `L(t) = L₀ + L̇·T`, T em séculos desde J2000 = 01/01/2000 12:00 TT; fonte: JPL "Approximate Positions of the Planets", raio = semieixo maior):
| Planeta | a (UA) | L₀ (°) | L̇ (°/século) | Período (dias) |
|---|---|---|---|---|
| Mercúrio | 0,38710 | 252,25032 | 149472,67411 | 87,97 |
| Vênus | 0,72333 | 181,97910 | 58517,81539 | 224,70 |
| Terra | 1,00000 | 100,46457 | 35999,37245 | 365,26 |
| Marte | 1,52371 | 355,44657 | 19140,30268 | 686,98 |

Com esses dados, na data inicial o ângulo de fase Terra→Marte é ~60° e a janela ideal (~44°) chega em ~33 dias (meados de novembro de 2026), coerente com a janela real de 2026. Mostrar isso ao jogador.

## 8. PEÇAS (`js/data/parts.js`) — balanceamento de jogo
**Foguete**
| id | Nome | Tipo | Custo (US$ M) | Massa cheia (t) | Massa vazia (t) | Isp (s) | Empuxo (kN) |
|---|---|---|---|---|---|---|---|
| tank-s | Tanque pequeno | tanque | 8 | 6 | 0,5 | | |
| tank-m | Tanque médio | tanque | 20 | 24 | 2 | | |
| tank-l | Tanque grande | tanque | 50 | 96 | 8 | | |
| engine-vac | Motor de vácuo | motor | 40 | 0,5 | 0,5 | 450 | 60 |
| engine-upper | Motor de 2º estágio | motor | 60 | 2 | 2 | 350 | 1.000 |
| engine-main | Motor principal | motor | 45 | 6 | 6 | 300 | 2.000 |
| decoupler | Desacoplador | estrutura | 2 | 0,1 | 0,1 | | |

Regras: cada estágio tem ≥ 1 tanque e motores de **um único tipo**; estágios 1 e 2 têm desacoplador acima deles; o estágio mais alto (motor de vácuo recomendado) fica preso à sonda até a captura. Máximo 3 estágios, 4 tanques e 3 motores por estágio.

**Sonda** (massas em kg na tela, em t no cálculo)
| id | Nome | Cat. | Custo | Massa (kg) | Energia (W) | Outros |
|---|---|---|---|---|---|---|
| probe-core | Núcleo da sonda | obrigatório | 40 | 500 | −150 | computador + estrutura |
| solar-small | Painel solar pequeno | energia | 20 | 30 | +600 a 1 UA | máx. 2 |
| solar-large | Painel solar grande | energia | 50 | 90 | +2.000 a 1 UA | |
| rtg | RTG | energia | 120 | 45 | +110 constante | |
| battery | Bateria | energia | 10 | 25 | cobre 300 W de déficit | máx. 2 |
| antenna-low | Antena de baixo ganho | comunicação | 10 | 5 | −20 | 8 Gbit/turno a 1 UA da Terra |
| antenna-high | Antena de alto ganho | comunicação | 60 | 40 | −100 | 80 Gbit/turno a 1 UA |
| laser | Comunicação a laser | comunicação | 140 | 25 | −150 | 160 Gbit/turno a 1 UA; −1 em todos os testes |
| camera | Câmera de alta resolução | instrumento | 60 | 40 | −80 | ciência 4, dados 4 Gbit |
| spectrometer | Espectrômetro | instrumento | 70 | 30 | −60 | ciência 5, dados 3 |
| radar | Radar de sondagem | instrumento | 90 | 50 | −200 | ciência 7, dados 5 |
| magnetometer | Magnetômetro | instrumento | 20 | 5 | −10 | ciência 2, dados 0,5 |
| shield-radiation | Blindagem de radiação | proteção | 30 | 30 | 0 | +4 em radiação (P2) |
| shield-mm | Escudo de micrometeoroides | proteção | 20 | 25 | 0 | +4 em micrometeoroides (P2) |

Cada carta tem uma frase `flavor` educativa (ex.: RTG: "O Curiosity usa um RTG porque não depende do Sol.").

## 9. MISSÃO (`js/data/mission.js`)
| Campo | Valor |
|---|---|
| id / nome | red-watch / Vigia Vermelho |
| orçamento | 1.000 (US$ M) |
| Δv até LEO | 9.400 m/s (fixo, inclui perdas) |
| TWR mínimo na decolagem | 1,2 |
| operações | 6 turnos de 30 dias |
| meta de ciência | 100 |
| zona de encontro | 2 × SOI de Marte (simplificação de jogabilidade, declarada) |
| multiplicador de dificuldade | 1,5 |

**Mapa de Δv** (mostrar no briefing; valores calculados com as constantes da seção 7):
Superfície → LEO **9.400** · LEO → transferência para Marte **3.613** · captura elíptica em Marte **907** (órbita circular baixa custaria **2.091**) · **total ≈ 13.920 m/s**.

**Foguete de referência** (usado nos testes de balanceamento):
- Sonda: probe-core, solar-large, battery, antenna-high, camera, spectrometer, radar, magnetometer, shield-radiation, shield-mm (835 kg).
- Estágio 3: 2× tank-s + engine-vac → ≈ 7.689 m/s, TWR 0,46.
- Estágio 2: 3× tank-m + engine-upper + decoupler → ≈ 4.825 m/s.
- Estágio 1: 3× tank-l + 3× engine-main + decoupler → ≈ 3.269 m/s, TWR 1,55.
- Total ≈ 15.784 m/s (margem ≈ 1.860 m/s), custo 915.
- Com só 2 motores principais o TWR cai para 1,05: não decola (lição de TWR).

## 10. FÍSICA (`js/physics/`) — funções puras
**orbit.js**
```js
planetAngle(planet, tSeconds)          // L(t) em rad, a partir de J2000
planetState(planet, t)                 // { r:[x,y], v:[vx,vy] } órbita circular, v = √(GM/r)
circularSpeed(mu, r)                   // √(mu/r)
visViva(mu, r, a)                      // √(mu·(2/r − 1/a))
period(mu, a)                          // 2π·√(a³/mu)
stateToElements(r, v, mu, t)           // { a, e, omega, M0, t0, n } (2D)
positionAt(el, t)                      // resolve Kepler M = E − e·sinE (Newton, 10 iterações)
velocityAt(el, t)
trajectoryPoints(el, n)                // pontos da elipse para desenhar
closestApproach(el, planet, t0, t1)    // amostragem: { t, dist }
phaseAngle(t)                          // ângulo Marte − Terra, em graus [0, 360)
idealPhaseAngle()                      // 180 − 360·(t_Hohmann / T_Marte) ≈ 44,3°
hohmann(mu, r1, r2)                    // { dv1, dv2, tTransfer }
escapeBurn(muP, rPark, vInf)           // √(v∞² + 2mu/r) − √(mu/r)
captureBurn(muP, rp, ra, vInf)         // √(v∞² + 2mu/rp) − visViva(mu, rp, (rp+ra)/2)
```
**rocket.js**
```js
stageStats(stages, payloadT)           // por estágio: m0, mf, Δv, TWR (de baixo para cima)
totalDeltaV(stages, payloadT)
burn(rocketState, dv)                  // consome propelente estágio a estágio: mf = m0 / e^(Δv/(Isp·g0)); desacopla estágio vazio; retorna { state, done, missing }
```
**Partida da Terra:** no instante da queima, v∞ = √((v_LEO + Δv)² − 2·GM_T/r_LEO) se positivo; senão a nave continua presa à Terra (mostrar "ainda não escapou"). A velocidade heliocêntrica é `v_Terra + v∞` na direção do movimento da Terra (prograde). Posição inicial = posição da Terra.
**Correção de meio de curso:** Δv prograde e radial aplicados à velocidade heliocêntrica atual; recalcula elementos.
**Encontro:** a cada passo do tempo, se `|r_nave − r_Marte| < zona de encontro`, para o time warp, calcula `v∞ = |v_nave − v_Marte|` e o Δv de captura. Sem Δv suficiente → sobrevoo (falha).
**Operações:** energia = painéis × (1/1,52²) + RTG; taxa de dados = base / d_TM², com d_TM = distância Terra–Marte em UA naquele turno; atraso = d_TM / c. Regras de déficit de energia, buffer (40 Gbit), entrega proporcional de ciência e desligamento de instrumentos são as mesmas do engine anterior (ver histórico do git, `game/turn.ts`).

## 11. ESTADO E FASES (`js/game/mission.js`)
```js
state = {
  phase: 'briefing' | 'hangar' | 'leo' | 'cruise' | 'encounter' | 'mars-orbit' | 'operations' | 'report',
  t,                 // segundos desde J2000
  warp,              // dias por segundo real: 0, 1, 10, 50
  design: { stages: [[partId...], ...], probe: [partId...], crew: [] },
  rocket,            // propelente restante por estágio
  ship: { elements, frame: 'earth' | 'sun' | 'mars' },
  ops: { turn, buffer, scienceDelivered, ... },
  log: [], timeline: [], result
}
```
Funções: `validateDesign`, `launch`, `planDeparture(dv)` (só prevê), `executeBurn(dv, radial)`, `advance(state, dtSeconds)`, `capture()`, `runOperationsTurn()`, `finish()`. Todas retornam um novo `state` ou alteram só o objeto recebido, sem DOM.

## 12. TELAS (`js/ui/`)
- **Briefing:** carta da missão, mapa de Δv em barras SVG, botão "Ir ao hangar".
- **Hangar:** coluna de peças (cartas por categoria), pilha do foguete desenhada em SVG (estágio 3 no topo), tabela por estágio (massa, Δv, TWR), Δv total vs. mapa de Δv, custo vs. orçamento, checklist de lançamento.
- **Mapa orbital (canvas):** fundo escuro; Sol no centro; órbitas como círculos finos; planetas com tamanho exagerado e rótulo "fora de escala"; nave como triângulo; trajetória atual sólida, trajetória planejada tracejada; marcadores **Periélio/Afélio**; "fantasma" de Marte na hora da aproximação máxima; linha do ângulo de fase Terra–Sol–Marte com o valor em graus. Zoom para "Vista Terra" (LEO em escala) e "Vista Marte" (órbita de captura em escala).
- **Controles:** data, botões de time warp (⏸ 1× 10× 50× dias/s), parada automática na janela, no encontro e no fim do cruzeiro; controle deslizante de Δv prograde (0–4.500 m/s) e radial (−300 a +300 m/s), Δv restante da nave.
- **Painel de Física:** cartões de conceito da fase atual (seção 13).
- **Relatório:** resultado, estrelas, score, tabela por turno, lições.

## 13. PAINEL DE FÍSICA (`js/data/concepts.js` + `js/ui/panels.js`)
Cada conceito é um objeto:
```js
{ id: 'vis-viva', title: 'Equação vis-viva', formula: 'v² = GM·(2/r − 1/a)',
  plain: 'Quanto mais perto do Sol, mais rápido você anda na mesma órbita.',
  analogy: 'Como um skate numa rampa: desce ganhando velocidade, sobe perdendo.',
  phases: ['cruise'], live: (state) => 'r = 1,21 UA, a = 1,26 UA → v = 27,3 km/s' }
```
Conceitos por fase:
| Fase | Conceitos |
|---|---|
| Briefing | Gravitação, Mapa de Δv |
| Hangar | Equação do foguete, TWR, Estágios |
| LEO | Velocidade orbital circular, 3ª Lei de Kepler |
| Planejamento | Transferência de Hohmann, Ângulo de fase e janela, Velocidade de escape |
| Cruzeiro | Vis-viva, Periélio e afélio, Correção de meio de curso |
| Encontro/captura | Esfera de influência, Excesso hiperbólico, Queima de captura |
| Operações | Inverso do quadrado (energia e dados), Atraso do sinal |

Texto em português simples (nível ensino médio), uma ideia por cartão, sempre com os números atuais. Uma seção fixa "Como o jogo simplifica" lista as simplificações do Contexto.md.

## 14. RESULTADO E SCORE (`js/game/scoring.js`)
- success: capturado e ciência ≥ meta; partial: ciência > 0 ou capturado; failure: não decolou, não escapou, sobrevoo ou nave perdida.
- `score = round(ciência × (1 + sobraOrçamento/orçamento × 0,5) × 1,5 + Δv_sobrando/100 − 5 × turnosEmModoSeguro)`, mínimo 0.
- Estrelas: 0 failure, 1 partial, 2 success, 3 success com sobra de orçamento ≥ 20%.

## 15. LIÇÕES (`js/game/lessons.js`)
Frases geradas pelo que aconteceu, sempre ligando à física. Exemplos: TWR < 1,2 ("o empuxo não vence o peso"); partida longe da janela ("Marte não estava lá quando você chegou: o ângulo de fase era X°, o ideal é 44°"); faltou Δv na captura ("chegou rápido demais: v∞ = X km/s"); dados presos ("a Terra estava a X UA e o sinal enfraquece com o quadrado da distância"); painel solar a 1,52 UA rende 43%.

## 16. TESTES (`node --test`)
- orbit: `circularSpeed` em LEO ≈ 7.788 m/s; período da Terra ≈ 365,25 dias; `hohmann` Terra→Marte: tempo ≈ 259 dias; `escapeBurn` da LEO ≈ 3.613 m/s; `captureBurn` elíptica ≈ 907 m/s; ângulo de fase ideal ≈ 44,3°; `stateToElements`/`positionAt` ida e volta (erro < 1 km); Kepler converge para e = 0,9.
- rocket: Δv por estágio do foguete de referência (seção 9) com tolerância de 1 m/s; TWR; `burn` atravessa estágios e falha quando falta propelente.
- mission: validação (orçamento, TWR, estágio sem motor, motores misturados); partida na janela ideal com o Δv de Hohmann encontra Marte; partida 60 dias fora da janela não encontra; captura sem Δv vira sobrevoo; operações determinísticas.
- Balanceamento: o foguete de referência completa a missão com a partida na janela ideal.

## 17. YAGNI GATE
Antes de adicionar qualquer coisa: é requisito do MVP? o jogo quebra sem isso? existe solução menor? pode esperar? aumenta risco? Sem justificativa: **não implementar**.

## 18. SEGURANÇA E PERFORMANCE
Sem `innerHTML` com dados externos (usar `textContent`). Sem segredos. Loop com `requestAnimationFrame`; recalcular a trajetória prevista só quando o controle de Δv muda; desenhar a elipse com ~200 pontos.

## 19. PLANO
**P0:** dados + física + testes
**P1:** hangar + mapa + manobras + captura + operações + relatório + painel de física
**P2:** eventos em cartas no cruzeiro, equipe (3 de 6), JPL Horizons com fallback, "Na vida real"
**P3:** Lua e Vênus, carreira em `localStorage`, sons, polimento

**Próximo: `Desenvolvimento_guiado.md`.**


## 18. VISUALIZAÇÃO 3D (EXCEÇÃO APROVADA)
- `js/ui/solar3d.js` renderiza corpos celestes texturizados; `js/ui/hangar3d.js` gera um foguete a partir da configuração existente.
- A cena 3D não contém lógica de missão nem altera cálculos. O mapa 2D continua disponível para trajetórias e manobras.
- As texturas vêm de CDN externo e são apenas assets de apresentação; dimensões, distâncias e materiais visuais não são dados de engenharia.
- O hangar usa geometria procedural para evitar uma pipeline de modelos 3D e manter o escopo YAGNI.
