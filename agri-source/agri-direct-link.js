/* Clean direct-link entry for explicitly allowlisted Agri pilots.
   Existing access-code clients continue to use the normal portal gate. */
(function installAgriDirectLink() {
  const DIRECT_LINK_SENTINEL = 'DIRECT_LINK_PILOT';

  function requestedClient() {
    return String(new URLSearchParams(window.location.search).get('client') || '')
      .trim()
      .toLowerCase();
  }

  function showLoading(gate) {
    const card = gate?.querySelector('.gate-card');
    if (!card) return;
    card.innerHTML = `
      <div class="gate-logo">PYTHOLOGY</div>
      <h1>Farm Intelligence</h1>
      <p>Loading the latest farm picture…</p>
    `;
  }

  function showUnavailable(gate, message) {
    gate?.classList.remove('hidden');
    const card = gate?.querySelector('.gate-card');
    if (!card) return;
    card.innerHTML = `
      <div class="gate-logo">PYTHOLOGY</div>
      <h1>Farm Intelligence</h1>
      <p>${escapeHtml(message || 'The farm view is not available yet.')}</p>
      <button class="primary-button" type="button" id="direct-link-retry">Try again</button>
    `;
    document.getElementById('direct-link-retry')?.addEventListener('click', () => window.location.reload());
  }

  function renderCoreFallback() {
    const client = portalState.client || {};
    const dataClient = portalState.data?.client || {};
    const displayName = client.name || dataClient.name || client.id || 'Farm Intelligence';
    const contactName = client.contact_name || dataClient.contact_name || '';
    setText('farm-name', displayName);
    setText('farm-subtitle', [contactName ? `Welcome, ${contactName}` : '', client.region || dataClient.region || ''].filter(Boolean).join(' · '));
    setText('updated', portalState.data?.generated_display ? `LIVE FARM CONDITIONS · ${portalState.data.generated_display}` : 'LIVE FARM CONDITIONS');

    renderDecisionBanner();
    renderStats();
    renderRecommendations();
    renderAlerts();
    renderPlanner();
    renderTrialEvidence();
    renderSummary();
    if (document.getElementById('map')) renderMap();

    const banner = document.getElementById('weather-refresh-banner');
    if (banner) {
      banner.hidden = false;
      banner.classList.add('mark-live-banner');
      banner.innerHTML = '<strong>Live farm intelligence active.</strong> The core farm view is loaded while an enhanced presentation layer recovers.';
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const clientId = requestedClient();
    if (!clientId) return;

    const gate = document.getElementById('gate');
    const portal = document.getElementById('portal');
    const logout = document.getElementById('logout');
    showLoading(gate);

    try {
      await openFarm(clientId, '');
      if (portalState.client?.access_mode !== 'direct_link') return;

      portalState.accessCode = DIRECT_LINK_SENTINEL;
      history.replaceState({}, '', `${window.location.pathname}?client=${encodeURIComponent(clientId)}`);
      gate?.classList.add('hidden');
      portal?.classList.remove('hidden');
      if (logout) logout.hidden = true;

      try {
        renderPortal();
      } catch (renderError) {
        console.error('Enhanced Agri portal render failed; using core fallback.', renderError);
        try {
          renderCoreFallback();
        } catch (fallbackError) {
          console.error('Core Agri fallback render failed.', fallbackError);
          portal?.classList.add('hidden');
          showUnavailable(gate, 'Farm data arrived, but the page could not finish drawing. Please try again.');
        }
      }
    } catch (error) {
      portal?.classList.add('hidden');
      showUnavailable(gate, error?.message || 'Farm intelligence could not be opened.');
    }
  });
})();
