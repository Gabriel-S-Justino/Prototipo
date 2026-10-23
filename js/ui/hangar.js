// Hangar de montagem: peças em cartas, pilha do foguete em SVG, tabela por estágio.
import { MISSION } from '../data/mission.js';
import { PROBE_PARTS, ROCKET_PARTS, probePart, rocketPart } from '../data/parts.js';
import { canLaunch, designStats, launch, validateDesign } from '../game/mission.js';
import { el, fmt } from './dom.js';
import { NASA_RESOURCES } from '../data/nasa-resources.js';

const CATEGORY = { core: 'Núcleo', power: 'Energia', comms: 'Comunicação', instrument: 'Instrumento', protection: 'Proteção' };
const SVG = 'http://www.w3.org/2000/svg';

function partCard(name, tag, lines, flavor, onClick, active, partId = 'generic', partKind = 'probe') {
  return el('button', { class: `card${active ? ' active' : ''}`, type: 'button', 'data-part-id': partId, 'data-part-kind': partKind, onclick: onClick },
    el('span', { class: `part-render part-${partId} ${partKind === 'engine' ? 'part-engine' : partKind === 'tank' ? 'part-tank' : 'part-probe'}`, 'aria-hidden': 'true' }, el('span', { class: 'part-metal' }), el('span', { class: 'part-detail' })),
    el('span', { class: 'card-tag' }, tag),
    el('strong', {}, name),
    el('ul', {}, lines.map((l) => el('li', {}, l))),
    el('small', {}, flavor));
}

function rocketLines(p) {
  const lines = [`US$ ${p.cost} M · ${fmt(p.wet, 1)} t`];
  if (p.kind === 'tank') lines.push(`${fmt(p.wet - p.dry, 1)} t de propelente`);
  if (p.kind === 'engine') lines.push(`Isp ${p.isp} s · empuxo ${fmt(p.thrust)} kN`);
  return lines;
}

function probeLines(p) {
  const lines = [`US$ ${p.cost} M · ${p.mass} kg`];
  if (p.power > 0) lines.push(p.solar ? `+${p.power} W na Terra, +${fmt(p.power / 1.52371 ** 2)} W em Marte` : `+${p.power} W constantes`);
  if (p.power < 0) lines.push(`${p.power} W`);
  if (p.battery) lines.push(`Cobre ${p.battery} W de déficit`);
  if (p.rate) lines.push(`${p.rate} Gbit/turno a 1 UA da Terra`);
  if (p.science) lines.push(`+${p.science} ciência · ${fmt(p.data, 1)} Gbit por turno`);
  return lines;
}


/**
 * Desenha o foguete montado em SVG.
 *
 * Compatibilidade:
 * - Recebe o mesmo objeto design.
 * - Continua retornando um elemento SVG.
 * - Não modifica o estado nem as regras da simulação.
 * - Usa as peças já definidas em data/parts.js.
 */

function svgNode(tag, attributes = {}, parent = null) {
  const node = document.createElementNS(SVG, tag);

  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }

  if (parent) parent.append(node);
  return node;
}

function rocketTankSize(part) {
  const sizes = {
    'tank-s': { width: 34, height: 35 },
    'tank-m': { width: 48, height: 48 },
    'tank-l': { width: 64, height: 62 },
  };

  // Fallback para tanques adicionados futuramente.
  return sizes[part.id] ?? { width: 46, height: 46 };
}

