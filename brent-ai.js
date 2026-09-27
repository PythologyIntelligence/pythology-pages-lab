/* Public read-only client for the separately hosted BrentAI API. No secrets live here. */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const API = 'https://ysmeaptz5yq22q7irccl5tzqdi0dessn.lambda-url.ap-southeast-1.on.aws/';
  const box = document.querySelector('[data-brent-chat]');
  if (!box) return;
  const messages = box.querySelector('[data-chat-messages]');
  const input = box.querySelector('[data-chat-input]');
  const form = box.querySelector('[data-chat-form]');
  const submit = box.querySelector('[data-chat-submit]');
  const clear = box.querySelector('[data-chat-clear]');
  const state = box.querySelector('[data-chat-state]');
  const error = box.querySelector('[data-chat-error]');
  const trace = document.querySelector('[data-chat-trace]');
  const sessionId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  let history = [], busy = false, knowledgeReady = false;
  input.disabled = true;
  submit.disabled = true;
  state.textContent = 'checking approved knowledge';

  async function api(payload) {
    const response = await fetch(API, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload), mode: 'cors'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.error || 'Request failed (' + response.status + ')');
    return result;
  }
  function text(tag, value, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = value;
    return el;
  }
  function timeAgo(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return 'unavailable';
    const hours = Math.max(0, (Date.now() - Date.parse(value)) / 3600000);
    return hours < 1 ? Math.round(hours * 60) + ' min ago' : hours < 48 ? Math.round(hours) + ' h ago' : Math.floor(hours / 24) + ' d ago';
  }
  const REQUIRED_BRIEFS = ['purpose','systems','integration','chathams','research','investment'];
  const APPROVED_PAGES = new Set([
    '/', '/index.html', '/about.html', '/research.html', '/causal-intelligence.html',
    '/prometheus.html', '/earthnet-platform.html', '/earthnet-nz-intelligence.html',
    '/mdra.html', '/precursor-domains.html', '/poseidon.html',
    '/marine-intelligence.html', '/where-it-fits.html', '/ask-brent.html',
    '/technosphere-twin.html', '/synthetic-cognition.html'
  ]);
  function allowedPublicSource(raw) {
    if (raw === 'internal://founder-brief') return true;
    if (REQUIRED_BRIEFS.some(function (name) { return raw === 'internal://approved/knowledge-' + name + '.md'; })) return true;
    try {
      const u = new URL(raw);
      if (u.hostname === 'pythology.co.nz' || u.hostname === 'www.pythology.co.nz') return APPROVED_PAGES.has(u.pathname);
      return raw === 'https://earthnet.pythology.co.nz/' || raw === 'https://atlas.pythology.co.nz/atlas';
    } catch { return false; }
  }
  api({action:'kb'}).then(function (kb) {
    document.querySelector('[data-kb-pages]').textContent = String(kb.pages || 0);
    document.querySelector('[data-kb-chunks]').textContent = String(kb.chunks || 0);
    document.querySelector('[data-kb-updated]').textContent = timeAgo(kb.lastIngestAt);
    const pages = Array.isArray(kb.pageList) ? kb.pageList : [];
    const active = pages.filter(function (p) { return p.status === 'active'; });
    const briefsReady = REQUIRED_BRIEFS.every(function (name) {
      return active.some(function (p) { return p.url === 'internal://approved/knowledge-' + name + '.md' && p.chunks > 0; });
    });
    const noOldSources = active.every(function (p) { return allowedPublicSource(p.url); });
    const fresh = Number.isFinite(Date.parse(kb.lastIngestAt)) && Date.now() - Date.parse(kb.lastIngestAt) < 13 * 3600000;
    knowledgeReady = kb.version === 'public-founder-story-20260928' && briefsReady && noOldSources && fresh
      && (kb.lastIngestStatus === 'ok' || kb.lastIngestStatus === 'partial');
    document.querySelector('[data-kb-status]').textContent = knowledgeReady ? 'approved knowledge ready' : 'knowledge update pending';
    state.textContent = knowledgeReady ? 'ready' : 'knowledge update pending';
    input.disabled = !knowledgeReady;
    submit.disabled = !knowledgeReady;
    input.placeholder = knowledgeReady ? 'Ask about our purpose, Prometheus, the Chathams…' : 'Chat opens after the approved knowledge refresh.';
    if (!knowledgeReady) error.textContent = 'The public story is available above. Chat is paused until the revised backend and approved source index have been verified.';
  }).catch(function () {
    document.querySelector('[data-kb-updated]').textContent = 'unavailable';
    document.querySelector('[data-kb-status]').textContent = 'service unavailable';
    state.textContent = 'temporarily unavailable';
    error.textContent = 'BrentAI chat is unavailable; the public company story and direct contact links remain available.';
  });

  function writeWithCitations(line, container, sources) {
    const pattern = /\[(S\d+)\]/g;
    let offset = 0, match;
    while ((match = pattern.exec(line)) !== null) {
      if (match.index > offset) container.appendChild(document.createTextNode(line.slice(offset, match.index)));
      const source = sources.find(function (s) { return s.id === match[1]; });
      if (source) {
        const button = text('button', '[' + match[1] + ']', 'brent-cite');
        button.type = 'button';
        button.title = 'Show evidence ' + match[1];
        button.addEventListener('click', function () {
          const node = document.getElementById('brent-src-' + source.id);
          if (node) {
            node.classList.add('flash');
            node.scrollIntoView({behavior:'smooth',block:'center'});
            window.setTimeout(function () { node.classList.remove('flash'); }, 1800);
          }
        });
        container.appendChild(button);
      } else container.appendChild(document.createTextNode(match[0]));
      offset = pattern.lastIndex;
    }
    if (offset < line.length) container.appendChild(document.createTextNode(line.slice(offset)));
  }
  function showAnswer(answer, sources) {
    const parts = answer.split(/^###\s*Evidence Sources?\s*$/im);
    const body = parts[0].trim();
    const wrapper = document.createElement('div');
    const lines = body.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    lines.forEach(function (line) {
      const item = text('p', '');
      const cleaned = line.replace(/^#{1,4}\s+/, '').replace(/^[-*]\s+/, '• ').replace(/\*\*/g, '');
      writeWithCitations(cleaned, item, sources);
      wrapper.appendChild(item);
    });
    if (parts[1]) {
      wrapper.appendChild(text('div', 'EVIDENCE SOURCE', 'brent-msg-label'));
      parts[1].trim().split('\n').filter(Boolean).forEach(function (line) {
        const item = text('p', '');
        writeWithCitations(line.replace(/^[-*]\s+/, '• ').replace(/\*\*/g, ''), item, sources);
        wrapper.appendChild(item);
      });
    }
    return wrapper;
  }
  function addMessage(label, value, cls, sources) {
    const node = document.createElement('article');
    node.className = 'brent-msg ' + cls;
    node.appendChild(text('div', label, 'brent-msg-label'));
    if (sources) node.appendChild(showAnswer(value, sources));
    else node.appendChild(text('p', value));
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
    return node;
  }
  function showTrace(result) {
    const t = result.trace;
    trace.replaceChildren();
    trace.appendChild(text('h3', 'Evidence & retrieval trace'));
    const summary = text('p', 'Source status: ' + t.grounding + ' · ' + t.sources.filter(function (s) { return s.cited; }).length + ' of ' + t.sources.length + ' retrieved passages cited · ' + t.totalMs + ' ms');
    trace.appendChild(summary);
    if (t.invalidCitations && t.invalidCitations.length) {
      trace.appendChild(text('p','Unsupported citation identifiers: ' + t.invalidCitations.join(', ') + '. Do not treat those claims as supported.'));
    }
    const stages = text('div','','brent-stage-list');
    (t.steps || []).forEach(function (s, i) {
      stages.appendChild(text('span', String(i+1).padStart(2,'0') + ' ' + s.name + ' · ' + s.ms + ' ms'));
    });
    trace.appendChild(stages);
    t.sources.forEach(function (s) {
      const item = document.createElement('article');
      item.id = 'brent-src-' + s.id;
      item.className = 'brent-source' + (s.cited ? ' cited' : '');
      item.appendChild(text('h4', '[' + s.id + '] ' + s.family + ' — ' + s.title));
      const subtitle = s.kind === 'baseline' ? 'Reviewed public briefing' : (s.lastFetched ? 'Fetched ' + timeAgo(s.lastFetched) : 'Published page');
      item.appendChild(text('small', subtitle + ' · ' + (s.cited ? 'Cited' : 'Retrieved, not cited')));
      item.appendChild(text('p', s.content));
      if (s.kind !== 'baseline' && /^https:\/\//.test(s.url)) {
        const link = text('a','Open published source ↗');
        link.href = s.url; link.target='_blank'; link.rel='noopener noreferrer'; item.appendChild(link);
      }
      trace.appendChild(item);
    });
    if (!t.sources.length) trace.appendChild(text('p','No passage cleared the relevance threshold. Claims cannot be grounded in the knowledge base.'));
  }
  async function send(question) {
    const q = question.trim();
    if (!q || busy || !knowledgeReady) return;
    busy = true; submit.disabled = true; input.disabled = true;
    state.textContent='retrieving & answering'; error.textContent='';
    addMessage('You',q,'visitor');
    clear.hidden=false; input.value='';
    const previous = history.slice(-8);
    const pending = addMessage('BrentAI','Searching the approved knowledge base…','twin');
    try {
      const result = await api({action:'chat',message:q,history:previous,sessionId:sessionId});
      pending.remove();
      addMessage('BrentAI',result.answer,'twin',result.trace.sources);
      showTrace(result);
      history.push({role:'user',content:q},{role:'assistant',content:result.answer});
      history = history.slice(-8);
    } catch (e) {
      pending.remove();
      error.textContent = e.message || 'Could not complete the answer.';
      input.value = q;
    } finally {
      busy=false; submit.disabled=!knowledgeReady; input.disabled=!knowledgeReady; state.textContent=knowledgeReady ? 'ready' : 'knowledge update pending'; if (knowledgeReady) input.focus();
    }
  }
  form.addEventListener('submit',function (event) { event.preventDefault(); send(input.value); });
  input.addEventListener('keydown',function (event) {
    if (event.key==='Enter' && !event.shiftKey) { event.preventDefault(); send(input.value); }
  });
  clear.addEventListener('click',function () {
    if (busy) return;
    history=[]; messages.replaceChildren(text('p',"Hello, I'm BrentAI. Ask me anything about Pythology's public work.",'brent-welcome'));
    trace.replaceChildren(text('h3','Evidence & retrieval trace'),text('p','Ask a question to inspect the sources.'));
    error.textContent=''; clear.hidden=true; input.focus();
  });
  document.querySelectorAll('[data-question]').forEach(function (button) {
    button.addEventListener('click',function () {
      if (!knowledgeReady) {
        document.getElementById('brent-story').scrollIntoView({behavior:'smooth',block:'start'});
        error.textContent = 'Chat opens once the approved knowledge index is verified. Explore the public story above in the meantime.';
        return;
      }
      input.value=button.getAttribute('data-question') || '';
      document.getElementById('ask').scrollIntoView({behavior:'smooth',block:'start'});
      input.focus();
    });
  });
});