# Créditos e licenças dos recursos visuais

O Mission Architect usa apenas recursos de domínio público ou gerados proceduralmente pelo próprio
código. Nenhum asset proprietário ou de licença restritiva foi incluído.

## Texturas da NASA (domínio público)

As imagens em `public/textures/` foram derivadas de recursos públicos da NASA. O material produzido
pela NASA geralmente não tem direitos autorais (ver [NASA Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)).
As imagens foram redimensionadas e recomprimidas para uso em tempo real; nenhuma foi alterada em conteúdo.

| Arquivo | Origem | Descrição |
| --- | --- | --- |
| `earth_day_2k.jpg` | NASA Visible Earth — Blue Marble (via [NASAWorldWind/WebWorldWind](https://github.com/NASAWorldWind/WebWorldWind), `BMNG_world.topo.bathy`) | Mapa diurno da Terra |
| `earth_night_2k.jpg` | NASA Earth Observatory — Black Marble / VIIRS (via WebWorldWind, `dnb_land_ocean_ice_2012`), processada para realçar as luzes das cidades | Luzes noturnas da Terra |
| `earth_ocean_1k.jpg` | Máscara de oceanos derivada do próprio Blue Marble | Mapa de reflexo especular dos oceanos |
| `mars_1440.jpg` | NASA — mosaico global de Marte (Viking), do repositório [nasa/NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources) (*Images and Textures/Mars*) | Superfície de Marte |
| `stars_tycho_2k.jpg` | ESA/NASA — mapa estelar Tycho, do [NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources) (*Images and Textures/Tycho Star Map*) | Céu estrelado de fundo |

## Recursos gerados proceduralmente (sem arquivo, criados em tempo de execução)

- **Materiais PBR** do foguete, da sonda e do hangar (espuma isolante, compósito, metal pintado, folha
  MLI dourada, células solares, concreto, aço, faixas de segurança, gelo de condensação): desenhados em
  `<canvas>` em `src/render/materials.ts`.
- **Nuvens da Terra, granulação do Sol, atmosferas e relevo dos planetas**: shaders e ruído procedural
  em `src/render/planets.ts`.
- **Plumas dos motores e partículas** (fogo, fumaça, vapor, centelhas): shaders em `src/render/effects.ts`.
- **Geometria** de todos os veículos, da sonda e da baia de montagem: construída a partir do catálogo de
  peças em `src/render/rocketModel.ts`, `src/render/probeModel.ts` e `src/render/hangarScene.ts`. É uma
  representação fiel em proporções (metros), não um modelo CAD dos veículos reais.

## Pós-processamento

O pipeline cinematográfico (bloom, tone mapping ACES, vinheta, grão de filme e aberração cromática) usa
os módulos de pós-processamento que já acompanham a biblioteca `three` (licença MIT), em `src/render/common.ts`.

## Desempenho e fallback

- A qualidade gráfica é detectada automaticamente (`?qualidade=baixa` força o modo econômico); em
  aparelhos modestos o render usa resolução menor e sombras reduzidas, mantendo o mesmo visual.
- As cenas pausam a renderização quando a aba está em segundo plano ou fora da área visível.
- Sem WebGL, as cenas 3D são substituídas por um aviso e todos os dados continuam nos painéis
  (comportamento preservado da versão anterior).
- As texturas carregam de forma assíncrona: a cena começa com uma textura procedural e troca pela imagem
  real quando ela chega. Se o download falhar (sem rede), a procedural permanece e nada quebra.
