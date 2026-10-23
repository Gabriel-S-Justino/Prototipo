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

O servidor do Vite também atende `/api/horizons` e `/api/donki` (plugin em `server/dev-middleware.ts`), com a mesma lógica das funções serverless.

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

## Deploy na Vercel

O projeto já está configurado (`vercel.json`): build com `npm run build`, site estático em `dist/` e duas funções serverless, `api/horizons.ts` e `api/donki.ts` (Node 22, até 30 s). A lógica dos proxies fica em `server/`, fora de `api/`, para que a Vercel não a publique como função.

### Pelo painel da Vercel (recomendado)

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório `Gabriel-S-Justino/Prototipo`.
2. Em **Production Branch** (Settings → Git), escolha `Produção`. Os outros branches viram deploys de pré-visualização.
3. Deixe o preset **Vite**: o comando de build e a pasta de saída já vêm do `vercel.json`.
4. Em **Settings → Environment Variables**, crie `NASA_API_KEY` com a chave de [api.nasa.gov](https://api.nasa.gov/) (opcional; sem ela a DONKI usa `DEMO_KEY`, com limite baixo).
5. Clique em **Deploy**.

### Pela linha de comando

```bash
npx vercel login
npx vercel link                 # liga a pasta ao projeto
npx vercel env add NASA_API_KEY # opcional
npx vercel                      # deploy de pré-visualização
npx vercel --prod               # deploy de produção
```

### Depois do deploy, confira

- `https://SEU-PROJETO.vercel.app/api/horizons?body=pluto` deve responder **400** com `"kind":"parametros"`;
- no Planejamento, "Usar NASA/JPL Horizons" deve trocar a fonte das efemérides (primeiro teste real contra a NASA);
- "Calibrar eventos solares (DONKI)" deve mostrar quantas CMEs foram usadas.

### O que já foi verificado e o que não foi

- `vercel build` (CLI 65.2.0) rodou localmente e gerou o site e as duas funções; as funções compiladas foram executadas em Node com `fetch` simulado e responderam 400, 200 e 405 como esperado, sem vazar a chave.
- **Não verificado:** um deploy real na Vercel e a chamada real à NASA, porque o ambiente de desenvolvimento não tinha conta da Vercel nem acesso aos domínios da NASA.
- Avisos `TS2688` (tipos de teste não encontrados) aparecem ao compilar as funções; são inofensivos e não impedem o build.
- Em hospedagem só estática (sem `/api`), o jogo funciona com o modelo offline e os botões de Horizons/DONKI mostram a indisponibilidade.
