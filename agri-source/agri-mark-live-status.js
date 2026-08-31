/* Mark pilot live-status truth layer.
   The Mark-only server request-time feed is authoritative while the legacy
   browser overlay remains in the handover map layer. Keep the farmer-facing
   status aligned with the feed actually driving the portal without observers. */
(function installMarkLiveStatus() {
  const CLIENT_ID = 'brookfield-newfield-pilot';

  function requestedClient() {
    return String(new URLSearchParams(window.location.search).get('client') || '')
      .trim()
      .toLowerCase();
  }

  if (requestedClient() !== CLIENT_ID) return;

  function state() {
    return typeof portalState === 'undefined' ? null : portalState;
  }

  function formatStamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'current';
    return date.toLocaleString('en-NZ', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit',
    });
  }

  function healthyRefresh(refresh) {
    return refresh && (
      refresh.status === 'online'
      || refresh.status === 'live_overlay'
      || refresh.mode === 'request_time_failover'
    );
  }

  function applyTruthfulStatus() {
    const current = state();
    if (current?.client?.id !== CLIENT_ID) return;
    const refresh = current?.data?.weather_refresh;
    if (!healthyRefresh(refresh)) return;

    const stamp = refresh.last_success || current?.data?.generated;
    const liveText = formatStamp(stamp);
    const desired = `<strong>Live farm intelligence active.</strong> Brookfield & Newfield conditions refreshed ${liveText} · portal rechecks every 5 minutes. Soil and pasture values are modelled estimates; field observations remain authoritative.`;

    const banner = document.getElementById('weather-refresh-banner');
    if (banner) {
      if (banner.innerHTML !== desired) banner.innerHTML = desired;
      if (banner.hidden) banner.hidden = false;
      if (!banner.classList.contains('mark-live-banner')) banner.classList.add('mark-live-banner');
    }

    const updated = document.getElementById('updated');
    if (updated && stamp) {
      const date = new Date(stamp);
      if (!Number.isNaN(date.getTime())) {
        const desiredUpdated = `LIVE FARM CONDITIONS ${date.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}`;
        if (updated.textContent !== desiredUpdated) updated.textContent = desiredUpdated;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.setTimeout(applyTruthfulStatus, 250);
    window.setInterval(applyTruthfulStatus, 500);
  });
})();
