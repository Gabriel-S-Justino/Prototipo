# Física e modelos

Este documento descreve o que o código calcula de fato. As limitações estão no fim e também aparecem no Painel de Física (`src/data/concepts.ts`, `MODEL_LIMITATIONS`).

## Unidades

| Grandeza | Unidade interna | Onde |
|---|---|---|
| Órbitas heliocêntricas e planetocêntricas | km, km/s, s | `simulation/orbital`, `mission/cruise.ts`, `capture.ts` |
| Foguete (massas, empuxo, Isp) | kg, kN, s; Δv em m/s | `simulation/rocket` |
| C3 | km²/s² | toda a cadeia de trajetória |
| Tempo | Data Juliana (JD, escala TDB tratada como UTC; diferença < 70 s, desprezível aqui) | `domain/units.ts` |
| Ângulos | radianos internamente, graus na interface | |
| Referencial | heliocêntrico, eclíptica e equinócio J2000 | efemérides e Lambert |

Constantes (`domain/units.ts`): μ☉ = 1,32712440018 × 10¹¹ km³/s², μ⊕ = 398.600,4418 km³/s², μ♂ = 42.828,37 km³/s², raio equatorial da Terra 6.378,137 km, de Marte 3.396,2 km, 1 UA = 149.597.870,7 km, g₀ = 9,80665 m/s².

A referência didática de Hohmann (`orbital/hohmann.ts`) mantém o SI (m, s) do código original.

## Posições planetárias

- **Offline (padrão):** elementos keplerianos aproximados de Standish (JPL, válidos de 1800 a 2050), com taxas seculares. Fora desse intervalo, `EphemerisRangeError` e a trajetória vira NO-GO.
- **Horizons (opcional):** tabelas de vetores diários de Terra e Marte (centro 500@10, eclíptica J2000/ICRF, km e km/s), interpoladas por Hermite cúbico usando posição e velocidade. Fora do intervalo baixado, erro explícito. Ver [DADOS_NASA.md](DADOS_NASA.md).

O jogo indica sempre qual fonte está em uso.

## Lambert e transferência

`orbital/lambert.ts` resolve o problema de Lambert de revolução única por variáveis universais (Curtis, algoritmo 5.2), com busca de z por **bisseção** (o tempo de voo cresce monotonicamente com z) no intervalo (−∞, 4π²). Casos recusados com motivo: tempo de voo não positivo, geometria colinear (0° ou 180°, plano indefinido), ausência de solução de revolução única.

`orbital/transfer.ts`:

- v∞ de partida = v₁(Lambert) − v⊕; **C3 = |v∞|²**;
- v∞ de chegada = v₂ − v♂;
- **DLA**: declinação de v∞ de partida, depois de girar da eclíptica para o equador J2000 (obliquidade 23,439281°).

## Porkchop

Grade de datas de partida × tempos de voo (padrão 94 × 100 = 9.400 trajetórias, 140 a 440 dias). Cada célula é um Lambert completo. Células sem solução ficam hachuradas. O cálculo roda num Web Worker, com cache por parâmetros e fonte de efemérides. O ★ marca o mínimo **dentro da grade calculada**, e a interface avisa que fora dela pode haver soluções melhores.

## Do C3 à carga útil

Queima de injeção a partir de órbita circular de 200 km:

Δv = √(C3 + 2μ⊕/r) − √(μ⊕/r)

Inclinação da órbita de estacionamento: max(28,5°, |DLA|), limitada a 57°. Ganho da rotação da Terra: 465,1 · cos(i) m/s. O modelo de fases de queima está em [FOGUETES.md](FOGUETES.md). A capacidade é a maior carga cujo Δv disponível após a órbita de estacionamento atinge a C3 pedida (bisseção).

## Sonda

Tsiolkovsky com o Isp do sistema de propulsão escolhido. Δv exigido = captura planejada + reserva de 40 m/s para correções. Energia: painéis com irradiância 1361 W/m² · (1 UA/r)² e eficiência 18%, ou RTG de saída constante.

