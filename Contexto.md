# CONTEXTO — MISSION ARCHITECT (ESTILO KERBAL SPACE PROGRAM)

## 1. FLUXO
`Contexto.md → Arquitetura.md → Desenvolvimento_guiado.md`
Leia os três antes de implementar. Este arquivo diz **o quê** e **por quê**; o próximo diz **como**.

## 2. REGRAS INEGOCIÁVEIS
1. **Somente HTML, CSS e JavaScript puro** (ES2020+, módulos nativos do navegador).
   - Proibido: React, Vue, Svelte, Next.js, TypeScript, Tailwind, jQuery, bibliotecas de física, bundlers (Vite, Webpack), transpiladores e frameworks de CSS. Exceção aprovada nesta versão: Three.js via import map, restrito às cenas visuais; não participa da física nem das regras da missão.
   - Permitido: `<canvas>` 2D, SVG inline, Three.js/WebGL apenas na camada visual 3D, `fetch`, `localStorage`, `requestAnimationFrame`, e o executor de testes **nativo** do Node (`node --test`), que não é dependência.
2. **YAGNI (You Aren't Gonna Need It) é obrigatório.** Só implemente o que o MVP exige agora. Antes de cada arquivo, função, opção ou abstração, responda: "o MVP quebra sem isso?". Se não quebra, não faça. Nada de código "para o futuro", camadas genéricas, configurações que ninguém pediu ou otimizações antecipadas.
3. **A física precisa ser didática.** Todo conceito físico usado na simulação aparece na tela com: nome, fórmula, explicação em linguagem simples e os números da situação atual aplicados na fórmula.
4. **As órbitas precisam aparecer.** O jogo mostra as órbitas dos planetas e a órbita/trajetória da nave, inclusive a trajetória prevista antes de uma manobra.

## 3. DESAFIO NASA
**Nome:** [pendente — copiar o título oficial do desafio no site do Space Apps 2026]
**Challenge Statement (texto oficial):**
> Designing a space mission requires careful consideration of competing demands, including mission objectives, spacecraft design, scientific instruments, launch vehicles, budgets, power, mass, communications, and orbital constraints. For students who rarely get to experiment with an entire mission from concept to operation, these trade-offs often remain abstract. Your challenge is to create an interactive game that allows participants to design, manage, and simulate a complete space mission while making engineering decisions, managing limited resources, and evaluating how each choice shapes the success of their mission.

**Objetivo oficial:** jogo interativo em que o participante projeta, gerencia e simula uma missão espacial completa, tomando decisões de engenharia, gerenciando recursos limitados e avaliando como cada escolha afeta o sucesso.
**Problema:** estudantes raramente experimentam uma missão inteira, do conceito à operação; os trade-offs ficam abstratos.
**Público-alvo:** estudantes do ensino médio e da graduação, sem formação em engenharia espacial.
**Requisitos obrigatórios (derivados do statement):** projetar a missão (objetivo, nave, instrumentos, lançador); gerenciar recursos limitados (orçamento, energia, massa, comunicação, restrições orbitais); simular do lançamento à operação; mostrar como cada escolha afeta o resultado.
**Restrições:** prazo do hackathon (~48 h); roda no navegador sem instalação.
**Critérios de avaliação:** [pendente — copiar do site oficial]
**Prazo/evento:** NASA Space Apps Challenge 2026.
**Fonte oficial:** [pendente — link da página do desafio]

## 4. REFERÊNCIA: KERBAL SPACE PROGRAM
O jogo se inspira no KSP, sem copiar nomes, arte ou marca. O que pegamos dele:
- **Hangar de montagem (VAB):** o foguete é montado empilhando peças em **estágios**; o jogo mostra Δv e TWR de cada estágio enquanto você monta.
- **Mapa orbital:** vista de cima do Sistema Solar com as órbitas dos planetas e a trajetória da nave.
- **Manobras:** você escolhe quando e quanto acelerar (prograde/retrograde, radial); a trajetória prevista é redesenhada na hora.
- **Aceleração do tempo (time warp):** para esperar a janela de lançamento e atravessar o cruzeiro.
- **Modo carreira simplificado:** orçamento (verba), ciência (pontos) e reputação.
- **Mapa de Δv:** quanto cada etapa da viagem custa em delta-v.

O que **não** pegamos (YAGNI): voo atmosférico pilotado, física de peças/colisões em 3D, aerodinâmica detalhada, n-corpos, pouso pilotado, tripulação com EVA, editor livre de peças.

## 5. DADOS NASA
**Fonte principal:** NASA Planetary Fact Sheet (NSSDCA) — raios orbitais, períodos, massas (GM) e raios dos planetas. Valores ficam em `js/data/planets.js` com a fonte citada.
**Opcional (P2):** JPL Horizons API — posição real de Terra e Marte numa data, para a janela de lançamento real. Com fallback local obrigatório.
**Missões reais para as caixas "Na vida real":** Mars Reconnaissance Orbiter, MAVEN, Curiosity (RTG), Juno (painéis em Júpiter).
**Licenças/regras:** dados e textos da NASA são, em geral, de domínio público; citar a fonte. Conferir as regras do Space Apps.
**Referências:** [pendente — listar os recursos indicados na página do desafio]

## 6. CIÊNCIA (conceitos que o jogo ensina)
| Conceito | Fórmula | Onde aparece |
|---|---|---|
| Gravitação | `F = G·M·m / r²` | Explicação de por que há órbitas |
| Velocidade orbital circular | `v = √(GM / r)` | Órbita baixa da Terra, órbitas dos planetas |
| Equação vis-viva | `v² = GM·(2/r − 1/a)` | Velocidade em qualquer ponto da trajetória |
| 3ª Lei de Kepler | `T = 2π·√(a³ / GM)` | Período dos planetas, tempo de viagem |
| Equação do foguete (Tsiolkovsky) | `Δv = Isp · g₀ · ln(m₀ / m_f)` | Δv de cada estágio no hangar |
| Empuxo/peso (TWR) | `TWR = F / (m · g₀)` | O foguete sai do chão? (precisa > 1) |
| Transferência de Hohmann | `a_t = (r₁ + r₂) / 2` | A viagem Terra → Marte |
| Ângulo de fase / janela de lançamento | `φ = 180° − 360°·(t_viagem / T_Marte)` | Quando partir |
| Velocidade de escape / excesso hiperbólico | `v = √(v∞² + 2GM/r)` | Sair da Terra e ser capturado em Marte |
| Esfera de influência (SOI) | `r_SOI = a·(m/M)^(2/5)` | Quando a gravidade de Marte "assume" |
| Lei do inverso do quadrado (luz e rádio) | `P ∝ 1/d²` | Energia solar e taxa de dados |
| Atraso do sinal | `t = d / c` | Comunicação com a Terra |

**Simplificações (declarar na tela "Como o jogo simplifica"):**
- Órbitas dos planetas circulares e no mesmo plano (2D). Erro pequeno para Terra e Marte.
- Cônicas remendadas (patched conics): dentro da SOI de um planeta só a gravidade dele age; fora dela, só a do Sol.
- Subida até a órbita baixa (LEO) não é pilotada: custa um Δv fixo de 9.400 m/s, que já inclui perdas por gravidade e arrasto.
- Queimas são instantâneas (impulsivas).
- Números das peças são **balanceamento de jogo**, inspirados em ordens de grandeza reais. Constantes físicas e dados dos planetas são **reais**.

Não apresentar o sistema como ferramenta operacional ou certificada.

## 7. PRODUTO
**Nome:** Mission Architect
**Objetivo:** montar um foguete e uma sonda, lançar, esperar a janela, executar a transferência para Marte vendo as órbitas, ser capturado e fazer ciência, entendendo a física de cada passo.
**Fluxo:** `briefing → hangar (montar foguete + sonda) → lançamento até LEO → mapa: esperar janela → queima de partida → cruzeiro (correções + eventos) → captura em Marte → operações científicas → relatório`
**Missão do MVP:** **Vigia Vermelho** — orbitador de Marte.
**Decisões do usuário:** peças de cada estágio, instrumentos e sistemas da sonda, equipe (3 de 6), momento da partida, tamanho e direção das queimas, correções de meio de curso, uso de habilidades e cartas de ação nos eventos.
**Métricas:** orçamento, massa, Δv por estágio e total, TWR, energia, taxa de dados, ciência entregue, reputação.
**Resultado:** sucesso / parcial / falha, estrelas, score e lições que explicam a física por trás do que aconteceu.

## 8. NASA/JPL
**Fonte principal no MVP:** dados fixos do Planetary Fact Sheet em `js/data/planets.js`.
**P2:** JPL Horizons para posições reais numa data. API externa nunca pode impedir a demonstração.

## 9. YAGNI — LISTA DO QUE NÃO FAZER
Sem: backend, banco, login, multiplayer, IA, analytics, painel admin, i18n, física 3D, sistema de plugins, editor de missões, física de n-corpos, salvar em nuvem, PWA, sistema de temas, gerenciador de estado genérico, classes abstratas "para reaproveitar depois".
Progresso (P3), se existir, usa `localStorage`.

## 10. HACKATHON
**MVP:** missão a Marte jogável do hangar ao relatório, com mapa orbital animado, trajetória prevista, janela de lançamento, captura e painel de física didático.
**P0:** física pura (órbitas, Kepler, foguete) + dados + testes.
**P1:** hangar, mapa orbital em canvas, manobras, time warp, captura, operações, relatório, painel de física.
**P2:** eventos em cartas durante o cruzeiro, correções de meio de curso finas, JPL Horizons com fallback, caixas "Na vida real".
**P3:** outros destinos (Lua, Vênus), carreira com reputação em `localStorage`, sons, polimento visual.

Prioridade: `funcionar > estabilidade > clareza didática > UX > dados > polimento > extras`

## 11. REGRAS DE TRABALHO
- Diferencie fatos (constantes, dados NASA), decisões de jogo (balanceamento) e hipóteses.
- Não invente valores científicos; use os da seção 6 e do Planetary Fact Sheet.
- Se um requisito oficial conflitar com este arquivo, o requisito oficial vence.
- Campos `[pendente]` não bloqueiam o MVP; não invente o conteúdo deles.

**Próximo: `Arquitetura.md`.**


## 12. EVOLUÇÃO VISUAL APROVADA
A camada visual agora possui cenas Three.js para o Sistema Solar e o hangar. Isso é uma exceção intencional ao escopo inicial sem 3D: o modelo físico, regras da missão e testes continuam em JS puro, sem depender da cena. O mapa 2D segue disponível para validar trajetória e manobras. Texturas e escalas da cena 3D são ilustrativas.