function rocketTankShape(cx, y, width, height, parent) {
  const left = cx - width / 2;
  const right = cx + width / 2;
  const bevel = Math.min(5, height / 5);
  const shoulder = Math.min(5, width / 8);

  // Corpo com extremidades suavemente chanfradas.
  svgNode('path', {
    d: [
      `M ${left + shoulder} ${y}`,
      `L ${right - shoulder} ${y}`,
      `L ${right} ${y + bevel}`,
      `L ${right} ${y + height - bevel}`,
      `L ${right - shoulder} ${y + height}`,
      `L ${left + shoulder} ${y + height}`,
      `L ${left} ${y + height - bevel}`,
      `L ${left} ${y + bevel}`,
      'Z',
    ].join(' '),
    fill: 'url(#rocket-metal)',
    stroke: '#64748b',
    'stroke-width': 0.8,
  }, parent);

  // Faixa de sombra lateral.
  svgNode('path', {
    d: `M ${right - 7} ${y + bevel} L ${right - 3} ${y + bevel} L ${right - 3} ${y + height - bevel} L ${right - 7} ${y + height - bevel} Z`,
    fill: '#64748b',
    opacity: 0.48,
  }, parent);

  // Painel central.
  svgNode('path', {
    d: `M ${left + 5} ${y + bevel + 2} L ${right - 10} ${y + bevel + 2} L ${right - 10} ${y + height - bevel - 2} L ${left + 5} ${y + height - bevel - 2} Z`,
    fill: '#e2e8f0',
    opacity: 0.55,
  }, parent);

  // Anéis estruturais do tanque.
  for (const ringY of [y + 4, y + height - 4]) {
    svgNode('line', {
      x1: left + 2,
      y1: ringY,
      x2: right - 2,
      y2: ringY,
      stroke: '#64748b',
      'stroke-width': 1,
    }, parent);
  }
}

function rocketEngine(cx, y, width, parent) {
  const topWidth = width * 0.48;
  const exitWidth = width * 0.82;
  const height = Math.max(12, width * 0.48);

  // Bocal convergente/divergente.
  svgNode('path', {
    d: [
      `M ${cx - topWidth / 2} ${y}`,
      `L ${cx + topWidth / 2} ${y}`,
      `L ${cx + exitWidth / 2} ${y + height}`,
      `L ${cx - exitWidth / 2} ${y + height}`,
      'Z',
    ].join(' '),
    fill: 'url(#rocket-engine)',
    stroke: '#475569',
    'stroke-width': 1,
    'stroke-linejoin': 'round',
  }, parent);

  // Garganta e borda da saída.
  svgNode('line', {
    x1: cx - topWidth / 2,
    y1: y + 2,
    x2: cx + topWidth / 2,
    y2: y + 2,
    stroke: '#f8fafc',
    'stroke-width': 1,
    opacity: 0.8,
  }, parent);

  svgNode('path', {
    d: `M ${cx - exitWidth / 2} ${y + height} Q ${cx} ${y + height + 3} ${cx + exitWidth / 2} ${y + height}`,
    fill: 'none',
    stroke: '#94a3b8',
    'stroke-width': 1.5,
  }, parent);
}

function rocketAdapter(cx, y, upperWidth, lowerWidth, height, parent) {
  const upperLeft = cx - upperWidth / 2;
  const upperRight = cx + upperWidth / 2;
  const lowerLeft = cx - lowerWidth / 2;
  const lowerRight = cx + lowerWidth / 2;

  svgNode('path', {
    d: [
      `M ${upperLeft} ${y}`,
      `L ${upperRight} ${y}`,
      `L ${lowerRight} ${y + height}`,
      `L ${lowerLeft} ${y + height}`,
      'Z',
    ].join(' '),
    fill: '#94a3b8',
    stroke: '#475569',
    'stroke-width': 0.8,
  }, parent);

  svgNode('line', {
    x1: lowerLeft + 2,
    y1: y + height - 3,
    x2: lowerRight - 2,
    y2: y + height - 3,
    stroke: '#e2e8f0',
    'stroke-width': 1.2,
  }, parent);
}

