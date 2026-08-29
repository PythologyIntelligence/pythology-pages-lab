(() => {
  'use strict';

  const state = {
    selectedDefault: false,
    cloudsOn: true,
    cloudOpacity: 0.55,
    scheduled: false,
  };

  const norm = (value) => String(value || '').trim().toLowerCase();
  const buttons = () => Array.from(document.querySelectorAll('button'));
  const byLabel = (label) => buttons().find((button) => norm(button.textContent) === label);
  const pressed = (button) => button?.getAttribute('aria-pressed') === 'true';

  function ensureStyle() {
    if (document.getElementById('earthnet-map-control-style')) return;
    const style = document.createElement('style');
    style.id = 'earthnet-map-control-style';
    style.textContent = `
      html[data-earthnet-clouds='off'] .earthnet-satellite-recent {
        opacity: 0 !important;
      }
      html[data-earthnet-clouds='on'] .earthnet-satellite-recent {
        opacity: var(--earthnet-cloud-opacity, .55) !important;
      }
      #earthnet-cloud-controls {
        position: fixed;
        top: 118px;
        right: 18px;
        z-index: 10050;
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 10px;
        background: rgba(7,20,38,.92);
        box-shadow: 0 14px 34px rgba(0,0,0,.32);
        backdrop-filter: blur(12px);
      }
      #earthnet-cloud-controls[hidden] { display: none !important; }
      #earthnet-cloud-controls button {
        min-height: 30px;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 7px;
        padding: 6px 9px;
        background: rgba(255,255,255,.025);
        color: #8aa0b6;
        font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: .08em;
        text-transform: uppercase;
        cursor: pointer;
      }
      #earthnet-cloud-controls button:hover,
      #earthnet-cloud-controls button:focus-visible {
        border-color: rgba(103,232,249,.30);
        color: #cffafe;
        outline: none;
      }
      #earthnet-cloud-controls button[aria-pressed='true'] {
        background: rgba(34,211,238,.10);
        color: #cffafe;
      }
      #earthnet-cloud-controls button:disabled {
        opacity: .38;
        cursor: default;
      }
      @media (max-width: 680px) {
        #earthnet-cloud-controls {
          top: 126px;
          right: 10px;
          max-width: calc(100vw - 20px);
          flex-wrap: wrap;
          justify-content: flex-end;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function applyCloudState() {
    document.documentElement.dataset.earthnetClouds = state.cloudsOn ? 'on' : 'off';
    document.documentElement.style.setProperty('--earthnet-cloud-opacity', String(state.cloudOpacity));

    const panel = document.getElementById('earthnet-cloud-controls');
    if (!panel) return;
    const toggle = panel.querySelector('[data-cloud-toggle]');
    const opacity = panel.querySelector('[data-cloud-opacity]');
    if (toggle) {
      toggle.textContent = state.cloudsOn ? 'Clouds on' : 'Clouds off';
      toggle.setAttribute('aria-pressed', String(state.cloudsOn));
    }
    if (opacity) {
      const solid = state.cloudOpacity > 0.7;
      opacity.textContent = solid ? 'Cloud solid' : 'Cloud 55%';
      opacity.setAttribute('aria-pressed', String(solid));
      opacity.disabled = !state.cloudsOn;
      opacity.title = solid ? 'Make the recent cloud-bearing satellite layer translucent' : 'Make the recent cloud-bearing satellite layer nearly opaque';
    }
  }

  function ensureCloudControls(satelliteButton) {
    let panel = document.getElementById('earthnet-cloud-controls');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'earthnet-cloud-controls';
      panel.setAttribute('aria-label', 'Satellite cloud controls');

      const clouds = document.createElement('button');
      clouds.type = 'button';
      clouds.dataset.cloudToggle = 'true';
      clouds.title = 'Show or hide the recent cloud-bearing satellite layer';
      clouds.addEventListener('click', () => {
        state.cloudsOn = !state.cloudsOn;
        applyCloudState();
      });

      const opacity = document.createElement('button');
      opacity.type = 'button';
      opacity.dataset.cloudOpacity = 'true';
      opacity.addEventListener('click', () => {
        state.cloudOpacity = state.cloudOpacity > 0.7 ? 0.55 : 0.92;
        applyCloudState();
      });

      panel.append(clouds, opacity);
      document.body.appendChild(panel);
      applyCloudState();
    }
    panel.hidden = !pressed(satelliteButton);
  }

  function ensureHomeButton(globalButton) {
    if (!globalButton?.parentElement) return;
    let home = document.getElementById('earthnet-home-button');
    if (home && home.parentElement !== globalButton.parentElement) home.remove();
    if (!home) {
      home = document.createElement('button');
      home.id = 'earthnet-home-button';
      home.type = 'button';
      home.className = globalButton.className;
      home.textContent = 'Home';
      home.title = 'Back to Pythology';
      home.setAttribute('aria-label', 'Back to Pythology home page');
      home.addEventListener('click', () => window.location.assign('../index.html'));
      globalButton.parentElement.insertBefore(home, globalButton);
    }
  }

  function reconcile() {
    state.scheduled = false;
    ensureStyle();

    const dark = byLabel('dark');
    const satellite = byLabel('satellite');
    const ocean = byLabel('ocean');
    const global = byLabel('global');

    if (dark) {
      dark.hidden = true;
      dark.style.display = 'none';
      dark.tabIndex = -1;
      dark.setAttribute('aria-hidden', 'true');
    }

    ensureHomeButton(global);

    if (satellite && !state.selectedDefault) {
      state.selectedDefault = true;
      if (!pressed(satellite)) satellite.click();
    } else if (dark && pressed(dark) && satellite) {
      satellite.click();
    }

    if (satellite) ensureCloudControls(satellite);
    else document.getElementById('earthnet-cloud-controls')?.setAttribute('hidden', '');

    if (ocean) ocean.title = 'Ocean bathymetry view';
  }

  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(reconcile);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-pressed'],
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }
})();
