/* Affix finder, from data/affixes.json (the Item Affixes page's prefix/suffix tables).
 *   #/affixes?slot=Circlet&ilvl=90&base=Tiara&q=…&ps=P   what can roll on an item
 *   #/affixes/changes                                   PD2 changes & removed affixes
 *   #/affixes/rules                                     how affixes and alvl work
 * Affix level follows the wiki: qlvl raises a low ilvl; items with a magic level use
 * ilvl + maglvl; otherwise alvl = ilvl − ⌊qlvl/2⌋, or 2·ilvl − 99 near the top.
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  let data = null, loading = null;
  const load = () => {
    if (data) return Promise.resolve(data);
    if (!loading) loading = P().fetchJSON('data/affixes.json').then(d => {
      for (const [i, a] of d.affixes.entries()) a._i = i, a._s = [a.name, a.attr.replace(/<[^>]+>/g, ' '), ...a.types].join(' ').toLowerCase();
      return (data = d);
    }).catch(e => { loading = null; throw e; });
    return loading;
  };

  // What each item type counts as, for the wiki's affix type labels.
  const W = ['Melee Weapon', 'Weapon'];
  const SLOTS = [
    ['Armor', [
      ['Helm', ['Helm', 'Armor']], ['Circlet', ['Circlet', 'Helm', 'Armor']],
      ['Barbarian Helm', ['Barbarian Helm', 'Helm', 'Armor'], 'cls'], ['Druid Helm', ['Druid Helm', 'Helm', 'Armor'], 'cls'],
      ['Chest', ['Chest', 'Armor']], ['Shield', ['Shield', 'Armor']],
      ['Necromancer Shield', ['Necromancer Shield', 'Shield', 'Armor'], 'cls'], ['Paladin Shield', ['Paladin Shield', 'Shield', 'Armor'], 'cls'],
      ['Gloves', ['Gloves', 'Armor']], ['Boots', ['Boots', 'Armor']], ['Belt', ['Belt', 'Armor']],
    ]],
    ['Jewelry & other', [['Amulet', ['Amulet']], ['Ring', ['Ring']], ['Quiver', ['Quiver']], ['Jewel', ['Jewel'], 'jewel'],
      ['Small Charm', ['Small Charm'], 'charm'], ['Large Charm', ['Large Charm'], 'charm'], ['Grand Charm', ['Grand Charm'], 'charm']]],
    ['Weapons', [
      ['Axe', ['Axe', ...W]], ['Throwing Axe', ['Throwing Axe', 'Axe', ...W], 'throw'], ['Sword', ['Sword', ...W]], ['Crystal Sword', ['Crystal Sword', 'Sword', ...W]],
      ['Dagger', ['Dagger', 'Knife', ...W]], ['Throwing Knife', ['Throwing Knife', 'Knife', ...W], 'throw'],
      ['Club', ['Club', 'Blunt Weapon', ...W]], ['Tipped Mace', ['Tipped Mace', 'Blunt Weapon', ...W]], ['Hammer', ['Hammer', 'Blunt Weapon', ...W]],
      ['Scepter', ['Scepter', 'Rod', 'Blunt Weapon', ...W]], ['Wand', ['Wand', 'Rod', 'Blunt Weapon', ...W], 'wand'], ['Staff', ['Staff', 'Rod', 'Blunt Weapon', ...W], 'staff'],
      ['Polearm', ['Polearm', ...W]], ['Scythe', ['Scythe', 'Polearm', ...W]], ['Spear', ['Spear', ...W]], ['Amazon Spear', ['Amazon Spear', 'Spear', 'Amazon Weapon', ...W], 'cls'],
      ['Javelin', ['Javelin', 'Spear', ...W], 'throw'], ['Bow', ['Bow', 'Missile Weapon', 'Weapon']], ['Amazon Bow', ['Amazon Bow', 'Bow', 'Amazon Weapon', 'Missile Weapon', 'Weapon'], 'cls'],
      ['Crossbow', ['Crossbow', 'Missile Weapon', 'Weapon']], ['Claw', ['Claw', ...W], 'cls'], ['Orb', ['Orb', 'Weapon'], 'orb'],
    ]],
  ];
  const SLOT = new Map(SLOTS.flatMap(([, l]) => l.map(([n, isa, flag]) => [n, { isa, flag }])));
  const MAGLVL = { Circlet: 3, Coronet: 8, Tiara: 13, Diadem: 18 };

  // Does an affix type label ("WeaponP", "Non-Orb Weapon", "SpearNC"…) include this slot?
  function typeMatches(label, slot) {
    const s = SLOT.get(slot);
    if (!s) return true;
    let t = label, sup = '';
    const m = t.match(/^(.*?[a-z])(NC|PS|P)$/);
    if (m) { t = m[1]; sup = m[2]; }
    if (sup === 'P' && /orb|wand|staff/.test(s.flag || '')) return false;
    if (sup === 'PS' && /orb|wand/.test(s.flag || '')) return false;
    if (sup === 'NC' && s.flag === 'cls') return false;
    const neg = t.match(/^Non-(.+)$/);
    if (neg) {
      // "Non-Orb Weapon": find the longest trailing label this slot is, then check the exclusion.
      const words = neg[1].split(' ');
      for (let i = 1; i < words.length; i++) {
        const excl = words.slice(0, i).join(' '), base = words.slice(i).join(' ');
        if (s.isa.includes(base)) {
          const hit = s.isa.some(x => x === excl || x.startsWith(excl + ' ') || x === `${excl} ${base}`) || (excl === 'Throwing' && s.flag === 'throw');
          return !hit;
        }
      }
      return false;
    }
    return s.isa.includes(t);
  }

  // Wands, staves and orbs (non-elite) have magic level 1; this also picks the item type for a base.
  const ORB = /(orb|globe|sphere|ball|shard)|jared's stone|heavenly stone|swirling crystal|demon heart/i;
  const STAFF = /staff|walking stick|stalagmite|shillelagh/i;
  function kindOfBase(b) {
    if (!b || b.kind !== 'Weapon') return '';
    if (/wand/i.test(b.name)) return 'Wand';
    if (STAFF.test(b.name)) return 'Staff';
    if (ORB.test(b.name)) return 'Orb';
    return '';
  }
  const slotForBase = b => kindOfBase(b) || (MAGLVL[b?.name] ? 'Circlet' : b?.kind === 'Other' && SLOT.has(b.name) ? b.name : '');

  function alvlOf(ilvl, base) {
    if (!ilvl) return null;
    let i = Math.min(99, ilvl);
    const q = base?.qlvl || 0;
    if (q > i) i = q;
    const mag = base ? (MAGLVL[base.name] || (base.tier !== 'Elite' && kindOfBase(base) ? 1 : 0)) : 0;
    if (mag > 0) return Math.min(99, i + mag);
    const h = Math.floor(q / 2);
    return i < 99 - h ? i - h : 2 * i - 99;
  }

  const readQ = qs => {
    const p = new URLSearchParams(qs || '');
    return { slot: p.get('slot') || '', ilvl: p.get('ilvl') || '', base: p.get('base') || '', q: p.get('q') || '', ps: p.get('ps') || '', ch: p.get('ch') === '1', grp: p.get('grp') || '' };
  };
  const writeQ = f => {
    const p = new URLSearchParams();
    for (const k of ['slot', 'ilvl', 'base', 'q', 'ps', 'grp']) if (f[k]) p.set(k, f[k]);
    if (f.ch) p.set('ch', '1');
    const s = p.toString();
    return '#/affixes' + (s ? '?' + s : '');
  };
  const TABS = [['', 'Affix finder'], ['changes', 'PD2 changes'], ['rules', 'How affixes work']];
  const head = (tab, title) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/items">Items</a></nav>
    <h1 class="page-title">${title}</h1><div class="segs" role="group">${TABS.map(([k, l]) => `<a class="seg${k === tab ? ' on' : ''}" href="#/affixes${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;
  const foot = () => { const p = P().byId(data.page); return `<p class="attrib">From <a href="${p ? P().wikiUrl(p.title) : '#'}" target="_blank" rel="noopener">Item Affixes</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`; };

  async function render(root, tab, qs) {
    const { esc } = P();
    root.innerHTML = '<div class="loading">Loading affixes…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load affixes.</b><br>${esc(e.message)}</div>`; return; }
    if (tab === 'changes') return changes(root);
    if (tab === 'rules') return rules(root);
    return finder(root, qs);
  }

  // Hover card: everything the one-line row leaves out.
  async function tip(i) {
    const { esc } = P();
    await load();
    const a = data.affixes[+i];
    if (!a) return '';
    const unlink = h => String(h).replace(/<a\b[^>]*>|<\/a>/g, '');
    return `<div class="hc-affix">
      <div class="hc-head"><span><b class="hc-name">${esc(a.name)}</b><span class="hc-sub">${a.ps === 'P' ? 'Prefix' : 'Suffix'} · ${esc(a.cat)} · group ${a.group}</span></span></div>
      <div class="hc-stat">${unlink(a.attr)}</div>
      <ul class="hc-kv"><li><span>Affix level</span> ${a.amin}${a.amax ? '–' + a.amax : '+'}</li><li><span>Required level</span> ${a.rlvl ?? '?'}</li><li><span>Frequency</span> ${a.freq ?? '?'}</li></ul>
      <div class="hc-lvl">Rolls on</div><p class="hc-desc">${a.types.map(esc).join(', ')}</p>
      ${a.change ? `<div class="hc-lvl">Changed in PD2</div><p class="hc-desc">${unlink(a.change)}</p>` : ''}
      <div class="hc-foot">Only one affix per group can roll · click to show just this group</div>
    </div>`;
  }

  function finder(root, qs) {
    const { esc, $, enhanceFragment } = P();
    const f = readQ(qs);
    const base = data.bases.find(b => b.name.toLowerCase() === f.base.toLowerCase());
    root.innerHTML = `${head('', 'Affix Finder')}
      <p class="lead">Pick what you're rolling and its item level to see every prefix and suffix that can spawn, with each one's share of the rolls.</p>
      <div class="filters">
        <div class="frow">
          <label class="fsel">Item type <select id="as"><option value="">Any</option>${SLOTS.map(([g, l]) => `<optgroup label="${esc(g)}">${l.map(([n]) => `<option${n === f.slot ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`).join('')}</select></label>
          <label class="fnum">Item level <input type="number" id="ai" min="1" max="99" inputmode="numeric" placeholder="e.g. 85" value="${esc(f.ilvl)}"></label>
          <label class="fsel">Base <input id="ab" list="ab-list" placeholder="optional, e.g. Tiara" value="${esc(f.base)}" autocomplete="off"><datalist id="ab-list">${data.bases.map(b => `<option value="${esc(b.name)}">qlvl ${b.qlvl}</option>`).join('')}</datalist></label>
          <span class="alvl" id="alvl"></span>
        </div>
        <div class="frow">${`<label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="aq" value="${esc(f.q)}" placeholder="Stat or affix name, e.g. faster cast, of the Magus" aria-label="Filter affixes" autocomplete="off"></label>`}
          <div class="chips">${[['', 'Both'], ['P', 'Prefixes'], ['S', 'Suffixes']].map(([k, l]) => `<button type="button" class="chip${f.ps === k ? ' on' : ''}" data-ps="${k}">${l}</button>`).join('')}
            <button type="button" class="chip toggle${f.ch ? ' on' : ''}" data-ch>Changed in PD2</button></div></div>
      </div>
      <div class="rcount" aria-live="polite"></div>
      <div class="afx"></div>${foot()}`;
    const box = $('.afx', root), count = $('.rcount', root), alvlEl = $('#alvl', root);
    const draw = () => {
      const b = data.bases.find(x => x.name.toLowerCase() === f.base.toLowerCase());
      const lvl = alvlOf(+f.ilvl, b);
      alvlEl.innerHTML = lvl != null ? `Affix level <b>${lvl}</b>${b ? ` <small>(${esc(b.name)} qlvl ${b.qlvl})</small>` : ''}` : '';
      const cat = f.slot === 'Jewel' ? 'Jewel' : /Charm$/.test(f.slot) ? f.slot : f.slot ? 'Equipment' : '';
      const ts = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = data.affixes.filter(a => (!cat || a.cat === cat) && (!f.slot || a.types.some(t => typeMatches(t, f.slot))) &&
        (lvl == null || (a.amin <= lvl && (a.amax == null || a.amax >= lvl))) && (!f.ps || a.ps === f.ps) && (!f.ch || a.change) &&
        (!f.grp || String(a.group) === f.grp) && ts.every(t => a._s.includes(t)));
      // Each affix's share of its side's rolls among what can spawn (by frequency).
      const tot = { P: 0, S: 0 };
      for (const a of hits) tot[a.ps] += a.freq || 0;
      count.innerHTML = `${hits.length} affix${hits.length === 1 ? '' : 'es'}${f.grp ? ` in group ${esc(f.grp)} <a href="#" data-clear-grp>show all groups</a>` : ''}`;
      const side = ps => {
        const list = hits.filter(a => a.ps === ps).sort((a, b) => (a.group - b.group) || (a.amin - b.amin));
        if (!list.length) return '';
        // One line each; affixes in one group (only one can roll) sit together.
        const max = Math.max(...list.map(a => a.freq || 0), 1);
        let prev = null;
        return `<section class="afx-side"><h2 class="home-h">${ps === 'P' ? 'Prefixes' : 'Suffixes'} <small>${list.length}</small></h2>
          <div class="afx-rows"><div class="ar-head"><span>Stat</span><span>Affix</span><span title="Affix level range">alvl</span><span>${lvl != null ? 'Share' : 'Weight'}</span></div>
          ${list.map(a => {
            const newGrp = a.group !== prev;
            prev = a.group;
            const share = lvl != null && tot[ps] ? (a.freq || 0) / tot[ps] * 100 : null;
            return `<div class="arow${newGrp ? ' g0' : ''}${a.change ? ' chg' : ''}" data-hc="affix:${a._i}" data-g="${a.group}" title="Click to show only group ${a.group}">
              <span class="ar-attr">${a.attr}</span><b>${esc(a.name)}</b>
              <span class="ar-lvl">${a.amin}${a.amax ? '–' + a.amax : '+'}</span>
              <span class="ar-share"><i style="width:${Math.max(3, (a.freq || 0) / max * 100)}%"></i><em>${share != null ? share.toFixed(1) + '%' : a.freq ?? '?'}</em></span></div>`;
          }).join('')}</div></section>`;
      };
      box.innerHTML = (side('P') + side('S')) || `<div class="empty">No affixes match.${lvl != null ? ' Try a higher item level.' : ''}</div>`;
      enhanceFragment(box, P().byId(data.page));
    };
    const sync = () => { history.replaceState(null, '', writeQ(f)); draw(); };
    box.addEventListener('click', e => {
      const r = e.target.closest('.arow');
      if (!r || e.target.closest('a')) return;
      f.grp = f.grp === r.dataset.g ? '' : r.dataset.g;
      sync();
      scrollTo({ top: root.querySelector('.rcount').getBoundingClientRect().top + scrollY - 80 });
    });
    $('#as', root).addEventListener('change', e => { f.slot = e.target.value; sync(); });
    $('#ai', root).addEventListener('input', e => { f.ilvl = e.target.value; sync(); });
    $('#ab', root).addEventListener('change', e => {
      f.base = e.target.value.trim();
      const g = slotForBase(data.bases.find(x => x.name.toLowerCase() === f.base.toLowerCase()));
      if (g && !f.slot) { f.slot = g; $('#as', root).value = g; }
      sync();
    });
    let t;
    $('#aq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); sync(); }, 150); });
    root.addEventListener('click', e => {
      const ps = e.target.closest('[data-ps]');
      if (ps) { f.ps = ps.dataset.ps; for (const b of root.querySelectorAll('[data-ps]')) b.classList.toggle('on', b === ps); sync(); }
      const ch = e.target.closest('[data-ch]');
      if (ch) { f.ch = !f.ch; ch.classList.toggle('on', f.ch); sync(); }
      if (e.target.closest('[data-clear-grp]')) { e.preventDefault(); f.grp = ''; sync(); }
    });
    draw();
  }

  function changes(root) {
    const { esc, enhanceFragment } = P();
    const changed = data.affixes.filter(a => a.change);
    root.innerHTML = `${head('changes', 'Affix Changes')}
      <h2 class="home-h">Changed in PD2 <small>${changed.length}</small></h2>
      <ul class="afx-list">${changed.map(a => `<li class="chg"><div class="afx-top"><b>${esc(a.name)}</b><em class="ps">${a.ps === 'P' ? 'prefix' : 'suffix'}</em><span class="afx-attr">${a.attr}</span></div>
        <div class="afx-meta"><span>${esc(a.cat)}</span><span>alvl ${a.amin}${a.amax ? '–' + a.amax : '+'}</span><span class="afx-types">${a.types.map(esc).join(', ')}</span></div><div class="afx-chg">${a.change}</div></li>`).join('')}</ul>
      <h2 class="home-h">Removed in PD2 <small>${data.removed.length}</small></h2>
      <ul class="afx-list">${data.removed.map(a => `<li class="rm"><div class="afx-top"><b>${esc(a.name)}</b><em class="ps">${esc(a.ps)}</em><span class="afx-attr">${a.attr}</span></div><div class="afx-meta"><span class="afx-types">${esc(a.where)}</span></div></li>`).join('')}</ul>
      ${foot()}`;
    enhanceFragment(root.querySelector('.afx-list') || root, P().byId(data.page));
  }

  function rules(root) {
    const { esc, $$, enhanceFragment } = P();
    root.innerHTML = `${head('rules', 'How Affixes Work')}
      ${data.info.map(i => `<section class="info-card" id="${esc(i.anchor)}"><h2 class="home-h">${esc(i.title)}</h2><div class="wiki">${i.html}</div></section>`).join('')}${foot()}`;
    for (const el of $$('.wiki', root)) enhanceFragment(el, P().byId(data.page));
  }

  window.PD2Affixes = { load, render, typeMatches, alvlOf, tip, get data() { return data; } };
})();
