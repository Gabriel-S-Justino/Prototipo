# Mission Architect

Simulador didático de engenharia de missão a Marte: monte o lançador e a sonda, escolha a janela num gráfico de oportunidades calculado por Lambert, passe pelo checklist, acompanhe o lançamento, gerencie o cruzeiro, faça a inserção orbital e opere a sonda em Marte.

```bash
npm install
npm run dev    # http://localhost:5173
npm test
```

A física usa efemérides do JPL (modelo de Standish offline ou NASA/JPL Horizons via proxy). Custos, eventos solares do cruzeiro e a tempestade de poeira são **didáticos** e rotulados assim no jogo.

Documentação completa em [`docs/`](docs/README.md): arquitetura, física, foguetes, dados da NASA, testes, execução, critérios de aceitação e o relatório de entrega.
