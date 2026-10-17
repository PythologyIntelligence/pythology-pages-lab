import { esc, fmtAgo, clamp } from './util.js';

/**
 * Solar activity view.
 *
 * The Sun is the one object in this app that is not an event: it has no
 * footprint, no start and no end, only a condition. So it gets a panel that
 * reads as a station report rather than an incident — how it is right now,
 * what it has been doing, and what it looks like at this minute through four
 * instruments in orbit.
 */
export const SOLAR_URL = './media/feed/solar.json';

export const HEALTH_COLOR = {
  quiet: '#7dd3fc',
  unsettled: '#ffd000',
  active: '#ff8a00',
  storm: '#ff4d14',
  severe: '#ff2d55',
};

export const healthColor = (key) => HEALTH_COLOR[key] || HEALTH_COLOR.quiet;

/**
 * The channels worth showing, in the order a reader wants them: the corona
 * first because that is where flares happen, then the layer where prominences
 * live, then the flaring plasma, then the visible disc with the sunspots on
 * it, and finally the coronagraph that sees the coronal mass ejections the
 * other four cannot.
 */
export const CHANNELS = [
  {
    key: '0193', label: '193 Å', name: 'Corona',
    note: 'Coronal loops and flaring active regions at about 1.2 million K.',
    img: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0193.jpg',
    movie: 'https://sdo.gsfc.nasa.gov/assets/img/latest/mpeg/latest_512_0193.mp4',
    credit: 'NASA SDO / AIA',
  },
  {
    key: '0304', label: '304 Å', name: 'Chromosphere',
    note: 'The cooler layer just above the surface — where prominences and filaments show.',
    img: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0304.jpg',
    movie: 'https://sdo.gsfc.nasa.gov/assets/img/latest/mpeg/latest_512_0304.mp4',
    credit: 'NASA SDO / AIA',
  },
  {
    key: '0131', label: '131 Å', name: 'Flare plasma',
    note: 'Tuned to 10 million K plasma, so it lights up only during a flare.',
    img: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0131.jpg',
    movie: 'https://sdo.gsfc.nasa.gov/assets/img/latest/mpeg/latest_512_0131.mp4',
    credit: 'NASA SDO / AIA',
  },
  {
    key: 'HMIIF', label: 'Visible', name: 'Sunspots',
    note: 'The photosphere in white light — the disc as the eye would see it, sunspots and all.',
    img: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIIF.jpg',
    movie: 'https://sdo.gsfc.nasa.gov/assets/img/latest/mpeg/latest_512_HMIIF.mp4',
    credit: 'NASA SDO / HMI',
  },
  {
    key: 'C2', label: 'LASCO C2', name: 'Coronagraph',
    note: 'The disc is blocked out so the faint outer corona shows — this is where a CME is first seen leaving the Sun.',
    img: 'https://soho.nascom.nasa.gov/data/realtime/c2/512/latest.jpg',
    movie: null,
    credit: 'ESA/NASA SOHO / LASCO',
  },
];

/** SDO and SOHO overwrite one filename forever, so the URL needs a stamp. */
const stamp = () => Math.floor(Date.now() / 600_000);

const num = (v, dp = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(dp));

/* ---------------- charts ---------------- */

/**
 * Six hours of GOES long-channel X-ray flux. Plotted on the log scale the
 * flare classes are actually defined on, with the class boundaries drawn in —
 * a linear axis would flatten everything below M into a single line along the
 * bottom, which is exactly where most of the interesting variation lives.
 */
