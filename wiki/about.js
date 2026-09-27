/* About PD2: rules, singleplayer differences and credits, from gear.json's about.
 *   #/about[#group]              rules as numbered cards, searchable
 *   #/about/singleplayer         differences from online play, bugs with their fixes
 *   #/about/credits              everyone who made PD2, by role
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const TABS = [['', 'Rules'], ['seasons', 'Seasons'], ['bugs', 'Known bugs'], ['singleplayer', 'Singleplayer'], ['credits', 'Credits']];
  const attrib = id => { const p = P().byId(id); return `<p class="attrib">From <a href="${p ? P().wikiUrl(p.title) : '#'}" target="_blank" rel="noopener">${P().esc(p?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`; };
  const head = (tab, title) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>About PD2</span></nav>
    <h1 class="page-title">${title}</h1><div class="segs" role="group">${TABS.map(([k, l]) => `<a class="seg${k === tab ? ' on' : ''}" href="#/about${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;

  async function render(root, tab, anchor) {
    const { esc, $, $$, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    let A;
    try { A = (await window.PD2Gear.load()).about; } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load this page.</b><br>${esc(e.message)}</div>`; return; }
    const page = id => P().byId(id);

    if (tab === 'bugs') {
      const B = A.bugs;
      const all = B.sections.flatMap(sec => sec.bugs.map(b => ({ ...b, sec: sec.title })));
      const recent = Math.max(0, ...all.map(b => b.season || 0));
      root.innerHTML = `${head('bugs', 'Known Bugs')}
        ${B.warning ? `<p class="warnbox"><b>Some of these may be fixed.</b> ${esc(B.warning.replace(/^Reason:\s*/i, ''))}</p>` : ''}
        <div class="filters"><div class="frow"><label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="bq" placeholder="Search bugs, e.g. corpse, cube, stash" aria-label="Search bugs" autocomplete="off"></label></div>
          <div class="chips">${['', ...B.sections.map(x => x.title)].map(t => `<button type="button" class="chip${t === '' ? ' on' : ''}" data-sec="${esc(t)}">${t ? esc(t) : 'All'}</button>`).join('')}
            ${recent ? `<button type="button" class="chip toggle" data-recent>Confirmed in S${recent}</button>` : ''}</div></div>
        <div class="bugs"></div>
        <p class="muted">For crashes and setup problems see the <a href="#/help">Help Center</a>. New bugs are reported in the PD2 Discord's #known-bugs channel.</p>
        ${attrib(B.page)}`;
      const box = $('.bugs', root);
      const f = { sec: '', q: '', recent: false };
      const draw = () => {
        const ts = f.q.toLowerCase().split(/\s+/).filter(Boolean);
        box.innerHTML = B.sections.filter(x => !f.sec || x.title === f.sec).map(x => {
          const bs = x.bugs.filter(b => (!f.recent || b.season) && ts.every(t => (b.text + ' ' + b.note).toLowerCase().includes(t)));
          if (!bs.length) return '';
          const groups = [...new Set(bs.map(b => b.group))];
          return `<section class="info-card" id="${esc(x.anchor)}"><h2 class="home-h">${esc(x.title)}${x.blurb ? ` <small>${esc(x.blurb)}</small>` : ''}</h2>
            ${groups.map(g => `${g ? `<h3 class="sub-h">${esc(g)}</h3>` : ''}<ul class="splist">${bs.filter(b => b.group === g).map(b => `<li>${b.season ? `<em class="bugtag">S${b.season}</em>` : ''}<div class="wiki">${b.html}</div>${b.note ? `<div class="wiki spfix">${b.note}</div>` : ''}${b.more ? `<div class="wiki muted">${b.more}</div>` : ''}</li>`).join('')}</ul>`).join('')}</section>`;
        }).join('') || '<div class="empty">No bugs match.</div>';
        for (const el of $$('.wiki', box)) enhanceFragment(el, page(B.page));
      };
      draw();
      root.querySelector('.filters').addEventListener('click', e => {
        const b = e.target.closest('[data-sec]');
        if (b) { f.sec = b.dataset.sec; for (const x of $$('[data-sec]', root)) x.classList.toggle('on', x === b); draw(); }
        const r = e.target.closest('[data-recent]');
        if (r) { f.recent = !f.recent; r.classList.toggle('on', f.recent); draw(); }
      });
      let t;
      $('#bq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); draw(); }, 150); });
    } else if (tab === 'seasons') {
      const S = A.seasons;
      // The wiki's table can lag behind; fill in later seasons from the patch-notes data.
      const known = new Set(S.seasons.filter(x => x.n).map(x => x.n));
      const extra = (P().S.index.seasons || []).filter(x => x.n && !known.has(x.n) && x.iso)
        .map(x => ({ name: `Season ${x.n} - ${x.name}`, n: x.n, title: x.name, start: x.iso, days: null, daysText: '', details: '', league: false }));
      const rows = [...S.seasons, ...extra].sort((a, b) => a.start.localeCompare(b.start));
      const today = new Date().toISOString().slice(0, 10);
      rows.forEach((r, i) => {
        const next = rows.slice(i + 1).find(x => !x.league);
        r.upcoming = r.start > today;
        r.current = !r.upcoming && !r.league && !(next && next.start <= today);
        if (r.days == null && !r.upcoming) r.days = Math.round(((next && next.start <= today ? new Date(next.start) : new Date(today)) - new Date(r.start)) / 864e5);
      });
      const max = Math.max(...rows.map(r => r.days || 0), 1);
      const { fmtDate } = P();
      const len = r => r.upcoming ? 'upcoming' : r.current ? `${r.days} days so far` : r.days ? `${/\+/.test(r.daysText || '') ? esc(r.daysText) : r.days} days` : '';
      root.innerHTML = `${head('seasons', 'Seasons')}
        <p class="lead">Every PD2 ladder season and league, newest first: how long each ran and what was special about it. Click a season for its patch notes.</p>
        <ol class="tl">${[...rows].reverse().map(r => `<li class="${r.league ? 'league' : ''}${r.current ? ' now' : ''}${r.upcoming ? ' soon' : ''}">
          <a class="tl-name" href="${r.n ? `#/patches/s${r.n}` : '#/patches'}"><b>${r.n ? `Season ${r.n}` : 'League'}</b><span>${esc(r.title)}</span></a>
          <span class="tl-date">${esc(fmtDate(r.start))}</span>
          <span class="tl-bar"><i style="width:${r.days ? Math.max(4, r.days / max * 100) : 4}%"></i><em>${len(r)}</em></span>
          ${r.details ? `<span class="tl-note wiki">${r.details}</span>` : ''}</li>`).join('')}</ol>
        ${S.info.map(i => `<section class="info-card" id="${esc(i.anchor)}"><h2 class="home-h">${esc(i.title)}</h2><div class="wiki">${i.html}</div></section>`).join('')}
        ${attrib(S.page)}`;
      for (const el of $$('.wiki', root)) enhanceFragment(el, page(S.page));
    } else if (tab === 'singleplayer') {
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
