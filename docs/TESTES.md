# Testes

## Comandos

```bash
npm test                   # Vitest (unidade, integração, interface)
npm run validate:science   # validação científica com tabela de desvios
npm run test:e2e           # Playwright, fluxo completo no Chromium
npm run typecheck          # TypeScript estrito
```

## Resultado na entrega

Executados nesta entrega, em Node 22 e Chromium headless:

- `npm test`: **7 arquivos, 115 testes, todos passando**;
- `npm run test:e2e`: **2 testes, ambos passando** (fluxo completo e proxy `/api/horizons`);
- `tsc -b`: sem erros; `vite build`: sem erros (aviso de tamanho do pacote, ~956 kB antes de gzip, por causa do Three.js).

## O que cada suíte cobre

| Arquivo | Cobertura |
|---|---|
| `src/simulation/orbital/orbital.test.ts` | Valores de referência do projeto original (Hohmann 258,9 dias, partida 3.613 m/s, captura 907 m/s, ângulo de fase 44,35°); Kepler (convergência, ida e volta estado/elementos, período, energia de hipérbole); Lambert (exemplo 5.2 de Curtis, propagação de volta até r₂, casos inválidos); efemérides (distâncias, periélio de 2027, oposição de 19/02/2027, conjunção de março de 2028, erro fora do intervalo, Hermite); transferência de 31/10/2026; porkchop e validação de parâmetros |
| `src/simulation/rocket/rocket.test.ts` | Tsiolkovsky, C3 ↔ Δv, inclinação de estacionamento; presets sem incompatibilidade, TWR, capacidade decrescente com C3, limites inferiores de MRO, InSight e Perseverance; cada regra de compatibilidade |
| `src/simulation/mission/mission.test.ts` | Lançamento nominal, recusa com NO-GO, TWR ≤ 1, déficit completado pela sonda, falha por falta de Δv, antena danificada pela coifa; captura; enlace (1/r², conjunção, antena danificada, entradas inválidas); energia; orçamento; eventos solares (determinismo, rótulo de treinamento, geometria de exposição, proteção); operações em Marte (8 turnos, DSN, corte de instrumentos, conjunção); RNG |
| `src/state/mission.test.ts` | Redutor: estado inicial, sincronização data → C3/capacidade/checklist, NO-GO bloqueia, lançamento forçado com falha → relatório, travamento pós-lançamento, navegação, missão completa até o relatório, determinismo por semente, **sem TCMs a sonda não é capturada** |
| `src/services/nasa/nasa.test.ts` | Horizons: validação de parâmetros, URL, resposta válida, sem `result`, erro do Horizons, sem tabela, referencial/unidades errados, linha incompleta, valor não numérico, valores implausíveis, ordem, HTTP, rede, timeout, JSON inválido; DONKI: parser, calibração, erros; proxies (códigos HTTP, chave não vaza); cliente do navegador |
| `src/app/App.test.tsx` | Interface: etapas liberadas, preset e peça incompatível no hangar, data do planejamento no checklist, confirmação do lançamento forçado, lançamento → cruzeiro → TCM, Painel de Física, órbita de captura |
| `src/simulation/validation/science.test.ts` | Tabela de validação científica (ver [FOGUETES.md](FOGUETES.md)) |
| `e2e/mission.spec.ts` | Fluxo inteiro no navegador real: Centro → Hangar → Planejamento → Checklist → Lançamento → Cruzeiro (todas as TCMs e eventos) → Inserção → 8 turnos → Relatório, sem erros de página |

## Fixtures

As respostas do Horizons usadas nos testes (`src/services/nasa/__fixtures__/horizons.ts`) são **sintéticas**: têm o formato da API, mas os números vêm do modelo de Standish. Não são dados baixados da NASA.

## Testes do projeto original

Os 25 testes `node --test` do ZIP:

- **órbita (11):** portados com os mesmos valores. O de velocidade em LEO mudou de 7.788 para 7.784 m/s porque o raio terrestre passou de 6.371 km (médio) para 6.378,137 km (equatorial). Os que usavam o modelo circular do jogo antigo (ângulo de fase na data inicial, trajetória de Hohmann que encontra Marte) foram substituídos pelos testes de Lambert e de efemérides, porque o modelo circular deixou de planejar a trajetória;
- **foguete (4) e missão (10):** testavam o foguete genérico e as regras antigas (subida de 9.400 m/s fixos, 6 turnos). Foram substituídos por testes equivalentes do novo modelo: TWR baixo não decola, falta de Δv falha, Δv consumido, operações determinísticas, missão de referência completa, falha sem correção;
- **Horizons (2):** substituídos por 7 testes do novo parser;
- **manifesto de recursos NASA (4):** o manifesto de modelos/texturas da NASA não existe mais (as texturas são procedurais); a garantia equivalente agora é a proveniência obrigatória de cada peça do catálogo.

## Critérios de qualidade

- Valores de referência vêm de fontes nomeadas no próprio teste (Curtis, kits de imprensa, efemérides) ou de invariantes físicas (ida e volta, conservação de energia, 1/r²).
- Tolerâncias justificadas pelo modelo (por exemplo ±4 dias na oposição, por ser Standish).
- Nenhum teste foi relaxado para passar; os desvios do modelo de lançador ficam visíveis na suíte de validação.
