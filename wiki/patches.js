/* Patch notes by season, from data/patches.json (split out of the wiki's Patch Notes page).
 *   #/patches               latest released season
 *   #/patches/s13[#anchor]  one season, optionally at a section
 *   #/patches/upcoming      next season's spoilers
 * Filter a season by category and class, or search every season at once.
 * history(name) finds the patch lines that mention an item or skill.
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const CATS = ['General', 'Classes', 'Items', 'Maps & Ubers', 'Mercenaries', 'PvP', 'Hotfixes'];
  const CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];

  let data = null, loading = null;
  const load = () => {
    if (data) return Promise.resolve(data);
    if (!loading) loading = P().fetchJSON('data/patches.json').then(d => {
      for (const s of d.seasons) {
        s.key = s.upcoming ? 'upcoming' : 's' + s.n;
        for (const b of s.blocks) b._l = b.lines.map(l => l.toLowerCase());
      }
      return (data = d);
    }).catch(e => { loading = null; throw e; });
    return loading;
  };
  const released = () => {
    const today = new Date().toISOString().slice(0, 10);
    return data.seasons.filter(s => !s.upcoming && (!s.iso || s.iso <= today));
  };
  const isFuture = s => s.upcoming || (s.iso && s.iso > new Date().toISOString().slice(0, 10));
  const label = s => s.upcoming ? 'Upcoming' : `Season ${s.n}`;

  const STORE = 'pd2wiki-patchf';
  const getF = () => { try { return JSON.parse(sessionStorage.getItem(STORE) || '{}'); } catch { return {}; } };
  const setF = f => { try { sessionStorage.setItem(STORE, JSON.stringify(f)); } catch {} };

  async function render(root, key, anchor) {
    const { esc, $, $$, byId, wikiUrl, enhanceFragment, fmtDate } = P();
    root.innerHTML = '<div class="loading">Loading patch notes…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load the patch notes.</b><br>${esc(e.message)}</div>`; return; }
    const season = data.seasons.find(s => s.key === key) || released()[0] || data.seasons[0];
    document.title = `${label(season)}${season.name && !season.upcoming ? ' ' + season.name : ''} · Patch Notes · PD2 Wiki`;
    const page = byId(data.page);
    const f = { cat: '', cls: '', q: '', ...getF() };
    const cats = CATS.filter(c => season.blocks.some(b => b.cat === c));
    if (f.cat && !cats.includes(f.cat)) f.cat = '';

    root.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/patches">Patch Notes</a></nav>
      <div class="pn">
        <aside class="pn-seasons" aria-label="Seasons"><ol>${data.seasons.map(s => `
          <li><a href="#/patches/${s.key}" class="${s === season ? 'on' : ''}${isFuture(s) ? ' future' : ''}"${s === season ? ' aria-current="page"' : ''}>
            <b>${esc(label(s))}</b><span>${esc(s.upcoming ? 'Dev streams & spoilers' : s.name)}</span>${s.iso ? `<time>${esc(fmtDate(s.iso))}</time>` : ''}</a></li>`).join('')}</ol></aside>
        <div class="pn-main">
          <header class="pn-head">
            <p class="pn-kicker">${esc(label(season))}${isFuture(season) && !season.upcoming ? ' · <span class="soon">Upcoming</span>' : ''}</p>
            <h1 class="page-title">${esc(season.upcoming ? 'Upcoming spoilers' : season.name)}</h1>
            ${season.date ? `<p class="pn-date">${esc(season.date)}</p>` : ''}
          </header>
          <div class="filters pn-filters">
            <div class="frow"><label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input type="search" id="pq" value="${esc(f.q)}" placeholder="Search every season, e.g. Zeal or Enigma" aria-label="Search all patch notes" autocomplete="off"></label></div>
            <div class="chips pn-cats" role="group" aria-label="Category">
              <button type="button" class="chip${!f.cat ? ' on' : ''}" data-cat="">All</button>
              ${cats.map(c => `<button type="button" class="chip${f.cat === c ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
            <div class="chips pn-cls" role="group" aria-label="Class"${f.cat === 'Classes' ? '' : ' hidden'}>
              ${CLASSES.filter(c => season.blocks.some(b => b.cls === c)).map(c => `<button type="button" class="chip${f.cls === c ? ' on' : ''}" data-cls="${c}">${c}</button>`).join('')}</div>
          </div>
          <div class="pn-tools"><span class="pn-toggle"><button type="button" class="chip" data-all="1">Expand all</button><button type="button" class="chip" data-all="0">Collapse all</button></span></div>
          <div class="pn-body"></div>
          <p class="attrib">From <a href="${page ? wikiUrl(page.title, season.anchor) : '#'}" target="_blank" rel="noopener">Patch Notes</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>
        </div>
      </div>`;

    const body = $('.pn-body', root);
    const show = () => {
      setF(f);
      for (const b of $$('.pn-cats .chip', root)) b.classList.toggle('on', b.dataset.cat === f.cat);
      for (const b of $$('.pn-cls .chip', root)) b.classList.toggle('on', b.dataset.cls === f.cls);
      $('.pn-cls', root).hidden = f.cat !== 'Classes';
      if (f.q.trim().length >= 2) { body.innerHTML = searchAll(f.q.trim()); return; }
      body.innerHTML = seasonHtml(season, f);
      enhanceFragment(body, page);
      $('.pn-tools', root).hidden = !$('.pn-body > details.pn-sec', root);
    };
    $('.pn-tools', root).addEventListener('click', e => {
      const all = e.target.closest('[data-all]');
      if (all) for (const d of $$('.pn-body > details.pn-sec', root)) d.open = all.dataset.all === '1';
    });
    $('.pn-cats', root).addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; f.cat = b.dataset.cat; if (f.cat !== 'Classes') f.cls = ''; show(); });
    $('.pn-cls', root).addEventListener('click', e => { const b = e.target.closest('[data-cls]'); if (!b) return; f.cls = f.cls === b.dataset.cls ? '' : b.dataset.cls; show(); });
    let t;
    $('#pq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; show(); }, 180); });
    if (anchor) { f.cat = ''; f.cls = ''; f.q = ''; $('#pq', root).value = ''; }
    show();
    if (anchor) {
      const el = document.getElementById(anchor);
      if (el) {
        if (el.matches('details')) el.open = true;
        for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
        requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
      }
    }
    const cur = $('.pn-seasons a.on', root);
    if (cur && matchMedia('(max-width: 900px)').matches) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function seasonHtml(season, f) {
    const { esc } = P();
    const keep = b => (!f.cat || b.cat === f.cat) && (!f.cls || b.cls === f.cls);
    const kids = new Map();
    for (const b of season.blocks) if (b.parent) { if (!kids.has(b.parent)) kids.set(b.parent, []); kids.get(b.parent).push(b); }
    const visible = b => keep(b) || (kids.get(b.anchor) || []).some(visible);
    const one = (b, depth) => {
      if (!visible(b)) return '';
      const inner = `${b.html ? `<div class="wiki pn-text">${b.html}</div>` : ''}${(kids.get(b.anchor) || []).map(k => one(k, depth + 1)).join('')}`;
      const tag = b.cls ? `<span class="cls-orb cls-${b.cls.toLowerCase()}" aria-hidden="true">${b.cls[0]}</span>` : '';
      if (b.cat === 'Hotfixes' && depth > 0) {
        return `<details class="pn-fix" id="${esc(b.anchor)}"><summary>${esc(b.title)}<span>${b.lines.length} change${b.lines.length === 1 ? '' : 's'}</span></summary>${inner}</details>`;
      }
      if (depth === 0) {
        // Top sections fold to one line with their size; a filter opens what it matches.
        const n = count(b);
        const open = f.cat || f.cls || b === first;
        return `<details class="pn-sec d0" id="${esc(b.anchor)}"${open ? ' open' : ''}>
          <summary class="pn-title">${tag}<span>${esc(b.title)}</span><em class="pn-cat">${esc(b.cat)}</em><span class="pn-n">${n} change${n === 1 ? '' : 's'}</span></summary>${inner}</details>`;
      }
      return `<section class="pn-sec d${Math.min(depth, 2)}" id="${esc(b.anchor)}"><h3 class="pn-title">${tag}${esc(b.title)}</h3>${inner}</section>`;
    };
    const count = b => (keep(b) ? b.lines.length : 0) + (kids.get(b.anchor) || []).reduce((a, k) => a + count(k), 0);
    const tops = season.blocks.filter(b => !b.parent);
    const first = tops.find(visible);
    const intro = season.intro && !f.cat && season.intro.html ? `<div class="wiki pn-intro">${season.intro.html}</div>` : '';
    const out = intro + tops.map(b => one(b, 0)).join('');
    return out || `<div class="empty">Nothing in this season for that filter.</div>`;
  }

  function searchAll(q) {
    const { esc } = P();
    const ts = q.toLowerCase().split(/\s+/).filter(Boolean);
    const groups = [];
    let total = 0;
    for (const s of data.seasons) {
      const hits = [];
      for (const b of s.blocks) b._l.forEach((l, i) => { if (ts.every(t => l.includes(t))) hits.push({ b, line: b.lines[i] }); });
      if (hits.length) { groups.push({ s, hits }); total += hits.length; }
    }
    if (!total) return `<div class="empty">No patch notes mention “${esc(q)}”.</div>`;
    const re = new RegExp(`(${ts.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return `<p class="rcount">${total} line${total === 1 ? '' : 's'} in ${groups.length} season${groups.length === 1 ? '' : 's'}</p>` + groups.map(({ s, hits }) => `
      <section class="pn-hits"><h2 class="home-h"><a href="#/patches/${s.key}">${esc(label(s))}${s.name && !s.upcoming ? ' · ' + esc(s.name) : ''}</a></h2>
        <ul>${hits.slice(0, 60).map(h => `<li><a href="#/patches/${s.key}#${encodeURIComponent(h.b.anchor)}" class="pn-where">${esc(h.b.title)}</a>${esc(h.line).replace(re, '<mark>$1</mark>')}</li>`).join('')}</ul>
        ${hits.length > 60 ? `<p class="muted">+${hits.length - 60} more in this season</p>` : ''}</section>`).join('');
  }

  // Patch history for an item or skill name, from data/history/<first letter>.json (built by
  // the sync with the same matching as fullHistory below), so item and skill pages don't
  // download every season's notes. Falls back to scanning the notes for other names.
  const shards = new Map();
  async function history(name, limit = 30) {
    const k = /^[a-z]/i.test(name) ? name[0].toLowerCase() : '_';
    if (!shards.has(k)) shards.set(k, P().fetchJSON(`data/history/${k}.json`).catch(() => null));
    const shard = await shards.get(k);
    const seasons = P().S.index.seasons || [];
    if (shard && seasons.length) {
      return (shard[name] || []).slice(0, limit).map(([si, anchor, title, line]) => {
        const s = seasons[si] || {};
        return { s: { key: s.key, n: s.n, name: s.name, upcoming: s.key === 'upcoming' }, b: { anchor, title }, line };
      });
    }
    return fullHistory(name, limit);
  }

  // Lines that mention `name` as a whole word (case-sensitive, so "Death" the runeword
  // doesn't match every "death"), newest season first.
  async function fullHistory(name, limit = 30) {
    await load();
    const re = new RegExp(`(^|[^A-Za-z'])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`);
    const out = [];
    for (const s of data.seasons) for (const b of s.blocks) for (const l of b.lines) {
      if (!re.test(l)) continue;
      // Grouped lines ("Runeword Weapons: a · b · c") keep only the parts about `name`.
      let line = l;
      const i = l.indexOf(': ');
      if (l.includes(' · ') && i > 0) {
        const head = l.slice(0, i), parts = l.slice(i + 2).split(' · ');
        const mine = parts.filter(x => re.test(x));
        if (re.test(head)) line = l.length > 320 ? l.slice(0, 317) + '…' : l;
        else if (mine.length) line = `${head}: ${mine.join(' · ')}`;
      }
      out.push({ s, b, line });
      if (out.length >= limit) return out;
    }
    return out;
  }

  async function historyHtml(name) {
    const { esc } = P();
    let hits;
    try { hits = await history(name); } catch { return ''; }
    if (!hits.length) return '';
    const safe = esc(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return `<section class="phist"><h2 class="home-h">Patch history</h2><ul>${hits.map(h => `
      <li><a class="phist-s" href="#/patches/${h.s.key}#${encodeURIComponent(h.b.anchor)}">${esc(label(h.s))}</a><span>${esc(h.line).replace(new RegExp(safe, 'g'), '<b>$&</b>')}</span></li>`).join('')}</ul></section>`;
  }

  window.PD2Patches = { load, render, history, historyHtml, get data() { return data; } };
})();
