/* About PD2: rules, singleplayer differences and credits, from gear.json's about.
 *   #/about[#group]              rules as numbered cards, searchable
 *   #/about/singleplayer         differences from online play, bugs with their fixes
 *   #/about/credits              everyone who made PD2, by role
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const TABS = [['', 'Rules'], ['singleplayer', 'Singleplayer'], ['credits', 'Credits']];
  const attrib = id => { const p = P().byId(id); return `<p class="attrib">From <a href="${p ? P().wikiUrl(p.title) : '#'}" target="_blank" rel="noopener">${P().esc(p?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`; };
  const head = (tab, title) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>About PD2</span></nav>
    <h1 class="page-title">${title}</h1><div class="segs" role="group">${TABS.map(([k, l]) => `<a class="seg${k === tab ? ' on' : ''}" href="#/about${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;

  async function render(root, tab, anchor) {
    const { esc, $, $$, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    let A;
    try { A = (await window.PD2Gear.load()).about; } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load this page.</b><br>${esc(e.message)}</div>`; return; }
    const page = id => P().byId(id);

    if (tab === 'singleplayer') {
      const S = A.sp;
      root.innerHTML = `${head('singleplayer', 'Singleplayer')}
        ${S.intro ? `<div class="wiki lead">${S.intro}</div>` : ''}
        ${S.sections.map(s => `<section class="info-card" id="${esc(s.anchor)}"><h2 class="home-h">${esc(s.title)}</h2>
          <ul class="splist">${s.items.map(i => `<li><div class="wiki">${i.html}</div>${i.fix ? `<div class="wiki spfix">${i.fix}</div>` : ''}</li>`).join('')}</ul>
          ${s.after ? `<div class="wiki muted">${s.after}</div>` : ''}</section>`).join('')}
        <p class="muted">Installing PlugY and other setup steps are in the <a href="#/help?cat=Installation%20%26%20other%20guides">Help Center</a>.</p>
        ${attrib(A.pages.sp)}`;
      for (const el of $$('.wiki', root)) enhanceFragment(el, page(A.pages.sp));
    } else if (tab === 'credits') {
      const C = A.credits;
      const named = C.roles.filter(r => r.names.length), thanks = C.roles.filter(r => !r.names.length);
      root.innerHTML = `${head('credits', 'Credits')}
        ${C.intro ? `<div class="wiki lead">${C.intro}</div>` : ''}
        <div class="credits">${named.map(r => `<section class="credit"><h2>${esc(r.title)}${r.note ? ` <small>${esc(r.note.replace(/[():]/g, '').trim())}</small>` : ''}</h2>
          <ul>${r.names.map(n => `<li>${esc(n)}</li>`).join('')}</ul>${r.more ? `<div class="wiki muted">${r.more}</div>` : ''}</section>`).join('')}</div>
        ${thanks.length ? `<div class="thanks">${thanks.map(r => `<p>${esc(r.title)}${r.more ? `</p><div class="wiki">${r.more}</div><p>` : ''}</p>`).join('')}</div>` : ''}
        ${attrib(A.pages.credits)}`;
      for (const el of $$('.wiki', root)) enhanceFragment(el, page(A.pages.credits));
    } else {
      const R = A.rules;
      root.innerHTML = `${head('', 'Rules')}
        ${R.intro ? `<div class="wiki lead">${R.intro}</div>` : ''}
        <div class="filters"><div class="frow"><label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="rq" placeholder="Search the rules, e.g. trading, names, multiple accounts" aria-label="Search the rules" autocomplete="off"></label></div></div>
        <div class="rules-box"></div>${attrib(A.pages.rules)}`;
      const box = $('.rules-box', root);
      const strip = h => String(h).replace(/<[^>]+>/g, ' ').toLowerCase();
      const draw = q => {
        const ts = q.toLowerCase().split(/\s+/).filter(Boolean);
        box.innerHTML = R.groups.map(g => {
          const rs = g.rules.filter(r => ts.every(t => strip(r.html + ' ' + r.more).includes(t)));
          return rs.length ? `<section id="${esc(g.anchor)}" class="rgroup"><h2 class="home-h">${esc(g.title)}</h2>${rs.map(r => `
            <article class="rule">${r.n != null ? `<span class="rn">${r.n}</span>` : ''}<div><div class="wiki">${r.html}</div>${r.more ? `<div class="wiki rmore">${r.more}</div>` : ''}</div></article>`).join('')}</section>` : '';
        }).join('') || '<div class="empty">No rules match.</div>';
        for (const el of $$('.wiki', box)) enhanceFragment(el, page(A.pages.rules));
      };
      draw('');
      let t;
      $('#rq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => draw(e.target.value), 150); });
    }
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  }

  window.PD2About = { render };
})();
