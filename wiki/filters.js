/* Loot filters & game setup, from data/filters.json (Item Filtering + Customization pages).
 *   #/filters[/<topic>][#sub]        filter guide by topic (syntax, strictness, formulas…)
 *   #/filters/codes?q=&top=&sec=     every filter code, searchable, click to copy
 *   #/filters/list                   public loot filters
 *   #/filters/setup[#file]           ProjectDiablo.cfg, UI.ini, ddraw.ini
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  let data = null, loading = null;
  const load = () => {
    if (data) return Promise.resolve(data);
    if (!loading) loading = P().fetchJSON('data/filters.json').then(d => {
      const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      for (const c of d.codes) c._s = [c.codes.join(' '), ...Object.values(c.f).map(strip), c.ctx, c.sec].join(' ').toLowerCase();
      return (data = d);
    }).catch(e => { loading = null; throw e; });
    return loading;
  };
  const TABS = [['', 'Filter guide'], ['codes', 'Code finder'], ['list', 'Public filters'], ['setup', 'Game setup']];
  const TOPS = ['Output Keywords', 'Boolean Conditions', 'Value Conditions', 'Value Condition IDs', 'Variables'];
  const head = (tab, title) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/filters">Loot Filters</a></nav>
    <h1 class="page-title">${title}</h1><div class="segs" role="group">${TABS.map(([k, l]) => `<a class="seg${k === tab ? ' on' : ''}" href="#/filters${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;
  const attrib = id => { const p = P().byId(id); return `<p class="attrib">From <a href="${p ? P().wikiUrl(p.title) : '#'}" target="_blank" rel="noopener">${P().esc(p?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`; };
  const builder = `<a class="callout" href="/Roofoo-s-PD2-Loot-Filter/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg>
    <span><b>Loot Filter Builder</b><span>Customize Roofoo's filter without writing filter code: themes, sounds, star tiers and what shows on each filter level.</span></span></a>`;

  async function render(root, tab, rest, qs, anchor) {
    const { esc } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load the filter reference.</b><br>${esc(e.message)}</div>`; return; }
    if (tab === 'codes') return codes(root, qs);
    if (tab === 'list') return list(root);
    if (tab === 'setup') return setup(root, anchor);
    return guide(root, rest, anchor);
  }

  function guide(root, topicId, anchor) {
    const { esc, $, enhanceFragment } = P();
    const topic = data.topics.find(t => t.anchor === topicId) || data.topics.find(t => t.subs.some(s => s.anchor === anchor)) || data.topics[0];
    root.innerHTML = `${head('', 'Loot Filters')}
      <div class="mech">
        <nav class="mech-topics" aria-label="Topics"><ol>${data.topics.map(t => `<li><a href="#/filters/${encodeURIComponent(t.anchor)}" class="${t === topic ? 'on' : ''}">${esc(t.title)}</a></li>`).join('')}
          <li><a href="#/filters/codes">Code finder<i>tool</i></a></li></ol></nav>
        <article class="mech-main">
          <h2 class="home-h">${esc(topic.title)}</h2>
          ${topic.subs.length ? `<div class="chips mech-subs">${topic.subs.map(s => `<a class="chip" href="#/filters/${encodeURIComponent(topic.anchor)}#${encodeURIComponent(s.anchor)}">${esc(s.title)}</a>`).join('')}</div>` : ''}
          ${topic.anchor === data.topics[0].anchor ? builder : ''}
          <div class="wiki mech-body">${topic.html}</div>
          ${attrib(data.page)}
        </article>
      </div>`;
    enhanceFragment($('.mech-body', root), P().byId(data.page));
    // The filter list inside "Filters" lives in its own tab.
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  }

  function codes(root, qs) {
    const { esc, $, $$, enhanceFragment } = P();
    const p = new URLSearchParams(qs || '');
    const f = { q: p.get('q') || '', top: p.get('top') || '', sec: p.get('sec') || '' };
    // A section link from the old page (e.g. "Runes") filters to that section.
    if (f.sec && !data.codes.some(c => c.sec === f.sec)) {
      const hit = data.codes.find(c => c.sec.split(' › ').includes(f.sec) || c.top === f.sec);
      f.sec = hit ? (hit.top === f.sec ? '' : hit.sec) : '';
      if (hit && hit.top === p.get('sec')) f.top = hit.top;
    }
    const tops = TOPS.filter(t => data.codes.some(c => c.top === t));
    const url = ff => { const u = new URLSearchParams(); for (const k of ['q', 'top', 'sec']) if (ff[k]) u.set(k, ff[k]); const s = u.toString(); return '#/filters/codes' + (s ? '?' + s : ''); };
    root.innerHTML = `${head('codes', 'Filter Code Finder')}
      <p class="lead">Every code the PD2 loot filter understands. Search by code or meaning (<i>shako</i>, <i>FCR</i>, <i>ethereal</i>, <i>%GOLD%</i>), then click a code to copy it.</p>
      <div class="filters">
        <div class="frow"><label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="fq" value="${esc(f.q)}" placeholder="Code or meaning, e.g. shako, FCR, sockets" aria-label="Search filter codes" autocomplete="off"></label>
          <label class="fsel">Section <select id="fsec"><option value="">All sections</option></select></label></div>
        <div class="chips" role="group">${['', ...tops].map(t => `<a class="chip${f.top === t ? ' on' : ''}" href="${url({ ...f, top: t, sec: '' })}">${t ? esc(t) : 'All'}</a>`).join('')}</div>
      </div>
      <div class="rcount" aria-live="polite"></div>
      <div class="tw"><table class="restable fcodes"><thead><tr><th>Code</th><th>Meaning</th><th>Section</th></tr></thead><tbody></tbody></table></div>
      <button class="more-btn" type="button" hidden>Show more</button>
      <div class="copied" role="status" aria-live="polite" hidden></div>
      ${attrib(data.page)}`;
    const secSel = $('#fsec', root), body = $('tbody', root), count = $('.rcount', root), more = $('.more-btn', root);
    const fillSecs = () => {
      const secs = [...new Set(data.codes.filter(c => !f.top || c.top === f.top).map(c => c.sec))];
      secSel.innerHTML = `<option value="">All sections</option>${secs.map(s => `<option${s === f.sec ? ' selected' : ''}>${esc(s)}</option>`).join('')}`;
    };
    let hits = [], shown = 0;
    const row = c => {
      const meaning = Object.entries(c.f).map(([k, v]) => `<span class="fk">${esc(k)}</span> ${v}`).join(' ');
      const color = /class="(d2-[a-z]+)"/.exec(c.f.Color || '')?.[1] || '';
      return `<tr><td class="fc">${c.codes.map(x => `<button type="button" class="code${color ? ' wiki' : ''}" data-copy="${esc(x)}" title="Copy"><span class="${color}">${esc(x)}</span></button>`).join('')}</td>
        <td class="fm">${c.ctx ? `<span class="fctx">${esc(c.ctx)}</span>` : ''}${meaning}</td><td class="fs" title="${esc(c.sec)}">${esc(c.sec.split(' › ').pop())}</td></tr>`;
    };
    const page = () => { body.insertAdjacentHTML('beforeend', hits.slice(shown, shown + 200).map(row).join('')); shown = Math.min(hits.length, shown + 200); more.hidden = shown >= hits.length; more.textContent = `Show more (${hits.length - shown} left)`; enhanceFragment(body, P().byId(data.page)); };
    const draw = () => {
      const ql = f.q.toLowerCase().trim();
      const ts = ql.split(/\s+/).filter(Boolean);
      hits = data.codes.filter(c => (!f.top || c.top === f.top) && (!f.sec || c.sec === f.sec) && ts.every(t => c._s.includes(t)));
      // Exact code matches first.
      if (ql) hits.sort((a, b) => (b.codes.some(x => x.toLowerCase() === ql) - a.codes.some(x => x.toLowerCase() === ql)));
      count.textContent = `${hits.length} code${hits.length === 1 ? '' : 's'}`;
      body.innerHTML = hits.length ? '' : '<tr><td colspan="3" class="empty">No codes match.</td></tr>';
      shown = 0;
      if (hits.length) page(); else more.hidden = true;
    };
    fillSecs(); draw();
    const sync = () => { history.replaceState(null, '', url(f)); draw(); };
    let t;
    $('#fq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; sync(); }, 150); });
    secSel.addEventListener('change', e => { f.sec = e.target.value; sync(); });
    more.addEventListener('click', page);
    const toast = $('.copied', root);
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-copy]');
      if (!b) return;
      try { await navigator.clipboard.writeText(b.dataset.copy); toast.textContent = `Copied ${b.dataset.copy}`; }
      catch { toast.textContent = `Select and copy: ${b.dataset.copy}`; }
      toast.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { toast.hidden = true; }, 1600);
    });
  }

  function list(root) {
    const { esc, $$, enhanceFragment } = P();
    // One row per filter: name, author, last update and the start of its description.
    const card = x => `<article class="frow-f${x.archived ? ' old' : ''}" data-hc="lfilter:${data.filters.indexOf(x)}">
      <h3>${x.href ? `<a href="${esc(x.href)}" target="_blank" rel="noopener">${esc(x.name)}</a>` : esc(x.name)}</h3>
      <span class="ff-by">${esc(x.author || '')}</span><span class="ff-up">${esc(x.updated || '')}</span>
      <p class="ff-desc">${esc(String(x.desc || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim())}</p></article>`;
    root.innerHTML = `${head('list', 'Public Loot Filters')}${builder}
      <h2 class="home-h">Current filters <small>${data.filters.filter(x => !x.archived).length}</small></h2><div class="flist">${data.filters.filter(x => !x.archived).map(card).join('')}</div>
      ${data.filters.some(x => x.archived) ? `<details class="about"><summary>Archived filters (${data.filters.filter(x => x.archived).length})</summary><div class="flist">${data.filters.filter(x => x.archived).map(card).join('')}</div></details>` : ''}
      <p class="muted">Install a filter from the launcher, or put a <code>loot.filter</code> file in your ProjectD2 folder. See the <a href="#/filters">filter guide</a> for in-game settings.</p>
      ${attrib(data.page)}`;
    for (const el of $$('.frow-f .wiki', root)) enhanceFragment(el, P().byId(data.page));
  }

  function setup(root, anchor) {
    const { esc, $$, enhanceFragment } = P();
    root.innerHTML = `${head('setup', 'Game Setup')}
      <p class="lead">Settings files in your ProjectD2 folder. Close the game before editing them.</p>
      ${data.setup.map(s => `<section class="info-card" id="${esc(s.anchor)}"><h2 class="home-h">${esc(s.title)}</h2><div class="wiki">${s.html}</div></section>`).join('')}
      <p class="muted">Loot filter files are covered under <a href="#/filters/list">Public filters</a>. Crashes and graphics problems are in the <a href="#/help">Help Center</a>.</p>
      ${attrib(data.customPage)}`;
    for (const el of $$('.wiki', root)) enhanceFragment(el, P().byId(data.customPage));
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  }

  function search(q, n) {
    if (!data || q.length < 2) return [];
    const ql = q.toLowerCase();
    return data.codes.filter(c => c.codes.some(x => x.toLowerCase() === ql)).slice(0, n);
  }

  // Hover card: a public filter's whole description.
  async function filterTip(i) {
    const { esc } = P();
    await load();
    const x = data.filters[+i];
    if (!x) return '';
    return `<div class="hc-lf"><b class="hc-name">${esc(x.name)}</b><span class="hc-sub">${[x.author && 'by ' + x.author, x.updated && 'updated ' + x.updated].filter(Boolean).map(esc).join(' · ')}</span>
      <div class="hc-notes">${String(x.desc || '').replace(/<a\b[^>]*>|<\/a>/g, '')}</div></div>`;
  }

  window.PD2Filters = { load, render, search, filterTip, get data() { return data; } };
})();
