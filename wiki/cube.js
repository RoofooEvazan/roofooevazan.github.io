/* Crafting & Cube, from data/cube.json (built from the Recipes, Crafting and Corruptions pages).
 *   #/cube?grp=…&sec=…&rune=…&q=…        every Horadric Cube recipe
 *   #/cube/crafting?type=Blood&slot=Ring  crafted items: recipe + stats
 *   #/cube/corruptions?type=Weapon        corruption outcomes by item type (Amulet adds desecration)
 *   #/cube/guide                          how crafting works, comparison chart
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const TABS = [['', 'Cube recipes'], ['crafting', 'Crafted items'], ['corruptions', 'Corruptions'], ['guide', 'How crafting works']];
  const CRAFT_TYPES = { Blood: 'Life, leech & strength', Caster: 'Mana & cast rate', Hitpower: 'Blocking & hit recovery', Safety: 'Defense & resistances',
    Vampiric: 'Leech & regeneration', Bountiful: 'Gold & magic find', Brilliant: 'Skills & energy' };
  const SLOTS = ['Helm', 'Armor', 'Shield', 'Gloves', 'Boots', 'Belt', 'Amulet', 'Ring', 'Weapon', 'Quiver'];

  let data = null, loading = null;
  const load = () => {
    if (data) return Promise.resolve(data);
    if (!loading) loading = P().fetchJSON('data/cube.json').then(d => {
      const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      for (const r of d.recipes.recipes) r._s = [strip(r.ing), strip(r.res), strip(r.notes), r.section, r.caption].join(' ').toLowerCase();
      for (const c of d.crafts.crafts) c._s = [c.name, c.type, c.slot, ...c.recipe, ...c.stats.map(s => strip(s.html))].join(' ').toLowerCase();
      return (data = d);
    }).catch(e => { loading = null; throw e; });
    return loading;
  };

  const q = qs => new URLSearchParams(qs || '');
  const url = (base, obj) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v) p.set(k, v);
    const s = p.toString();
    return '#/' + base + (s ? '?' + s : '');
  };
  const head = (tab, title) => {
    const { esc } = P();
    return `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>Crafting &amp; Cube</span></nav>
      <h1 class="page-title">${esc(title)}</h1>
      <div class="segs" role="group" aria-label="Crafting topics">${TABS.map(([k, l]) => `<a class="seg${k === tab ? ' on' : ''}" href="#/cube${k ? '/' + k : ''}" aria-pressed="${k === tab}">${l}</a>`).join('')}</div>`;
  };
  const foot = pageId => {
    const { byId, wikiUrl } = P();
    const p = byId(pageId);
    return `<p class="attrib">From <a href="${p ? wikiUrl(p.title) : '#'}" target="_blank" rel="noopener">${P().esc(p?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`;
  };
  const searchBox = (id, val, ph) => `<label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input type="search" id="${id}" value="${P().esc(val)}" placeholder="${P().esc(ph)}" aria-label="${P().esc(ph)}" autocomplete="off"></label>`;

  async function render(root, tab, qs) {
    const { esc } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load crafting data.</b><br>${esc(e.message)}</div>`; return; }
    if (tab === 'crafting') return crafting(root, qs);
    if (tab === 'corruptions') return corruptions(root, qs);
    if (tab === 'guide') return guide(root);
    return recipes(root, qs);
  }

  // Ingredients "A + B + C" as separate pills.
  const pills = html => html.split(/\s\+\s/).map(p => `<span class="ing">${p.trim()}</span>`).join('<i class="plus" aria-hidden="true">+</i>');

  function recipes(root, qs) {
    const { esc, $, enhanceFragment } = P();
    const R = data.recipes;
    const p = q(qs);
    const f = { grp: p.get('grp') || '', sec: p.get('sec') || '', rune: p.get('rune') || '', q: p.get('q') || '' };
    // A link to a section picks its group too.
    const secInfo = R.sections.find(s => s.anchor === f.sec);
    if (secInfo && !f.grp) f.grp = secInfo.group;
    const groups = [...new Set(R.recipes.map(r => r.group))];
    const inGroup = R.sections.filter(s => (!f.grp || s.group === f.grp) && R.recipes.some(r => r.sec === s.anchor));
    const runes = [...new Set(R.recipes.flatMap(r => r.runes))];
    const order = ['El', 'Eld', 'Tir', 'Nef', 'Eth', 'Ith', 'Tal', 'Ral', 'Ort', 'Thul', 'Amn', 'Sol', 'Shael', 'Dol', 'Hel', 'Io', 'Lum', 'Ko', 'Fal', 'Lem', 'Pul', 'Um', 'Mal', 'Ist', 'Gul', 'Vex', 'Ohm', 'Lo', 'Sur', 'Ber', 'Jah', 'Cham', 'Zod'];
    runes.sort((a, b) => order.indexOf(a) - order.indexOf(b));

    root.innerHTML = `${head('', 'Cube Recipes')}
      <div class="filters">
        <div class="frow">${searchBox('cq', f.q, 'Ingredient or result, e.g. sockets, Ber, rare')}
          <label class="fsel">Uses rune <select id="crune"><option value="">Any</option>${runes.map(r => `<option${r === f.rune ? ' selected' : ''}>${r}</option>`).join('')}</select></label></div>
        <div class="chips" role="group" aria-label="Group">${['', ...groups].map(g => `<a class="chip${f.grp === g ? ' on' : ''}" href="${url('cube', { grp: g, rune: f.rune, q: f.q })}">${g ? esc(g) : 'All'}</a>`).join('')}</div>
        ${f.grp ? `<div class="chips sub" role="group" aria-label="Section">${inGroup.map(s => `<a class="chip${f.sec === s.anchor ? ' on' : ''}" href="${url('cube', { grp: f.grp, sec: f.sec === s.anchor ? '' : s.anchor, rune: f.rune, q: f.q })}">${esc(s.title || s.group)}</a>`).join('')}</div>` : ''}
      </div>
      <div class="rcount" aria-live="polite"></div>
      <div class="recipes"></div>
      ${foot(R.page)}`;

    const box = $('.recipes', root), count = $('.rcount', root);
    const draw = ff => {
      const ts = ff.q.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = R.recipes.filter(r => (!ff.grp || r.group === ff.grp) && (!ff.sec || r.sec === ff.sec) &&
        (!ff.rune || r.runes.includes(ff.rune)) && ts.every(t => r._s.includes(t)));
      count.textContent = `${hits.length} recipe${hits.length === 1 ? '' : 's'}`;
      const secs = R.sections.filter(s => hits.some(r => r.sec === s.anchor) || (!ts.length && !ff.rune && s.html && (!ff.grp || s.group === ff.grp) && (!ff.sec || s.anchor === ff.sec)));
      box.innerHTML = secs.map(s => {
        const rs = hits.filter(r => r.sec === s.anchor);
        const caps = [...new Set(rs.map(r => r.caption))];
        return `<section class="rsec" id="${esc(s.anchor)}">
          <h2 class="home-h">${esc(s.title || s.group)}${s.title ? `<small>${esc(s.group)}</small>` : ''}</h2>
          ${s.html ? `<details class="about"${rs.length ? '' : ' open'}><summary>About ${esc((s.title || s.group).toLowerCase())}</summary><div class="wiki">${s.html}</div></details>` : ''}
          ${caps.map(cap => `${cap ? `<h3 class="sub-h">${esc(cap)}</h3>` : ''}<ul class="rlist">${rs.filter(r => r.caption === cap).map(r => `
            <li class="recipe">
              ${r.icon ? `<img class="ricon" src="${esc(r.icon)}" alt="" loading="lazy">` : ''}
              <div class="rin">${pills(r.ing)}</div>
              <div class="rout"><span class="arrow" aria-hidden="true">→</span><span>${r.res}</span></div>
              ${r.notes ? `<div class="rnote">${r.notes}</div>` : ''}
            </li>`).join('')}</ul>`).join('')}
        </section>`;
      }).join('') || `<div class="empty">No recipes match. <a href="#/cube">Clear filters</a></div>`;
      enhanceFragment(box, P().byId(R.page));
    };
    draw(f);
    const live = patch => {
      Object.assign(f, patch);
      history.replaceState(null, '', url('cube', f));
      draw(f);
    };
    let t;
    $('#cq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => live({ q: e.target.value.trim() }), 150); });
    $('#crune', root).addEventListener('change', e => live({ rune: e.target.value }));
    if (f.sec && !f.q) requestAnimationFrame(() => document.getElementById(f.sec)?.scrollIntoView({ block: 'start' }));
  }

  function crafting(root, qs) {
    const { esc, $, enhanceFragment } = P();
    const C = data.crafts;
    const p = q(qs);
    const f = { type: p.get('type') || '', slot: p.get('slot') || '', q: p.get('q') || '' };
    const types = Object.keys(CRAFT_TYPES).filter(t => C.crafts.some(c => c.type === t));
    const slots = SLOTS.filter(s => C.crafts.some(c => c.slot === s));
    root.innerHTML = `${head('crafting', 'Crafted Items')}
      <p class="lead">Each craft takes a <b>magic or rare item</b> of that slot, <b>any jewel</b>, a perfect gem and a rune. You get the fixed stats below plus up to 4 random affixes. <a href="#/cube/guide">How crafting works →</a></p>
      <div class="filters">
        <div class="frow">${searchBox('fq', f.q, 'Stat or ingredient, e.g. life leech, Amn')}</div>
        <div class="chips craft-types" role="group" aria-label="Craft type">${['', ...types].map(t => `<a class="chip${f.type === t ? ' on' : ''}${t ? ' ct-' + t.toLowerCase() : ''}" href="${url('cube/crafting', { type: t, slot: f.slot, q: f.q })}">${t || 'All types'}</a>`).join('')}</div>
        <div class="chips" role="group" aria-label="Slot">${['', ...slots].map(s => `<a class="chip${f.slot === s ? ' on' : ''}" href="${url('cube/crafting', { type: f.type, slot: s, q: f.q })}">${s || 'All slots'}</a>`).join('')}</div>
      </div>
      <div class="rcount" aria-live="polite"></div>
      <div class="crafts"></div>
      ${foot(C.page)}`;
    const box = $('.crafts', root), count = $('.rcount', root);
    const card = c => `<article class="icard ccard ct-${c.type.toLowerCase()}" id="${esc(c.slug)}">
      <div class="icard-top">
        ${c.img ? `<span class="icard-img"><img src="${esc(c.img)}" alt="" loading="lazy"></span>` : ''}
        <div class="icard-title"><b>${esc(c.name)}</b><span>${esc(c.type)} craft · ${esc(c.slot)}</span></div>
      </div>
      <div class="crecipe">${c.recipe.map(x => `<span class="ing${/rune/i.test(x) ? ' rune' : /perfect|gem|skull/i.test(x) ? ' gem' : ''}">${esc(x)}</span>`).join('<i class="plus" aria-hidden="true">+</i>')}</div>
      <ul class="istats">${c.stats.map(s => s.st === 'removed' ? `<li class="st st-removed"><s>${esc(s.old || '')}</s></li>` : `<li class="st st-${s.st}" ${s.old ? `title="Was: ${esc(s.old)}"` : ''}>${s.html}</li>`).join('')}
        <li class="st st-rand">+ up to 4 random affixes</li></ul>
      ${c.notes ? `<div class="wiki rnote">${c.notes}</div>` : ''}
    </article>`;
    const draw = ff => {
      const ts = ff.q.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = C.crafts.filter(c => (!ff.type || c.type === ff.type) && (!ff.slot || c.slot === ff.slot) && ts.every(t => c._s.includes(t)));
      count.textContent = `${hits.length} craft${hits.length === 1 ? '' : 's'}`;
      // One type: its slots side by side. One slot: every type's version to compare.
      const by = ff.type || !ff.slot ? types.filter(t => hits.some(c => c.type === t)).map(t => [t, `${t} <small>${esc(CRAFT_TYPES[t])}</small>`, hits.filter(c => c.type === t)])
        : [[ff.slot, `${esc(ff.slot)} crafts`, hits]];
      box.innerHTML = hits.length ? by.map(([, title, cs]) => `<h2 class="home-h">${title}</h2><div class="igrid">${cs.map(card).join('')}</div>`).join('')
        : `<div class="empty">No crafts match. <a href="#/cube/crafting">Clear filters</a></div>`;
      enhanceFragment(box, P().byId(C.page));
    };
    draw(f);
    let t;
    $('#fq', root).addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => { f.q = e.target.value.trim(); history.replaceState(null, '', url('cube/crafting', f)); draw(f); }, 150);
    });
  }

  function corruptions(root, qs) {
    const { esc, enhanceFragment } = P();
    const K = data.corruptions;
    const p = q(qs);
    const type = K.types.find(t => t.name === p.get('type')) || K.types[0];
    const intro = K.blocks.find(b => /^equipment corruptions$/i.test(b.title));
    const others = K.blocks.filter(b => b !== intro && !/modifiers/i.test(b.title));
    root.innerHTML = `${head('corruptions', 'Corruptions')}
      <p class="lead">Cube a <b>Worldstone Shard</b> with an item to corrupt it: it may gain sockets, gain one of the modifiers below, or turn into a random rare. Corrupted items can't be corrupted again.</p>
      ${intro ? `<details class="about"><summary>Odds and rules for equipment</summary><div class="wiki">${intro.html}</div></details>` : ''}
      <div class="chips corr-types" role="group" aria-label="Item type">${K.types.map(t => `<a class="chip${t === type ? ' on' : ''}" href="${url('cube/corruptions', { type: t.name })}">${esc(t.name)}</a>`).join('')}</div>
      ${type ? `<h2 class="home-h">${esc(type.name)} corruptions</h2>
      <div class="corr">${type.cols.map((c, i) => `<section class="corr-col r${i}">
        <header><b>${esc(c.label)}</b>${c.chance != null ? `<span>${c.chance}% of modifier rolls</span>` : ''}</header>
        <ul class="istats">${c.mods.map(m => `<li>${m.replace(/<br\s*\/?>/g, ' · ')}</li>`).join('')}</ul></section>`).join('')}</div>` : ''}
      ${desecration(type)}
      ${others.map(b => `<section class="info-card" id="${esc(b.anchor)}"><h2 class="home-h">${esc(b.title)}</h2><div class="wiki">${b.html}</div></section>`).join('')}
      ${foot(K.page)}`;
    for (const el of root.querySelectorAll('.wiki')) enhanceFragment(el, P().byId(el.closest('.desec') ? data.desecration.page : K.page));
  }

  // Desecration (Season 10+): a second corruption on an already corrupted amulet, after Lucion.
  function desecration(type) {
    const { esc } = P();
    const D = data.desecration;
    if (!D || !D.mods.length) return '';
    if (type?.name !== 'Amulet') return `<a class="callout desec-link" href="${url('cube/corruptions', { type: 'Amulet' })}#Desecration"><span><b>Desecration</b><span>Corrupted amulets can be corrupted a second time after killing Lucion.</span></span></a>`;
    const warn = D.notes.find(n => /^warning/i.test(n));
    const rest = D.notes.filter(n => n !== warn && !/depends on the tier/i.test(n));
    return `<section class="info-card desec" id="Desecration"><h2 class="home-h">Desecration <small>second corruption on amulets</small></h2>
      <div class="wiki">${rest.map(n => `<p>${n}</p>`).join('')}</div>
      <div class="desec-grid">
        <div><h3 class="sub-h">Possible modifiers</h3><ul class="istats">${D.mods.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>
        ${D.chances.length ? `<div><h3 class="sub-h">Success chance by Lucion tier</h3><ul class="desec-odds">${D.chances.map(c => `<li><span>${esc(c.tier)}</span><i style="--w:${c.pct}%"></i><b>${c.pct}%</b></li>`).join('')}</ul></div>` : ''}
      </div>
      ${warn ? `<p class="warnbox wiki">${warn.replace(/^WARNING:\s*/i, '<b>It can brick the amulet.</b> ')}</p>` : ''}</section>`;
  }

  function guide(root) {
    const { esc, enhanceFragment } = P();
    const C = data.crafts;
    root.innerHTML = `${head('guide', 'How Crafting Works')}
      ${C.info.map(b => `<section class="info-card" id="${esc(b.anchor)}"><h2 class="home-h">${esc(b.title)}</h2><div class="wiki">${b.html}</div></section>`).join('')}
      ${foot(C.page)}`;
    for (const el of root.querySelectorAll('.wiki')) enhanceFragment(el, P().byId(C.page));
  }

  function search(qText, n) {
    if (!data) return [];
    const ql = qText.toLowerCase();
    return data.crafts.crafts.filter(c => c.name.toLowerCase().includes(ql)).slice(0, n);
  }

  window.PD2Cube = { load, render, search, get data() { return data; } };
})();
