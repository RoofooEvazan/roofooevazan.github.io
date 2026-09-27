/* Item database: every unique, set item and runeword from data/items.json, which
 * tools/wiki-sync/extract.mjs builds from the wiki's item pages.
 *   #/items?t=unique&slot=Helm&q=fcr   filtered list (all filters live in the hash)
 *   #/item/<slug>                      one item, with what PD2 changed
 * Also renders item cards inside ordinary pages (transformPage).
 */
(() => {
  'use strict';
  const P = () => window.PD2;

  const KINDS = {
    unique: { label: 'Uniques', one: 'Unique', cls: 'q-unique' },
    set: { label: 'Set Items', one: 'Set', cls: 'q-set' },
    runeword: { label: 'Runewords', one: 'Runeword', cls: 'q-rw' },
  };
  const SLOTS = ['Helm', 'Armor', 'Shield', 'Gloves', 'Boots', 'Belt', 'Amulet', 'Ring', 'Weapon', 'Quiver', 'Charm', 'Jewel', 'Other'];
  const TIERS = ['Normal', 'Exceptional', 'Elite'];
  const SORTS = { lvl: 'Level, low to high', 'lvl-desc': 'Level, high to low', name: 'Name', changes: 'Most PD2 changes' };
  const PAGE = 48;

  let data = null, loading = null;
  const D = { bySlug: new Map(), sets: new Map() };

  const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  const unlink = h => String(h || '').replace(/<a\b[^>]*>/g, '').replace(/<\/a>/g, '');

  function load() {
    if (data) return Promise.resolve(data);
    if (!loading) {
      loading = P().fetchJSON('data/items.json').then(d => {
        for (const it of d.items) {
          D.bySlug.set(it.slug, it);
          it.changes = it.stats.filter(s => s.st !== 'same').length;
          it.lvl = it.req?.lvl ?? 0;
          it._s = [it.name, it.base, it.set, (it.runes || []).join(' '), (it.types || []).join(' '), it.sub, it.slot, ...it.stats.map(s => strip(s.html))]
            .join(' \u0001 ').toLowerCase();
        }
        for (const s of d.sets) D.sets.set(s.slug, s);
        data = d;
        return d;
      }).catch(e => { loading = null; throw e; });
    }
    return loading;
  }

  // ---------- small pieces ----------
  const kindOf = it => KINDS[it.kind] || KINDS.unique;
  const subtitle = it => {
    if (it.kind === 'runeword') return `${it.sockets}-socket ${it.base}`;
    return [it.base, it.kind === 'set' ? it.set : ''].filter(Boolean).join(' · ');
  };
  const runes = it => it.runes?.length ? `<div class="runes">${it.runes.map(r => `<span data-hc="rune:${P().esc(r)}">${P().esc(r)}</span>`).join('')}</div>` : '';
  const statLi = (s, withLinks) => {
    const html = withLinks ? s.html : unlink(s.html);
    const cls = `st st-${s.st}`;
    if (s.st === 'removed') return `<li class="${cls}"><s>${P().esc(s.old || strip(s.html))}</s></li>`;
    return `<li class="${cls}">${html}</li>`;
  };

  function card(it, opts = {}) {
    const k = kindOf(it);
    const shown = it.stats.filter(s => s.st !== 'removed');
    const max = opts.full ? shown.length : 6;
    const more = shown.length - max;
    const tag = opts.tag || 'a';
    const href = tag === 'a' ? ` href="#/item/${it.slug}"` : '';
    return `<${tag} class="icard ${k.cls}"${href}${opts.id ? ` id="${P().esc(opts.id)}"` : ''}>
      <div class="icard-top">
        ${it.img ? `<span class="icard-img"><img src="${P().esc(it.img)}" alt="" loading="lazy" decoding="async"></span>` : ''}
        <div class="icard-title"><b>${P().esc(it.name)}</b><span>${P().esc(subtitle(it))}</span></div>
        ${it.lvl ? `<span class="icard-lvl" title="Required level">${it.lvl}</span>` : ''}
      </div>
      ${runes(it)}
      <ul class="istats">${shown.slice(0, max).map(s => statLi(s, false)).join('')}</ul>
      <div class="icard-foot">
        <span>${more > 0 ? `+${more} more` : k.one}${it.tier ? ` · ${it.tier}` : ''}</span>
        ${it.changes ? `<span class="chg" title="Stats PD2 added, changed or removed">${it.changes} PD2 change${it.changes === 1 ? '' : 's'}</span>` : ''}
      </div>
    </${tag}>`;
  }

  // One line per item: picture, name and base, level and its first stats; the rest on hover.
  const VIEW = 'pd2wiki-iview';
  const getView = () => { try { return localStorage.getItem(VIEW) || 'list'; } catch { return 'list'; } };
  const saveView = v => { try { localStorage.setItem(VIEW, v); } catch {} };
  function row(it) {
    const { esc } = P();
    const k = kindOf(it);
    const shown = it.stats.filter(s => s.st !== 'removed');
    const sum = shown.slice(0, 3).map(s => esc(strip(s.html))).join('<i>·</i>');
    return `<a class="irow ${k.cls}" href="#/item/${it.slug}">
      <span class="ir-img">${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy" decoding="async">` : ''}</span>
      <span class="ir-name"><b>${esc(it.name)}</b><span>${esc(subtitle(it))}</span></span>
      <span class="ir-lvl" title="Required level">${it.lvl || ''}</span>
      <span class="ir-stats">${sum}${shown.length > 3 ? ` <em>+${shown.length - 3}</em>` : ''}</span>
      <span class="ir-chg">${it.changes ? `<span class="chg" title="Stats PD2 added, changed or removed">${it.changes}</span>` : ''}</span>
    </a>`;
  }

  // Hover card: the item's full tooltip, for links to it anywhere on the site.
  async function tip(slug) {
    await load();
    const it = D.bySlug.get(slug);
    if (!it) return '';
    const { esc } = P();
    const k = kindOf(it);
    const req = [it.req?.lvl && `Level ${it.req.lvl}`, it.req?.str && `${it.req.str} Str`, it.req?.dex && `${it.req.dex} Dex`].filter(Boolean).join(' · ');
    const info = it.info.filter(l => !l.base && /defense|damage|block|sockets/i.test(l.label || '')).slice(0, 3);
    return `<div class="hc-item ${k.cls}">
      <div class="hc-head">${it.img ? `<img src="${esc(it.img)}" alt="">` : ''}<span><b class="hc-name">${esc(it.name)}</b><span class="hc-sub">${esc(subtitle(it))}${it.tier ? ' · ' + esc(it.tier) : ''}</span></span></div>
      ${runes(it)}
      ${info.length ? `<ul class="hc-kv">${info.map(l => `<li><span>${esc(l.label)}</span> ${unlink(l.html)}</li>`).join('')}</ul>` : ''}
      ${req ? `<div class="hc-req">Requires ${esc(req)}</div>` : ''}
      <ul class="istats">${it.stats.filter(s => s.st !== 'removed').map(s => statLi(s, false)).join('')}</ul>
      ${it.changes ? `<div class="hc-foot"><span class="st-dot st-changed"></span>${it.changes} PD2 change${it.changes === 1 ? '' : 's'}</div>` : ''}
    </div>`;
  }

  // ---------- filters in the hash ----------
  function readQuery(qs) {
    const p = new URLSearchParams(qs || '');
    return {
      t: p.get('t') || 'all', slot: p.get('slot') || '', sub: p.get('sub') || '', tier: p.get('tier') || '',
      q: p.get('q') || '', min: p.get('min') || '', max: p.get('max') || '', ch: p.get('ch') === '1',
      sock: p.get('sock') || '', type: p.get('type') || '', set: p.get('set') || '', sort: p.get('sort') || 'lvl',
    };
  }
  function writeQuery(f) {
    const p = new URLSearchParams();
    if (f.t !== 'all') p.set('t', f.t);
    for (const k of ['slot', 'sub', 'tier', 'q', 'min', 'max', 'sock', 'type', 'set']) if (f[k]) p.set(k, f[k]);
    if (f.ch) p.set('ch', '1');
    if (f.sort !== 'lvl') p.set('sort', f.sort);
    const s = p.toString();
    return '#/items' + (s ? '?' + s : '');
  }

  function apply(f) {
    const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const min = f.min === '' ? -1 : +f.min, max = f.max === '' ? 999 : +f.max;
    let list = data.items.filter(it =>
      (f.t === 'all' || it.kind === f.t) &&
      (!f.slot || it.slot === f.slot) &&
      (!f.sub || it.sub === f.sub) &&
      (!f.tier || it.tier === f.tier) &&
      (!f.sock || it.sockets === +f.sock) &&
      (!f.type || (it.types || []).includes(f.type)) &&
      (!f.set || it.setSlug === f.set) &&
      (!f.ch || it.changes > 0) &&
      it.lvl >= min && it.lvl <= max &&
      terms.every(t => it._s.includes(t)));
    const by = {
      lvl: (a, b) => a.lvl - b.lvl || a.name.localeCompare(b.name),
      'lvl-desc': (a, b) => b.lvl - a.lvl || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      changes: (a, b) => b.changes - a.changes || a.lvl - b.lvl,
    }[f.sort] || ((a, b) => a.lvl - b.lvl);
    return list.sort(by);
  }

  const count = (pred) => data.items.filter(pred).length;

  // ---------- list view ----------
  async function list(root, qs) {
    const { esc, $, $$ } = P();
    root.innerHTML = '<div class="loading">Loading items…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load the item database.</b><br>${esc(e.message)}</div>`; return; }
    const f = readQuery(qs);
    const base = data.items.filter(it => f.t === 'all' || it.kind === f.t);
    const slots = SLOTS.filter(s => base.some(it => it.slot === s));
    const subs = [...new Set(base.filter(it => it.slot === 'Weapon' && it.sub).map(it => it.sub))];
    const types = f.t === 'runeword' ? [...new Set(base.flatMap(it => it.types || []))].sort() : [];
    const title = f.set ? D.sets.get(f.set)?.name || 'Set' : (KINDS[f.t]?.label || 'Item Database');

    const chip = (key, val, label, n) => {
      const on = String(f[key]) === String(val);
      const next = { ...f, [key]: on ? '' : val };
      if (key === 'slot' && !on && val !== 'Weapon') next.sub = '';
      return `<a class="chip${on ? ' on' : ''}" href="${writeQuery(next)}" aria-pressed="${on}">${esc(label)}${n != null ? `<i>${n}</i>` : ''}</a>`;
    };
    const tab = (t, label, n) => `<a class="seg${f.t === t ? ' on' : ''}" href="${writeQuery({ ...readQuery(''), t, q: f.q })}" aria-pressed="${f.t === t}">${label}<i>${n}</i></a>`;

    const set = f.set && D.sets.get(f.set);
    root.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/items">Items</a></nav>
      <h1 class="page-title">${esc(title)}</h1>
      <div class="segs" role="group" aria-label="Item type">
        ${tab('all', 'All', data.items.length)}${tab('unique', 'Uniques', count(i => i.kind === 'unique'))}${tab('set', 'Sets', count(i => i.kind === 'set'))}${tab('runeword', 'Runewords', count(i => i.kind === 'runeword'))}
      </div>
      <div class="filters">
        <div class="frow">
          <label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input type="search" id="iq" value="${esc(f.q)}" placeholder="Name, rune or stat, e.g. cast rate" aria-label="Filter items" autocomplete="off"></label>
          <label class="fnum">Level <input type="number" id="imin" inputmode="numeric" min="0" max="99" placeholder="min" value="${esc(f.min)}" aria-label="Minimum required level">
            – <input type="number" id="imax" inputmode="numeric" min="0" max="99" placeholder="max" value="${esc(f.max)}" aria-label="Maximum required level"></label>
          <label class="fsel">Sort <select id="isort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}"${f.sort === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
          <a class="chip toggle${f.ch ? ' on' : ''}" href="${writeQuery({ ...f, ch: !f.ch })}" aria-pressed="${f.ch}">Changed in PD2</a>
        </div>
        <div class="chips" role="group" aria-label="Slot">${slots.map(s => chip('slot', s, s, base.filter(it => it.slot === s).length)).join('')}</div>
        ${f.slot === 'Weapon' && subs.length ? `<div class="chips sub" role="group" aria-label="Weapon type">${subs.map(s => chip('sub', s, s)).join('')}</div>` : ''}
        ${f.t !== 'runeword' ? `<div class="chips" role="group" aria-label="Tier">${TIERS.map(t => chip('tier', t, t)).join('')}</div>` : ''}
        ${f.t === 'runeword' ? `<div class="chips" role="group" aria-label="Sockets">${[2, 3, 4, 5, 6].map(n => chip('sock', n, n + ' sockets')).join('')}</div>
          <details class="more-f"${f.type ? ' open' : ''}><summary>Base type</summary><div class="chips">${types.map(t => chip('type', t, t)).join('')}</div></details>` : ''}
      </div>
      ${set ? setPanel(set) : ''}
      <div class="rbar"><div class="rcount" aria-live="polite"></div>
        <div class="vtoggle" role="group" aria-label="Layout"><button type="button" data-v="list">List</button><button type="button" data-v="cards">Cards</button></div></div>
      <div class="igrid"></div>
      <button class="more-btn" type="button" hidden>Show more</button>`;

    const grid0 = $('.igrid', root), moreBtn = $('.more-btn', root), countEl = $('.rcount', root);
    let results = [], shown = 0, grid = grid0, view = getView();
    const setView = v => {
      view = v;
      grid.className = v === 'list' ? 'ilist' : 'igrid';
      for (const b of $$('.vtoggle button', root)) b.classList.toggle('on', b.dataset.v === v);
    };
    setView(view);
    $('.vtoggle', root).addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (!b || b.dataset.v === view) return;
      setView(b.dataset.v);
      saveView(b.dataset.v);
      const n = Math.max(shown, PAGE);
      grid.innerHTML = results.slice(0, n).map(it => view === 'list' ? row(it) : card(it)).join('');
      shown = Math.min(results.length, n);
    });
    const renderMore = () => {
      grid.insertAdjacentHTML('beforeend', results.slice(shown, shown + PAGE).map(it => view === 'list' ? row(it) : card(it)).join(''));
      shown = Math.min(results.length, shown + PAGE);
      moreBtn.hidden = shown >= results.length;
      moreBtn.textContent = `Show more (${results.length - shown} left)`;
    };
    const update = ff => {
      results = apply(ff); shown = 0;
      grid.innerHTML = results.length ? '' : `<div class="empty">No items match. <a href="${writeQuery({ ...readQuery(''), t: ff.t })}">Clear filters</a></div>`;
      countEl.textContent = results.length ? `${results.length} item${results.length === 1 ? '' : 's'}` : '';
      if (results.length) renderMore(); else moreBtn.hidden = true;
    };
    update(f);
    moreBtn.addEventListener('click', renderMore);
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && !moreBtn.hidden) renderMore(); }, { rootMargin: '600px' });
    io.observe(moreBtn);

    // Text, level and sort update the list in place and the hash without a history entry,
    // so the search box keeps focus; chips are plain links.
    const live = patch => {
      const next = { ...readQuery(currentQs()), ...patch };
      history.replaceState(null, '', writeQuery(next));
      update(next);
      for (const a of root.querySelectorAll('.filters a.chip, .segs a.seg')) {
        const u = new URLSearchParams(a.getAttribute('href').split('?')[1] || '');
        if (next.q) u.set('q', next.q); else u.delete('q');
        const qs = u.toString();
        a.setAttribute('href', '#/items' + (qs ? '?' + qs : ''));
      }
    };
    let t;
    const q = $('#iq', root);
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => live({ q: q.value.trim() }), 160); });
    for (const id of ['imin', 'imax']) $('#' + id, root).addEventListener('input', e => live({ [id === 'imin' ? 'min' : 'max']: e.target.value }));
    $('#isort', root).addEventListener('change', e => live({ sort: e.target.value }));
  }
  const currentQs = () => (location.hash.split('?')[1] || '');

  function setPanel(set) {
    const { esc } = P();
    const members = set.items.map(s => D.bySlug.get(s)).filter(Boolean);
    return `<section class="setpanel">
      <div class="setpanel-head"><b>${esc(set.name)}</b><span>${esc(set.rarity)} set · ${members.length} items · ${esc(set.tier)}</span></div>
      ${set.bonuses.length ? `<h3>Set bonuses</h3><ul class="istats">${set.bonuses.map(s => statLi(s, true)).join('')}</ul>` : ''}
    </section>`;
  }

  // ---------- detail view ----------
  async function detail(root, slug) {
    const { esc, $, ICONS, wikiUrl, byId, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load the item database.</b><br>${esc(e.message)}</div>`; return; }
    const it = D.bySlug.get(slug);
    if (!it) { root.innerHTML = `<div class="error"><b>No item “${esc(slug)}”.</b><br><a href="#/items">Browse all items</a></div>`; return; }
    document.title = `${it.name} · PD2 Wiki`;
    const k = kindOf(it);
    const page = byId(it.page);
    const set = it.setSlug && D.sets.get(it.setSlug);
    const changes = it.stats.filter(s => s.st !== 'same');
    const infoLines = it.info.filter(l => !l.base && l.label && !/^Required (Level|Strength|Dexterity)$/i.test(l.label));
    const baseLines = it.info.filter(l => l.base);
    const req = [it.req.lvl && `Level ${it.req.lvl}`, it.req.str && `${it.req.str} Str`, it.req.dex && `${it.req.dex} Dex`].filter(Boolean).join(' · ');
    const listHref = `#/items?t=${it.kind}${it.slot ? '&slot=' + encodeURIComponent(it.slot) : ''}`;
    const others = set ? set.items.filter(s => s !== it.slug).map(s => D.bySlug.get(s)).filter(Boolean) : [];
    // Other uniques and sets on the same base (not runewords, whose "base" is a socket count).
    const sameBase = it.kind === 'runeword' || !it.base ? [] : data.items.filter(o => o !== it && o.kind !== 'runeword' && baseName(o.base) === baseName(it.base));

    root.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/items?t=${it.kind}">${esc(k.label)}</a><span aria-hidden="true">›</span><a href="${listHref}">${esc(it.slot)}</a></nav>
      <div class="idetail">
        <div class="tooltip ${k.cls}">
          ${it.img ? `<div class="tt-img"><img src="${esc(it.img)}" alt=""></div>` : ''}
          <h1 class="tt-name">${esc(it.name)}</h1>
          <div class="tt-base">${it.kind === 'runeword' ? it.baseHtml || esc(subtitle(it)) : esc(it.base)}</div>
          ${runes(it)}
          ${infoLines.length ? `<ul class="tt-info">${infoLines.map(l => `<li><span>${esc(l.label)}</span> ${l.html}</li>`).join('')}</ul>` : ''}
          ${req ? `<div class="tt-req">Requires ${esc(req)}</div>` : ''}
          <ul class="istats tt-stats">${it.stats.map(s => s.st === 'removed' ? `<li class="st st-removed"><s>${esc(s.old || strip(s.html))}</s> <em class="tt-was">removed in PD2</em></li>`
            : `<li class="st st-${s.st}">${s.html}${s.st === 'changed' && s.old ? `<em class="tt-was">was ${esc(s.old)}</em>` : ''}</li>`).join('')}</ul>
          ${changes.length ? `<div class="tt-legend"><span class="st-new">New in PD2</span><span class="st-changed">Changed</span>${changes.some(s => s.st === 'removed') ? '<span class="st-removed">Removed</span>' : ''}</div>` : '<div class="tt-legend tt-same">Same stats as the original game</div>'}
        </div>
        <div class="iside">
          ${baseLines.length ? `<section><h2 class="home-h">Base item${it.kind !== 'runeword' && it.base ? ` <a class="ibase" href="#/bases?kind=${it.slot === 'Weapon' ? 'Weapon' : 'Armor'}&q=${encodeURIComponent(baseName(it.base))}" data-hc="base:${esc(baseSlug(it.base))}">${esc(baseName(it.base))}</a>` : ''}</h2><ul class="kv kv2">${baseLines.map(l => `<li><span>${esc(l.label)}</span><b>${l.html}</b></li>`).join('')}</ul></section>` : ''}
          ${sameBase.length ? `<section><h2 class="home-h">Also on ${esc(baseName(it.base))}</h2><p class="also">${sameBase.map(o => `<a href="#/item/${o.slug}" class="${kindOf(o).cls}">${esc(o.name)}</a>`).join('')}</p></section>` : ''}
          ${set ? `<section><h2 class="home-h">${esc(set.name)}</h2>
            ${others.length ? `<div class="mini">${others.map(o => `<a href="#/item/${o.slug}" class="${kindOf(o).cls}">${o.img ? `<img src="${esc(o.img)}" alt="" loading="lazy">` : ''}<span><b>${esc(o.name)}</b><i>${esc(o.base)}</i></span></a>`).join('')}</div>` : ''}
            ${set.bonuses.length ? `<h3 class="sub-h">Set bonuses</h3><ul class="istats">${set.bonuses.map(s => statLi(s, true)).join('')}</ul>` : ''}
            <a class="more-link" href="#/items?t=set&set=${set.slug}">Whole set →</a></section>` : ''}
          ${it.notes ? `<section><h2 class="home-h">Notes</h2><div class="wiki inote">${it.notes.replace(/^\s*<p>\s*<b>Notes?:?<\/b>\s*<\/p>/i, '')}</div></section>` : ''}
          <p class="attrib">From <a href="${page ? wikiUrl(page.title, it.anchor) : '#'}" target="_blank" rel="noopener">${esc(page?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>
        </div>
      </div>`;
    for (const el of root.querySelectorAll('.tt-stats, .tt-info, .diff, .setpanel, .inote, .istats')) enhanceFragment(el, page);
    const side = root.querySelector('.iside');
    window.PD2Patches?.historyHtml(it.name).then(h => { if (h && side.isConnected) side.querySelector('.attrib').insertAdjacentHTML('beforebegin', h); });
  }

  const baseName = n => String(n || '').replace(/\s*\([^)]*\)\s*$/, '');
  const baseSlug = n => baseName(n).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // ---------- item entries inside ordinary pages ----------
  // Replaces each wiki item block (heading, picture, info box, Before/After table) with
  // our card, grouping neighbours into a grid. The card keeps the heading's id so links
  // to #Section still land on it.
  async function transformPage(root, page) {
    const targets = P().S.index.targets || {};
    const heads = [...root.querySelectorAll('.mw-heading')].filter(w => {
      const h = w.querySelector('h1,h2,h3,h4,h5,h6');
      return h?.id && /^item\//.test(targets[`${page.id}#${h.id}`] || '');
    });
    if (!heads.length) return;
    try { await load(); } catch { return; }
    for (const w of heads) {
      const h = w.querySelector('h1,h2,h3,h4,h5,h6');
      const it = D.bySlug.get(targets[`${page.id}#${h.id}`].slice(5));
      if (!it) continue;
      // Remove the wiki's own block for this item.
      for (let n = w.nextElementSibling; n && !n.matches('.mw-heading');) {
        const next = n.nextElementSibling;
        if (n.matches('.item-image-text,.item-image-table,.item-info-box,table.wikitable,.tw,figure') || !n.textContent.trim()) n.remove();
        else break;
        n = next;
      }
      const tmp = document.createElement('div');
      tmp.innerHTML = card(it, { id: h.id });
      const c = tmp.firstElementChild;
      const prev = w.previousElementSibling;
      if (prev?.classList.contains('igrid')) prev.appendChild(c);
      else { const g = document.createElement('div'); g.className = 'igrid in-page'; g.appendChild(c); w.before(g); }
      w.remove();
    }
    // Merge grids that ended up adjacent.
    for (const g of [...root.querySelectorAll('.igrid.in-page')]) {
      const n = g.nextElementSibling;
      if (n?.classList.contains('igrid')) { while (n.firstChild) g.appendChild(n.firstChild); n.remove(); }
    }
  }

  // Search helpers for the global search box.
  function searchItems(q, n) {
    if (!data) return [];
    const ql = q.toLowerCase();
    const out = [];
    for (const it of data.items) {
      const nm = it.name.toLowerCase();
      let s = 0;
      if (nm === ql) s = 100; else if (nm.startsWith(ql)) s = 80; else if (nm.includes(' ' + ql)) s = 65; else if (nm.includes(ql)) s = 50;
      else if (it.runes?.join(' ').toLowerCase() === ql) s = 45;
      if (s) out.push({ it, s });
    }
    return out.sort((a, b) => b.s - a.s || a.it.lvl - b.it.lvl).slice(0, n).map(x => x.it);
  }

  // How many items mention every word of q anywhere (name, base, runes, stats).
  function countMatches(q) {
    if (!data) return 0;
    const ts = q.toLowerCase().split(/\s+/).filter(Boolean);
    return ts.length ? data.items.filter(it => ts.every(t => it._s.includes(t))).length : 0;
  }

  window.PD2Items = { load, list, detail, transformPage, searchItems, countMatches, card, row, kindOf, subtitle, tip, get data() { return data; } };
})();
