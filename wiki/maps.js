/* Map explorer, from data/maps.json (built by tools/wiki-sync/extract.mjs from the Maps page).
 *   #/maps?tier=T2&avoid=cold,fire&q=…   every map as a card, filterable by what's immune
 *   #/maps/events | modify | affixes     the general map rules
 *   #/map/<slug>                         one map: monsters and resistances, notes, screenshots
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const EL = [
    ['phys', 'Physical'], ['magic', 'Magic'], ['fire', 'Fire'], ['light', 'Lightning'], ['cold', 'Cold'], ['poison', 'Poison'],
  ];
  const TIERS = [['T1', 'Tier 1'], ['T2', 'Tier 2'], ['T3', 'Tier 3'], ['Dungeon', 'Dungeons'], ['Unique', 'Unique']];
  const TABS = [['', 'Maps'], ['events', 'Map events'], ['modify', 'Modifying maps'], ['affixes', 'Map affixes']];

  let data = null, loading = null;
  const load = () => {
    if (data) return Promise.resolve(data);
    if (!loading) loading = P().fetchJSON('data/maps.json').then(d => {
      for (const m of d.maps) m._s = [m.name, m.tier, ...m.monsters.map(x => x.name), ...m.types].join(' ').toLowerCase();
      return (data = d);
    }).catch(e => { loading = null; throw e; });
    return loading;
  };

  const readQ = qs => {
    const p = new URLSearchParams(qs || '');
    return { tier: p.get('tier') || '', avoid: (p.get('avoid') || '').split(',').filter(Boolean), q: p.get('q') || '', type: p.get('type') || '' };
  };
  const writeQ = f => {
    const p = new URLSearchParams();
    if (f.tier) p.set('tier', f.tier);
    if (f.avoid.length) p.set('avoid', f.avoid.join(','));
    if (f.type) p.set('type', f.type);
    if (f.q) p.set('q', f.q);
    const s = p.toString().replace(/%2C/g, ',');
    return '#/maps' + (s ? '?' + s : '');
  };

  const tabs = active => `<div class="segs" role="group" aria-label="Map topics">${TABS.map(([k, l]) =>
    `<a class="seg${k === active ? ' on' : ''}" href="#/maps${k ? '/' + k : ''}" aria-pressed="${k === active}">${l}</a>`).join('')}</div>`;
  const tierLabel = t => (TIERS.find(x => x[0] === t) || [, t])[1];

  function immuneRow(m) {
    return `<div class="imm">${EL.map(([k, l]) => {
      const n = m.immune[k] || 0;
      return `<span class="el el-${k}${n ? ' on' : ''}" title="${n ? `${n} monster type${n > 1 ? 's' : ''} immune to ${l}` : `Nothing immune to ${l}`}">${l.slice(0, 4)}${n ? `<b>${n}</b>` : ''}</span>`;
    }).join('')}</div>`;
  }

  function card(m) {
    const { esc } = P();
    const shot = m.shots[0];
    return `<a class="mcard" href="#/map/${m.slug}">
      ${shot ? `<span class="mshot"><img src="${esc(shot.thumb)}" alt="" loading="lazy" decoding="async"></span>` : '<span class="mshot empty"></span>'}
      <span class="mbody">
        <span class="mtitle">${m.icon ? `<img src="${esc(m.icon)}" alt="" loading="lazy">` : ''}<b>${esc(m.name)}</b><em class="tier tier-${esc(m.tier)}">${esc(m.tier)}</em></span>
        ${immuneRow(m)}
        <span class="mmeta">${m.monsters.length} monster types${m.types.length ? ' · ' + m.types.map(esc).join(', ') : ''}</span>
      </span>
    </a>`;
  }

  function apply(f) {
    const ts = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.maps.filter(m => (!f.tier || m.tier === f.tier) && f.avoid.every(e => !m.immune[e]) &&
      (!f.type || m.types.includes(f.type)) && ts.every(t => m._s.includes(t)));
  }

  async function list(root, qs, tab = '') {
    const { esc, $, byId, wikiUrl } = P();
    root.innerHTML = '<div class="loading">Loading maps…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load the maps.</b><br>${esc(e.message)}</div>`; return; }
    const page = byId(data.page);
    const head = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>Endgame</span></nav>
      <h1 class="page-title">${tab ? esc(TABS.find(t => t[0] === tab)[1]) : 'Map Explorer'}</h1>${tabs(tab)}`;
    const foot = `<p class="attrib">From <a href="${page ? wikiUrl(page.title) : '#'}" target="_blank" rel="noopener">Maps</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`;

    if (tab) {
      const blocks = data.info.filter(i => i.tab === tab);
      const events = tab === 'events' ? `<div class="events">${data.events.map(e => `
        <article class="event"><q>${esc(e.quote.replace(/^["“]|["”]$/g, ''))}</q><div class="wiki">${e.html}</div></article>`).join('')}</div>` : '';
      root.innerHTML = `${head}<div class="wiki map-info">${blocks.map(b => b.html).join('')}</div>${events}${foot}`;
      for (const el of root.querySelectorAll('.wiki')) P().enhanceFragment(el, page);
      return;
    }

    const f = readQ(qs);
    const types = [...new Set(data.maps.flatMap(m => m.types))].sort();
    const chip = (label, next, on, extra = '') => `<a class="chip${on ? ' on' : ''}${extra}" href="${writeQ(next)}" aria-pressed="${on}">${label}</a>`;
    root.innerHTML = `${head}
      <div class="filters">
        <div class="frow">
          <label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input type="search" id="mq" value="${esc(f.q)}" placeholder="Map or monster name" aria-label="Filter maps" autocomplete="off"></label>
        </div>
        <div class="chips" role="group" aria-label="Tier">${TIERS.map(([k, l]) => chip(l, { ...f, tier: f.tier === k ? '' : k }, f.tier === k)).join('')}</div>
        <div class="frow"><span class="flabel">No monsters immune to</span>
          <div class="chips" role="group" aria-label="Hide maps with immunities">${EL.map(([k, l]) => chip(l, { ...f, avoid: f.avoid.includes(k) ? f.avoid.filter(x => x !== k) : [...f.avoid, k] }, f.avoid.includes(k), ` el-chip el-${k}`)).join('')}</div></div>
        ${types.length ? `<div class="frow"><span class="flabel">Has</span><div class="chips" role="group" aria-label="Monster type">${types.map(t => chip(esc(t), { ...f, type: f.type === t ? '' : t }, f.type === t)).join('')}</div></div>` : ''}
      </div>
      <div class="rcount" aria-live="polite"></div>
      <div class="mgrid"></div>
      ${foot}`;
    const grid = $('.mgrid', root), count = $('.rcount', root);
    const update = ff => {
      const res = apply(ff);
      count.textContent = `${res.length} map${res.length === 1 ? '' : 's'}${ff.avoid.length ? ` with nothing immune to ${ff.avoid.map(e => EL.find(x => x[0] === e)[1].toLowerCase()).join(' or ')}` : ''}`;
      const byTier = TIERS.map(([k, l]) => [l, res.filter(m => m.tier === k)]).filter(([, ms]) => ms.length);
      grid.innerHTML = res.length ? byTier.map(([l, ms]) => `<h2 class="home-h">${esc(l)}</h2><div class="mcards">${ms.map(card).join('')}</div>`).join('')
        : `<div class="empty">No maps match. <a href="#/maps">Clear filters</a></div>`;
    };
    update(f);
    let t;
    $('#mq', root).addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => {
        const next = { ...readQ(location.hash.split('?')[1]), q: e.target.value.trim() };
        history.replaceState(null, '', writeQ(next));
        update(next);
      }, 150);
    });
  }

  async function detail(root, slug) {
    const { esc, byId, wikiUrl, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load the maps.</b><br>${esc(e.message)}</div>`; return; }
    const m = data.maps.find(x => x.slug === slug);
    if (!m) { root.innerHTML = `<div class="error"><b>No map “${esc(slug)}”.</b><br><a href="#/maps">All maps</a></div>`; return; }
    document.title = `${m.name} · PD2 Wiki`;
    const page = byId(data.page);
    const same = data.maps.filter(x => x.tier === m.tier);
    const i = same.indexOf(m);
    const prev = same[i - 1], next = same[i + 1];
    const cell = (v, k) => {
      const cls = v >= 100 ? ' imm-cell' : v >= 75 ? ' hi' : v <= 0 ? ' lo' : '';
      return `<td class="r el-${k}${cls}">${v || '—'}</td>`;
    };
    root.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/maps">Maps</a><span aria-hidden="true">›</span><a href="#/maps?tier=${esc(m.tier)}">${esc(tierLabel(m.tier))}</a></nav>
      <div class="map-head">
        ${m.icon ? `<img src="${esc(m.icon)}" alt="">` : ''}
        <h1 class="page-title">${esc(m.name)}</h1><em class="tier tier-${esc(m.tier)}">${esc(tierLabel(m.tier))}</em>
      </div>
      ${immuneRow(m)}
      ${m.shots.length ? `<div class="shots">${m.shots.map(s => `<a class="img-link" href="${esc(s.full)}"><img src="${esc(s.thumb)}" alt="${esc(m.name)} screenshot" loading="lazy"></a>`).join('')}</div>` : ''}
      ${m.desc ? `<div class="wiki map-desc">${m.desc}</div>` : ''}
      ${m.monsters.length ? `<h2 class="home-h">Monsters</h2>
        <div class="tw"><table class="restable">
          <thead><tr><th>Monster</th>${EL.map(([k, l]) => `<th class="el-${k}" title="${l} resistance">${l.slice(0, 4)}</th>`).join('')}<th>Type</th><th title="Life drain">Drain</th></tr></thead>
          <tbody>${m.monsters.map(x => `<tr><td class="mn${x.minion ? ' minion' : ''}">${esc(x.name)}${x.boss ? ' <span class="boss" title="Boss or special monster">★</span>' : ''}${x.minion ? ' <small>minion</small>' : ''}</td>${EL.map(([k]) => cell(x.res[k], k)).join('')}<td>${esc(x.type)}</td><td class="r">${x.drain ?? ''}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="legend"><span class="imm-cell">100+</span> immune <span class="hi">75+</span> high resistance</p>` : ''}
      ${m.notes.length ? `<h2 class="home-h">Notes</h2><ul class="wiki map-notes">${m.notes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
      <nav class="pager">${prev ? `<a href="#/map/${prev.slug}">← ${esc(prev.name)}</a>` : '<span></span>'}${next ? `<a href="#/map/${next.slug}">${esc(next.name)} →</a>` : ''}</nav>
      <p class="attrib">From <a href="${page ? wikiUrl(page.title, m.anchor) : '#'}" target="_blank" rel="noopener">Maps</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`;
    for (const el of root.querySelectorAll('.map-desc, .map-notes')) enhanceFragment(el, page);
  }

  function search(q, n) {
    if (!data) return [];
    const ql = q.toLowerCase();
    return data.maps.filter(m => m.name.toLowerCase().includes(ql)).slice(0, n);
  }

  window.PD2Maps = { load, list, detail, search, get data() { return data; } };
})();
