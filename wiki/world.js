/* Zones and monsters, from data/world.json (built from the Zones and Monsters pages).
 *   #/zones?act=1&diff=h&l85=1&corrupt=1&avoid=cold&sort=lvl&q=…   every zone
 *   #/monsters[#<boss>]                                            boss bestiary
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const EL = [['phys', 'Physical'], ['magic', 'Magic'], ['fire', 'Fire'], ['light', 'Lightning'], ['cold', 'Cold'], ['poison', 'Poison']];
  const DIFF = [['n', 'Normal'], ['nm', 'Nightmare'], ['h', 'Hell']];
  const GROUPS = [['Act Bosses', 'Act bosses'], ['Key Holders', 'Key holders'], ['Ubers', 'Ubers']];

  let data = null, loading = null;
  const load = () => {
    if (data) return Promise.resolve(data);
    if (!loading) loading = P().fetchJSON('data/world.json').then(d => {
      for (const z of d.zones.zones) z._s = [z.name, z.parent, ...z.supers].join(' ').toLowerCase();
      for (const b of d.monsters.bosses) b._s = [b.name, b.group, b.html.replace(/<[^>]+>/g, ' ')].join(' ').toLowerCase();
      return (data = d);
    }).catch(e => { loading = null; throw e; });
    return loading;
  };
  const foot = id => {
    const p = P().byId(id);
    return `<p class="attrib">From <a href="${p ? P().wikiUrl(p.title) : '#'}" target="_blank" rel="noopener">${P().esc(p?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`;
  };
  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>Endgame</span></nav>`;
  const tabs = active => `<div class="segs" role="group" aria-label="World">${[['zones', 'Zones'], ['monsters', 'Monsters'], ['maps', 'Maps']].map(([k, l]) =>
    `<a class="seg${k === active ? ' on' : ''}" href="#/${k}" aria-pressed="${k === active}">${l}</a>`).join('')}</div>`;

  // ---------- zones ----------
  const readQ = qs => {
    const p = new URLSearchParams(qs || '');
    return { act: p.get('act') || '', diff: p.get('diff') || 'h', l85: p.get('l85') === '1', corrupt: p.get('corrupt') === '1',
      avoid: (p.get('avoid') || '').split(',').filter(Boolean), sort: p.get('sort') || 'act', q: p.get('q') || '' };
  };
  const writeQ = f => {
    const p = new URLSearchParams();
    if (f.act) p.set('act', f.act);
    if (f.diff !== 'h') p.set('diff', f.diff);
    if (f.l85) p.set('l85', '1');
    if (f.corrupt) p.set('corrupt', '1');
    if (f.avoid.length) p.set('avoid', f.avoid.join(','));
    if (f.sort !== 'act') p.set('sort', f.sort);
    if (f.q) p.set('q', f.q);
    const s = p.toString().replace(/%2C/g, ',');
    return '#/zones' + (s ? '?' + s : '');
  };

  async function zones(root, qs) {
    const { esc, $, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading zones…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load zones.</b><br>${esc(e.message)}</div>`; return; }
    const Z = data.zones;
    const f = readQ(qs);
    const bossBy = new Map(data.monsters.bosses.map(b => [b.name.toLowerCase().replace(/^the /, ''), b]));
    const chip = (label, next, on, extra = '') => `<a class="chip${on ? ' on' : ''}${extra}" href="${writeQ(next)}" aria-pressed="${on}">${label}</a>`;
    root.innerHTML = `${crumbs}<h1 class="page-title">Zones</h1>${tabs('zones')}
      ${Z.info.length ? `<details class="about"><summary>About zone levels, level 85 zones and corrupted zones</summary><div class="wiki">${Z.info.map(i => `<h3 class="sub-h">${esc(i.title)}</h3>${i.html}`).join('')}</div></details>` : ''}
      <div class="filters">
        <div class="frow"><label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="zq" value="${esc(f.q)}" placeholder="Zone or super unique, e.g. Pit, Countess" aria-label="Filter zones" autocomplete="off"></label>
          <label class="fsel">Difficulty <select id="zdiff">${DIFF.map(([k, l]) => `<option value="${k}"${f.diff === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="fsel">Sort <select id="zsort"><option value="act"${f.sort === 'act' ? ' selected' : ''}>By act</option><option value="lvl"${f.sort === 'lvl' ? ' selected' : ''}>Highest level</option><option value="lvl-asc"${f.sort === 'lvl-asc' ? ' selected' : ''}>Lowest level</option><option value="name"${f.sort === 'name' ? ' selected' : ''}>Name</option></select></label>
        </div>
        <div class="chips" role="group" aria-label="Act">${['', '1', '2', '3', '4', '5'].map(a => chip(a ? `Act ${a}` : 'All acts', { ...f, act: a }, f.act === a)).join('')}
          ${chip('Level 85 (Hell)', { ...f, l85: !f.l85 }, f.l85, ' toggle')}${chip('Can be corrupted', { ...f, corrupt: !f.corrupt }, f.corrupt, ' toggle')}</div>
        <div class="frow"><span class="flabel">No monsters immune to</span><div class="chips" role="group" aria-label="Hide zones with immunities">${EL.map(([k, l]) =>
          chip(l, { ...f, avoid: f.avoid.includes(k) ? f.avoid.filter(x => x !== k) : [...f.avoid, k] }, f.avoid.includes(k), ` el-chip el-${k}`)).join('')}</div></div>
      </div>
      <div class="rcount" aria-live="polite"></div>
      <p class="zkey muted"><em class="corrupt">C</em> can be a corrupted zone · <span class="l85k">85</span> level 85 in Hell · hover a boss for its details</p>
      <div class="tw"><table class="restable ztable"><thead><tr>
        <th>Zone</th>${DIFF.map(([k, l]) => `<th class="${k === f.diff ? 'cur' : ''}" title="${l} monster level">${l === 'Nightmare' ? 'NM' : l[0]}</th>`).join('')}
        <th title="Waypoint">WP</th><th>Immunities <small>(lvl 85)</small></th><th>Super uniques</th></tr></thead><tbody></tbody></table></div>
      ${f.avoid.length ? '<p class="muted">Immunity counts are only listed for level 85 zones, so the immunity filter shows those.</p>' : ''}
      ${foot(Z.page)}`;
    enhanceFragment($('.about .wiki', root) || document.createElement('div'), P().byId(Z.page));

    const body = $('tbody', root), count = $('.rcount', root);
    const draw = ff => {
      const ts = ff.q.toLowerCase().split(/\s+/).filter(Boolean);
      let rows = Z.zones.filter(z => (!ff.act || String(z.act) === ff.act) && (!ff.l85 || z.l85) && (!ff.corrupt || z.corrupt) &&
        (!ff.avoid.length || (z.immune && ff.avoid.every(e => !z.immune[e]?.n))) && ts.every(t => z._s.includes(t)));
      const lv = z => z.lvl[ff.diff] ?? -1;
      if (ff.sort === 'lvl') rows = [...rows].sort((a, b) => lv(b) - lv(a));
      else if (ff.sort === 'lvl-asc') rows = [...rows].filter(z => lv(z) >= 0).sort((a, b) => lv(a) - lv(b));
      else if (ff.sort === 'name') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
      count.textContent = `${rows.length} zone${rows.length === 1 ? '' : 's'}`;
      const byAct = ff.sort === 'act';
      let lastAct = null;
      body.innerHTML = rows.map(z => {
        const lvCell = k => {
          const v = z.lvl[k];
          const was = k === 'h' && z.hellWas && z.hellWas !== v ? `<small title="Before PD2">was ${z.hellWas}</small>` : '';
          return `<td class="r lv${k === ff.diff ? ' cur' : ''}${k === 'h' && v >= 85 ? ' l85' : ''}">${v ?? '—'}${was}</td>`;
        };
        const imm = z.immune ? `<div class="imm">${EL.filter(([k]) => z.immune[k]?.n).map(([k, l]) => `<span class="el el-${k} on" title="${esc(z.immune[k].t)} ${l.toLowerCase()}-immune monster type(s)">${l.slice(0, 4)}<b>${esc(z.immune[k].t.replace(/\s/g, ''))}</b></span>`).join('') || '<span class="muted">none</span>'}</div>` : '';
        const sup = z.supers.map(s => {
          const b = bossBy.get(s.toLowerCase().replace(/^the /, ''));
          return b ? `<a class="sup sup-boss" href="#/monsters#${b.slug}" data-hc="boss:${esc(b.slug)}">${esc(s)}</a>` : `<span class="sup">${esc(s)}</span>`;
        }).join('<i class="zsep">, </i>');
        const act = byAct && z.act !== lastAct ? `<tr class="zact"><th colspan="7">${z.act ? `Act ${z.act}` : 'Other'}</th></tr>` : '';
        lastAct = z.act;
        return `${act}<tr id="z-${esc(z.slug)}"><td class="zn">${!byAct && z.act ? `<i class="zact-n">A${z.act}</i>` : ''}<b>${esc(z.name)}</b>${z.parent ? ` <small>· ${esc(z.parent)}</small>` : ''}${z.corrupt ? ' <em class="corrupt" title="Can be a corrupted zone (monster level 85)">C</em>' : ''}</td>
          ${DIFF.map(([k]) => lvCell(k)).join('')}
          <td class="r">${z.wp ? '<span class="wp" title="Waypoint">✓</span>' : ''}</td><td>${imm}</td><td class="sups">${sup}</td></tr>`;
      }).join('') || `<tr><td colspan="7" class="empty">No zones match. <a href="#/zones">Clear filters</a></td></tr>`;
    };
    draw(f);
    const live = patch => { const next = { ...readQ(location.hash.split('?')[1]), ...patch }; history.replaceState(null, '', writeQ(next)); draw(next); };
    let t;
    $('#zq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => live({ q: e.target.value.trim() }), 150); });
    $('#zdiff', root).addEventListener('change', e => { live({ diff: e.target.value }); P().rerender(); });
    $('#zsort', root).addEventListener('change', e => live({ sort: e.target.value }));
  }

  // ---------- monsters ----------
  // First bullet of a boss's notes, as plain text, for its one-line summary.
  const firstNote = html => {
    const t = document.createElement('template');
    t.innerHTML = html;
    const li = t.content.querySelector('li') || t.content.querySelector('p');
    if (li) for (const sub of li.querySelectorAll('ul, ol')) sub.remove();
    return (li || t.content).textContent.replace(/\s+/g, ' ').trim();
  };
  const resCells = r => EL.map(([k, l]) => {
    const v = r?.res?.[k];
    if (v == null) return `<td class="r el-${k} dim">—</td>`;
    return `<td class="r el-${k}${v >= 100 ? ' imm-cell' : v >= 75 ? ' hi' : ''}" title="${l} resistance">${v}</td>`;
  }).join('');

  // Monsters: each group is one table (resists, where it's found, first note); hover a row
  // for the full notes, click it to open them in place.
  async function monsters(root, anchor) {
    const { esc, $, $$, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading monsters…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load monsters.</b><br>${esc(e.message)}</div>`; return; }
    const M = data.monsters;
    const zoneBy = new Map(data.zones.zones.map(z => [z.slug, z]));
    const info = t => M.info.find(i => i.title.toLowerCase() === t.toLowerCase());
    const where = b => b.zones.map(s => zoneBy.get(s)).filter(Boolean).map(z => `<a href="#/zones?q=${encodeURIComponent(z.name)}">${esc(z.name)}</a>${z.lvl.h ? ` <small>${z.lvl.h}</small>` : ''}`).join(', ');
    // Resistance columns only where the wiki lists them (act bosses have none).
    const head = res => `<thead><tr><th>Name</th>${res ? EL.map(([e, n]) => `<th class="el-${e}" title="${n} resistance">${n.slice(0, 4)}</th>`).join('') : ''}<th>Found in <small>(Hell lvl)</small></th><th>Notes</th></tr></thead>`;
    const row = (b, res) => `<tr class="brow" id="${esc(b.slug)}" data-hc="boss:${esc(b.slug)}" tabindex="0" aria-expanded="false">
        <td class="mn"><b>${esc(b.name)}</b>${b.stats?.type ? ` <em>${esc(b.stats.type)}</em>` : ''}</td>
        ${res ? resCells(b.stats) : ''}
        <td class="bwhere">${where(b) || '<span class="dim">—</span>'}</td>
        <td class="bsum"><span>${esc(firstNote(b.html))}</span></td></tr>
      <tr class="bdet" hidden><td colspan="${(res ? EL.length : 0) + 3}"><div class="wiki bnotes">${b.html}</div></td></tr>`;
    const uberRows = M.stats.filter(s => s.where === 'Ubers');
    const prime = info('Prime Evils');
    root.innerHTML = `${crumbs}<h1 class="page-title">Monsters</h1>${tabs('monsters')}
      <p class="lead">Resistances of 100 or more (immune) are filled in. Hover a monster for its PD2 changes, or click it to open them.</p>
      ${GROUPS.map(([k, l]) => {
        const bs = M.bosses.filter(b => b.group === k);
        if (!bs.length) return '';
        const intro = k === 'Key Holders' ? info('Key Holders') : k === 'Ubers' ? info('Ubers') : prime;
        return `<section class="mgroup" id="g-${k.replace(/\s/g, '-')}"><h2 class="home-h">${l}</h2>
          ${intro ? `<details class="about"><summary>${k === 'Act Bosses' ? 'What PD2 changed for every act boss' : `About ${esc(l.toLowerCase())}`}</summary><div class="wiki">${intro.html}</div></details>` : ''}
          <div class="tw"><table class="restable btbl">${head(bs.some(b => b.stats))}<tbody>${bs.map(b => row(b, bs.some(x => x.stats))).join('')}</tbody></table></div>
          ${k === 'Ubers' && uberRows.length ? `<h3 class="sub-h">Uber stats</h3><div class="tw"><table class="restable"><thead><tr><th>Uber</th>${EL.map(([e, n]) => `<th class="el-${e}">${n.slice(0, 4)}</th>`).join('')}<th>Level</th><th>Base HP</th><th>Block</th><th>Crit</th></tr></thead>
            <tbody>${uberRows.map(s => `<tr><td class="mn">${esc(s.name)}</td>${resCells(s)}<td class="r">${esc(s['monster level'] || '')}</td><td class="r">${esc(s['base-hp'] || '')}</td><td class="r">${esc(s.block || '')}</td><td class="r">${esc(s['crit chance'] || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
        </section>`;
      }).join('')}
      <section class="mgroup" id="g-regular"><h2 class="home-h">Regular monsters</h2>
        ${['Regular Monsters', 'Monster Aura Stats'].map(info).filter(Boolean).map(i => `<details class="about"><summary>${esc(i.title)}</summary><div class="wiki">${i.html}</div></details>`).join('')}
        <p><a href="#/maps">Map monsters and their resistances are in the Map Explorer →</a></p></section>
      ${foot(M.page)}`;
    for (const el of $$('.wiki', root)) enhanceFragment(el, P().byId(M.page));
    const toggle = (tr, open) => {
      const det = tr.nextElementSibling;
      open = open ?? det.hidden;
      det.hidden = !open;
      tr.setAttribute('aria-expanded', String(open));
    };
    root.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tr.brow');
      if (tr) toggle(tr);
    });
    root.addEventListener('keydown', e => {
      const tr = e.target.closest?.('tr.brow');
      if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(tr); }
    });
    if (anchor) requestAnimationFrame(() => {
      const el = document.getElementById(anchor);
      if (!el) return;
      if (el.matches('tr.brow')) toggle(el, true);
      el.scrollIntoView({ block: 'start' });
      el.classList.add('flash');
    });
  }

  // Hover card: resistances, where it's found and every note.
  async function bossTip(slug) {
    const { esc } = P();
    await load();
    const b = data.monsters.bosses.find(x => x.slug === slug);
    if (!b) return '';
    const zoneBy = new Map(data.zones.zones.map(z => [z.slug, z]));
    const zs = b.zones.map(s => zoneBy.get(s)).filter(Boolean).map(z => esc(z.name) + (z.lvl.h ? ` (${z.lvl.h})` : '')).join(', ');
    const notes = String(b.html).replace(/<a\b[^>]*>|<\/a>/g, '');
    return `<div class="hc-boss">
      <div class="hc-head"><span><b class="hc-name">${esc(b.name)}</b><span class="hc-sub">${esc(b.group)}${b.stats?.type ? ' · ' + esc(b.stats.type) : ''}</span></span></div>
      ${b.stats ? `<div class="hc-res">${EL.map(([k, l]) => { const v = b.stats.res?.[k] ?? 0; return `<span class="el-${k}${v >= 100 ? ' imm' : ''}"><i>${l.slice(0, 4)}</i>${v}</span>`; }).join('')}</div>` : ''}
      ${zs ? `<div class="hc-req">Found in ${zs}</div>` : ''}
      <div class="hc-notes">${notes}</div>
    </div>`;
  }

  function search(q, n) {
    if (!data) return [];
    const ql = q.toLowerCase();
    const out = [];
    for (const b of data.monsters.bosses) if (b.name.toLowerCase().includes(ql)) out.push({ kind: 'boss', b });
    for (const z of data.zones.zones) if (z.name.toLowerCase().includes(ql)) out.push({ kind: 'zone', z });
    return out.slice(0, n);
  }

  window.PD2World = { load, zones, monsters, search, bossTip, get data() { return data; } };
})();
