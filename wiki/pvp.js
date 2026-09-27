/* PvP and the abbreviations glossary, from guide.json's pvp and lexicon.
 *   #/pvp[#section]          tournaments, arena rules, PvP bugs
 *   #/pvp/skills?cls=…&q=…   every skill's PvP damage multiplier and behaviour change
 *   #/pvp/lld[#section]      Low Level Dueling
 *   #/glossary?q=…           slang and abbreviations, searchable, A–Z
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const TABS = [['', 'Arena rules'], ['skills', 'Skills in PvP'], ['lld', 'Low Level Dueling']];
  const attrib = id => { const p = P().byId(id); return `<p class="attrib">From <a href="${p ? P().wikiUrl(p.title) : '#'}" target="_blank" rel="noopener">${P().esc(p?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`; };
  const head = (tab, title) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>PvP &amp; Dueling</span></nav>
    <h1 class="page-title">${title}</h1><div class="segs" role="group">${TABS.map(([k, l]) => `<a class="seg${k === tab ? ' on' : ''}" href="#/pvp${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;
  const searchBox = (id, val, ph) => `<label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input type="search" id="${id}" value="${P().esc(val)}" placeholder="${P().esc(ph)}" aria-label="${P().esc(ph)}" autocomplete="off"></label>`;
  const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').toLowerCase();
  const CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];

  async function load(root) {
    try { return await window.PD2Guide.load(); }
    catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load this page.</b><br>${P().esc(e.message)}</div>`; return null; }
  }
  // Level-3 headings and what follows them become one-line toggles.
  const foldSubs = box => {
    for (const w of [...box.querySelectorAll(':scope > .mw-heading3')]) {
      const h = w.querySelector('h3');
      const d = document.createElement('details');
      d.className = 'lld-sub';
      d.id = h.id;
      h.removeAttribute('id');
      d.innerHTML = `<summary>${P().esc(h.textContent.trim())}</summary>`;
      let n = w.nextElementSibling;
      while (n && !n.matches('.mw-heading2, .mw-heading3')) { const next = n.nextElementSibling; d.appendChild(n); n = next; }
      w.replaceWith(d);
    }
  };
  const openTo = id => {
    const el = document.getElementById(id);
    if (!el) return;
    for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    el.scrollIntoView({ block: 'start' });
  };
  const scrollTo = anchor => { if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' })); };

  async function render(root, path, anchor) {
    const { esc, $, $$, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    const G = await load(root);
    if (!G) return;
    const V = G.pvp;
    const [tab, qs = ''] = String(path || '').split('?');

    if (tab === 'skills') {
      const p = new URLSearchParams(qs);
      const f = { cls: CLASSES.includes(p.get('cls')) ? p.get('cls') : '', q: p.get('q') || '' };
      const rows = V.diffs.map(d => ({ ...d, _s: strip(`${d.name} ${d.cls} ${d.type} ${d.diff} ${d.group || ''}`) }));
      root.innerHTML = `${head('skills', 'Skills in PvP')}
        <p class="lead">Against players, skills deal a share of their damage: 16% / 12% / 6% in Normal / Nightmare / Hell, except the skills below, which use their own multipliers.</p>
        <details class="about"><summary>How PvP damage multipliers work</summary><div class="wiki">${V.multIntro}</div></details>
        <div class="filters"><div class="frow">${searchBox('pq', f.q, 'Search skills, e.g. Bone Spear, stun, auto-aim')}</div>
          <div class="chips">${['', ...CLASSES].map(c => `<button type="button" class="chip${c === f.cls ? ' on' : ''}" data-c="${c}">${c || 'All classes'}</button>`).join('')}</div></div>
        <div class="pvp-box"></div>
        ${V.diffNotes.length ? `<section class="info-card"><h2 class="home-h">Also different in PvP</h2><ul class="splist">${V.diffNotes.map(n => `<li class="wiki">${n}</li>`).join('')}</ul></section>` : ''}
        ${attrib(V.page)}`;
      const box = $('.pvp-box', root);
      const pct = v => v ? esc(v).replace(/\//g, '<i>/</i>') : '<span class="dim">—</span>';
      const draw = () => {
        const ts = f.q.toLowerCase().split(/\s+/).filter(Boolean);
        const list = rows.filter(r => (!f.cls || r.cls === f.cls) && ts.every(t => r._s.includes(t)));
        const groups = [...CLASSES, ''].map(c => [c, list.filter(r => (r.cls || '') === c)]).filter(([, l]) => l.length);
        box.innerHTML = groups.length ? `<div class="tw"><table class="restable pvp-t"><thead><tr><th>Skill</th><th title="Share of the skill's PvP damage in Normal and Nightmare">Norm/NM %</th><th title="Share of the skill's PvP damage in Hell">Hell %</th><th>Type</th><th>Plays differently</th></tr></thead>
          <tbody>${groups.map(([c, l]) => `<tr class="zact"><th colspan="5">${esc(c || 'Other')} <small>${l.length}</small></th></tr>${l.map(r => `<tr><td>${r.anchor && r.cls ? `<a href="#/skills/${r.cls}/${encodeURIComponent(r.anchor)}">${esc(r.name)}</a>` : esc(r.name)}${r.group ? ` <small class="dim">${esc(r.group)}</small>` : ''}</td>
            <td>${pct(r.nm)}</td><td>${pct(r.hell)}</td><td>${r.type ? `<span class="omod">${esc(r.type)}</span>` : ''}</td><td class="wiki pvp-diff">${r.diff || ''}</td></tr>`).join('')}`).join('')}</tbody></table></div>`
          : '<div class="empty">No skills match.</div>';
        for (const el of $$('.wiki', box)) enhanceFragment(el, P().byId(V.page));
      };
      draw();
      const sync = () => { const u = new URLSearchParams(); if (f.cls) u.set('cls', f.cls); if (f.q) u.set('q', f.q); history.replaceState(null, '', '#/pvp/skills' + (u.toString() ? '?' + u : '')); };
      root.querySelector('.filters').addEventListener('click', e => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        f.cls = b.dataset.c;
        for (const x of $$('[data-c]', root)) x.classList.toggle('on', x === b);
        sync(); draw();
      });
      let t;
      $('#pq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); sync(); draw(); }, 150); });
      for (const el of $$('.about .wiki', root)) enhanceFragment(el, P().byId(V.page));
      return;
    }

    if (tab === 'lld') {
      const L = V.lld;
      root.innerHTML = `${head('lld', 'Low Level Dueling')}
        ${L.intro ? `<div class="wiki lead">${L.intro}</div>` : ''}
        <div class="chips lld-jump">${L.topics.flatMap(t => [`<a class="chip" href="#/pvp/lld#${encodeURIComponent(t.anchor)}"><b>${esc(t.title)}</b></a>`,
          ...t.subs.filter(s => s.level === 3).map(s => `<a class="chip" href="#/pvp/lld#${encodeURIComponent(s.anchor)}">${esc(s.title)}</a>`)]).join('')}</div>
        ${L.topics.map(t => `<section class="info-card lld" id="${esc(t.anchor)}"><h2 class="home-h">${esc(t.title)}</h2><div class="wiki">${t.html}</div></section>`).join('')}
        <p class="muted">Tournaments, arena rules and each skill's PvP numbers are on the <a href="#/pvp">other PvP tabs</a>.</p>
        ${attrib(L.page)}`;
      for (const el of $$('.wiki', root)) { enhanceFragment(el, P().byId(L.page)); foldSubs(el); }
      root.addEventListener('click', e => {
        const a = e.target.closest('.lld-jump a');
        if (!a) return;
        const id = decodeURIComponent(a.getAttribute('href').split('#').pop());
        e.preventDefault();
        openTo(id);
        history.replaceState(null, '', '#/pvp/lld#' + encodeURIComponent(id));
      });
      if (anchor) requestAnimationFrame(() => openTo(anchor));
      return;
    }

    root.innerHTML = `${head('', 'PvP &amp; Dueling')}
      ${V.intro ? `<p class="lead wiki">${V.intro}</p>` : ''}
      <div class="tiles pvp-tiles">
        <a class="tile" href="#/pvp/skills"><span><b>Skills in PvP</b><span>Damage multiplier and behaviour changes for ${V.diffs.length} skills</span></span></a>
        <a class="tile" href="#/pvp/lld"><span><b>Low Level Dueling</b><span>Level 9/18/30 dueling: crafts, charms, runewords, builds</span></span></a>
        <a class="tile" href="#/breakpoints"><span><b>Breakpoints</b><span>FCR, FHR, IAS and block frames</span></span></a>
      </div>
      ${V.sections.map(s => `<section class="info-card" id="${esc(s.anchor)}"><h2 class="home-h">${esc(s.title)}</h2><div class="wiki">${s.html}</div></section>`).join('')}
      ${attrib(V.page)}`;
    for (const el of $$('.wiki', root)) enhanceFragment(el, P().byId(V.page));
    scrollTo(anchor);
  }

  async function glossary(root, qs) {
    const { esc, $, $$, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    const G = await load(root);
    if (!G) return;
    const X = G.lexicon;
    const q0 = new URLSearchParams(qs).get('q') || '';
    const rows = X.entries.map(e => ({ ...e, _t: e.term.toLowerCase(), _s: strip(e.html) }));
    const letters = [...new Set(rows.map(e => e.letter))];
    root.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>Mechanics</span></nav>
      <h1 class="page-title">Abbreviations &amp; Slang</h1>
      <p class="lead">${esc(X.intro || 'Common slang and abbreviations used in Project Diablo 2 and Diablo II.')} Type a term like <i>BO</i> or <i>Tal</i>, or search the meanings.</p>
      ${X.colors.length ? `<details class="about gl-key"><summary>Item and damage colors: ${X.colors.map(c => `<b class="${esc(c.cls)}">${esc(c.name)}</b>`).join(' · ')}</summary><div class="gl-colors wiki">${X.colors.map(c => `<span class="gl-color"><b class="${esc(c.cls)}">${esc(c.name)}</b><span>${esc(c.what)}</span></span>`).join('')}</div></details>` : ''}
      <div class="filters gl-bar"><div class="frow">${searchBox('gq', q0, 'Search abbreviations, e.g. CtA, BO, pierce')}</div>
        <nav class="chips gl-az" aria-label="Jump to letter">${letters.map(l => `<a class="chip" href="#gl-${esc(l)}" data-l="${esc(l)}">${esc(l)}</a>`).join('')}</nav></div>
      <div class="gl-box"></div>
      ${X.stub ? `<p class="muted">The wiki's list is still growing (${esc(X.stub.replace(/\.$/, ''))}). Missing a term? Add it on the wiki and it shows up here the next day.</p>` : ''}
      ${attrib(X.page)}`;
    const box = $('.gl-box', root);
    const draw = q => {
      const ql = q.toLowerCase().trim();
      const hit = ql ? rows.filter(e => e._t.split(/\s*\/\s*/).some(t => t.startsWith(ql)) || e._t.includes(ql) || e._s.includes(ql))
        .sort((a, b) => (b._t.split(/\s*\/\s*/).includes(ql) - a._t.split(/\s*\/\s*/).includes(ql)) || (b._t.startsWith(ql) - a._t.startsWith(ql))) : rows;
      const groups = ql ? [['', hit]] : letters.map(l => [l, hit.filter(e => e.letter === l)]);
      box.innerHTML = groups.filter(([, l]) => l.length).map(([l, list]) => `<section class="gl-sec"${l ? ` id="gl-${esc(l)}"` : ''}>${l ? `<h2 class="gl-l">${esc(l)}</h2>` : ''}
        <dl class="gl">${list.map(e => `<div><dt>${esc(e.term)}</dt><dd class="wiki">${e.html}</dd></div>`).join('')}</dl></section>`).join('')
        || `<div class="empty">No abbreviation matches “${esc(q)}”. Try the <a href="#/search/${encodeURIComponent(q)}">site search</a>.</div>`;
      for (const el of $$('.wiki', box)) enhanceFragment(el, P().byId(X.page));
    };
    draw(q0);
    let t;
    $('#gq', root).addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => {
        const v = e.target.value.trim();
        history.replaceState(null, '', '#/glossary' + (v ? '?q=' + encodeURIComponent(v) : ''));
        draw(v);
      }, 120);
    });
    // Letter chips scroll within the page instead of changing the route.
    $('.gl-az', root).addEventListener('click', e => {
      const a = e.target.closest('[data-l]');
      if (!a) return;
      e.preventDefault();
      if ($('#gq', root).value) { $('#gq', root).value = ''; history.replaceState(null, '', '#/glossary'); draw(''); }
      document.getElementById('gl-' + a.dataset.l)?.scrollIntoView({ block: 'start' });
    });
  }

  window.PD2Pvp = { render, glossary };
})();