## Cruzeiro

- **Propagação:** Kepler universal heliocêntrico (cônicas remendadas; Marte não perturba antes da esfera de influência de 577.000 km).
- **Injeção:** a velocidade inicial combina a solução de Lambert com um viés de proteção planetária de 250.000 km no ponto de mira, como em missões reais, mais o erro de injeção gaussiano do lançamento (1σ de 2 m/s por eixo; 4 m/s se forçado; 5 m/s se a sonda completou a injeção). **Sem correções, a sonda não é capturada** (isso é testado).
- **TCMs:** quatro oportunidades (10 dias após a partida, 25% do voo, chegada − 45 d, chegada − 8 d). O Δv é calculado por Lambert do estado atual até o ponto de mira no plano B (B que produz o periapse da órbita escolhida). A execução tem erro de 1% em módulo e 0,3° em direção (o dobro depois de um reinício do computador). A interface mostra o custo de corrigir agora e na próxima oportunidade, ambos calculados.
- **Chegada:** busca da máxima aproximação; periapse rp = k(√(1 + (B/k)²) − 1), com k = μ♂/v∞². Abaixo de 80 km de altitude, a sonda entra na atmosfera.
- **Captura (MOI):** Δv = √(v∞² + 2μ♂/rp) − √(μ♂(2/rp − 2/(rp + ra))), com o periapse efetivamente alcançado. Se faltar propelente, a sonda passa direto.

## Comunicação

Equação de Friis na banda X (8,42 GHz): ganho de refletor η(πD/λ)², DSN de 34 m (η = 0,6), temperatura de sistema 30 K, perdas diversas de 2 dB, Eb/N0 exigido de 2,5 dB mais 3 dB de margem, taxa máxima de 6 Mbit/s. Atraso = distância / c. **Conjunção solar:** com ângulo Sol–Terra–sonda abaixo de 2° não há enlace; entre 2° e 5° a taxa cai. Antena de alto ganho danificada no lançamento → só a de baixo ganho.

## Eventos solares (cenários de treinamento)

Ejeções de massa coronal são sorteadas por processo de Poisson (taxa padrão de 1 a cada 40 dias, ou calibrada pela DONKI) com velocidade e largura angular. A exposição é **geométrica**: a CME é um cone radial a partir do Sol; calcula-se quando ela chega à distância da sonda e se a longitude da sonda está dentro do cone. O jogador escolhe manter operações, entrar em modo de proteção (2 dias sem manobras) ou replanejar (2 kg de propelente). A probabilidade de dano depende da velocidade, da blindagem e da resposta. **Nenhum evento é apresentado como real.**

## Operações em Marte

8 turnos de 30 sóis. A cada turno: geração de energia na distância real de Marte ao Sol, fração iluminada da órbita (93% na elíptica, 62% na circular), consumo do barramento, do transmissor (horas de DSN) e dos instrumentos em ordem de prioridade (os de menor prioridade são desligados primeiro); modo seguro se nem o barramento fecha. Dados entram no gravador e descem pelo enlace calculado dia a dia (distância e conjunção reais); excesso é descartado. Ciência = Gbit entregues × fator do instrumento × qualidade (órbita, dano por radiação, tempestade de poeira de treinamento).

## Limitações conhecidas

- Elementos de Standish são aproximados (erro de posição de Marte da ordem de centenas a milhares de km no intervalo); não substituem uma efeméride de precisão.
- Cônicas remendadas: sem perturbações de n-corpos, pressão de radiação solar ou arrasto.
- Lambert só de revolução única.
- O modelo do lançador é de fases médias, sem integração de trajetória de subida; ver desvios em [FOGUETES.md](FOGUETES.md).
- Captura é impulsiva (sem perdas por gravidade da queima longa).
- O enlace usa um único conjunto de parâmetros de DSN e não modela meteorologia.
- Os números de ciência, custo e regras de turno são do jogo.
