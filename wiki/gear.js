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
  const vv = x => x ? (x.was != null ? `<span class="bv-chg" title="Before PD2: ${P().esc(x.was)}">${P().esc(x.v)}</span>` : P().esc(x.v)) : '<span class="muted">—</span>';

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
      <p class="muted"><span class="bv-chg">Gold</span> values changed in PD2. Hover a base for its full card, or click it for its upgrade path and shortcuts.</p>
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
      const links = b => `<span class="blinks"><a href="#/items?q=${encodeURIComponent(b.name)}">Uniques &amp; sets on it</a><a href="#/affixes?base=${encodeURIComponent(b.name)}&ilvl=85">Affixes at ilvl 85</a>${W || A ? `<a href="#/runes">Runewords</a>` : ''}</span>`;
      const head = W ? '<th>Base</th><th>Type</th><th>Damage</th><th title="Average damage">Avg</th><th title="Weapon speed modifier">WSM</th><th>Range</th><th>Str</th><th>Dex</th><th title="Max sockets">Sock</th><th title="Required level">Lvl</th><th>qlvl</th>'
        : A ? '<th>Base</th><th>Type</th><th>Defense</th><th>Str</th><th>Block</th><th title="Max sockets">Sock</th><th>Durability</th><th title="Required level">Lvl</th><th>qlvl</th>'
        : '<th>Base</th><th>Type</th><th title="Max sockets">Sock</th><th title="Required level">Lvl</th><th>qlvl</th>';
      table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${rows.map(b => `<tr id="b-${esc(b.slug)}"${b.changed ? ' class="chg"' : ''}>
        <td class="bn" data-hc="base:${esc(b.slug)}"><span class="bname">${esc(b.name)}${b.tier ? `<em class="tier tier-${esc(b.tier)}">${esc(b.tier[0] === 'E' && b.tier !== 'Elite' ? 'Exc' : b.tier)}</em>` : ''}</span></td>
        <td>${esc(b.type || '')}</td>
        ${W ? `<td class="r">${vv(b.dmg)}</td><td class="r">${esc(b.avg || '')}</td><td class="r">${vv(b.wsm)}</td><td class="r">${vv(b.range)}</td><td class="r">${esc(b.str || '')}</td><td class="r">${esc(b.dex || '')}</td>`
          : A ? `<td class="r">${vv(b.def)}</td><td class="r">${esc(b.str || '')}</td><td class="r">${vv(b.block)}</td>` : ''}
        <td class="r">${vv(b.sockets)}</td>${A ? `<td class="r">${vv(b.dur)}</td>` : ''}<td class="r">${esc(b.rlvl || '')}</td><td class="r">${esc(b.qlvl || '')}</td></tr>
        <tr class="bdet" hidden><td colspan="${W ? 11 : A ? 9 : 5}">${fam(b)}${links(b)}</td></tr>`).join('')}</tbody>`;
    };
    // Click a base for its upgrade path and shortcuts.
    table.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tbody tr:not(.bdet)');
      if (tr?.nextElementSibling?.classList.contains('bdet')) { const d = tr.nextElementSibling; d.hidden = !d.hidden; tr.classList.toggle('open', !d.hidden); }
    });
    draw(f);
    const live = patch => { Object.assign(f, patch); history.replaceState(null, '', writeQ(f)); draw(f); };
    let t;
    $('#bq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => live({ q: e.target.value.trim() }), 150); });
    $('#bs', root).addEventListener('change', e => live({ sort: e.target.value }));
  }

  const mercTabs = cur => `<div class="segs mercs-tabs" role="group"><a class="seg${cur ? '' : ' on'}" href="#/mercs">Compare all</a>${data.mercs.mercs.map(x => `<a class="seg${x.key === cur ? ' on' : ''}" href="#/mercs/${x.key}">${P().esc(x.name.replace(/^Act (\d) /, 'A$1 '))}</a>`).join('')}</div>`;

  // Every mercenary side by side at one level, with their auras; then the rules for all of them.
  function mercCompare(root, anchor) {
    const { esc, $, $$, enhanceFragment } = P();
    const M = data.mercs;
    const page = P().byId(M.page);
    document.title = 'Mercenaries · PD2 Wiki';
    const all = [...new Set(M.mercs.flatMap(m => m.levels))].sort((a, b) => a - b);
    root.innerHTML = `${crumbs('Classes &amp; Skills', '#/mercs')}<h1 class="page-title">Mercenaries</h1>${mercTabs('')}
      <div class="lvlw merc-cmp-lvl"><div class="lvlw-head"><label>Merc level <b class="lvlw-n"></b></label><input type="range" min="0" max="${all.length - 1}" aria-label="Mercenary level"></div></div>
      <div class="tw"><table class="restable mcmp"><thead><tr><th>Mercenary</th><th>Auras by type</th><th>HP</th><th>Defense</th><th>Str</th><th>Dex</th><th title="Attack rating, before Dexterity">AR</th><th>Resist</th><th>Damage</th></tr></thead><tbody></tbody></table></div>
      <p class="muted">Stats are the same whichever difficulty you hire from, once the merc is level 80 or higher. Click a mercenary for its skills and level-by-level stats. The <a href="#/tools/merc-weapons">merc weapon compare</a> ranks Act 2 weapons by attack speed.</p>
      <h2 class="home-h">Rules for all mercenaries</h2>
      ${M.sections.filter(s => !/^stats$|^sources$/i.test(s.title)).map(s => `<details class="about" id="${esc(s.anchor)}"${s.anchor === anchor ? ' open' : ''}><summary>${esc(s.title)}</summary><div class="wiki">${s.html}</div></details>`).join('')}
      ${attrib(M.page, 'Mercenaries')}`;
    for (const el of $$('.about .wiki', root)) enhanceFragment(el, page);
    const body = $('tbody', root), range = $('input', root), n = $('.lvlw-n', root);
    const draw = i => {
      const want = all[i];
      n.textContent = want;
      body.innerHTML = M.mercs.map(m => {
        const lv = m.levels.find(l => l >= want) ?? m.levels.at(-1);
        const g = s => m.stats[s]?.[lv];
        const dmg = g('Dmg-Min') ? `${g('Dmg-Min')}–${g('Dmg-Max')}` : '—';
        return `<tr><td class="mn"><a href="#/mercs/${m.key}">${esc(m.name)}</a>${lv !== want ? ` <small title="Closest level listed">lvl ${lv}</small>` : ''}</td>
          <td class="mauras wiki">${m.auras.map(a => `<span><i>${esc(a.subtype)}</i> ${a.aura}</span>`).join('')}</td>
          ${['HP', 'Defense', 'Str', 'Dex', 'Attack Rating', 'Resist'].map(s => `<td class="r">${esc(g(s) ?? '—')}</td>`).join('')}<td class="r">${esc(dmg)}</td></tr>`;
      }).join('');
      enhanceFragment(body, page);
    };
    let idx = all.findIndex(l => l >= getLvl()); if (idx < 0) idx = all.length - 1;
    range.value = idx; draw(idx);
    range.addEventListener('input', () => { draw(+range.value); setLvl(all[+range.value]); });
    if (anchor) requestAnimationFrame(() => { const el = document.getElementById(anchor); if (el) { el.open = true; el.scrollIntoView({ block: 'start' }); } });
  }

  // Hover cards: an item base, and a merc skill's description.
  async function baseTip(slug) {
    const { esc } = P();
    await Promise.all([load(), window.PD2Items.load().catch(() => {})]);
    const b = data.bases.bases.find(x => x.slug === slug);
    if (!b) return '';
    const rows = [['Damage', b.dmg], ['Speed (WSM)', b.wsm], ['Range', b.range], ['Defense', b.def], ['Block', b.block], ['Sockets', b.sockets], ['Durability', b.dur]]
      .filter(([, v]) => v).map(([k, v]) => `<li><span>${k}</span> ${esc(v.v)}${v.was != null ? ` <span class="hc-was">was ${esc(v.was)}</span>` : ''}</li>`);
    const req = [b.str && `${b.str} Str`, b.dex && `${b.dex} Dex`, b.rlvl && `level ${b.rlvl}`].filter(Boolean).join(' · ');
    const on = (window.PD2Items.data?.items || []).filter(i => i.base === b.name && i.kind !== 'runeword');
    return `<div class="hc-base">
      <div class="hc-head"><span><b class="hc-name">${esc(b.name)}</b><span class="hc-sub">${[b.tier, b.type || b.kind, b.qlvl && 'qlvl ' + b.qlvl].filter(Boolean).map(esc).join(' · ')}</span></span></div>
      ${b.family && b.family.length > 1 ? `<div class="hc-req">${b.family.map(x => x === b.name ? `<b>${esc(x)}</b>` : esc(x)).join(' → ')}</div>` : ''}
      ${rows.length ? `<ul class="hc-kv">${rows.join('')}</ul>` : ''}
      ${req ? `<div class="hc-req">Requires ${esc(req)}</div>` : ''}
      ${on.length ? `<div class="hc-lvl">Uniques &amp; sets on it</div><p class="hc-desc">${on.slice(0, 8).map(i => esc(i.name)).join(', ')}${on.length > 8 ? `, +${on.length - 8} more` : ''}</p>` : ''}
    </div>`;
  }
  // Merc skill card: the skill's level at the reader's merc level (from the wiki's
  // "Merc Level | 1 | 9 | …" table), then the class skill's own card when there is one.
  async function mercSkillTip(arg) {
    const { esc } = P();
    await load();
    const [k, a] = arg.split('/');
    const m = data.mercs.mercs.find(x => x.key === k);
    const s = m?.skills.find(x => x.anchor === a);
    if (!s || !s.html) return '';
    const t = document.createElement('template');
    t.innerHTML = s.html;
    const lvl = getLvl();
    let at = '';
    for (const tb of t.content.querySelectorAll('table')) {
      const rows = [...tb.querySelectorAll('tr')].map(r => [...r.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()));
      if (!/merc level/i.test(rows[0]?.[0] || '')) continue;
      const lv = rows[0].slice(1).map(Number);
      let i = -1;
      lv.forEach((v, j) => { if (v <= lvl) i = j; });
      if (i < 0) continue;
      at = rows.slice(1).map(r => `<li><span>${esc(r[0])}</span> ${esc(r[i + 1] || '')}</li>`).join('');
      break;
    }
    for (const x of t.content.querySelectorAll('table')) x.remove();
    const text = t.content.textContent.replace(/\s+/g, ' ').replace(/For more information, see:.*$/i, '').trim();
    // The class skill this is based on ("Defiance Aura" → Defiance, "Fire Ball (Mercenary-Only)" → Fire Ball).
    const base = s.name.replace(/\s*\(Mercenary-Only\)/i, '').replace(/\s+Aura$/i, '');
    const sk = (P().S.index.skillIndex || []).find(x => x.n.toLowerCase() === base.toLowerCase() && x.c !== 'Items');
    const own = sk ? await window.PD2Skills?.tip(sk.c, sk.a).catch(() => '') : '';
    return `<div class="hc-mskill"><b class="hc-name">${esc(s.name)}</b><span class="hc-sub">${esc(m.name)} · ${esc(s.group)}</span>
      ${at ? `<div class="hc-lvl">At merc level ${lvl}</div><ul class="hc-kv">${at}</ul>` : ''}
      ${text ? `<p class="hc-desc">${esc(text.length > 300 ? text.slice(0, 290).replace(/\s+\S*$/, '') + '…' : text)}</p>` : ''}
      ${own ? `<div class="hc-sub-card">${own}</div>` : ''}</div>`;
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
    const strip = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    root.innerHTML = `${crumbs('Items', '#/items')}<h1 class="page-title">Runes</h1>${segs}
      ${info('runes')?.html ? `<details class="about"><summary>About runes in PD2</summary><div class="wiki">${info('runes').html}</div></details>` : ''}
      <div class="filters"><div class="frow"><label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" id="rq" placeholder="Rune or stat, e.g. Ber, cannot be frozen" aria-label="Filter runes" autocomplete="off"></label>
        <div class="chips">${['', 'Low', 'Mid', 'High'].map(g => `<button type="button" class="chip${g === '' ? ' on' : ''}" data-g="${g}">${g || 'All'}</button>`).join('')}</div></div></div>
      <div class="tw"><table class="restable rtable"><thead><tr><th>Rune</th><th title="Required level">Lvl</th><th>Weapon</th><th>Helm / Chest</th><th>Shield / Quiver</th><th title="Runewords that use it">Used in</th></tr></thead><tbody></tbody></table></div>
      <p class="muted">Hover a rune for its cube upgrade and every runeword that uses it.</p>${attrib(R.page)}`;
    const body = $('.rtable tbody', root);
    const f = { g: '', q: '' };
    const row = r => {
      const uses = rws.filter(i => (i.runes || []).includes(r.name));
      return `<tr id="${esc(r.name.toLowerCase())}" class="rg-${esc(r.group.toLowerCase())}">
        <td class="rn-name"><span data-hc="rune:${esc(r.name)}">${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy">` : ''}<b>${esc(r.name)}</b><i>#${r.n}</i></span></td>
        <td class="r">${r.lvl ?? ''}</td><td class="wiki">${r.weapon || '—'}</td><td class="wiki">${r.armor || '—'}</td><td class="wiki">${r.shield || '—'}</td>
        <td class="r">${uses.length ? `<a href="#/items?t=runeword&q=${encodeURIComponent(r.name)}" data-hc="rune:${esc(r.name)}">${uses.length}</a>` : '—'}</td></tr>`;
    };
    const draw = () => {
      const ts = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      const list = R.runes.filter(r => (!f.g || r.group === f.g) && ts.every(t => (r.name + ' ' + strip(r.weapon + ' ' + r.armor + ' ' + r.shield)).toLowerCase().includes(t)));
      body.innerHTML = list.map(row).join('') || '<tr><td colspan="6" class="empty">No runes match.</td></tr>';
      enhanceFragment(body, page);
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
    if (!key) return mercCompare(root, anchor);
    const m = M.mercs.find(x => x.key === key) || M.mercs.find(x => x.key === 'a2') || M.mercs[0];
    document.title = `${m.name} · Mercenaries · PD2 Wiki`;
    const page = P().byId(M.page), spage = P().byId(M.skillsPage);
    const groups = [...new Set(m.skills.map(s => s.group))];
    const rwPage = { a2: 'Act 2 Mercenary Runewords', a3: 'Act 3 Mercenary Runewords', a5: 'Act 5 Mercenary Runewords' }[m.key];
    const rwLink = rwPage && P().resolve(rwPage) ? P().pageHref(rwPage) : '';
    root.innerHTML = `${crumbs('Classes &amp; Skills', '#/mercs')}<h1 class="page-title">Mercenaries</h1>
      ${mercTabs(m.key)}
      <section class="merc-head"><h2 class="home-h">${esc(m.name)}</h2>
        <div class="merc-links">${m.key === 'a2' ? '<a class="chip" href="#/tools/merc-weapons">Merc weapon compare</a>' : ''}${rwLink ? `<a class="chip" href="${rwLink}">Runewords for this merc</a>` : ''}</div></section>
      <section class="lvlw merc-lvl">
        <div class="lvlw-head"><label>Merc level <b class="lvlw-n"></b></label><input type="range" min="0" max="${m.levels.length - 1}" aria-label="Mercenary level"></div>
        <dl class="lvlw-vals"></dl>
        <p class="muted">Same stats whichever difficulty you hire from, once the merc is level 80 or higher. Attack rating doesn't include the bonus from Dexterity.</p>
      </section>
      ${m.auras.length ? `<h2 class="home-h">Types &amp; auras</h2><div class="auras">${m.auras.map(a => `<div class="aura"><b>${esc(a.subtype)}</b><span class="wiki">${a.aura}</span></div>`).join('')}</div>` : ''}
      ${m.skills.length ? `<h2 class="home-h">Skills</h2>${groups.map(g => `<h3 class="sub-h">${esc(g)}</h3><div class="mskills">${m.skills.filter(s => s.group === g).map(s => `
        <details class="mskill" id="${esc(s.anchor)}"${s.anchor === anchor ? ' open' : ''}><summary${s.html ? ` data-hc="mskill:${m.key}/${esc(s.anchor)}"` : ''}>${esc(s.name)}</summary><div class="wiki">${s.html}</div></details>`).join('')}</div>`).join('')}` : ''}
      <p class="tile-links"><a href="#/mercs">Compare all mercenaries and the rules for hiring, gear and auras →</a></p>
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

  // Hover card for a rune: its bonuses, cube upgrade and the runewords that use it.
  async function runeTip(name) {
    const { esc } = P();
    await Promise.all([load(), window.PD2Items.load().catch(() => {}), window.PD2Cube.load().catch(() => {})]);
    const r = data.runes.runes.find(x => x.name.toLowerCase() === String(name).toLowerCase());
    if (!r) return '';
    const strip = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const promos = (window.PD2Cube.data?.recipes.recipes || []).filter(x => /promotion/i.test(x.section) && x.runes[0] === r.name);
    const uses = [...new Set((window.PD2Items.data?.items || []).filter(i => i.kind === 'runeword' && (i.runes || []).includes(r.name)).map(i => i.name))];
    // Current values only: drop the struck-out pre-PD2 value the wiki shows beneath.
    const line = h => String(h || '—').replace(/<br\s*\/?>\s*<span class="omod">.*?<\/span>/g, '').replace(/<span class="omod">.*?<\/span>/g, '').replace(/<br\s*\/?>/g, ' · ').replace(/<a\b[^>]*>|<\/a>/g, '');
    return `<div class="hc-rune">
      <div class="hc-head">${r.img ? `<img src="${esc(r.img)}" alt="">` : ''}<span><b class="hc-name">${esc(r.name)} Rune</b><span class="hc-sub">#${r.n} · level ${r.lvl ?? '?'} · ${esc(r.group)} rune</span></span></div>
      <ul class="hc-kv"><li><span>Weapon</span> ${line(r.weapon)}</li><li><span>Helm / Chest</span> ${line(r.armor)}</li><li><span>Shield</span> ${line(r.shield)}</li></ul>
      ${promos[0] ? `<div class="hc-req">Upgrade: ${esc(strip(promos[0].ing))} → ${esc(strip(promos[0].res))}</div>` : ''}
      ${uses.length ? `<div class="hc-lvl">In ${uses.length} runeword${uses.length === 1 ? '' : 's'}</div><p class="hc-desc">${uses.slice(0, 18).map(esc).join(', ')}${uses.length > 18 ? `, +${uses.length - 18} more` : ''}</p>` : ''}
    </div>`;
  }

  window.PD2Gear = { load, bases, runes, mercs, search, runeTip, baseTip, mercSkillTip, get data() { return data; } };
})();