function xrayChart(spark, color) {
  const pts = (spark || []).filter((p) => Number.isFinite(p.val));
  if (pts.length < 4) return '';
  const W = 620, H = 130, PADL = 6, PADR = 26, PADY = 8;
  const LO = -8.6, HI = -3.6;
  const x = (i) => PADL + (i / (pts.length - 1)) * (W - PADL - PADR);
  const y = (v) => PADY + (1 - (clamp(v, LO, HI) - LO) / (HI - LO)) * (H - PADY * 2);

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.val).toFixed(1)}`).join(' ');
  const area = `M${x(0).toFixed(1)} ${H} ${line.slice(1)} L${x(pts.length - 1).toFixed(1)} ${H} Z`;
  const bands = [['A', -8], ['B', -7], ['C', -6], ['M', -5], ['X', -4]]
    .map(([letter, v]) => `
      <line x1="${PADL}" x2="${W - PADR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"
        stroke="rgba(150,178,230,.16)" stroke-width="1" stroke-dasharray="2 4"/>
      <text x="${W - PADR + 5}" y="${(y(v) + 3.5).toFixed(1)}" fill="#64738f" font-size="10" font-family="monospace">${letter}</text>`)
    .join('');

  const first = pts[0].ts ? pts[0].ts.slice(11, 16) : '';
  const last = pts.at(-1).ts ? pts.at(-1).ts.slice(11, 16) : '';
  return `
    <section class="block">
      <h3>X-ray flux<em>GOES 0.1–0.8 nm · 6 h</em></h3>
      <div class="chart">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Six hours of GOES X-ray flux">
          <defs><linearGradient id="xray-g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="${color}" stop-opacity=".38"/>
            <stop offset="1" stop-color="${color}" stop-opacity="0"/>
          </linearGradient></defs>
          ${bands}
          <path d="${area}" fill="url(#xray-g)"/>
          <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
        <div class="chart-axis"><span>${esc(first)} UTC</span><span class="mid">flare class</span><span>${esc(last)} UTC</span></div>
      </div>
    </section>`;
}

const kpColor = (v) => (v < 4 ? '#7dd3fc' : v < 5 ? '#ffd000' : v < 6 ? '#ff8a00' : v < 7 ? '#ff4d14' : '#ff2d55');

/**
 * Kp is a quantised 0–9 index reported once every three hours, so it is bars,
 * not a line: drawing it as a continuous curve would imply readings between
 * the bars that do not exist. Kp 5 is the storm threshold and gets a rule.
 */
function kpChart(kp) {
  const pts = (kp?.spark || []).filter((p) => Number.isFinite(p.val));
  if (pts.length < 4) return '';
  const W = 620, H = 110, PADY = 8;
  const bw = W / pts.length;
  const y = (v) => PADY + (1 - clamp(v, 0, 9) / 9) * (H - PADY * 2);
  const bars = pts
    .map((p, i) => {
      const top = y(p.val);
      return `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${top.toFixed(1)}" width="${(bw - 3).toFixed(1)}"
        height="${Math.max(1.5, H - PADY - top).toFixed(1)}" rx="2" fill="${kpColor(p.val)}" opacity="${i === pts.length - 1 ? 1 : 0.62}"/>`;
    })
    .join('');
  return `
    <section class="block">
      <h3>Geomagnetic activity<em>Kp · 3 days</em></h3>
      <div class="chart">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Planetary K-index over three days">
          <line x1="0" x2="${W}" y1="${y(5).toFixed(1)}" y2="${y(5).toFixed(1)}" stroke="rgba(255,138,0,.5)" stroke-width="1" stroke-dasharray="3 4"/>
          ${bars}
        </svg>
        <div class="chart-axis">
          <span>3 days ago</span>
          <span class="mid">Kp 5 = storm threshold</span>
          <span>now ${kp?.now == null ? '' : `Kp ${num(kp.now, 1)}`}</span>
        </div>
      </div>
    </section>`;
}

/* ---------------- blocks ---------------- */

function scaleRow(letter, name, s, worst) {
  const v = s?.scale || 0;
  const c = v === 0 ? 'var(--ink-3)' : v <= 1 ? '#ffd000' : v <= 2 ? '#ff8a00' : v <= 3 ? '#ff4d14' : '#ff2d55';
  const pips = Array.from({ length: 5 }, (_, i) => `<i class="${i < v ? 'on' : ''}" style="--c:${c}"></i>`).join('');
  return `
    <div class="nscale${v ? ' active' : ''}">
      <div class="ns-head"><b style="color:${v ? c : 'inherit'}">${letter}${v || 0}</b><span>${esc(name)}</span></div>
      <div class="ns-pips">${pips}</div>
      <div class="ns-text">${esc(v ? s.text : 'none')}${v === 0 && worst ? '' : ''}</div>
    </div>`;
}

function scalesBlock(sc) {
  if (!sc) return '';
  const fc = (sc.forecast || [])
    .map(
      (f) => `<li><span>${esc(String(f.date || '').slice(5))}</span>
        <b style="color:${f.g ? '#ff8a00' : 'var(--ink-2)'}">G${f.g}</b>
        <em>${f.rMinorProb == null ? '' : `R1–R2 ${f.rMinorProb}%`}</em>
        <em>${f.sProb == null ? '' : `S1 ${f.sProb}%`}</em></li>`,
    )
    .join('');
  return `
    <section class="block">
      <h3>NOAA space weather scales<em>now</em></h3>
      <div class="nscales">
        ${scaleRow('R', 'Radio blackout', sc.r)}
        ${scaleRow('S', 'Radiation storm', sc.s)}
        ${scaleRow('G', 'Geomagnetic storm', sc.g)}
      </div>
      ${fc ? `<ul class="nsforecast">${fc}</ul>` : ''}
    </section>`;
}

function imageryBlock(channel, playing, movieError) {
  const ch = CHANNELS.find((c) => c.key === channel) || CHANNELS[0];
  const t = stamp();
  // The time-lapse is H.264. Nearly every browser plays it, but the ones that
  // cannot must fall back to the still frame rather than to an empty box that
  // wrongly blames the spacecraft.
  const canPlay = ch.movie && !movieError;
  const media = playing && canPlay
    ? `<video src="${esc(ch.movie)}" autoplay loop muted playsinline controls></video>`
    : `<img src="${esc(ch.img)}?t=${t}" alt="The Sun at ${esc(ch.label)} — ${esc(ch.name)}" loading="lazy"
            onerror="this.closest('figure').classList.add('failed')">
       ${canPlay ? '<button class="sun-play" data-act="sun-play" aria-label="Play the last 24 hours"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z" fill="currentColor"/></svg><span>Last 24 hours</span></button>' : ''}`;

  return `
    <section class="block">
      <h3>Live from orbit<em>${esc(ch.credit)}</em></h3>
      <div class="seg">
        ${CHANNELS.map((c) => `<button data-act="sun-ch" data-ch="${esc(c.key)}" class="${c.key === ch.key ? 'on' : ''}">${esc(c.label)}</button>`).join('')}
      </div>
      <figure class="sat sun-fig${playing && canPlay ? ' playing' : ''}">
        ${media}
        <figcaption><b>${esc(ch.name)}</b> — ${esc(ch.note)}${movieError ? ' · this browser cannot play the time-lapse, so the latest frame is shown instead' : ''}</figcaption>
      </figure>
    </section>`;
}

function flaresBlock(fl) {
  if (!fl?.recent?.length) return '';
  const cls = (c) => {
    const letter = String(c || '')[0]?.toUpperCase();
    return letter === 'X' ? '#ff2d55' : letter === 'M' ? '#ff8a00' : letter === 'C' ? '#ffd000' : '#7dd3fc';
  };
  return `
    <section class="block">
      <h3>Recent flares<em>${fl.last24h.c + fl.last24h.m + fl.last24h.x} in 24 h · ${fl.last7d.c + fl.last7d.m + fl.last7d.x} in 7 d</em></h3>
      <ul class="flares">
        ${fl.recent
          .slice(0, 8)
          .map(
            (f) => `<li>
              <span class="fclass" style="color:${cls(f.class)};border-color:${cls(f.class)}44">${esc(f.class)}</span>
              <span class="fbar"><i style="width:${clamp(f.score, 4, 100)}%;background:${cls(f.class)}"></i></span>
              <span class="fwhen">${fmtAgo(f.peakAt || f.beginAt)}</span>
              <span class="flen">${f.minutes == null ? 'ongoing' : `${f.minutes} min`}</span>
            </li>`,
          )
          .join('')}
      </ul>
      ${fl.biggest7d ? `<p class="note">Largest in seven days: <b>${esc(fl.biggest7d.class)}</b> on ${esc(String(fl.biggest7d.peakAt || '').slice(0, 10))}.</p>` : ''}
    </section>`;
}

function regionsBlock(r) {
  if (!r) return '';
  return `
    <section class="block">
      <h3>Active regions<em>${esc(r.observedDate || '')}</em></h3>
      <div class="metrics">
        <div class="metric"><span>Numbered regions</span><strong>${r.count}</strong></div>
        <div class="metric"><span>Sunspots</span><strong>${r.spots}</strong></div>
      </div>
      <div class="probs">
        ${[['C', r.cProb], ['M', r.mProb], ['X', r.xProb]]
          .map(
            ([k, v]) => `<div class="prob"><span>${k}-class flare</span>
              <i><b style="width:${clamp(Number(v) || 0, 0, 100)}%"></b></i>
              <em>${Number(v) || 0}%</em></div>`,
          )
          .join('')}
      </div>
      ${r.biggest ? `<p class="note">Largest region <b>AR${r.biggest.region}</b> at ${esc(r.biggest.location || '—')}, ${esc(r.biggest.spotClass || '')} class, ${r.biggest.area} millionths of the disc.</p>` : ''}
    </section>`;
}

/**
 * Aurora australis. The global numbers are the honest headline, but the one a
 * reader here wants is whether it is worth driving south tonight — so New
 * Zealand gets its own line, and it says plainly when the answer is no.
 */
function auroraBlock(a) {
  if (!a) return '';
  const c = a.nzMax >= 40 ? '#ff8a00' : a.nzMax >= 15 ? '#ffd000' : a.nzMax >= 5 ? '#5ee7c0' : 'var(--ink-3)';
  const verdict =
    a.nzMax >= 40 ? 'Good chance from a dark southern sky tonight.'
      : a.nzMax >= 15 ? 'Possible low on the southern horizon from Otago and Southland.'
        : a.nzMax >= 5 ? 'Faint — a camera might catch it from the deep south.'
          : 'Nothing over New Zealand in this half-hour forecast.';
  return `
    <section class="block">
      <h3>Aurora australis<em>OVATION · 30 min</em></h3>
      <div class="aurora">
        <div class="au-nz" style="--c:${c}">
          <b>${a.nzMax}%</b>
          <span>chance over New Zealand<em>${esc(verdict)}</em></span>
        </div>
        <div class="au-glob">
          <div><span>Southern peak</span><b>${a.southMax}%</b></div>
          <div><span>Northern peak</span><b>${a.northMax}%</b></div>
        </div>
      </div>
    </section>`;
}

function alertsBlock(list) {
  if (!list?.length) return '';
  return `
    <section class="block">
      <h3>SWPC bulletins<em>last 36 h</em></h3>
      <ul class="swalerts">
        ${list
          .slice(0, 6)
          .map(
            (a) => `<li class="k-${esc(a.kind)}">
              <div class="sa-top"><b>${esc(a.headline)}</b><span>${fmtAgo(a.issuedAt)}</span></div>
              ${a.body ? `<p>${esc(a.body)}</p>` : ''}
            </li>`,
          )
          .join('')}
      </ul>
    </section>`;
}

/* ---------------- the panel body ---------------- */

export function solarMarkup(s, { channel = CHANNELS[0].key, playing = false, loading = false, error = null, movieError = false } = {}) {
  if (loading) {
    return `
      <button class="panel-close" data-act="close" aria-label="Close">&times;</button>
      <div class="panel-scroll">
        <header class="panel-head sun-head" style="--accent:#ffcb84">
          <div class="chips"><span class="chip cat">The Sun</span></div>
          <h2>Solar activity</h2>
        </header>
        <section class="block brief loading" style="margin-top:18px">
          <h3>Reading the instruments<em>fetching</em></h3>
          <p class="skeleton"><i></i><i></i><i></i></p>
        </section>
      </div>`;
  }

  if (!s) {
    return `
      <button class="panel-close" data-act="close" aria-label="Close">&times;</button>
      <div class="panel-scroll">
        <header class="panel-head sun-head" style="--accent:#ffcb84">
          <div class="chips"><span class="chip cat">The Sun</span></div>
          <h2>Solar activity</h2>
        </header>
        <p class="panel-summary" style="margin-top:16px">No space-weather snapshot is available right now.${error ? `<br><small>${esc(error)}</small>` : ''}</p>
        ${imageryBlock(channel, playing, movieError)}
      </div>`;
  }

  const h = s.health || {};
  const color = healthColor(h.key);
  const w = s.wind || {};
  const x = s.xray || {};

  return `
    <button class="panel-close" data-act="close" aria-label="Close">&times;</button>
    <div class="panel-scroll">
      <header class="panel-head sun-head" style="--accent:${color}">
        <div class="chips">
          <span class="chip cat">The Sun</span>
          ${x.inProgress ? '<span class="chip live-flare">Flare in progress</span>' : ''}
          ${s.scales?.g?.scale ? `<span class="chip storm">G${s.scales.g.scale} storm</span>` : ''}
        </div>
        <h2>Solar activity</h2>
        <div class="sev-row">
          <div class="sev-num" style="color:${color}">${h.index ?? '—'}</div>
          <div class="sev-meta">
            <div class="sev-label" style="color:${color}">${esc(h.label || '')}</div>
            <div class="sev-bar"><i style="width:${clamp(h.index || 0, 0, 100)}%;background:${color}"></i></div>
            ${h.driver ? `<div class="sev-peak">Led by ${esc(h.driver.toLowerCase())}</div>` : ''}
          </div>
        </div>
      </header>

      <div class="panel-facts">
        <div><span>Condition</span>${esc(h.label || '—')}<em>${esc(h.note || '')}</em></div>
        <div><span>Updated</span>${fmtAgo(s.generatedAt)}<em>${x.satellite ? esc(x.satellite) : 'NOAA SWPC'}</em></div>
      </div>

      ${h.summary ? `<p class="panel-summary">${esc(h.summary)}</p>` : ''}

      <div class="metrics">
        <div class="metric"><span>X-ray flux</span><strong>${esc(x.class || '—')}</strong></div>
        <div class="metric"><span>Planetary Kp</span><strong>${num(s.kp?.now, 1)}<i>of 9</i></strong></div>
        <div class="metric"><span>Solar wind</span><strong>${num(w.speed)}<i>km/s</i></strong></div>
        <div class="metric" title="Southward Bz couples the solar wind into Earth's magnetic field; the more negative, the stronger the coupling.">
          <span>Field Bz</span><strong>${num(w.bz, 1)}<i>nT</i></strong></div>
        <div class="metric"><span>Sunspot number</span><strong>${num(s.indices?.ssn, 1)}<i>${esc(s.indices?.ssnMonth || '')}</i></strong></div>
        <div class="metric"><span>F10.7 radio flux</span><strong>${num(s.indices?.f107)}<i>sfu</i></strong></div>
      </div>

      ${imageryBlock(channel, playing, movieError)}
      ${xrayChart(x.spark, color)}
      ${flaresBlock(s.flares)}
      ${scalesBlock(s.scales)}
      ${kpChart(s.kp)}
      ${auroraBlock(s.aurora)}
      ${regionsBlock(s.regions)}
      ${alertsBlock(s.alerts)}

      <details class="method">
        <summary>How this is measured</summary>
        <p>The condition index is the worst of five readings rather than their average — X-ray flux, planetary Kp, and the NOAA R, S and G scales — because a quiet magnetosphere does not make an X-class flare unimportant. Flare letters are decades of X-ray flux, so C, M and X are each ten times the one before. Solar wind comes from DSCOVR at the L1 point, roughly an hour upstream of Earth.</p>
      </details>

      <div class="panel-actions">
        ${(s.sources || [])
          .slice(0, 2)
          .map((src) => `<a class="btn ghost" href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.name.split(' ')[0])} data</a>`)
          .join('')}
      </div>
      <p class="note credits-note">Sources: ${(s.sources || []).map((src) => esc(src.name)).join(' · ')}.</p>
    </div>`;
}

/** Fetch the published snapshot. Bucketed by the minute so a refresh is cheap. */
export async function loadSolar() {
  const r = await fetch(`${SOLAR_URL}?t=${Math.floor(Date.now() / 60000)}`);
  if (!r.ok) throw new Error(`solar ${r.status}`);
  return r.json();
}
