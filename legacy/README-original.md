# Mission Architect — simulação de missão com visualizações 3D

O projeto original foi preservado: fases de briefing, montagem, lançamento, mapa orbital de missão, manobras, operações, painel didático de física, relatório e testes. A visualização 3D foi adicionada como camada de apresentação, sem substituir as regras do jogo.

## Visualizações novas

- **Sistema Solar 3D:** esferas com texturas planetárias, iluminação, atmosfera/nuvens terrestres, anéis de Saturno, estrelas e câmera orbital. As posições de Mercúrio, Vênus, Terra e Marte usam o mesmo modelo orbital do jogo. Júpiter e Saturno são elementos visuais ilustrativos, não parte da simulação física.
- **Mapa de missão 2D:** continua disponível como visualização alternativa e mantém trajetórias, previsões, periélio/afélio e dados de manobras. Use-o para interpretar os resultados da simulação.
- **Hangar 3D:** foguete gerado a partir dos IDs das peças existentes em `js/data/parts.js` e da configuração em `state.design`, com materiais metálicos, estrutura de hangar, motor, painéis e instrumentos. O esquema SVG original segue disponível como alternativa.
- **YAGNI:** sem backend, login, banco, estado genérico, framework de UI ou dependências de build. Three.js foi adicionado por import map porque WebGL 3D é requisito explícito desta versão.

## Executar localmente

É um site estático. Use Node.js 18+ para os testes e qualquer servidor HTTP para rodar o app:

```bash
python3 -m http.server 8000
```

Abra http://localhost:8000. Não abra o HTML diretamente como `file://`.

Teste a lógica existente:

```bash
npm test
```

## Publicar na Vercel

1. Faça push desta pasta para um repositório Git.
2. Importe o repositório em https://vercel.com/new.
3. Selecione **Other** como framework.
4. Deixe Build Command vazio e Output Directory como `.`.
5. Faça deploy.

O `vercel.json` inclui cabeçalhos HTTP básicos. Não há build step.

## Recursos externos

Three.js é carregado de jsDelivr por import map. Texturas planetárias são carregadas de Solar System Scope; se o domínio estiver bloqueado, o renderizador ainda mostra os corpos, mas o aspecto texturizado fica degradado. As texturas são recursos externos e não estão armazenadas no ZIP.

## Precisão e limitações

- **A simulação 2D continua sendo a referência** para a física e trajetória da missão.
- O tamanho visual dos corpos, materiais, modelos do foguete e órbitas exibidas em 3D não estão em escala real.
- Júpiter e Saturno são adicionados somente para enriquecer a cena visual.
- O hangar usa geometrias procedurais, não CAD validado nem modelos de voo.
- Esta é uma experiência educativa; não é uma ferramenta operacional de engenharia espacial.
- As posições orbitais no modelo do jogo são simplificadas e não substituem efemérides de alta precisão.

## Estrutura relevante

```text
index.html
css/style.css
js/main.js
js/ui/map.js             mapa de missão 2D original
js/ui/solar3d.js         nova visualização solar 3D
js/ui/hangar.js          montagem original e regras de peças
js/ui/hangar3d.js        nova visualização do foguete montado
js/physics/*             física original, sem dependência do DOM
js/game/*                regras da missão original
js/data/*                dados, catálogo e constantes originais
tests/*                  testes originais
vercel.json
```


## Visualização 3D atualizada

- O sistema solar 3D recebe o estado da missão e posiciona a nave usando o mesmo propagador orbital (`positionAt`) usado pela simulação; durante o cruzeiro, desenha também a trajetória calculada.
- A montagem do foguete abre um hangar 3D em tela cheia, com catálogo e métricas em painéis sobrepostos.
- O hangar usa iluminação PBR, reflexos de ambiente, piso industrial texturizado e estrutura de galpão; as peças do catálogo possuem miniaturas estilizadas e o foguete 3D é composto pelos IDs reais do projeto.

