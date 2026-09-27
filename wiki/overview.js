/* What PD2 changed, from gear.json's general (General Changes page) and balance
 * (Balance Changes page — marked outdated on the wiki, Season 1 only).
 *   #/overview?cat=…&q=…          every general change, by category, searchable
 *   #/overview/season1?cls=…      the old Season 1 skill notes, clearly labelled
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];
  const attrib = id => { const p = P().byId(id); return `<p class="attrib">From <a href="${p ? P().wikiUrl(p.title) : '#'}" target="_blank" rel="noopener">${P().esc(p?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`; };
  const tabs = t => `<div class="segs" role="group">${[['', 'What PD2 changed'], ['season1', 'Season 1 skill notes (outdated)']].map(([k, l]) => `<a class="seg${k === t ? ' on' : ''}" href="#/overview${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;
  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/mechanics">Mechanics</a></nav>`;

  async function render(root, tab, qs) {
    const { esc } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    let g;
    try { g = await window.PD2Gear.load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load the changes.</b><br>${esc(e.message)}</div>`; return; }
    if (tab === 'season1') return season1(root, g.balance, qs);
    return general(root, g.general, qs);
  }

  function general(root, G, qs) {
    const { esc, $, $$, enhanceFragment } = P();
    const p = new URLSearchParams(qs || '');
    const f = { cat: p.get('cat') || '', q: p.get('q') || '' };
    const total = G.cats.reduce((a, c) => a + c.items.length, 0);
    root.innerHTML = `${crumbs}<h1 class="page-title">What PD2 Changed</h1>${tabs('')}
      <p class="lead">Everything Project Diablo 2 changes compared to the original game, in one place: ${total} changes outside skills and items, plus where to find the rest.</p>
      <div class="tiles ovtiles">
        <a class="tile" href="#/items?ch=1&sort=changes"><span><b>Changed items</b><span>Uniques, sets and runewords PD2 reworked, most changes first</span></span></a>
        <a class="tile" href="#/new"><span><b>New in PD2</b><span>Runewords, uniques and items that didn't exist before</span></span></a>
        <a class="tile" href="#/skills/changes"><span><b>Skill changes</b><span>How every class's skills were rebalanced</span></span></a>
        <a class="tile" href="#/patches"><span><b>Patch notes</b><span>Season by season, searchable</span></span></a>
      </div>
      ${G.intro.length ? `<details class="about"><summary>About skill and item changes</summary><div class="wiki">${G.intro.map(i => `<h3 class="sub-h">${esc(i.title)}</h3>${i.html}`).join('')}</div></details>` : ''}
      <div class="filters">
        <div class="frow"><label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="oq" value="${esc(f.q)}" placeholder="Search changes, e.g. stash, gold, potions" aria-label="Search changes" autocomplete="off"></label></div>
        <div class="chips" role="group">${['', ...G.cats.map(c => c.title)].map(c => `<button type="button" class="chip${f.cat === c ? ' on' : ''}" data-cat="${esc(c)}">${c ? esc(c) : 'All'} <i>${c ? G.cats.find(x => x.title === c).items.length : total}</i></button>`).join('')}</div>
      </div>
      <div class="rbar"><div class="rcount" aria-live="polite"></div><span class="pn-toggle"><button type="button" class="chip" data-all="1">Expand all</button><button type="button" class="chip" data-all="0">Collapse all</button></span></div>
      <div class="ov"></div>${attrib(G.page)}`;
    root.querySelector('.pn-toggle').addEventListener('click', e => { const b = e.target.closest('[data-all]'); if (b) for (const d of $$('.ov details', root)) d.open = b.dataset.all === '1'; });
    const box = $('.ov', root), count = $('.rcount', root);
    const draw = () => {
      const ts = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      let n = 0, n0 = 0;
      box.innerHTML = G.cats.filter(c => !f.cat || c.title === f.cat).map(c => {
        const items = c.items.filter(i => ts.every(t => i.text.toLowerCase().includes(t)));
        n += items.length;
        if (!items.length) return '';
        // Each category folds to one line; the first opens, and a search or filter opens what it matches.
        const open = ts.length || f.cat || !n0++;
        return `<details class="ovcat" id="${esc(c.anchor)}"${open ? ' open' : ''}><summary><span>${esc(c.title)}</span><span class="pn-n">${items.length} change${items.length === 1 ? '' : 's'}</span></summary>
          <ul class="ovlist">${items.map(i => `<li class="wiki">${i.html}</li>`).join('')}</ul>
          ${c.note && !ts.length ? `<div class="wiki muted ovnote">${c.note}</div>` : ''}</details>`;
      }).join('') || '<div class="empty">No changes match.</div>';
      count.textContent = `${n} change${n === 1 ? '' : 's'}`;
      for (const el of $$('.wiki', box)) enhanceFragment(el, P().byId(G.page));
    };
    draw();
    for (const el of $$('.about .wiki', root)) enhanceFragment(el, P().byId(G.page));
    const sync = () => { const u = new URLSearchParams(); if (f.cat) u.set('cat', f.cat); if (f.q) u.set('q', f.q); const s = u.toString(); history.replaceState(null, '', '#/overview' + (s ? '?' + s : '')); draw(); };
    root.querySelector('.filters').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; f.cat = b.dataset.cat; for (const x of $$('[data-cat]', root)) x.classList.toggle('on', x === b); sync(); });
    let t;
    $('#oq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); sync(); }, 150); });
  }

  function season1(root, B, qs) {
    const { esc, $$, enhanceFragment } = P();
    const cls = new URLSearchParams(qs || '').get('cls') || '';
    const idx = P().S.index.skillIndex || [];
    const skillHref = (c, n) => { const s = idx.find(x => x.c === c && x.n.toLowerCase() === n.toLowerCase()); return s ? `#/skills/${s.c}/${encodeURIComponent(s.a)}` : ''; };
    const list = B.classes.filter(c => !cls || c.cls === cls);
    root.innerHTML = `${crumbs}<h1 class="page-title">Season 1 Skill Notes</h1>${tabs('season1')}
      <p class="warnbox"><b>Outdated.</b> These are the skill changes as of Season 1 (November 2020), kept for history. The wiki marks this page for deletion. For current skills, use the <a href="#/skills/${cls || 'Amazon'}">skill pages</a> or <a href="${P().pageHref('Skill Changes')}">Skill Changes</a>; for how they changed since, see <a href="#/patches">patch notes</a>.</p>
      <div class="chips">${['', ...CLASSES].map(c => `<a class="chip${cls === c ? ' on' : ''}" href="#/overview/season1${c ? '?cls=' + c : ''}">${c || 'All classes'}</a>`).join('')}</div>
      ${list.map(c => {
        const trees = [...new Set(c.rows.map(r => r.tree))];
        return `<h2 class="home-h">${esc(c.cls)}</h2>${trees.map(t => `<h3 class="sub-h">${esc(t)}</h3><div class="tw"><table class="restable s1"><tbody>${c.rows.filter(r => r.tree === t).map(r => {
          const h = skillHref(c.cls, r.skill);
          return `<tr><td class="mn">${h ? `<a href="${h}">${esc(r.skill)}</a>` : esc(r.skill)}</td><td class="wiki">${r.html}</td></tr>`;
        }).join('')}</tbody></table></div>`).join('')}`;
      }).join('')}
      ${B.abbr ? `<details class="about"><summary>Abbreviations</summary><div class="wiki">${B.abbr}</div></details>` : ''}
      ${attrib(B.page)}`;
    for (const el of $$('.wiki', root)) enhanceFragment(el, P().byId(B.page));
  }

  window.PD2Overview = { render };
})();
