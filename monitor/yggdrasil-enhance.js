(() => {
  const DATA_URL = "../data/yggdrasil_activity.json";

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  }

  function nzTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-NZ", {
      timeZone: "Pacific/Auckland",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .trade-ledger{grid-column:1/-1}
      .trade-table{width:100%;border-collapse:separate;border-spacing:0 7px}
      .trade-table th{text-align:left;padding:0 10px 5px;color:#5f7970;font-size:8px;letter-spacing:.13em;text-transform:uppercase;font-weight:900}
      .trade-table td{padding:11px 10px;background:#061512;border-top:1px solid #153633;border-bottom:1px solid #153633;color:#c7d8d1;font-size:11px;vertical-align:middle}
      .trade-table td:first-child{border-left:1px solid #153633;border-radius:10px 0 0 10px}
      .trade-table td:last-child{border-right:1px solid #153633;border-radius:0 10px 10px 0}
      .trade-market{font-family:Georgia,"Times New Roman",serif;font-size:17px!important;color:#edf7f1!important;font-weight:700}
      .trade-side{font-weight:900;letter-spacing:.05em}
      .trade-side.buy{color:#58d8a5}.trade-side.sell{color:#ef9a83}
      .trade-strategy{color:#d9b869!important;overflow-wrap:anywhere;max-width:360px}
      .trade-outcome{display:inline-flex;padding:5px 8px;border-radius:999px;border:1px solid #21443e;font-size:8px;font-weight:900;letter-spacing:.1em}
      .trade-outcome.win{color:#58d8a5;border-color:rgba(88,216,165,.30);background:rgba(88,216,165,.07)}
      .trade-outcome.loss{color:#ef7777;border-color:rgba(239,119,119,.30);background:rgba(239,119,119,.07)}
      .trade-outcome.opened{color:#6eb5cf;border-color:rgba(110,181,207,.30);background:rgba(110,181,207,.07)}
      .trade-outcome.flat,.trade-outcome.rule-flatten{color:#f2ba63;border-color:rgba(242,186,99,.30);background:rgba(242,186,99,.07)}
      .trade-empty{border:1px dashed #173b39;border-radius:13px;padding:18px;color:#91a9a0;font-size:11px;line-height:1.55}
      @media(max-width:760px){.trade-table thead{display:none}.trade-table,.trade-table tbody,.trade-table tr,.trade-table td{display:block;width:100%}.trade-table tr{margin-bottom:10px}.trade-table td{border-left:1px solid #153633!important;border-right:1px solid #153633!important;border-radius:0!important;padding:7px 10px}.trade-table td:first-child{border-radius:10px 10px 0 0!important;padding-top:11px}.trade-table td:last-child{border-radius:0 0 10px 10px!important;padding-bottom:11px}.trade-table td:before{content:attr(data-label);display:inline-block;min-width:86px;color:#5f7970;font-size:8px;letter-spacing:.1em;text-transform:uppercase;font-weight:900}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if (document.getElementById("tradeLedger")) return;
    const championPanel = document.querySelector(".panel.full");
    if (!championPanel) return;
    const panel = document.createElement("section");
    panel.className = "panel full trade-ledger";
    panel.id = "tradeLedger";
    panel.innerHTML = `
      <div class="panel-head">
        <div>
          <div class="eyebrow">Bifröst // Trade ledger</div>
          <div class="panel-title">What he has traded</div>
          <div class="panel-sub">Sanitised demo execution history. Exact prices, broker tickets, account values and cash P&amp;L remain private until System Control is authenticated.</div>
        </div>
        <span class="chip good" id="tradeLedgerChip">DEMO LEDGER</span>
      </div>
      <div id="tradeLedgerBody"><div class="trade-empty">No Yggdrasil trades have been published yet. That is perfectly normal before the authorised New York/London execution window opens.</div></div>`;
    championPanel.insertAdjacentElement("afterend", panel);
  }

  function outcomeClass(value) {
    return String(value || "").toLowerCase().replaceAll(" ", "-");
  }

  function renderTrades(data) {
    ensurePanel();
    const body = document.getElementById("tradeLedgerBody");
    if (!body) return;
    const trades = Array.isArray(data?.recentTrades) ? data.recentTrades : [];
    if (!trades.length) {
      body.innerHTML = `<div class="trade-empty">No Yggdrasil trades have been published yet. When Bifröst executes, this ledger will show the market, BUY/SELL direction, champion strategy, risk budget and eventual WIN / LOSS / FLAT outcome.</div>`;
      return;
    }

    body.innerHTML = `
      <table class="trade-table">
        <thead><tr><th>Time NZ</th><th>Market</th><th>Action</th><th>Strategy</th><th>Risk</th><th>Status</th></tr></thead>
        <tbody>${trades.map(t => {
          const side = String(t.side || t.kind || "—").toUpperCase();
          const status = t.outcome || t.state || t.kind || "—";
          const risk = Number.isFinite(Number(t.riskPct)) ? `${Number(t.riskPct).toFixed(3)}%` : "—";
          return `<tr>
            <td data-label="Time">${esc(nzTime(t.ts))}</td>
            <td data-label="Market" class="trade-market">${esc(t.symbol || "—")}</td>
            <td data-label="Action"><span class="trade-side ${side === "BUY" ? "buy" : side === "SELL" ? "sell" : ""}">${esc(side)}</span></td>
            <td data-label="Strategy" class="trade-strategy">${esc(t.strategyId || (t.kind === "EXIT" ? "broker-confirmed exit" : "—"))}</td>
            <td data-label="Risk">${esc(risk)}</td>
            <td data-label="Status"><span class="trade-outcome ${outcomeClass(status)}">${esc(status)}</span></td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;
  }

  async function refreshLedger() {
    try {
      const response = await fetch(`${DATA_URL}?ledger=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      renderTrades(data);
    } catch {
      // Main Yggdrasil page owns the visible telemetry-error state.
    }
  }

  function fixBanner() {
    const image = document.getElementById("heroImage");
    if (!image) return;
    image.style.display = "block";
    image.src = "https://pythology.co.nz/png_images/Yggdrasil.png";
  }

  document.addEventListener("DOMContentLoaded", () => {
    addStyles();
    ensurePanel();
    fixBanner();
    refreshLedger();
    setInterval(refreshLedger, 60000);
  });
})();
