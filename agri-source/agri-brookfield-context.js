/* Brookfield map context patch.
   Restores the farmer-supplied tree-block corridor that physically joins the
   upper and lower Brookfield grazing areas. Mark has confirmed Pines,
   Blackberry and Swamp must also be responsive in the portal so the breeding
   mob can be placed into them when they are used as grazing/shelter areas.
   They remain visually identified as tree blocks rather than ordinary paddocks. */
(function installBrookfieldContext() {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const TREE_BLOCKS = [
    {
      name: 'Pines',
      hectares: 5.4,
      path: 'M307,444 L347,396 L370,362 L402,377 L423,371 L452,386 L483,392 L531,411 L569,424 L570,615 L550,632 L530,622 L505,560 L490,505 L475,478 L457,455 L420,443 L363,459 L310,447 Z',
      x: 515,
      y: 465,
    },
    {
      name: 'Blackberry',
      hectares: 5.3,
      path: 'M270,488 L303,446 L310,447 L363,459 L418,451 L449,461 L464,475 L457,499 L481,596 L493,609 L519,625 L510,650 L486,670 L473,678 L417,675 L385,656 L360,625 L342,590 L325,548 L300,515 L270,500 Z',
      x: 390,
      y: 535,
    },
    {
      name: 'Swamp',
      hectares: 0.9,
      path: 'M500,650 L519,625 L545,635 L559,654 L568,682 L562,742 L555,806 L542,781 L528,744 L514,711 Z',
      x: 538,
      y: 704,
    },
  ];

  function brookfieldVisible() {
    const selector = document.getElementById('mark-block-select');
    return !selector || selector.value === 'brookfield';
  }

  function blockState() {
    try {
      return decisionIntel()?.paddock_decisions?.find((item) => item?.block_id === 'brookfield')?.map_state || 'go';
    } catch {
      return 'go';
    }
  }

  function makeText(text, x, y, size, weight, className) {
    const node = document.createElementNS(SVG_NS, 'text');
    node.setAttribute('x', String(x));
    node.setAttribute('y', String(y));
    node.setAttribute('text-anchor', 'middle');
    node.setAttribute('font-size', String(size));
    node.setAttribute('font-weight', String(weight));
    node.setAttribute('fill', '#dfe8db');
    node.setAttribute('paint-order', 'stroke');
    node.setAttribute('stroke', 'rgba(8, 15, 12, .86)');
    node.setAttribute('stroke-width', '3');
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('class', className);
    node.textContent = text;
    return node;
  }

  function renderDetail(area, shape) {
    document.querySelectorAll('#mark-map-stage .mark-paddock.selected')
      .forEach((item) => item.classList.remove('selected'));
    shape.classList.add('selected');

    const target = document.getElementById('mark-map-detail');
    if (!target) return;
    const state = blockState().toUpperCase();
    target.innerHTML = `
      <div><span>Selected management area</span><strong>${area.name} · ${area.hectares.toFixed(1)} ha</strong></div>
      <div><span>Current operating state</span><strong>${state} · Brookfield block-level live weather</strong></div>
      <div><span>Area context</span><strong>Tree block / shelter area · responsive for mob placement and grazing history.</strong></div>`;
  }

  function makeArea(area) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('data-mark-paddock', area.name);
    group.setAttribute('data-mark-context', 'tree-block');
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    group.setAttribute('aria-label', `${area.name} tree block, ${area.hectares.toFixed(1)} hectares`);

    // A wider invisible copy makes drop/tap targeting reliable, especially on Swamp.
    const hit = document.createElementNS(SVG_NS, 'path');
    hit.setAttribute('d', area.path);
    hit.setAttribute('fill', 'rgba(0,0,0,0.001)');
    hit.setAttribute('stroke', 'rgba(0,0,0,0.001)');
    hit.setAttribute('stroke-width', area.name === 'Swamp' ? '22' : '14');
    hit.setAttribute('vector-effect', 'non-scaling-stroke');
    hit.setAttribute('data-paddock-hit', area.name);
    hit.style.cursor = 'pointer';
    group.appendChild(hit);

    const shape = document.createElementNS(SVG_NS, 'path');
    shape.setAttribute('d', area.path);
    shape.setAttribute('class', 'mark-paddock tree-block');
    shape.setAttribute('data-paddock', area.name);
    shape.setAttribute('data-management-area', 'tree-block');
    shape.setAttribute('vector-effect', 'non-scaling-stroke');
    group.appendChild(shape);

    group.appendChild(makeText(area.name, area.x, area.y, area.name === 'Swamp' ? 10 : 13, 700, 'mark-label'));
    group.appendChild(makeText(`${area.hectares.toFixed(1)} ha`, area.x, area.y + (area.name === 'Swamp' ? 12 : 15), area.name === 'Swamp' ? 8 : 10, 500, 'mark-label-ha'));

    group.addEventListener('click', () => renderDetail(area, shape));
    group.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      shape.click();
    });
    return group;
  }

  function install() {
    if (!brookfieldVisible()) return;
    const stage = document.getElementById('mark-map-stage');
    const svg = stage?.querySelector('svg');
    if (!svg || svg.querySelector('[data-brookfield-context]')) return;

    const context = document.createElementNS(SVG_NS, 'g');
    context.setAttribute('data-brookfield-context', 'tree-blocks');
    context.setAttribute('aria-label', 'Brookfield tree blocks connecting the farm');
    TREE_BLOCKS.forEach((area) => context.appendChild(makeArea(area)));
    svg.insertBefore(context, svg.firstChild);
  }

  const observer = new MutationObserver(() => window.requestAnimationFrame(install));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', install);
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'mark-block-select') window.setTimeout(install, 0);
  });
  window.setTimeout(install, 400);
})();