function rocketFairing(cx, y, width, height, parent) {
  const baseY = y + height;
  const shoulderY = y + height * 0.42;
  const left = cx - width / 2;
  const right = cx + width / 2;

  // Carenagem com ponta cônica e ombros arredondados.
  svgNode('path', {
    d: [
      `M ${cx} ${y}`,
      `Q ${cx - width * 0.09} ${y + height * 0.18} ${left + 2} ${shoulderY}`,
      `Q ${left} ${shoulderY + 5} ${left} ${baseY - 4}`,
      `Q ${left} ${baseY} ${left + 5} ${baseY}`,
      `L ${right - 5} ${baseY}`,
      `Q ${right} ${baseY} ${right} ${baseY - 4}`,
      `Q ${right} ${shoulderY + 5} ${right - 2} ${shoulderY}`,
      `Q ${cx + width * 0.09} ${y + height * 0.18} ${cx} ${y}`,
      'Z',
    ].join(' '),
    fill: 'url(#rocket-fairing)',
    stroke: '#64748b',
    'stroke-width': 1,
  }, parent);

  // Costura longitudinal.
  svgNode('path', {
    d: `M ${cx + 2} ${y + height * 0.18} Q ${cx + 5} ${shoulderY} ${cx + 5} ${baseY - 2}`,
    fill: 'none',
    stroke: '#94a3b8',
    'stroke-width': 1,
    opacity: 0.9,
  }, parent);

  // Linha de separação da carenagem.
  svgNode('line', {
    x1: left + 2,
    y1: baseY - 5,
    x2: right - 2,
    y2: baseY - 5,
    stroke: '#475569',
    'stroke-width': 1,
  }, parent);
}

function rocketDetails(cx, y, width, height, parent) {
  // Pequenos painéis técnicos na lateral do corpo.
  const panelX = cx + width / 2 - 7;

  svgNode('rect', {
    x: panelX,
    y: y + height * 0.35,
    width: 3,
    height: Math.min(9, height * 0.2),
    rx: 0.8,
    fill: '#f97316',
  }, parent);

  svgNode('circle', {
    cx: cx - width / 2 + 5,
    cy: y + height * 0.35,
    r: 1.5,
    fill: '#64748b',
  }, parent);
}

