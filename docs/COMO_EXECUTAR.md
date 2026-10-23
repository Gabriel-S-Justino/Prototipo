# Como executar

## Requisitos

- Node.js 20 ou superior (testado com Node 22) e npm.
- Navegador com WebGL para as cenas 3D. Sem WebGL, cada cena mostra um aviso e o resto da interface continua funcionando.

## Instalação

```bash
npm install
cp .env.example .env   # opcional: NASA_API_KEY para a DONKI
```

`NASA_API_KEY` só é lida no servidor (função `/api/donki` e middleware do Vite). Ela nunca vai para o navegador. Sem a chave, o proxy usa `DEMO_KEY`, que tem limite baixo de requisições. O Horizons não exige chave.

## Desenvolvimento

```bash
npm run dev        # http://localhost:5173
```

O servidor do Vite também atende `/api/horizons` e `/api/donki` (plugin em `api/dev-middleware.ts`), com a mesma lógica das funções serverless.

## Build e pré-visualização

```bash
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve dist/ e também /api/*
```

## Testes

```bash
npm test                   # Vitest: unidade, integração e interface
npm run validate:science   # tabela de validação científica com os desvios
npm run test:e2e           # Playwright: fluxo completo no navegador (faz o build)
npm run typecheck
```

O Playwright usa o Chromium em `/opt/pw-browsers/chromium` se ele existir; caso contrário, rode `npx playwright install chromium` uma vez.

## Deploy (Vercel)

`vercel.json` define `npm run build`, saída em `dist/` e as funções `api/horizons.ts` e `api/donki.ts`. Configure `NASA_API_KEY` nas variáveis de ambiente do projeto na Vercel.

**Não verificado:** o deploy na Vercel não foi executado durante esta entrega. As funções importam módulos TypeScript com extensão `.ts`; se o empacotador da Vercel recusar esse formato, será preciso ajustar os imports. Em hospedagem estática sem `/api`, o jogo funciona com o modelo offline e os botões de Horizons/DONKI mostram a indisponibilidade.
