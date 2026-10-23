# ADR 0001: migrar para React + TypeScript + Vite

**Situação:** aceita (outubro de 2026).

## Contexto

O projeto original era HTML, CSS e JavaScript sem bundler, com Three.js e texturas carregados de CDN, 25 testes `node --test` e um mapa orbital 2D em canvas. A física era coplanar e circular (Hohmann, ângulo de fase), a subida até a órbita custava 9.400 m/s fixos e o hangar empilhava estágios genéricos.

A nova especificação pede Lambert sobre efemérides reais, porkchop calculado, catálogo modular de lançadores com compatibilidade, cruzeiro com eventos, operações em Marte e uma fonte única de verdade ligando tudo. Isso multiplica o número de módulos e de dependências entre eles.

## Decisão

- **TypeScript estrito** para os contratos entre física, estado e interface (unidades documentadas nos tipos).
- **React 19** para a interface por etapas; `useReducer` como fonte única de verdade.
- **Vite** para desenvolvimento, Web Worker do porkchop e build; o mesmo servidor atende os proxies `/api`.
- **Vitest** (com jsdom e Testing Library) e **Playwright** para testes.
- Three.js passa a vir do npm em vez de CDN.

## O que foi preservado

- A física didática de referência (Hohmann, vis-viva, ângulo de fase, captura elíptica 300 × 33.000 km), portada para `simulation/orbital/hohmann.ts` e usada como comparação no planejamento.
- Os testes de órbita do projeto original, portados para Vitest com os mesmos valores de referência.
- O parser de vetores do Horizons e a ideia de proxy serverless, reescritos com validação de referencial, unidades e plausibilidade.
- O fluxo briefing → hangar → planejamento → lançamento → cruzeiro → Marte → relatório, o Painel de Física por etapa e o tom didático em português.
- A documentação original, em `legacy/`.

## O que foi substituído e por quê

- O modelo de estágios genéricos e a subida de custo fixo: substituídos por lançadores de referência com fases de queima, perdas e capacidade por C3, porque a especificação exige que a trajetória mude a carga possível.
- O mapa 2D: substituído pela cena 3D do sistema solar alimentada pelas mesmas efemérides.
- Os testes de foguete do original (Δv por estágio de um foguete genérico) não têm equivalente direto, porque o foguete genérico deixou de existir; foram substituídos por testes do novo modelo (Tsiolkovsky, compatibilidade, capacidade com limites de missões reais).

## Consequências

- É preciso `npm install` e um passo de build; o site não é mais "abrir o index.html".
- O deploy estático continua possível, mas sem `/api` as integrações com a NASA ficam indisponíveis (o jogo usa o modelo offline e avisa).