function stackSvg(design) {
  const cx = 90;
  const blocks = [];

  // A largura da sonda acompanha o maior tanque do conjunto.
  const allRocketParts = design.stages.flat().map(rocketPart);
  const largestTankWidth = Math.max(
    34,
    ...allRocketParts
      .filter((part) => part.kind === 'tank')
      .map((part) => rocketTankSize(part).width)
  );

  // 1. Carga útil e carenagem.
  if (design.probe.length > 0) {
    blocks.push({
      type: 'fairing',
      width: Math.max(34, largestTankWidth * 0.66),
      height: 34 + Math.min(12, design.probe.length * 3),
    });
  }

  // 2. Estágios do topo até a base.
  for (let i = design.stages.length - 1; i >= 0; i--) {
    const parts = design.stages[i].map(rocketPart);
    if (parts.length === 0) continue;

    const tanks = parts.filter((part) => part.kind === 'tank');
    const engines = parts.filter((part) => part.kind === 'engine');

    // Cada tanque contribui para a altura e para a largura do estágio.
    for (const tank of tanks) {
      const size = rocketTankSize(tank);

      blocks.push({
        type: 'tank',
        width: size.width,
        height: size.height,
      });
    }

    // Estágio sem tanques, mas com motor: estrutura mínima para representá-lo.
    if (tanks.length === 0 && engines.length > 0) {
      blocks.push({
        type: 'tank',
        width: 38,
        height: 24,
      });
    }

    if (engines.length > 0) {
      blocks.push({
        type: 'engine',
        count: engines.length,
        width: Math.min(engines.length * 13 + 18, 54),
        height: Math.max(12, Math.min(engines.length * 2 + 15, 23)),
      });
    }

    // Anel de conexão entre este estágio e o seguinte.
    if (i > 0) {
      blocks.push({
        type: 'adapter',
        width: tanks.length
          ? Math.max(...tanks.map((tank) => rocketTankSize(tank).width))
          : 38,
        lowerWidth: Math.max(34, largestTankWidth * 0.55),
        height: 6,
      });
    }
  }

  // Reserva espaço para um desenho legível mesmo com configuração vazia.
  const totalHeight = blocks.reduce((sum, block) => sum + block.height, 0);
  const height = Math.max(120, totalHeight + 16);

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 180 ${height}`);
  svg.setAttribute('class', 'stack');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Representação técnica do foguete montado');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Definições de gradientes: mantêm o desenho leve e independente de CSS externo.
  const defs = svgNode('defs', {}, svg);

  const gradients = [
    {
      id: 'rocket-metal',
      stops: [
        ['0%', '#94a3b8'],
        ['30%', '#f8fafc'],
        ['72%', '#cbd5e1'],
        ['100%', '#94a3b8'],
      ],
    },
    {
      id: 'rocket-engine',
      stops: [
        ['0%', '#475569'],
        ['50%', '#cbd5e1'],
        ['100%', '#334155'],
      ],
    },
    {
      id: 'rocket-fairing',
      stops: [
        ['0%', '#f8fafc'],
        ['45%', '#e2e8f0'],
        ['100%', '#94a3b8'],
      ],
    },
  ];

  for (const gradient of gradients) {
    const linear = svgNode('linearGradient', {
      id: gradient.id,
      x1: '0%',
      y1: '0%',
      x2: '100%',
      y2: '0%',
    }, defs);

    for (const [offset, color] of gradient.stops) {
      svgNode('stop', {
        offset,
        'stop-color': color,
      }, linear);
    }
  }

  // Sombra discreta para destacar a silhueta.
  const shadow = svgNode('ellipse', {
    cx,
    cy: height - 4,
    rx: Math.max(18, largestTankWidth * 0.52),
    ry: 3,
    fill: '#64748b',
    opacity: 0.15,
  }, svg);

  let y = 6;

  for (const block of blocks) {
    switch (block.type) {
      case 'fairing': {
        rocketFairing(cx, y, block.width, block.height, svg);
        y += block.height;

        // Interface entre a carga útil e o primeiro estágio.
        rocketAdapter(
          cx,
          y,
          block.width,
          Math.max(30, largestTankWidth * 0.7),
          5,
          svg
        );
        y += 5;
        break;
      }

      case 'tank': {
        rocketTankShape(cx, y, block.width, block.height, svg);
        rocketDetails(cx, y, block.width, block.height, svg);
        y += block.height;
        break;
      }

      case 'adapter': {
        rocketAdapter(
          cx,
          y,
          block.width,
          block.lowerWidth,
          block.height,
          svg
        );
        y += block.height;
        break;
      }

      case 'engine': {
        // Motores distribuídos simetricamente sob o estágio.
        const count = block.count;
        const spacing = Math.min(13, block.width / Math.max(1, count));
        const startX = cx - ((count - 1) * spacing) / 2;

        // Suporte estrutural do conjunto de motores.
        svgNode('rect', {
          x: cx - block.width / 2,
          y,
          width: block.width,
          height: 4,
          rx: 1,
          fill: '#64748b',
          stroke: '#475569',
          'stroke-width': 0.7,
        }, svg);

        for (let j = 0; j < count; j++) {
          rocketEngine(
            startX + j * spacing,
            y + 3,
            Math.min(13, block.width / count + 4),
            svg
          );
        }

        y += block.height;
        break;
      }
    }
  }

  return svg;
}


function bar(label, value, max, text, ok) {
  return el('div', { class: 'bar' },
    el('div', { class: 'bar-head' }, el('span', {}, label), el('span', { class: ok ? '' : 'bad' }, text)),
    el('div', { class: 'bar-track' }, el('div', { class: `bar-fill ${ok ? 'ok' : 'bad'}`, style: `width:${Math.min(100, (value / max) * 100)}%` })));
}

export function renderHangar(state, ui, act) {
  const { design } = state;
  const stats = designStats(design);
  const issues = validateDesign(design);
  const stageIndex = ui.stage;

  const usedStages = stats.rocket.stages.length;
  const table = el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['Estágio', 'Massa total', 'Δv', 'TWR'].map((h) => el('th', {}, h)))),
    el('tbody', {}, stats.stages.map((s, i) => el('tr', {},
      el('td', {}, `${i + 1}${i === 0 ? ' (base)' : i === usedStages - 1 ? ' (topo)' : ''}`),
      el('td', {}, `${fmt(s.m0, 1)} t`),
      el('td', {}, `${fmt(s.deltaV)} m/s`),
      el('td', { class: i === 0 && s.twr < MISSION.minLiftoffTWR ? 'bad' : '' }, fmt(s.twr, 2))))));

  const stageTabs = el('div', { class: 'tabs', role: 'tablist' },
    [2, 1, 0].map((i) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(i === stageIndex), class: i === stageIndex ? 'tab on' : 'tab', onclick: () => act((s, u) => (u.stage = i)) },
      `Estágio ${i + 1}${i === 0 ? ' (base)' : i === 2 ? ' (topo)' : ''} · ${design.stages[i].length} peças`)));

  const stageParts = el('div', { class: 'chips' },
    design.stages[stageIndex].length === 0 ? el('span', { class: 'muted' }, 'Estágio vazio: clique em tanques e motores abaixo.') : null,
    design.stages[stageIndex].map((id, k) => el('button', { type: 'button', class: 'chip', title: 'Remover', onclick: () => act((s) => s.design.stages[stageIndex].splice(k, 1)) }, `${rocketPart(id).name} ✕`)));

  const probeChips = el('div', { class: 'chips' },
    design.probe.map((id, k) => el('button', { type: 'button', class: 'chip gold', title: 'Remover', onclick: () => act((s) => s.design.probe.splice(k, 1)) }, `${probePart(id).name} ✕`)));

  return el('div', { class: 'hangar hangar-fullscreen' },
    el('div', { class: 'hangar-scene-layer' },
      el('div', { id: 'hangar-3d', class: 'hangar-3d-view', 'aria-label': 'Hangar industrial 3D e foguete montado com as peças selecionadas' }),
      el('div', { class: 'hangar-scene-vignette' })),
    el('section', { class: 'catalog hangar-overlay catalog-overlay' },
      el('div', { class: 'overlay-title' }, el('span', { class: 'eyebrow' }, 'MISSION ARCHITECT'), el('h2', {}, 'Montagem do veículo'), el('p', { class: 'muted' }, 'Componentes visuais procedurais; não são modelos CAD oficiais. O rover NASA é exibido separadamente.')),
      stageTabs,
      el('h3', {}, `Estágio ${stageIndex + 1} · componentes instalados`),
      stageParts,
      el('h3', {}, 'Propulsão e estrutura'),
      el('div', { class: 'grid parts-grid' }, ROCKET_PARTS.map((p) => partCard(p.name, p.kind === 'tank' ? 'Tanque pressurizado' : 'Motor-foguete', rocketLines(p), p.flavor, () => act((s) => s.design.stages[stageIndex].push(p.id)), false, p.id, p.kind))),
      el('h3', {}, 'Sonda científica'),
      probeChips,
      el('div', { class: 'grid parts-grid probe-grid' }, PROBE_PARTS.map((p) => {
        const has = design.probe.includes(p.id);
        return partCard(p.name, CATEGORY[p.category], probeLines(p), p.flavor, () => act((s) => {
          const n = s.design.probe.filter((id) => id === p.id).length;
          if (n >= (p.max ?? 1)) s.design.probe.splice(s.design.probe.lastIndexOf(p.id), 1);
          else s.design.probe.push(p.id);
        }), has, p.id, p.category);
      })),
      el('p', { class: 'muted' }, 'Massas, custos e desempenho seguem o modelo educacional do simulador.'),
      el('section', { class: 'nasa-resource-card' },
        el('span', { class: 'eyebrow' }, 'RECURSOS OFICIAIS NASA'),
        el('p', {}, 'Consulte modelos 3D oficiais e baixe arquivos compatíveis para adicioná-los ao catálogo local do hangar.'),
        el('a', { class: 'btn small', href: NASA_RESOURCES.modelsCatalog, target: '_blank', rel: 'noopener noreferrer' }, 'NASA 3D Resources ↗'),
        el('a', { class: 'resource-text-link', href: NASA_RESOURCES.githubCatalog, target: '_blank', rel: 'noopener noreferrer' }, 'Catálogo no GitHub'),
        el('p', {}, 'O único ativo 3D oficial registrado aqui é o rover Perseverance. Em caso de falha de rede, aparece uma representação genérica explicitamente ilustrativa. Tanques e motores do foguete são geometrias procedurais e não têm modelos oficiais verificados neste projeto.'),
        el('a', { class: 'resource-text-link', href: NASA_RESOURCES.perseveranceModel, target: '_blank', rel: 'noopener noreferrer' }, 'Fonte do modelo Perseverance ↗'))),
    el('aside', { class: 'summary hangar-overlay summary-overlay' },
      el('div', { class: 'hangar-3d-heading' }, el('span', { class: 'eyebrow' }, 'VISUALIZAÇÃO AO VIVO'), el('span', { class: 'muted' }, 'Arraste para orbitar · scroll para zoom')),
      bar('Δv total', stats.totalDeltaV, stats.requiredDeltaV, `${fmt(stats.totalDeltaV)} / ${fmt(stats.requiredDeltaV)} m/s`, stats.totalDeltaV >= stats.requiredDeltaV),
      bar('Orçamento', stats.cost, stats.budget, `US$ ${fmt(stats.cost)} / US$ ${fmt(stats.budget)} M`, stats.cost <= stats.budget),
      bar('TWR na decolagem', stats.liftoffTWR, MISSION.minLiftoffTWR, fmt(stats.liftoffTWR, 2), stats.liftoffTWR >= MISSION.minLiftoffTWR),
      el('p', { class: 'muted' }, `Massa na plataforma: ${fmt(stats.totalMass, 1)} t · sonda: ${fmt(stats.probe.mass)} kg`),
      el('section', { class: 'learning-card', 'aria-live': 'polite' },
        el('span', { class: 'eyebrow' }, 'APRENDER MONTANDO'),
        el('h3', {}, stats.liftoffTWR < MISSION.minLiftoffTWR ? 'O foguete consegue sair do chão?' : 'Você tem empuxo para decolar'),
        el('p', {}, stats.liftoffTWR < MISSION.minLiftoffTWR
          ? `Seu TWR é ${fmt(stats.liftoffTWR, 2)}. O motor ainda não gera força suficiente em relação ao peso total. Tente aumentar o empuxo ou reduzir a massa.`
          : `Seu TWR é ${fmt(stats.liftoffTWR, 2)}: o empuxo supera o peso na decolagem. Tanques maiores ajudam a carregar propelente, mas também deixam o veículo mais pesado.`),
        el('details', {}, el('summary', {}, 'Por que isso acontece?'),
          el('p', { class: 'formula' }, 'TWR = empuxo ÷ peso'),
          el('p', {}, 'Acima de 1, o empuxo vence a gravidade no modelo do jogo. Já o Δv estima quanto a velocidade pode mudar: mais propelente ajuda, mas a massa seca dos tanques também precisa ser acelerada.'))),
      stats.stages.length ? el('details', {}, el('summary', {}, 'Detalhes por estágio'), table) : null,
      el('details', { class: 'svg-fallback' }, el('summary', {}, 'Esquema técnico 2D'), stackSvg(design)),
      el('h3', {}, 'Checklist'),
      issues.length
        ? el('ul', { class: 'issues' }, issues.map((i) => el('li', { class: i.severity }, `${i.severity === 'error' ? '✕' : '!'} ${i.message}`)))
        : el('p', { class: 'good' }, 'Tudo certo para lançar.'),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn ghost', onclick: () => act((s) => (s.phase = 'briefing')) }, 'Voltar'),
        el('button', { type: 'button', class: 'btn primary', disabled: !canLaunch(issues), onclick: () => act((s) => launch(s)) }, 'Lançar'))));

}
