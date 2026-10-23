# Dados da NASA: integrações, fontes e limitações

## Resumo

| Conjunto | Fonte | Situação nesta entrega |
|---|---|---|
| Posições de Terra e Marte (padrão) | Elementos keplerianos aproximados de Standish, JPL Solar System Dynamics, tabela 1800–2050 | Implementado e testado offline |
| Posições de Terra e Marte (opcional) | NASA/JPL Horizons API, via proxy `/api/horizons` | Implementado; testado só com respostas simuladas. **Não foi feita nenhuma consulta real** |
| Calibração de eventos solares | NASA DONKI (CMEAnalysis), via proxy `/api/donki` | Implementado; testado só com respostas simuladas. **Não foi feita nenhuma consulta real** |
| Referências de lançadores | Guias do usuário e páginas dos fabricantes | Ver [FOGUETES.md](FOGUETES.md) |
| Contexto das missões MRO, MAVEN, InSight, Perseverance | Kits de imprensa da NASA | Usado em textos e como limite inferior de capacidade |
| Texturas | Procedurais (geradas em canvas) | A pasta `assets/nasa/` do ZIP original estava vazia; nenhuma textura da NASA foi usada |

**Por que não houve consulta real:** o ambiente em que o código foi desenvolvido bloqueia `ssd.jpl.nasa.gov` e `api.nasa.gov` (o proxy de saída recusa a conexão). Por isso a comparação "modelo offline × Horizons" **não foi realizada**. Ela é o primeiro passo recomendado quando o projeto rodar com acesso à internet: no planejamento, clicar em "Usar NASA/JPL Horizons" e comparar C3 e datas.

## NASA/JPL Horizons

- **Consulta** (`src/services/nasa/horizonsCore.ts`): `EPHEM_TYPE=VECTORS`, `CENTER='500@10'` (centro do Sol), `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`, `OUT_UNITS=KM-S`, `VEC_TABLE=2`, `VEC_CORR=NONE`, `CSV_FORMAT=YES`, passo de 1 dia, no máximo 1.200 dias por consulta, datas de 1900 a 2100.
- **Época:** registrada no momento da consulta (`retrievedAt`) e mostrada na interface.
- **Unidades e referencial:** km e km/s, eclíptica e equinócio J2000 (ICRF), escala de tempo TDB. São as mesmas do modelo offline, então nenhuma conversão é feita.
- **Validação da resposta:** o parser exige que o cabeçalho confirme ICRF, eclíptica e km/s; recusa linhas incompletas, valores não numéricos, datas fora de ordem, tabelas com menos de duas linhas e estados fisicamente implausíveis (Terra fora de 0,97–1,03 UA ou 28,5–31 km/s; Marte fora de 1,36–1,69 UA ou 21,5–26,6 km/s). Isso pega, por exemplo, um corpo trocado ou unidades em UA.
- **Transformação:** interpolação de Hermite cúbica entre amostras diárias.
- **Falhas:** parâmetro inválido → HTTP 400; erro, tempo limite (15 s) ou resposta inválida do Horizons → HTTP 502 com mensagem. A interface mostra a mensagem e continua com o modelo offline. Nenhum valor é inventado.
- **Cache:** `s-maxage=86400` no proxy e cache em memória no navegador.

## NASA DONKI

- **Consulta** (`src/services/nasa/donkiCore.ts`): `CMEAnalysis` com `mostAccurateOnly=true`, velocidade mínima de 500 km/s, intervalo de até 120 dias (a interface pede os últimos 90 dias antes da partida escolhida).
- **Chave:** `NASA_API_KEY` só no servidor; sem ela, `DEMO_KEY`. A resposta do proxy não inclui a chave (testado).
- **Uso:** só **calibração estatística** (taxa de CMEs por dia e velocidades). Os eventos do cruzeiro continuam sendo **cenários de treinamento**, rotulados como tal. Registros sem horário ou velocidade são descartados, nunca preenchidos.
- **Falhas:** mesmo tratamento do Horizons; sem calibração, vale a taxa padrão didática (1 CME rápida a cada ~40 dias), indicada na interface.

## Arquitetura dos proxies

`server/handlers.ts` contém a lógica, usada pelas funções serverless da Vercel (`api/horizons.ts`, `api/donki.ts`) e pelo middleware do Vite (`server/dev-middleware.ts`) em `npm run dev` e `npm run preview`. O navegador só chama `/api/*`.

## O que é real e o que é didático no jogo

| Real (com fonte) | Didático (rotulado) |
|---|---|
| Efemérides (Standish ou Horizons) | Custos e limite de orçamento |
| Constantes físicas | Eventos solares do cruzeiro |
| Parâmetros de motores e estágios (com nível de confiança) | Tempestade de poeira em Marte |
| Equações (Lambert, Friis, Tsiolkovsky) | Pontuação de ciência e regras de turno |
