/* Item bases, runes & gems, and mercenaries, from data/gear.json.
 *   #/bases?kind=Weapon&type=Axe&tier=Elite&q=&ch=1&sort=avg   every base item
 *   #/runes | #/runes/gems | #/runes/jewels                     runes, gems, jewels
 *   #/mercs[/a1..a5][#skill]                                     mercenaries by act
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  let data = null, loading = null;
  const load = () => {
    if (data) return Promise.resolve(data);
    if (!loading) loading = P().fetchJSON('data/gear.json').then(d => (data = d)).catch(e => { loading = null; throw e; });
    return loading;
  };
  const attrib = (id, label) => {
    const p = P().byId(id);
    return `<p class="attrib">From <a href="${p ? P().wikiUrl(p.title) : '#'}" target="_blank" rel="noopener">${P().esc(label || p?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`;
  };
  const crumbs = (label, href) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="${href}">${label}</a></nav>`;
  const hi = s => { const m = String(s ?? '').match(/-?\d+(\.\d+)?/g); return m ? Math.max(...m.map(Number)) : -Infinity; };
  const vv = x => x ? `${P().esc(x.v)}${x.was != null ? `<s title="Before PD2">${P().esc(x.was)}</s>` : ''}` : '<span class="muted">—</span>';

  // ---------- item bases ----------
  const KINDS = [['Weapon', 'Weapons'], ['Armor', 'Armor'], ['Quiver', 'Quivers'], ['Other', 'Jewelry & charms']];
  const TYPE_ORDER = ['Axe', 'Sword', 'Dagger', 'Mace', 'Scepter', 'Wand', 'Staff', 'Spear', 'Polearm', 'Bow', 'Crossbow', 'Throwing', 'Claw', 'Orb',
    'Helm', 'Armor', 'Shield', 'Gloves', 'Boots', 'Belt', 'Quiver', 'Amulet', 'Ring', 'Jewel', 'Small Charm', 'Large Charm', 'Grand Charm'];
  const SORTS = {
    Weapon: [['name', 'Name'], ['avg', 'Average damage'], ['rlvl', 'Required level'], ['str', 'Required strength'], ['sockets', 'Max sockets'], ['wsm', 'Fastest (WSM)']],
    Armor: [['name', 'Name'], ['def', 'Defense'], ['rlvl', 'Required level'], ['str', 'Required strength'], ['sockets', 'Max sockets'], ['block', 'Block']],
    Quiver: [['name', 'Name']], Other: [['name', 'Name']],
  };
  const readQ = qs => { const p = new URLSearchParams(qs || ''); return { kind: p.get('kind') || 'Weapon', type: p.get('type') || '', tier: p.get('tier') || '', q: p.get('q') || '', ch: p.get('ch') === '1', sort: p.get('sort') || 'name' }; };
  const writeQ = f => {
    const p = new URLSearchParams();
    if (f.kind !== 'Weapon') p.set('kind', f.kind);
    for (const k of ['type', 'tier', 'q']) if (f[k]) p.set(k, f[k]);
    if (f.ch) p.set('ch', '1');
    if (f.sort !== 'name') p.set('sort', f.sort);
    const s = p.toString();
    return '#/bases' + (s ? '?' + s : '');
  };

  async function bases(root, tab, qs) {
    const { esc, $, $$, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading item bases…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load item bases.</b><br>${esc(e.message)}</div>`; return; }
    const B = data.bases;
    const segs = `<div class="segs" role="group">${[['', 'Bases'], ['qlvl', 'Quality levels'], ['rules', 'How bases work']].map(([k, l]) => `<a class="seg${k === tab ? ' on' : ''}" href="#/bases${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;
    if (tab === 'qlvl') {
      // One row per Normal -> Exceptional -> Elite family, with each base's quality level.
      const seen = new Set(), fams = [];
      for (const b of B.bases) {
        if (b.kind === 'Other' || b.kind === 'Quiver') continue;
        const fam = b.family && b.family.length > 1 ? b.family : [b.name];
        const key = fam.join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        fams.push({ type: b.type || b.kind, kind: b.kind, members: fam.map(n => B.bases.find(x => x.name === n)).filter(Boolean) });
      }
      const others = B.bases.filter(b => b.kind === 'Other' || b.kind === 'Quiver');
      const cell = b => b ? `<td class="qn"><a href="#/affixes?base=${encodeURIComponent(b.name)}&ilvl=85" title="Affixes on ${esc(b.name)} at item level 85">${esc(b.name)}</a></td><td class="r ql">${esc(b.qlvl ?? '')}</td>` : '<td></td><td></td>';
      root.innerHTML = `${crumbs('Items', '#/items')}<h1 class="page-title">Quality Levels</h1>${segs}
        <p class="lead">A base's <b>quality level</b> (qlvl) is the lowest item level it can drop at, and together with the item level it sets the <b>affix level</b> that decides which affixes can roll: affix level = item level − ⌊qlvl ÷ 2⌋ (or 2 × item level − 99 near the top). Low-qlvl bases reach high affix levels sooner. Click a base to see what can roll on it at item level 85.</p>
        <div class="filters"><div class="frow"><label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="qq" placeholder="Base name, e.g. Diadem, Monarch" aria-label="Filter bases" autocomplete="off"></label></div></div>
        <div class="tw"><table class="restable qtable"><thead><tr><th>Type</th><th>Normal</th><th>qlvl</th><th>Exceptional</th><th>qlvl</th><th>Elite</th><th>qlvl</th></tr></thead>
          <tbody>${fams.sort((a, b) => (TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)) || (+(a.members[0]?.qlvl || 0) - +(b.members[0]?.qlvl || 0))).map(f => {
            const by = t => f.members.find(m => m.tier === t) || (f.members.length === 1 && !f.members[0].tier && t === 'Normal' ? f.members[0] : null);
            return `<tr data-s="${esc(f.members.map(m => m.name).join(' ').toLowerCase())}"><td>${esc(f.type)}</td>${cell(by('Normal'))}${cell(by('Exceptional'))}${cell(by('Elite'))}</tr>`;
          }).join('')}</tbody></table></div>
        ${others.length ? `<h2 class="home-h">Jewelry, charms &amp; quivers</h2><div class="tw"><table class="restable qtable"><thead><tr><th>Item</th><th>qlvl</th></tr></thead><tbody>${others.map(b => `<tr data-s="${esc(b.name.toLowerCase())}">${cell(b)}</tr>`).join('')}</tbody></table></div>` : ''}
        ${attrib(data.qlvl?.page || B.page, 'Item Quality Levels')}`;
      $('#qq', root).addEventListener('input', e => { const q = e.target.value.trim().toLowerCase(); for (const tr of $$('.qtable tbody tr', root)) tr.hidden = q && !tr.dataset.s.includes(q); });
      return;
    }
    if (tab === 'rules') {
      root.innerHTML = `${crumbs('Items', '#/items')}<h1 class="page-title">How Item Bases Work</h1>${segs}
        ${B.info.map(i => `<section class="info-card" id="${esc(i.anchor)}"><h2 class="home-h">${esc(i.title)}</h2><div class="wiki">${i.html}</div></section>`).join('')}${attrib(B.page)}`;
      for (const el of $$('.wiki', root)) enhanceFragment(el, P().byId(B.page));
      return;
    }
    const f = readQ(qs);
    if (!SORTS[f.kind].some(([k]) => k === f.sort)) f.sort = 'name';
    const inKind = B.bases.filter(b => b.kind === f.kind);
    const types = TYPE_ORDER.filter(t => inKind.some(b => b.type === t));
    const chip = (label, next, on, extra = '') => `<a class="chip${on ? ' on' : ''}${extra}" href="${writeQ(next)}" aria-pressed="${on}">${label}</a>`;
    root.innerHTML = `${crumbs('Items', '#/items')}<h1 class="page-title">Item Bases</h1>${segs}
      <div class="segs kinds" role="group" aria-label="Kind">${KINDS.map(([k, l]) => `<a class="seg${f.kind === k ? ' on' : ''}" href="${writeQ({ ...readQ(''), kind: k })}">${l}<i>${B.bases.filter(b => b.kind === k).length}</i></a>`).join('')}</div>
      <div class="filters">
        <div class="frow"><label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="bq" value="${esc(f.q)}" placeholder="Base name, e.g. Archon, Phase Blade" aria-label="Filter bases" autocomplete="off"></label>
          <label class="fsel">Sort <select id="bs">${SORTS[f.kind].map(([k, l]) => `<option value="${k}"${f.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          ${chip('Changed in PD2', { ...f, ch: !f.ch }, f.ch, ' toggle')}</div>
        ${types.length > 1 ? `<div class="chips" role="group" aria-label="Type">${types.map(t => chip(esc(t), { ...f, type: f.type === t ? '' : t }, f.type === t)).join('')}</div>` : ''}
        ${f.kind === 'Weapon' || f.kind === 'Armor' ? `<div class="chips" role="group" aria-label="Tier">${['Normal', 'Exceptional', 'Elite'].map(t => chip(t, { ...f, tier: f.tier === t ? '' : t }, f.tier === t)).join('')}</div>` : ''}
      </div>
      <div class="rcount" aria-live="polite"></div>
      <div class="tw"><table class="restable btable"></table></div>
      <p class="muted">Struck-through values are from before PD2. Click a base's upgrade path to jump to that base.</p>
      ${attrib(B.page)}`;
    const table = $('.btable', root), count = $('.rcount', root);
    const W = f.kind === 'Weapon', A = f.kind === 'Armor';
    const draw = ff => {
      const ts = ff.q.toLowerCase().split(/\s+/).filter(Boolean);
      let rows = inKind.filter(b => (!ff.type || b.type === ff.type) && (!ff.tier || b.tier === ff.tier) && (!ff.ch || b.changed) &&
        ts.every(t => b.name.toLowerCase().includes(t) || (b.family || []).some(n => n.toLowerCase().includes(t))));
      const key = { avg: b => hi(b.avg), rlvl: b => -hi(b.rlvl), str: b => -hi(b.str), sockets: b => hi(b.sockets?.v), def: b => hi(b.def?.v), block: b => hi(b.block?.v), wsm: b => -hi(b.wsm?.v) }[ff.sort];
      rows = key ? [...rows].sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name))
        : [...rows].sort((a, b) => (TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)) || a.name.localeCompare(b.name));
      count.textContent = `${rows.length} base${rows.length === 1 ? '' : 's'}`;
      const fam = b => b.family && b.family.length > 1 ? `<span class="fam">${b.family.map(n => n === b.name ? `<b>${esc(n)}</b>` : `<a href="${writeQ({ ...ff, q: n, type: '', tier: '' })}">${esc(n)}</a>`).join(' › ')}</span>` : '';
      const links = b => `<span class="blinks"><a href="#/items?q=${encodeURIComponent(b.name)}">Uniques & sets</a><a href="#/affixes?base=${encodeURIComponent(b.name)}&ilvl=85">Affixes</a></span>`;
      const head = W ? '<th>Base</th><th>Type</th><th>Damage</th><th title="Average damage">Avg</th><th title="Weapon speed modifier">WSM</th><th>Range</th><th>Str</th><th>Dex</th><th title="Max sockets">Sock</th><th title="Required level">Lvl</th><th>qlvl</th>'
        : A ? '<th>Base</th><th>Type</th><th>Defense</th><th>Str</th><th>Block</th><th title="Max sockets">Sock</th><th>Durability</th><th title="Required level">Lvl</th><th>qlvl</th>'
        : '<th>Base</th><th>Type</th><th title="Max sockets">Sock</th><th title="Required level">Lvl</th><th>qlvl</th>';
      table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${rows.map(b => `<tr id="b-${esc(b.slug)}"${b.changed ? ' class="chg"' : ''}>
        <td class="bn"><span class="bname">${esc(b.name)}${b.tier ? `<em class="tier tier-${esc(b.tier)}">${esc(b.tier[0] === 'E' && b.tier !== 'Elite' ? 'Exc' : b.tier)}</em>` : ''}</span>${fam(b)}${W || A ? links(b) : ''}</td>
        <td>${esc(b.type || '')}</td>
        ${W ? `<td class="r">${vv(b.dmg)}</td><td class="r">${esc(b.avg || '')}</td><td class="r">${vv(b.wsm)}</td><td class="r">${vv(b.range)}</td><td class="r">${esc(b.str || '')}</td><td class="r">${esc(b.dex || '')}</td>`
          : A ? `<td class="r">${vv(b.def)}</td><td class="r">${esc(b.str || '')}</td><td class="r">${vv(b.block)}</td>` : ''}
        <td class="r">${vv(b.sockets)}</td>${A ? `<td class="r">${vv(b.dur)}</td>` : ''}<td class="r">${esc(b.rlvl || '')}</td><td class="r">${esc(b.qlvl || '')}</td></tr>`).join('')}</tbody>`;
    };
    draw(f);
    const live = patch => { Object.assign(f, patch); history.replaceState(null, '', writeQ(f)); draw(f); };
    let t;
    $('#bq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => live({ q: e.target.value.trim() }), 150); });
    $('#bs', root).addEventListener('change', e => live({ sort: e.target.value }));
  }

  // ---------- runes, gems, jewels ----------
  async function runes(root, tab) {
    const { esc, $, $$, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading runes…</div>';
    try { await Promise.all([load(), window.PD2Items.load().catch(() => {}), window.PD2Cube.load().catch(() => {})]); }
    catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load runes.</b><br>${esc(e.message)}</div>`; return; }
    const R = data.runes;
    const page = P().byId(R.page);
    const segs = `<div class="segs" role="group">${[['', 'Runes'], ['gems', 'Gems'], ['jewels', 'Jewels']].map(([k, l]) => `<a class="seg${k === tab ? ' on' : ''}" href="#/runes${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;
    const info = t => R.info.find(i => i.title.toLowerCase() === t);
    const slotRows = x => `<dl class="slots"><div><dt>Weapon</dt><dd>${x.weapon || '—'}</dd></div><div><dt>Helm / Chest</dt><dd>${x.armor || '—'}</dd></div><div><dt>Shield${x.group !== undefined ? ' / Quiver' : ''}</dt><dd>${x.shield || '—'}</dd></div></dl>`;

    if (tab === 'gems') {
      const types = [...new Set(R.gems.map(g => g.type))];
      root.innerHTML = `${crumbs('Items', '#/items')}<h1 class="page-title">Gems</h1>${segs}
        ${info('gems')?.html ? `<div class="wiki lead">${info('gems').html}</div>` : ''}
        <div class="gems">${types.map(ty => { const gs = R.gems.filter(g => g.type === ty); return `<section class="gem">
          <h2 class="home-h">${gs.at(-1)?.img ? `<img src="${esc(gs.at(-1).img)}" alt="">` : ''}${esc(ty)}</h2>
          <div class="tw"><table class="restable"><thead><tr><th>Grade</th><th>Lvl</th><th>Weapon</th><th>Helm / Chest</th><th>Shield</th></tr></thead>
          <tbody>${gs.map(g => `<tr><td class="mn">${g.img ? `<img src="${esc(g.img)}" alt="" loading="lazy">` : ''}${esc(g.grade)}</td><td class="r">${g.lvl ?? ''}</td><td>${g.weapon}</td><td>${g.armor}</td><td>${g.shield}</td></tr>`).join('')}</tbody></table></div></section>`; }).join('')}</div>
        ${attrib(R.page)}`;
      for (const el of $$('.wiki,.gems', root)) enhanceFragment(el, page);
      return;
    }
    if (tab === 'jewels') {
      const uj = (window.PD2Items.data?.items || []).filter(i => i.slot === 'Jewel' || /jewel/i.test(i.base || ''));
      root.innerHTML = `${crumbs('Items', '#/items')}<h1 class="page-title">Jewels</h1>${segs}
        <div class="wiki lead">${info('jewels')?.html || ''}</div>
        <div class="tiles">
          <a class="tile" href="#/affixes?slot=Jewel&ilvl=99"><span><b>Jewel affixes</b><span>Every prefix and suffix a jewel can roll</span></span></a>
          <a class="tile" href="#/cube?q=jewel"><span><b>Jewel recipes</b><span>Cube recipes that use or make jewels</span></span></a>
        </div>
        ${uj.length ? `<h2 class="home-h">Unique jewels</h2><div class="igrid">${uj.map(i => window.PD2Items.card(i)).join('')}</div>` : ''}
        ${attrib(R.page)}`;
      enhanceFragment($('.wiki', root), page);
      return;
    }

    // Runewords per rune, and each rune's cube upgrade.
    const rws = (window.PD2Items.data?.items || []).filter(i => i.kind === 'runeword');
    const promos = (window.PD2Cube.data?.recipes.recipes || []).filter(r => /promotion/i.test(r.section) && r.runes.length);
    const strip = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    root.innerHTML = `${crumbs('Items', '#/items')}<h1 class="page-title">Runes</h1>${segs}
      ${info('runes')?.html ? `<details class="about"><summary>About runes in PD2</summary><div class="wiki">${info('runes').html}</div></details>` : ''}
      <div class="filters"><div class="frow"><label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" id="rq" placeholder="Rune or stat, e.g. Ber, cannot be frozen" aria-label="Filter runes" autocomplete="off"></label>
        <div class="chips">${['', 'Low', 'Mid', 'High'].map(g => `<button type="button" class="chip${g === '' ? ' on' : ''}" data-g="${g}">${g || 'All'}</button>`).join('')}</div></div></div>
      <div class="runes-grid"></div>${attrib(R.page)}`;
    const grid = $('.runes-grid', root);
    const f = { g: '', q: '' };
    const card = r => {
      const up = promos.find(p => p.runes[0] === r.name && !/^Upgrad/i.test(p.caption) || p.runes[0] === r.name);
      const uses = rws.filter(i => (i.runes || []).includes(r.name));
      return `<article class="rune" id="${esc(r.name.toLowerCase())}">
        <header>${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy">` : ''}<div><h2>${esc(r.name)}</h2><p>#${r.n} · level ${r.lvl ?? '?'} · ${esc(r.group)}</p></div></header>
        <div class="wiki">${slotRows(r)}</div>
        ${up ? `<p class="rup"><span>Upgrade</span>${esc(strip(up.ing))} <b>→</b> ${esc(strip(up.res))}${up.notes ? ` <small>${esc(strip(up.notes))}</small>` : ''}</p>` : ''}
        ${uses.length ? `<p class="ruses"><span>In ${uses.length} runeword${uses.length === 1 ? '' : 's'}</span>${uses.map(i => `<a href="#/item/${i.slug}">${esc(i.name)}${uses.filter(x => x.name === i.name).length > 1 ? ` <small>${esc(i.slot)}</small>` : ''}</a>`).join('')}</p>` : ''}
      </article>`;
    };
    const draw = () => {
      const ts = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      const list = R.runes.filter(r => (!f.g || r.group === f.g) && ts.every(t => (r.name + ' ' + strip(r.weapon + ' ' + r.armor + ' ' + r.shield)).toLowerCase().includes(t)));
      grid.innerHTML = list.map(card).join('') || '<div class="empty">No runes match.</div>';
      enhanceFragment(grid, page);
    };
    draw();
    root.querySelector('.filters').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; f.g = b.dataset.g; for (const x of $$('[data-g]', root)) x.classList.toggle('on', x === b); draw(); });
    let t;
    $('#rq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); draw(); }, 150); });
    for (const el of $$('.about .wiki', root)) enhanceFragment(el, page);
  }

  // ---------- mercenaries ----------
  const STORE = 'pd2wiki-merclvl';
  const getLvl = () => { try { return +localStorage.getItem(STORE) || 80; } catch { return 80; } };
  const setLvl = v => { try { localStorage.setItem(STORE, String(v)); } catch {} };

  async function mercs(root, key, anchor) {
    const { esc, $, $$, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading mercenaries…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load mercenaries.</b><br>${esc(e.message)}</div>`; return; }
    const M = data.mercs;
    const m = M.mercs.find(x => x.key === key) || M.mercs.find(x => x.key === 'a2') || M.mercs[0];
    document.title = `${m.name} · Mercenaries · PD2 Wiki`;
    const page = P().byId(M.page), spage = P().byId(M.skillsPage);
    const groups = [...new Set(m.skills.map(s => s.group))];
    const rwPage = { a2: 'Act 2 Mercenary Runewords', a3: 'Act 3 Mercenary Runewords', a5: 'Act 5 Mercenary Runewords' }[m.key];
    const rwLink = rwPage && P().resolve(rwPage) ? P().pageHref(rwPage) : '';
    root.innerHTML = `${crumbs('Endgame', '#/mercs')}<h1 class="page-title">Mercenaries</h1>
      <div class="segs mercs-tabs" role="group">${M.mercs.map(x => `<a class="seg${x === m ? ' on' : ''}" href="#/mercs/${x.key}">${esc(x.name.replace(/^Act (\d) /, 'A$1 '))}</a>`).join('')}</div>
      <section class="merc-head"><h2 class="home-h">${esc(m.name)}</h2>
        <div class="merc-links">${m.key === 'a2' ? '<a class="chip" href="#/tools/merc-weapons">Merc weapon compare</a>' : ''}${rwLink ? `<a class="chip" href="${rwLink}">Runewords for this merc</a>` : ''}</div></section>
      <section class="lvlw merc-lvl">
        <div class="lvlw-head"><label>Merc level <b class="lvlw-n"></b></label><input type="range" min="0" max="${m.levels.length - 1}" aria-label="Mercenary level"></div>
        <dl class="lvlw-vals"></dl>
        <p class="muted">Same stats whichever difficulty you hire from, once the merc is level 80 or higher. Attack rating doesn't include the bonus from Dexterity.</p>
      </section>
      ${m.auras.length ? `<h2 class="home-h">Types &amp; auras</h2><div class="auras">${m.auras.map(a => `<div class="aura"><b>${esc(a.subtype)}</b><span class="wiki">${a.aura}</span></div>`).join('')}</div>` : ''}
      ${m.skills.length ? `<h2 class="home-h">Skills</h2>${groups.map(g => `<h3 class="sub-h">${esc(g)}</h3><div class="mskills">${m.skills.filter(s => s.group === g).map(s => `
        <details class="mskill" id="${esc(s.anchor)}"${s.anchor === anchor ? ' open' : ''}><summary>${esc(s.name)}</summary><div class="wiki">${s.html}</div></details>`).join('')}</div>`).join('')}` : ''}
      <h2 class="home-h">Rules for all mercenaries</h2>
      ${M.sections.filter(s => !/^stats$|^sources$/i.test(s.title)).map(s => `<details class="about" id="${esc(s.anchor)}"${s.anchor === anchor ? ' open' : ''}><summary>${esc(s.title)}</summary><div class="wiki">${s.html}</div></details>`).join('')}
      ${attrib(M.page, 'Mercenaries')}${spage ? attrib(M.skillsPage, 'Mercenary Skills') : ''}`;
    for (const el of $$('.wiki', root)) enhanceFragment(el, el.closest('.mskill') ? spage : page);

    const range = $('.merc-lvl input', root), n = $('.lvlw-n', root), vals = $('.lvlw-vals', root);
    const stats = Object.keys(m.stats);
    const show = i => {
      const lv = m.levels[i];
      n.textContent = lv;
      const g = s => m.stats[s]?.[lv];
      const dmg = g('Dmg-Min') ? `${g('Dmg-Min')}–${g('Dmg-Max')}` : null;
      const rows = stats.filter(s => !/^Dmg-/.test(s)).map(s => [s, g(s)]);
      if (dmg) rows.push(['Damage', dmg]);
      vals.innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v ?? '—')}</dd></div>`).join('');
    };
    const want = getLvl();
    let idx = m.levels.findIndex(l => l >= want); if (idx < 0) idx = m.levels.length - 1;
    range.value = idx; show(idx);
    range.addEventListener('input', () => { show(+range.value); setLvl(m.levels[+range.value]); });
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  }

  function search(q, n) {
    if (!data) return [];
    const ql = q.toLowerCase();
    const out = [];
    for (const r of data.runes.runes) if (r.name.toLowerCase() === ql || (ql.length > 2 && r.name.toLowerCase().startsWith(ql))) out.push({ kind: 'rune', r });
    for (const b of data.bases.bases) if (ql.length > 2 && b.name.toLowerCase().includes(ql)) out.push({ kind: 'base', b });
    return out.slice(0, n);
  }

  window.PD2Gear = { load, bases, runes, mercs, search, get data() { return data; } };
})();
