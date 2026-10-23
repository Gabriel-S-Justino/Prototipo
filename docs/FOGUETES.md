# Foguetes, motores e capacidade de carga

## Catálogo

Arquivo: `src/data/launchers.ts`. Cada item tem proveniência (`publicado`, `estimado`, …) e confiança (`alta`, `media`, `baixa`), mostradas na interface do hangar.

| Peça | Itens |
|---|---|
| Motores | RD-180, Merlin 1D, Merlin 1D Vac, BE-4, RL10A-4-2, RL10C-1, RL10C-1-1 |
| Primeiros estágios | Atlas V CCB, Falcon 9 1º estágio (descartável), Vulcan núcleo |
| Estágios superiores | Centaur III, Falcon 9 2º estágio, Centaur V |
| Propulsores laterais | AJ-60A, GEM 63XL, núcleo lateral do Falcon Heavy |
| Coifas | Atlas 4 m (no máximo 3 sólidos), Atlas 5 m, Falcon 5 m, Vulcan 5 m |

Configurações de referência: Atlas V 401, Atlas V 541, Falcon 9 (descartável), Falcon Heavy (descartável), Vulcan VC4.

**Sobre a origem dos números:** os valores foram preenchidos a partir de documentos públicos citados em cada item (guia do usuário do Atlas V de 2010, fichas do RL10, páginas da SpaceX, etc.). Durante esta entrega **não foi possível reabrir esses documentos para conferência** (o ambiente de desenvolvimento não tinha acesso à internet). Itens marcados `estimado` vêm de fontes secundárias e não têm confirmação oficial (por exemplo, massas dos estágios do Falcon e do Vulcan e o Isp do BE-4). Os geométricos dos modelos 3D são procedurais e ilustrativos, não CAD.

Custos são **fictícios** (unidade "US$ M*"), escolhidos para criar escolhas no jogo.

## Compatibilidade

`assembleVehicle` (em `simulation/rocket/vehicle.ts`) recusa com erro: estágio superior de outra família, motor que o estágio não aceita, número de motores inválido, propulsor de outra família ou em quantidade não qualificada, sólidos demais para a coifa de 4 m, coifa de outra família ou mais estreita que o estágio, carregamento de propelente fora de 50–100%. Tanques parciais geram só aviso. Cada erro vira NO-GO no checklist e, num lançamento forçado, uma falha específica (por exemplo, o interestágio não se separa).

## Modelo de desempenho

`simulation/rocket/performance.ts` divide a subida em fases:

1. propulsores + núcleo (Isp combinado ponderado pelo fluxo de massa, Isp do núcleo misturado entre nível do mar e vácuo);
2. núcleo sozinho em altitude;
3. estágio superior.

Δv ideal de cada fase por Tsiolkovsky. Perdas: gravidade = g₀ · t_queima · fator (0,7 na fase atmosférica, 0,35 para o núcleo em altitude, 0,05 para o superior), arrasto 150 m/s, direção 60 m/s; ganho pela rotação da Terra conforme a inclinação. O que sobra depois de atingir a órbita de 200 km é convertido em C3. A capacidade para uma C3 é obtida por bisseção na carga.

## Calibração e desvios encontrados

Os fatores de perda foram ajustados para que as configurações Atlas V respeitassem os limites inferiores dados por missões reais. Resultado do comando `npm run validate:science`:

| Verificação | Modelo | Referência | Situação |
|---|---|---|---|
| Atlas V 401 a C3 16,4 (MRO, 2.180 kg) | 2.889 kg | ≥ 2.180 kg | atende |
| Atlas V 541 a C3 14,5 (Perseverance, ~4.050 kg) | 4.931 kg | ≥ 4.050 kg | atende |
| Falcon 9 descartável "para Marte" a C3 9 | 6.216 kg | 4.020 kg (SpaceX) | **+55%, superestima** |
| Falcon Heavy descartável "para Marte" a C3 9 | 14.197 kg | 16.800 kg (SpaceX) | **−15%, subestima** |

Interpretação honesta:

- A SpaceX não informa a C3 associada ao número "para Marte"; se for uma C3 maior que 9, parte do desvio some, mas não há como confirmar.
- As massas do Falcon 9 são estimadas, e um modelo de fases médias com os mesmos fatores para veículos diferentes não reproduz bem o desempenho de todos.
- A meta de erro de ±8% contra as curvas oficiais do NASA Launch Services Program **não foi verificada**: as curvas de desempenho (C3 × massa) não estavam acessíveis neste ambiente. Os limites inferiores das missões reais são a única validação feita.

Por isso o Painel de Física apresenta a capacidade como estimativa do modelo, não como número oficial do lançador.