**Nota de fidelidade visual:** os modelos do foguete e do hangar são geometria procedural, não CAD de veículos reais nem assets fotogramétricos. As texturas planetárias dependem de conexão externa ao CDN Solar System Scope; os materiais industriais são gerados localmente.


## Recursos oficiais NASA

O projeto inclui links para o catálogo NASA 3D Resources e para NASA Eyes on the Solar System. Atenção: eles não são duas APIs REST equivalentes: o NASA 3D Resources é principalmente um catálogo de arquivos para download e o NASA Eyes é uma aplicação interativa. O Mission Architect continua funcionando sem esses sites.

- `js/data/nasa-resources.js`: URLs oficiais, manifesto de modelos locais e helper para carregar GLB/GLTF com `GLTFLoader`.
- `NASA_MODEL_MANIFEST`: registro de ativos oficiais com URL, fonte, provedor, tipo e atribuição. O ativo `perseverance-rover` é um rover, não uma peça de foguete. Não associe esse modelo a tanques ou motores.
- Hangar: atalho para o catálogo oficial e repositório de recursos.
- Visualização orbital: atalho para abrir NASA Eyes como referência externa; a visualização Three.js do jogo permanece própria e usa o modelo orbital educacional existente.

Para adicionar um modelo de componente, obtenha um arquivo compatível e verificável, confira os termos/licença e atribuição, guarde-o em `assets/nasa/` e registre fonte, provedor, tipo e status de verificação no manifesto. Só marque `official: true` depois de verificar a origem. O catálogo NASA 3D Resources não fornece uma API JSON única para todos os componentes; portanto, enquanto não houver ativos de tanques/motores comprovados, eles permanecem explicitamente procedurais.

## Integração NASA / JPL Horizons

- **NASA 3D Resources:** o hangar tenta carregar o modelo GLB oficial do rover Perseverance diretamente do repositório público da NASA no GitHub. É um recurso visual, não altera massa, empuxo ou outros parâmetros da simulação. O hangar inclui um modelo de contingência se a rede/CORS bloquear o download. Crédito e fonte: [NASA 3D Resources](https://science.nasa.gov/3d-resources/) e [arquivo do modelo Perseverance](https://github.com/nasa/NASA-3D-Resources/blob/master/3D%20Models/Mars%202020%20Perseverance%20Rover/Mars%202020%20Perseverance%20Rover.glb).
- **JPL Horizons:** na tela de voo, use **Sincronizar Terra e Marte com JPL**. A chamada passa pela função serverless `api/horizons.js`, que consulta os vetores heliocêntricos (posição em AU e velocidade em AU/dia) para Terra e Marte e os aplica à visualização 3D. A resposta é armazenada em cache por até uma hora na camada Vercel.
- **NASA Eyes on the Solar System:** continua como aplicação externa de exploração e comparação. Não existe uma API pública genérica/documentada para embutir a aplicação no jogo.

### Limitações científicas explícitas

O Horizons sincroniza as posições visuais de Terra e Marte para a data consultada. O propagador orbital, a janela de lançamento, o cálculo de Δv e a trajetória da nave ainda são o modelo educacional aproximado do jogo; não devem ser interpretados como efemérides de navegação ou planejamento de missão real. A data aceita pelo endpoint está limitada a 1800–2050, conforme a faixa usual dos elementos planetários de referência do jogo. Para usar dados JPL como base dos cálculos de janela e encontro, é necessário um passo adicional: calcular e validar a transferência com os estados vetoriais sincronizados e reconciliar os referenciais e escalas de tempo.

### Execução e implantação

A integração Horizons requer implantação em uma plataforma compatível com funções serverless (o projeto já contém `vercel.json`, e a rota está em `api/horizons.js`). Ao abrir o `index.html` diretamente via `file://` ou servir apenas arquivos estáticos sem executar a função `/api`, a consulta JPL não funcionará; o jogo mantém a simulação aproximada. Em implantação, monitore respostas `502`, limites de uso e mudanças no formato da API oficial.
