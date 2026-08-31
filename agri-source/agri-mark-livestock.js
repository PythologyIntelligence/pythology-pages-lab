/* Mark pilot livestock, calving and grazing management layer.
   Adds a known-stock operating picture and a pilot grazing log without claiming
   precise feed allocation before Mark supplies pasture/BCS/feed inputs. */
(function installMarkLivestockGrazing() {
  const CLIENT_ID = 'brookfield-newfield-pilot';
  const STORAGE_KEY = 'pythology:agri:brookfield-newfield-pilot:grazing-v1';
  const DEFAULT_BULLS = 2;
  const DEFAULT_STEERS = 5;
  let moveMode = false;
  let drag = null;
  let mapObserver = null;
  let observedPanel = null;
  let suppressClickUntil = 0;
  let syncQueued = false;

  function isMark() {
    return portalState?.client?.id === CLIENT_ID;
  }

  function escape(value) {
    return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '');
  }

  function profile() {
    return decisionIntel()?.profile_context || {};
  }

  function livestock() {
    return profile().livestock || {};
  }

  function seasonal() {
    return profile().seasonal_management || {};
  }

  function farmList() {
    return Array.isArray(profile().farms) ? profile().farms : [];
  }

  function n(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function nzDateLabel(value) {
    if (!value) return 'Not supplied';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00+12:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function daysToCalving() {
    const due = seasonal().calving_due_from;
    if (!due) return null;
    const target = new Date(`${String(due).slice(0, 10)}T00:00:00+12:00`);
    if (Number.isNaN(target.getTime())) return null;
    return Math.ceil((target.getTime() - Date.now()) / 86400000);
  }

  function calvingState(days) {
    if (days == null) return { label: 'Calving date not supplied', badge: 'CALVING' };
    if (days > 42) return { label: `Calving starts in ${days} days`, badge: `${days} DAYS` };
    if (days > 1) return { label: `Late pregnancy · calving starts in ${days} days`, badge: `${days} DAYS` };
    if (days === 1) return { label: 'Late pregnancy · calving starts tomorrow', badge: '1 DAY' };
    if (days === 0) return { label: 'Calving start date is today', badge: 'TODAY' };
    return { label: 'Calving window open · end date not yet supplied', badge: 'CALVING' };
  }

  function totalMappedArea() {
    const values = farmList().map((farm) => n(farm?.mapped_hectares ?? farm?.hectares, 0));
    const total = values.reduce((sum, value) => sum + value, 0);
    return total > 0 ? total : 149.4;
  }

  function totalMappedPaddocks() {
    const counts = farmList().map((farm) => n(farm?.mapped_paddock_count, Array.isArray(farm?.paddocks) ? farm.paddocks.length : 0));
    const total = counts.reduce((sum, value) => sum + value, 0);
    return total > 0 ? total : 46;
  }

  function currentFarmName(id) {
    return farmList().find((farm) => farm?.id === id)?.name
      || (id === 'brookfield' ? 'Brookfield' : id === 'newfield' ? 'Newfield' : id || 'Farm');
  }

  function loadGrazingState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        current: parsed?.current && typeof parsed.current === 'object' ? parsed.current : null,
        history: Array.isArray(parsed?.history) ? parsed.history.slice(-80) : [],
      };
    } catch {
      return { current: null, history: [] };
    }
  }

  function saveGrazingState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        current: state.current || null,
        history: (state.history || []).slice(-80),
      }));
    } catch {
      // Pilot remains usable even when browser storage is unavailable.
    }
  }

  function formatMovementTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'time not recorded';
    return date.toLocaleString('en-NZ', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit',
    });
  }

  function restDaysFor(state, farmId, paddock) {
    if (state.current?.farm_id === farmId && state.current?.paddock === paddock) return 0;
    const prior = [...(state.history || [])].reverse().find((entry) => (
      entry?.farm_id === farmId && entry?.paddock === paddock && entry?.exited_at
    ));
    if (!prior) return null;
    const exited = new Date(prior.exited_at).getTime();
    if (!Number.isFinite(exited)) return null;
    return Math.max(0, Math.floor((Date.now() - exited) / 86400000));
  }

  function assignMob(farmId, paddock) {
    if (!farmId || !paddock) return;
    const state = loadGrazingState();
    if (state.current?.farm_id === farmId && state.current?.paddock === paddock) {
      moveMode = false;
      document.documentElement.classList.remove('mark-mob-moving');
      queueSync();
      return;
    }

    const now = new Date().toISOString();
    if (state.current?.farm_id && state.current?.paddock) {
      state.history.push({
        ...state.current,
        exited_at: now,
      });
    }
    state.current = {
      farm_id: farmId,
      paddock,
      entered_at: now,
    };
    saveGrazingState(state);
    moveMode = false;
    document.documentElement.classList.remove('mark-mob-moving');

    const stage = document.getElementById('mark-map-stage');
    const group = [...(stage?.querySelectorAll('[data-mark-paddock]') || [])]
      .find((item) => item.dataset.markPaddock === paddock);
    const path = group?.querySelector('path[data-paddock]');
    if (path) window.setTimeout(() => path.click(), 0);
    queueSync();
  }

  function livestockMarkup() {
    const stock = livestock();
    const cows = stock.breeding_cows || {};
    const bulls = stock.breeding_bulls || {};
    const steers = stock.yearling_steers || {};
    const count = n(cows.head_count, 118);
    const weight = n(cows.average_liveweight_kg, 580);
    const totalKg = count != null && weight != null ? count * weight : null;
    const bullsCount = n(bulls.head_count, DEFAULT_BULLS);
    const steersCount = n(steers.head_count, DEFAULT_STEERS);
    const days = daysToCalving();
    const state = calvingState(days);
    const calvingPaddocks = Array.isArray(seasonal().saved_calving_paddocks)
      ? seasonal().saved_calving_paddocks
      : ['Back', 'Tank', 'Greens'];
    const feed = decisionIntel()?.feed_planning_readiness || {};
    const missing = new Set(feed.missing_inputs || []);
    const area = totalMappedArea();
    const paddocks = totalMappedPaddocks();

    return `
      <div class="panel-title mark-livestock-title">Livestock & calving <span>${escape(state.badge)}</span></div>
      <div class="mark-calving-hero">
        <div><span>Breeding mob</span><strong>${count ?? '—'} Angus cows</strong><small>${weight ?? '—'} kg average · ${totalKg == null ? '—' : (totalKg / 1000).toFixed(1)} t liveweight</small></div>
        <div><span>Calving</span><strong>${escape(nzDateLabel(seasonal().calving_due_from || '2026-09-01'))}</strong><small>${escape(state.label)}</small></div>
      </div>
      <div class="mark-stock-strip">
        <span><small>Bulls</small><strong>${bullsCount ?? '—'}</strong><em>mob association to confirm</em></span>
        <span><small>Yearling steers</small><strong>${steersCount ?? '—'}</strong><em>weight still needed</em></span>
        <span><small>Mapped paddocks</small><strong>${paddocks}</strong><em>${area.toFixed(1)} ha mapped</em></span>
      </div>
      <div class="mark-calving-paddocks"><span>Saved calving paddocks</span><strong>${calvingPaddocks.map(escape).join(' · ') || 'Not yet supplied'}</strong></div>
      <div class="mark-readiness-grid">
        <article class="ready"><span>Demand baseline</span><strong>${totalKg == null ? 'Waiting' : 'Ready'}</strong><p>${totalKg == null ? 'Cow liveweight baseline is incomplete.' : `Agri now has ${count} × ${weight} kg as the breeding-mob demand basis.`}</p></article>
        <article class="${missing.size ? 'waiting' : 'ready'}"><span>Precise feed allocation</span><strong>${missing.size ? 'Needs Mark' : 'Initial estimate ready'}</strong><p>${missing.size ? 'Still needs BCS, pasture cover/quality and supplements before Agri gives kg DM or ha/day advice.' : 'Configured feed inputs are sufficient for an initial guarded estimate.'}</p></article>
        <article class="waiting"><span>Paddock pugging model</span><strong>Partly ready</strong><p>The 68.4 t breeding-mob pressure is known; paddock soil/drainage behaviour is the key missing layer.</p></article>
        <article class="waiting"><span>30 / 60 / 90 feed budget</span><strong>Framework ready</strong><p>Pasture-growth supply is live. Current pasture cover/residual and feed quality are still needed before projecting a true surplus or deficit.</p></article>
      </div>`;
  }

  function ensureLivestockSection() {
    if (!isMark()) return;
    const panel = document.querySelector('.intel-panel');
    if (!panel) return;
    let section = document.getElementById('mark-livestock-section');
    if (!section) {
      section = document.createElement('section');
      section.className = 'panel-section mark-livestock-section';
      section.id = 'mark-livestock-section';
      panel.insertBefore(section, panel.firstChild);
    }
    const markup = livestockMarkup();
    if (section.dataset.signature !== markup) {
      section.innerHTML = markup;
      section.dataset.signature = markup;
    }
  }

  function selectedFarmId() {
    return document.getElementById('mark-block-select')?.value || 'brookfield';
  }

  function selectedPaddockName() {
    const selected = document.querySelector('#mark-map-stage .mark-paddock.selected');
    return selected?.dataset?.paddock || null;
  }

  function mobChipText(state) {
    if (!state.current) return moveMode ? 'Tap a paddock to place 118-cow mob' : '118-cow mob · unassigned';
    const where = `${currentFarmName(state.current.farm_id)} · ${state.current.paddock}`;
    return moveMode ? `Move 118-cow mob from ${where}` : `118-cow mob · ${where}`;
  }

  function ensureMobControl() {
    const toolbar = document.querySelector('.mark-map-toolbar');
    if (!toolbar) return null;
    let control = toolbar.querySelector('#mark-mob-control');
    if (!control) {
      control = document.createElement('div');
      control.className = 'mark-mob-control';
      control.id = 'mark-mob-control';
      control.innerHTML = `
        <span class="mark-mob-control-label">Grazing log</span>
        <button type="button" class="mark-mob-chip" id="mark-mob-chip" aria-describedby="mark-mob-help">
          <span class="mark-mob-icon" aria-hidden="true">🐄</span><strong></strong>
        </button>
        <small id="mark-mob-help">Drag onto a paddock, or tap then choose a paddock.</small>`;
      const badge = toolbar.querySelector('.mark-map-badge');
      toolbar.insertBefore(control, badge || null);
      wireMobChip(control.querySelector('#mark-mob-chip'));
    }
    const state = loadGrazingState();
    const strong = control.querySelector('.mark-mob-chip strong');
    const desired = mobChipText(state);
    if (strong && strong.textContent !== desired) strong.textContent = desired;
    control.querySelector('.mark-mob-chip')?.classList.toggle('moving', moveMode);
    return control;
  }

  function clearDropTarget() {
    document.querySelectorAll('.mob-drop-target').forEach((item) => item.classList.remove('mob-drop-target'));
  }

  function groupAtPoint(x, y) {
    const under = document.elementFromPoint(x, y);
    return under?.closest?.('#mark-map-stage [data-mark-paddock]') || null;
  }

  function finishDrag(event, cancelled = false) {
    if (!drag) return;
    const group = cancelled ? null : groupAtPoint(event.clientX, event.clientY);
    drag.ghost?.remove();
    clearDropTarget();
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8;
    try { drag.button.releasePointerCapture?.(drag.pointerId); } catch {}
    drag = null;
    if (moved) suppressClickUntil = Date.now() + 450;
    if (group && moved) {
      assignMob(selectedFarmId(), group.dataset.markPaddock);
      suppressClickUntil = Date.now() + 450;
    }
  }

  function wireMobChip(button) {
    if (!button || button.dataset.mobWired) return;
    button.dataset.mobWired = 'true';

    button.addEventListener('click', () => {
      if (Date.now() < suppressClickUntil) return;
      moveMode = !moveMode;
      document.documentElement.classList.toggle('mark-mob-moving', moveMode);
      queueSync();
    });

    button.addEventListener('pointerdown', (event) => {
      if (event.button != null && event.button !== 0) return;
      const ghost = button.cloneNode(true);
      ghost.removeAttribute('id');
      ghost.classList.add('mark-mob-drag-ghost');
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
      document.body.appendChild(ghost);
      drag = {
        button,
        ghost,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      try { button.setPointerCapture?.(event.pointerId); } catch {}
      event.preventDefault();
    });

    button.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.ghost.style.left = `${event.clientX}px`;
      drag.ghost.style.top = `${event.clientY}px`;
      clearDropTarget();
      groupAtPoint(event.clientX, event.clientY)?.classList.add('mob-drop-target');
    });

    button.addEventListener('pointerup', (event) => finishDrag(event));
    button.addEventListener('pointercancel', (event) => finishDrag(event, true));
  }

  function makeSmallPaddockHit(group) {
    if (group.querySelector('[data-paddock-hit]')) return;
    const path = group.querySelector('path[data-paddock]');
    const label = group.querySelector('.mark-label');
    if (!path || !label) return;
    const paddock = path.dataset.paddock;
    const farmId = selectedFarmId();
    const farm = farmList().find((item) => item?.id === farmId);
    const area = n(farm?.paddocks?.find((item) => item?.name === paddock)?.hectares, null);
    const knownTiny = farmId === 'brookfield' && ['Yard', 'House'].includes(paddock);
    if ((area == null && !knownTiny) || (area != null && area >= 0.9)) return;
    const x = n(label.getAttribute('x'), null);
    const y = n(label.getAttribute('y'), null);
    if (x == null || y == null) return;
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hit.setAttribute('cx', String(x));
    hit.setAttribute('cy', String(y));
    hit.setAttribute('r', '16');
    hit.setAttribute('fill', 'rgba(0,0,0,0.001)');
    hit.setAttribute('data-paddock-hit', paddock);
    hit.setAttribute('aria-hidden', 'true');
    group.insertBefore(hit, label);
  }

  function decoratePaddocks() {
    const groups = document.querySelectorAll('#mark-map-stage [data-mark-paddock]');
    groups.forEach((group) => {
      group.setAttribute('role', 'button');
      group.setAttribute('tabindex', '0');
      group.setAttribute('aria-label', `${group.dataset.markPaddock} paddock`);
      group.querySelectorAll('.mark-label,.mark-label-ha').forEach((label) => {
        label.style.pointerEvents = 'auto';
        label.style.cursor = 'pointer';
      });
      makeSmallPaddockHit(group);
    });
  }

  function renderMobMarker() {
    const svg = document.querySelector('#mark-map-stage svg');
    if (!svg) return;
    const state = loadGrazingState();
    const farmId = selectedFarmId();
    const signature = state.current?.farm_id === farmId
      ? `${farmId}:${state.current.paddock}:${state.current.entered_at}`
      : `${farmId}:none`;
    if (svg.dataset.mobMarkerSignature === signature) return;
    svg.querySelector('[data-mob-marker]')?.remove();
    svg.dataset.mobMarkerSignature = signature;

    if (state.current?.farm_id !== farmId || !state.current?.paddock) return;
    const group = [...svg.querySelectorAll('[data-mark-paddock]')]
      .find((item) => item.dataset.markPaddock === state.current.paddock);
    const label = group?.querySelector('.mark-label');
    const x = n(label?.getAttribute('x'), null);
    const y = n(label?.getAttribute('y'), null);
    if (x == null || y == null) return;

    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    marker.setAttribute('data-mob-marker', 'breeding-cows');
    marker.setAttribute('class', 'mark-mob-marker');
    marker.setAttribute('transform', `translate(${x} ${y - 34})`);
    marker.style.pointerEvents = 'none';

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '-38');
    rect.setAttribute('y', '-14');
    rect.setAttribute('width', '76');
    rect.setAttribute('height', '25');
    rect.setAttribute('rx', '12.5');
    marker.appendChild(rect);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', '3');
    text.setAttribute('text-anchor', 'middle');
    text.textContent = '🐄 118 COWS';
    marker.appendChild(text);
    svg.appendChild(marker);
  }

  function syncGrazingDetail() {
    const detail = document.getElementById('mark-map-detail');
    if (!detail) return;
    let item = detail.querySelector('#mark-grazing-detail');
    if (!item) {
      item = document.createElement('div');
      item.id = 'mark-grazing-detail';
      detail.appendChild(item);
    }
    const farmId = selectedFarmId();
    const paddock = selectedPaddockName();
    const state = loadGrazingState();
    let text = 'No movement history yet. Drag the breeding mob onto its current paddock to start the grazing log.';
    if (paddock) {
      if (state.current?.farm_id === farmId && state.current?.paddock === paddock) {
        text = `118-cow breeding mob is here · entered ${formatMovementTime(state.current.entered_at)}.`;
      } else {
        const rest = restDaysFor(state, farmId, paddock);
        text = rest == null
          ? 'No recorded grazing event for this paddock yet.'
          : `Rested ${rest} day${rest === 1 ? '' : 's'} since the breeding mob left.`;
      }
    }
    const signature = `${farmId}|${paddock}|${text}`;
    if (item.dataset.signature !== signature) {
      item.innerHTML = `<span>Grazing log</span><strong>${escape(text)}</strong>`;
      item.dataset.signature = signature;
    }
  }

  function ensureMapObserver() {
    const panel = document.querySelector('.map-panel');
    if (!panel || observedPanel === panel) return;
    mapObserver?.disconnect();
    observedPanel = panel;
    mapObserver = new MutationObserver(() => queueSync());
    mapObserver.observe(panel, { childList: true, subtree: true });
  }

  function syncMap() {
    if (!isMark()) return;
    ensureMobControl();
    decoratePaddocks();
    renderMobMarker();
    syncGrazingDetail();
    ensureMapObserver();
  }

  function syncAll() {
    if (!isMark()) return;
    ensureLivestockSection();
    syncMap();
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    window.requestAnimationFrame(() => {
      syncQueued = false;
      syncAll();
    });
  }

  document.addEventListener('click', (event) => {
    if (!isMark()) return;
    const group = event.target?.closest?.('#mark-map-stage [data-mark-paddock]');
    if (!group) return;

    if (moveMode) {
      event.preventDefault();
      event.stopPropagation();
      assignMob(selectedFarmId(), group.dataset.markPaddock);
      return;
    }

    if (!event.target.matches?.('path[data-paddock]')) {
      const path = group.querySelector('path[data-paddock]');
      if (path) {
        event.preventDefault();
        path.click();
      }
    }
    window.setTimeout(queueSync, 0);
  });

  document.addEventListener('keydown', (event) => {
    if (!isMark() || !['Enter', ' '].includes(event.key)) return;
    const group = event.target?.closest?.('#mark-map-stage [data-mark-paddock]');
    if (!group) return;
    event.preventDefault();
    if (moveMode) assignMob(selectedFarmId(), group.dataset.markPaddock);
    else group.querySelector('path[data-paddock]')?.click();
  });

  document.addEventListener('change', (event) => {
    if (event.target?.id === 'mark-block-select') window.setTimeout(queueSync, 0);
  });

  const baseRenderPortal = window.renderPortal;
  window.renderPortal = function renderMarkLivestockPortal() {
    baseRenderPortal();
    queueSync();
  };
})();
