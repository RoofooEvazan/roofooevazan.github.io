/* PD2 Wiki reader. Our own layout over the pages tools/wiki-sync/sync.mjs mirrors into data/.
 * Routes (all in the hash, so GitHub Pages needs no server config):
 *   #/                       home
 *   #/items?…                item database (items.js)
 *   #/item/<slug>            one item
 *   #/skills/<Class>[/<id>]  skill browser (skills.js)
 *   #/Page_Title#Section     any other wiki page, restyled
 *   #/search/<query>         full search results
 *   #/all-pages, #/changes   indexes
 *   #/tools/merc-weapons     Act 2 merc weapon comparison (merc.js)
 */
(() => {
  'use strict';

  const WIKI = 'https://wiki.projectdiablo2.com';
  const REPO = 'RoofooEvazan/roofooevazan.github.io';
  const MERC_ROUTE = 'tools/merc-weapons';
  const MERC_PAGES = new Set(['Mercenaries', 'Act 2 Mercenary Runewords', 'Mercenary Skills', 'Polearms', 'Spears', 'Polearm Runewords']);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const main = $('#main');
  const tocRail = $('#toc-rail');

  const S = {
    index: null,
    byTitle: new Map(),
    byId: new Map(),
    groupOf: new Map(),     // page id -> sidebar section name
    sections: [],
    html: new Map(),
    search: null,
    searchLoading: null,
    changes: null,
    current: null,
    spy: null,
  };

  // ---------- helpers ----------
  const norm = t => {
    t = String(t).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const encTitle = t => encodeURIComponent(t.replace(/ /g, '_'))
    .replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%2C/g, ',').replace(/%27/g, "'").replace(/%28/g, '(').replace(/%29/g, ')');
  const pageHref = (title, anchor) => '#/' + encTitle(title) + (anchor ? '#' + encodeURIComponent(anchor).replace(/%2C/g, ',').replace(/%27/g, "'") : '');
  const wikiUrl = (title, anchor) => `${WIKI}/wiki/${encTitle(title)}${anchor ? '#' + encodeURIComponent(anchor) : ''}`;
  const displayName = p => p.display.replace(/^Guide:/, '').replace(/^Patch:/, '');

  function resolve(title) {
    let t = norm(title), frag;
    for (let hops = 0; hops < 3; hops++) {
      const p = S.byTitle.get(t);
      if (p) return { page: p, frag };
      const r = S.index.redirects[t];
      if (!r) return null;
      const i = r.indexOf('#');
      if (i >= 0) { frag = frag || r.slice(i + 1); t = norm(r.slice(0, i)); } else t = norm(r);
    }
    return null;
  }

  // Where a wiki page (+ section) lives in this reader: an item card, a skill, or the page.
  function hrefFor(page, anchor) {
    const tg = S.index.targets || {};
    const t = tg[`${page.id}#${anchor || ''}`];
    if (t) return '#/' + t;
    return pageHref(page.title, anchor);
  }

  // Data files carry the sync's version stamp (index.json "v"), so they can be cached until
  // a sync changes them; the index itself and anything else is always checked.
  async function fetchJSON(url) {
    const versioned = S.index?.v && url.startsWith('data/') && !url.endsWith('index.json');
    const res = await fetch(versioned ? `${url}?v=${S.index.v}` : url, { cache: versioned ? 'default' : 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} loading ${url}`);
    return res.json();
  }
  function fmtDate(iso) {
    if (!iso) return '';
    // Plain dates ("2026-04-24") are calendar days, not UTC midnight.
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso);
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function ago(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 90) return 'just now';
    const m = s / 60; if (m < 60) return `${Math.round(m)} min ago`;
    const h = m / 60; if (h < 24) return `${Math.round(h)} h ago`;
    const d = h / 24; if (d < 30) return `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'} ago`;
    const mo = d / 30.4; if (mo < 12) return `${Math.round(mo)} month${Math.round(mo) === 1 ? '' : 's'} ago`;
    return fmtDate(iso);
  }

  const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const ICONS = {
    home: I('<path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z"/>'),
    items: I('<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/>'),
    unique: I('<path d="M12 2 9 9H2l6 4.5L5.5 21 12 16.5 18.5 21 16 13.5 22 9h-7z"/>'),
    set: I('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>'),
    rune: I('<path d="M12 2 5 7v10l7 5 7-5V7z"/><path d="M9 8l6 8M15 8l-6 8"/>'),
    skills: I('<path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><circle cx="12" cy="12" r="4"/>'),
    craft: I('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/>'),
    map: I('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
    gear: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
    book: I('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>'),
    scroll: I('<path d="M8 3h11v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-1h11v1a3 3 0 0 0 3 3"/><path d="M8 3a3 3 0 0 0-3 3v11M12 8h4M12 12h4"/>'),
    help: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>'),
    merc: I('<path d="M12 2v20M8 6l4-4 4 4M5 22h14M9 13h6"/>'),
    skull: I('<path d="M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/>'),
    clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    list: I('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
    ext: I('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', 'stroke-width="2"'),
  };

  // ---------- our own site map ----------
  // Links are [label, href] or a wiki page title. Titles that aren't on the wiki are skipped,
  // and every page nobody lists here still shows up under "More pages".
  const SITE = [
    { name: 'Items', icon: 'items', links: [['Item Database', '#/items'], ['Runewords', '#/items?t=runeword'], ['Uniques', '#/items?t=unique'], ['Set Items', '#/items?t=set'],
      ['Runes & Gems', '#/runes'], ['Item Bases', '#/bases'], ['Affix Finder', '#/affixes'], ['New in PD2', '#/new'], ['Cosmetics', '#/cosmetics']] },
    { name: 'Classes & Skills', icon: 'skills', links: [['Skills', '#/skills'], ['Skill Changes', '#/skills/changes'], ['Item-Only Skills', '#/skills/Items'], ['Stat Planner', '#/classes'],
      ['Breakpoints', '#/breakpoints'], ['Mercenaries', '#/mercs'], ['Merc Weapon Compare', '#/' + MERC_ROUTE]] },
    { name: 'Crafting & Cube', icon: 'craft', links: [['Cube Recipes', '#/cube'], ['Crafted Items', '#/cube/crafting'], ['Corruptions', '#/cube/corruptions']] },
    { name: 'Endgame', icon: 'map', links: [['Maps', '#/maps'], ['Zones', '#/zones'], ['Monsters & Ubers', '#/monsters'], ['PvP & Dueling', '#/pvp']] },
    { name: 'Mechanics', icon: 'gear', links: [['Game Mechanics', '#/mechanics'], ['What PD2 Changed', '#/overview'], ['Abbreviations', '#/glossary'], ['Known Bugs', '#/about/bugs']] },
    { name: 'Guides & Help', icon: 'book', links: [['Build Directory', '#/guides'], ['Help Center', '#/help'], ['Loot Filters', '#/filters'], ['Community Links', '#/guides/links']] },
    { name: 'Patch Notes', icon: 'scroll', auto: 'seasons' },
    { name: 'About PD2', icon: 'help', links: [['Rules', '#/about'], ['Seasons', '#/about/seasons'], ['Singleplayer', '#/about/singleplayer'], ['Credits', '#/about/credits']] },
    { name: 'More Pages', icon: 'list', auto: 'rest' },
  ];
  // Pages our own views replace; they stay reachable through search and A–Z.
  const COVERED = /^(Axes|Maces|Swords|Daggers|Throwing|Spears|Polearms|Bows|Crossbows|Staves|Wands|Scepters|Class Weapons|Helms|Chests|Shields|Gloves|Boots|Belts|Quivers|Amulets|Rings|Charms|Jewel|Normal|Exceptional|Elite|RW\w+|All .*|.* Runewords|New Runewords|New Equipment|MagicPrefixSuffix|Main Page.*|To Do|Amazon|Assassin|Barbarian|Druid|Necromancer|Paladin|Sorceress|Item Codes|Key|Introduction|Maps|Zones|Monsters|Game Mechanics|Item Affixes|Item Bases|Runes|Mercenaries|Mercenary Skills|FAQ|Support FAQ|Breakpoints|Links|Item Filtering|Filter Info|Customization|Class Attributes|Item Quality Levels|New Items|Cosmetics|General Changes|Balance Changes|Singleplayer|Rules|Credits|Arrows|Bugs|Seasons|Skill Changes|Item Skills|Item-Only Skills|PvP Changes|Low Level Dueling|Lexicon of Abbreviations|Formula Info|Desecration|Aura|Fury|Riddle|Blade Dance|ShadowWhirlwindAssassin|The Low-tech Lab.*|Recipes|Crafting|Corruptions|Patch Notes|Recent Patch Notes|Patch:.*|Season \d+)$/;

  function buildSite() {
    const used = new Set();
    const sections = [];
    for (const sec of SITE) {
      let links = [];
      if (sec.links) {
        for (const l of sec.links) {
          const [label, target] = Array.isArray(l) ? l : [l, l];
          if (target.startsWith('#')) { links.push({ label, href: target, route: target.slice(2) }); continue; }
          const r = resolve(target);
          if (!r) continue;
          used.add(r.page.id);
          links.push({ label, href: pageHref(r.page.title), id: r.page.id });
        }
      }
      sections.push({ ...sec, links });
    }
    const rest = S.index.pages.filter(p => !used.has(p.id) && !COVERED.test(p.title) && !S.index.targets?.[`${p.id}#`] && !/\/[a-z]{2}(-[a-z]+)?$/.test(p.title) && !/[^\x00-\x7F]/.test(p.title));
    const take = test => rest.filter(p => !p._t && test(p) && (p._t = true));
    const sortP = a => a.sort((x, y) => displayName(x).localeCompare(displayName(y), undefined, { numeric: true }));
    const autos = {
      patchPages: [...take(p => /^Patch:/.test(p.title)).sort((a, b) => (+(b.title.match(/\d+/) || [0])[0]) - (+(a.title.match(/\d+/) || [0])[0])),
        ...take(p => /Patch Notes|^Season \d+$/.test(p.title))],
      guides: sortP(take(p => /^Guide:|guide|^Starter |^\w+Assassin$|Build/i.test(p.title))),
    };
    const today = new Date().toISOString().slice(0, 10);
    // The newest three seasons (and upcoming spoilers); the rest are a click away on the patch notes page.
    const seasons = (S.index.seasons || []).slice().sort((a, b) => (b.iso || '9').localeCompare(a.iso || '9'));
    autos.seasons = [
      ...seasons.slice(0, 4).map(x => ({ label: x.key === 'upcoming' ? 'Upcoming spoilers' : `Season ${x.n} · ${x.name}${x.iso > today ? ' (upcoming)' : ''}`, href: `#/patches/${x.key}`, route: `patches/${x.key}` })),
      { label: `All ${seasons.filter(x => x.n).length} seasons`, href: '#/patches', route: 'patches' },
    ];
    autos.rest = sortP(take(() => true));
    for (const p of S.index.pages) delete p._t;
    for (const sec of sections) {
      if (sec.auto) sec.links = autos[sec.auto].map(p => p.href ? p : ({ label: displayName(p), href: pageHref(p.title), id: p.id }));
      for (const l of sec.links) if (l.id && !S.groupOf.has(l.id)) S.groupOf.set(l.id, sec.name);
    }
    S.sections = sections.filter(s => s.links.length);
  }

  // ---------- boot ----------
  async function boot() {
    try {
      // index.html starts this download in <head>, alongside the scripts.
      S.index = await (window.PD2_INDEX || fetchJSON('data/index.json'));
    } catch (e) {
      main.innerHTML = `<div class="error"><b>Couldn't load the wiki.</b><br>${esc(e.message)}</div>`;
      return;
    }
    for (const p of S.index.pages) { S.byTitle.set(norm(p.title), p); S.byId.set(p.id, p); }
    buildSite();
    renderSidebar();
    setupSearch();
    setupChrome();
    window.addEventListener('hashchange', () => route());
    route();
    // Keeps data and pages on the device between visits (see sw.js).
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      const reg = () => navigator.serviceWorker.register('sw.js').catch(() => {});
      if (document.readyState === 'complete') setTimeout(reg, 1000); else addEventListener('load', reg);
    }
  }

  function renderSidebar() {
    const nav = $('#side-nav');
    const top = `<a class="top-link" href="#/" data-route="">${ICONS.home}<span>Home</span></a>`;
    nav.innerHTML = top + S.sections.map((s, i) => `
      <details data-s="${i}">
        <summary>${ICONS[s.icon] || ''}<span>${esc(s.name)}</span><span class="n">${s.links.length}</span></summary>
        <ul>${s.links.map(l => `<li><a href="${l.href}"${l.id ? ` data-id="${l.id}"` : ` data-route="${esc(l.route)}"`}>${esc(l.label)}</a></li>`).join('')}</ul>
      </details>`).join('') +
      `<hr><a class="top-link" href="#/changes" data-route="changes">${ICONS.clock}<span>Recent changes</span></a>
       <a class="top-link" href="#/all-pages" data-route="all-pages">${ICONS.list}<span>All pages A–Z</span></a>
       <div class="side-empty" hidden>No pages match.</div>`;

    $('#side-filter').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      let any = false;
      for (const d of $$('details', nav)) {
        let hits = 0;
        for (const li of $$('li', d)) { const show = !q || li.textContent.toLowerCase().includes(q); li.hidden = !show; hits += show; }
        d.hidden = hits === 0;
        if (q) d.open = hits > 0;
        any = any || hits > 0;
      }
      $('.side-empty', nav).hidden = any;
    });
  }

  function markSidebar(key) {
    const nav = $('#side-nav');
    for (const a of $$('[aria-current]', nav)) a.removeAttribute('aria-current');
    let el = null;
    if (typeof key === 'number') el = $(`a[data-id="${key}"]`, nav);
    else if (key != null) {
      // Longest route prefix wins, so "items?t=set" beats "items".
      let best = -1;
      for (const a of $$('a[data-route]', nav)) {
        const r = a.dataset.route;
        if ((key === r || (r && key.startsWith(r))) && r.length > best) { best = r.length; el = a; }
      }
    }
    if (!el) return;
    el.setAttribute('aria-current', 'page');
    const d = el.closest('details');
    if (!$('#side-filter').value) for (const x of $$('details', nav)) if (x !== d) x.open = false;
    if (d && !d.open) d.open = true;
    const side = $('#side');
    const r = el.getBoundingClientRect(), sr = side.getBoundingClientRect();
    if (r.top < sr.top + 60 || r.bottom > sr.bottom - 20) side.scrollTop += r.top - sr.top - sr.height / 3;
  }

  // ---------- chrome: drawer, lightbox, back-to-top, keys ----------
  function setupChrome() {
    const side = $('#side'), scrim = $('.scrim'), btn = $('.menu-btn');
    const setDrawer = open => {
      side.classList.toggle('open', open);
      scrim.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    };
    btn.addEventListener('click', () => setDrawer(true));
    scrim.addEventListener('click', () => setDrawer(false));
    $('.side-close').addEventListener('click', () => setDrawer(false));
    side.addEventListener('click', e => { if (e.target.closest('a')) setDrawer(false); });
    S.closeDrawer = () => setDrawer(false);

    const lb = $('.lightbox');
    const closeLb = () => { lb.hidden = true; $('img', lb).removeAttribute('src'); };
    lb.addEventListener('click', closeLb);
    main.addEventListener('click', e => {
      const a = e.target.closest('a.img-link');
      if (!a || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      $('img', lb).src = a.href;
      lb.hidden = false;
    });

    const top = $('.to-top');
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { top.hidden = scrollY < 900; ticking = false; });
    }, { passive: true });
    top.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeLb(); setDrawer(false); }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (!typing && (e.key === '/' || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)))) {
        e.preventDefault(); $('#q').focus(); $('#q').select();
      }
    });
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(markScrollers, 200); });
  }

  // ---------- routing ----------
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const i = h.indexOf('#');
    const path = i >= 0 ? h.slice(0, i) : h;
    let anchor = i >= 0 ? h.slice(i + 1) : '';
    try { anchor = decodeURIComponent(anchor); } catch {}
    let p = path;
    try { p = decodeURIComponent(path); } catch {}
    return { raw: path, path: p, anchor };
  }

  const scrollMemo = new Map();
  let lastKey = null;
  window.addEventListener('scroll', () => { if (lastKey) scrollMemo.set(lastKey, scrollY); }, { passive: true });

  async function route() {
    const { raw, path, anchor } = parseHash();
    S.closeDrawer?.();
    closeResults();
    lastKey = null;
    const key = location.hash;
    const restore = () => { const y = scrollMemo.get(key); scrollTo(0, y || 0); lastKey = key; };

    if (!path) return view(home, '', 'PD2 Wiki').then(restore);
    if (path === MERC_ROUTE) return view(mercView, MERC_ROUTE, 'Act 2 Merc Weapon Compare · PD2 Wiki');
    if (path === 'changes') return view(changesView, 'changes', 'Recent Changes · PD2 Wiki');
    if (path === 'all-pages') return view(allPagesView, 'all-pages', 'All Pages · PD2 Wiki');
    if (path.startsWith('search/')) return view(() => searchView(path.slice(7)), null, 'Search · PD2 Wiki');
    if (path === 'items' || path.startsWith('items?')) {
      const qs = raw.split('?')[1] || '';
      return view(() => window.PD2Items.list(main, qs), 'items' + (qs ? '?' + qs.split('&')[0] : ''), 'Items · PD2 Wiki').then(restore);
    }
    if (path.startsWith('item/')) {
      const it = path.slice(5);
      return view(() => window.PD2Items.detail(main, it), 'items', 'Item · PD2 Wiki').then(() => { markItemSide(); scrollTo(0, 0); });
    }
    if (path === 'maps' || path.startsWith('maps?') || path.startsWith('maps/')) {
      const [p0, qs = ''] = raw.split('?');
      const tab = p0.split('/')[1] || '';
      return view(() => window.PD2Maps.list(main, qs, tab), tab ? 'maps/' + tab : 'maps', 'Maps · PD2 Wiki').then(restore);
    }
    if (path === 'cube' || path.startsWith('cube?') || path.startsWith('cube/')) {
      const [p0, qs = ''] = raw.split('?');
      const tab = p0.split('/')[1] || '';
      return view(() => window.PD2Cube.render(main, tab, qs), tab ? 'cube/' + tab : 'cube', 'Crafting & Cube · PD2 Wiki').then(() => {
        if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
        else restore();
      });
    }
    if (path === 'zones' || path.startsWith('zones?')) {
      const qs = raw.split('?')[1] || '';
      return view(() => window.PD2World.zones(main, qs), 'zones', 'Zones · PD2 Wiki').then(restore);
    }
    if (path === 'monsters') return view(() => window.PD2World.monsters(main, anchor), 'monsters', 'Monsters · PD2 Wiki', !!anchor);
    if (path === 'mechanics' || path.startsWith('mechanics/')) {
      let t = path.slice(10);
      return view(() => window.PD2Mech.render(main, t, anchor), 'mechanics' + (t ? '/' + t : ''), 'Game Mechanics · PD2 Wiki', !!anchor);
    }
    if (path === 'affixes' || path.startsWith('affixes?') || path.startsWith('affixes/')) {
      const [p0, qs = ''] = raw.split('?');
      const tab = p0.split('/')[1] || '';
      return view(() => window.PD2Affixes.render(main, tab, qs), 'affixes', 'Item Affixes · PD2 Wiki').then(() => {
        if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
      });
    }
    if (path === 'bases' || path.startsWith('bases?') || path.startsWith('bases/')) {
      const [p0, qs = ''] = raw.split('?');
      const tab = p0.split('/')[1] || '';
      return view(() => window.PD2Gear.bases(main, tab, qs), 'bases', 'Item Bases · PD2 Wiki').then(() => {
        if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
        else restore();
      });
    }
    if (path === 'runes' || path.startsWith('runes/')) {
      const tab = path.split('/')[1] || '';
      return view(() => window.PD2Gear.runes(main, tab), 'runes', 'Runes & Gems · PD2 Wiki').then(() => {
        if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
      });
    }
    if (path === 'mercs' || path.startsWith('mercs/')) {
      const k = path.split('/')[1] || '';
      return view(() => window.PD2Gear.mercs(main, k, anchor), 'mercs', 'Mercenaries · PD2 Wiki', !!anchor);
    }
    if (path === 'filters' || path.startsWith('filters/') || path.startsWith('filters?')) {
      const [p0, qs = ''] = raw.split('?');
      const seg = decodeURIComponent(p0.split('/')[1] || '');
      const tab = ['codes', 'list', 'setup'].includes(seg) ? seg : '';
      return view(() => window.PD2Filters.render(main, tab, tab ? '' : seg, qs, anchor), tab ? 'filters/' + tab : 'filters', 'Loot Filters · PD2 Wiki', !!anchor);
    }
    if (path === 'overview' || path.startsWith('overview?') || path.startsWith('overview/')) {
      const [p0, qs = ''] = raw.split('?');
      const tab = p0.split('/')[1] || '';
      return view(() => window.PD2Overview.render(main, tab, qs), 'overview', 'What PD2 Changed · PD2 Wiki');
    }
    if (path === 'about' || path.startsWith('about/')) {
      const tab = path.split('/')[1] || '';
      return view(() => window.PD2About.render(main, tab, anchor), tab ? 'about/' + tab : 'about', 'About PD2 · PD2 Wiki', !!anchor);
    }
    if (path === 'pvp' || path.startsWith('pvp/')) {
      const tab = raw.split('#')[0].replace(/^\/?pvp\/?/, '');
      return view(() => window.PD2Pvp.render(main, tab, anchor), 'pvp' + (tab ? '/' + tab.split('?')[0] : ''), 'PvP & Dueling · PD2 Wiki', !!anchor);
    }
    if (path === 'glossary' || path.startsWith('glossary?')) return view(() => window.PD2Pvp.glossary(main, raw.split('?')[1] || ''), 'glossary', 'Abbreviations · PD2 Wiki');
    if (path === 'new') return view(() => window.PD2Extras.newItems(main, anchor), 'new', 'New in PD2 · PD2 Wiki', !!anchor);
    if (path === 'cosmetics') return view(() => window.PD2Extras.cosmetics(main, anchor), 'cosmetics', 'Cosmetics · PD2 Wiki', !!anchor);
    if (path === 'classes' || path.startsWith('classes?')) {
      return view(() => window.PD2Classes.render(main, raw.split('?')[1] || ''), 'classes', 'Stat Planner · PD2 Wiki');
    }
    if (path === 'help' || path.startsWith('help?')) {
      const qs = raw.split('?')[1] || '';
      return view(() => window.PD2Guide.help(main, qs, anchor), 'help', 'Help Center · PD2 Wiki', !!anchor);
    }
    if (path === 'guides' || path.startsWith('guides?') || path.startsWith('guides/')) {
      const [p0, qs = ''] = raw.split('?');
      const tab = p0.split('/')[1] || '';
      return view(() => window.PD2Guide.guides(main, tab, qs), tab ? 'guides/' + tab : 'guides' + (qs.includes('starter=1') ? '?starter=1' : ''), 'Guides & Builds · PD2 Wiki').then(restore);
    }
    if (path === 'breakpoints' || path.startsWith('breakpoints/')) {
      return view(() => window.PD2Guide.breakpoints(main, path.split('/')[1] || ''), 'breakpoints', 'Breakpoints · PD2 Wiki');
    }
    if (path.startsWith('map/')) return view(() => window.PD2Maps.detail(main, path.slice(4)), 'maps', 'Map · PD2 Wiki');
    if (path === 'patches' || path.startsWith('patches/')) {
      const k = path.split('/')[1] || '';
      return view(() => window.PD2Patches.render(main, k, anchor), 'patches/' + (k || (S.index.seasons || []).find(x => x.key !== 'upcoming' && x.iso <= new Date().toISOString().slice(0, 10))?.key || ''), 'Patch Notes · PD2 Wiki', !!anchor);
    }
    if (path === 'skills' || path.startsWith('skills/')) {
      const [, cls, id] = path.split('/');
      return view(() => window.PD2Skills.render(main, cls || 'Amazon', id ? id : ''), 'skills/' + (cls || 'Amazon'), 'Skills · PD2 Wiki', !!id);
    }

    const r = resolve(path);
    if (!r) return view(() => notFound(path), null, 'Not found · PD2 Wiki');
    const want = anchor || r.frag;
    // Old wiki links into item lists and skill pages go to our own views.
    const tg = S.index.targets?.[`${r.page.id}#${want || ''}`];
    if (tg) { history.replaceState(null, '', '#/' + tg); return route(); }
    if (norm(r.page.title) !== norm(path)) history.replaceState(null, '', pageHref(r.page.title, want));
    if (S.current === r.page.id && $('.wiki', main)) { scrollToAnchor(want, true); return; }
    await showPage(r.page, want);
  }

  function markItemSide() {
    const it = window.PD2Items.data?.items && location.hash.slice(8);
    const item = it && window.PD2Items.data.items.find(x => x.slug === it);
    if (item) markSidebar(`items?t=${item.kind}`);
  }

  async function view(fn, sideKey, title, keepScroll) {
    S.current = null;
    S.spy?.disconnect();
    tocRail.innerHTML = '';
    setToc(false);
    document.title = title;
    if (!keepScroll) scrollTo(0, 0);
    await fn();
    markSidebar(sideKey);
  }

  // Re-run the current route without resetting scroll (used by live filters).
  const rerender = () => route();

  // ---------- page ----------
  async function getHtml(id) {
    if (S.html.has(id)) return S.html.get(id);
    // Each page's revision is in the index, so a cached copy is only reused while it's current.
    const rev = S.byId.get(id)?.rev;
    const res = await fetch(`data/pages/${id}.html${rev ? `?r=${rev}` : ''}`, { cache: rev ? 'default' : 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} loading page ${id}`);
    const html = await res.text();
    S.html.set(id, html);
    return html;
  }

  async function showPage(p, anchor) {
    S.current = p.id;
    S.spy?.disconnect();
    tocRail.innerHTML = '';
    setToc(false);
    document.title = `${displayName(p)} · PD2 Wiki`;
    markSidebar(p.id);
    main.innerHTML = '<div class="loading">Loading…</div>';
    let html;
    try { html = await getHtml(p.id); }
    catch (e) { main.innerHTML = `<div class="error"><b>Couldn't load this page.</b><br>${esc(e.message)}</div>`; return; }
    if (S.current !== p.id) return;

    const group = S.groupOf.get(p.id);
    const merc = MERC_PAGES.has(p.title) ? `
      <a class="callout" href="#/${MERC_ROUTE}">${ICONS.merc}
        <span><b>Act 2 Merc Weapon Compare</b><span>Pick your merc's IAS and see which polearm or spear deals the most damage at that breakpoint.</span></span></a>` : '';
    main.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a>${group ? `<span aria-hidden="true">›</span><span>${esc(group)}</span>` : ''}</nav>
      <h1 class="page-title">${esc(displayName(p))}</h1>
      <div class="page-meta">
        ${p.edited ? `<span title="${esc(new Date(p.edited).toLocaleString())}">Updated ${esc(ago(p.edited))}</span>` : ''}
        <button class="btn expand-all" type="button" hidden>Expand all</button>
      </div>
      ${merc}
      <details class="toc-inline" hidden><summary>On this page</summary><div class="toc"></div></details>
      <article class="wiki"></article>
      <p class="attrib">From <a href="${wikiUrl(p.title)}" target="_blank" rel="noopener">${esc(p.title)}</a> on the Project Diablo 2 Wiki,
        written by <a href="${WIKI}/w/index.php?title=${encTitle(p.title)}&action=history" target="_blank" rel="noopener">its contributors</a>
        and shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Re-synced daily; to fix something, edit the wiki itself.</p>`;
    const art = $('.wiki', main);
    art.innerHTML = html;
    enhance(art, p);
    await window.PD2Items.transformPage(art, p);
    window.PD2Guide.guideHeader(p).then(h => { if (h && S.current === p.id) $('.page-meta', main)?.insertAdjacentHTML('afterend', h); });
    if (S.current !== p.id) return;
    buildToc(art, p);
    requestAnimationFrame(markScrollers);

    const hl = sessionStorage.getItem('pd2wiki-hl');
    sessionStorage.removeItem('pd2wiki-hl');
    if (hl) highlight(art, hl, anchor);
    else if (anchor) scrollToAnchor(anchor, false);
    else scrollTo(0, 0);
  }

  function findAnchor(anchor) {
    if (!anchor) return null;
    const tries = [anchor, anchor.replace(/ /g, '_')];
    try { tries.push(decodeURIComponent(anchor)); } catch {}
    for (const t of tries) { const el = document.getElementById(t); if (el && main.contains(el)) return el; }
    return null;
  }

  function scrollToAnchor(anchor, smooth) {
    const el = findAnchor(anchor);
    if (!el) { if (!anchor) scrollTo(0, 0); return; }
    for (let c = el.closest('.is-collapsed'); c; c = c.parentElement?.closest('.is-collapsed')) setCollapsed(c, false);
    el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  }

  function notFound(path) {
    main.innerHTML = `<div class="error"><b>No page called “${esc(path)}” here.</b><br><br>
      <a href="${wikiUrl(path)}" target="_blank" rel="noopener">Try it on the PD2 Wiki</a> · <a href="#/search/${encodeURIComponent(path)}">Search for it</a></div>`;
  }

  // Inline styles from the wiki carry its own palette (tan text, brown panels). Keep
  // layout-ish declarations and genuinely meaningful text colours, drop the rest.
  const WIKI_CHROME = /^(#f9c666|#edcf8b|#b18d62|#ccc|#cccccc|#666|#666666|#7c502e|#1f160c|#382b1b|#271c12|#150d0a|#2c2014)$/i;
  const KEEP_STYLE = /^(text-align|white-space|vertical-align|width|min-width|max-width|font-weight|font-style|text-decoration|display|float|clear)$/i;
  function cleanStyle(el) {
    const decls = el.getAttribute('style').split(';').map(d => d.trim()).filter(Boolean);
    const keep = decls.filter(d => {
      const [k, ...v] = d.split(':');
      const key = k.trim().toLowerCase(), val = v.join(':').trim();
      if (key === 'color') return !WIKI_CHROME.test(val);
      if (key === 'display') return /none|inline/.test(val) && !/flex/.test(val);
      return KEEP_STYLE.test(key);
    });
    if (keep.length) el.setAttribute('style', keep.join(';')); else el.removeAttribute('style');
  }

  // Rewrites wiki HTML (a page, or a fragment such as an item's notes) for this reader.
  function enhanceFragment(root, p) {
    for (const el of $$('script,style,iframe,object,embed,link,meta', root)) el.remove();
    for (const el of $$('[style]', root)) cleanStyle(el);

    for (const a of $$('a', root)) {
      const href = a.getAttribute('href');
      if (!href) continue;
      if (/^\s*javascript:/i.test(href)) { a.removeAttribute('href'); continue; }
      if (a.classList.contains('new')) {
        const s = document.createElement('span'); s.className = 'dead-link'; s.innerHTML = a.innerHTML; a.replaceWith(s); continue;
      }
      if (a.classList.contains('img-link') || a.getAttribute('href').startsWith('#/')) continue;
      let path = null, frag = '';
      if (href.startsWith('/wiki/')) path = href.slice(6);
      else if (/^(https?:)?\/\/wiki\.projectdiablo2\.com\/wiki\//.test(href)) path = href.replace(/^(https?:)?\/\/wiki\.projectdiablo2\.com\/wiki\//, '');
      if (path !== null) {
        const i = path.indexOf('#');
        if (i >= 0) { frag = path.slice(i + 1); path = path.slice(0, i); }
        let title = path;
        try { title = decodeURIComponent(path); } catch {}
        try { frag = decodeURIComponent(frag); } catch {}
        title = norm(title);
        if (/^(File|Image|Media):/i.test(title)) {
          const img = $('img', a);
          if (img) { a.href = fullImage(img); a.classList.add('img-link'); a.removeAttribute('title'); }
          else external(a, WIKI + '/wiki/' + path);
          continue;
        }
        const r = resolve(title);
        if (r) { a.setAttribute('href', hrefFor(r.page, frag || r.frag)); a.removeAttribute('title'); }
        else external(a, WIKI + '/wiki/' + path + (frag ? '#' + encodeURIComponent(frag) : ''));
      } else if (href.startsWith('#')) {
        let f = href.slice(1);
        try { f = decodeURIComponent(f); } catch {}
        if (p) a.setAttribute('href', hrefFor(p, f));
      } else if (href.startsWith('/')) {
        external(a, (href.startsWith('//') ? 'https:' : WIKI) + href);
      } else if (/^https?:/i.test(href)) {
        external(a, href);
      }
    }

    for (const img of $$('img', root)) {
      const src = img.getAttribute('src');
      if (src?.startsWith('//')) img.setAttribute('src', 'https:' + src);
      else if (src?.startsWith('/')) img.setAttribute('src', WIKI + src);
      const ss = img.getAttribute('srcset');
      if (ss) img.setAttribute('srcset', ss.replace(/(^|,\s*)\/\//g, '$1https://'));
      img.loading = 'lazy';
      img.decoding = 'async';
    }

    for (const c of $$('.mw-collapsible', root)) {
      if (c.dataset.coll) continue;
      c.dataset.coll = '1';
      let btn;
      if (c.tagName === 'TABLE') {
        let cap = $(':scope > caption', c);
        if (!cap) { cap = document.createElement('caption'); cap.textContent = 'Details'; c.prepend(cap); }
        btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'coll-toggle';
        while (cap.firstChild) btn.appendChild(cap.firstChild);
        cap.appendChild(btn);
      } else {
        btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'coll-toggle';
        btn.textContent = c.dataset.expandtext || 'Show more';
        c.prepend(btn);
      }
      btn.addEventListener('click', () => setCollapsed(c, !c.classList.contains('is-collapsed')));
      setCollapsed(c, c.classList.contains('mw-collapsed'));
    }
    for (const b of $$('.expand-or-collapse-all-button', root)) (b.closest('p') || b).remove();

    for (const t of $$('table', root)) {
      if (t.closest('td,th')) continue;
      if (!t.parentElement.classList.contains('tw')) {
        const w = document.createElement('div'); w.className = 'tw';
        t.before(w); w.appendChild(t);
      }
      if (t.classList.contains('mw-collapsible')) continue;
      const info = tableShape(t);
      if (!info) continue;
      if (info.body.length >= 6 && !/wikitable-[12]col/.test(t.className)) makeSortable(t, info);
      if (info.body.length >= 15) addFilter(t, info);
    }
  }

  function enhance(root, p) {
    enhanceFragment(root, p);
    for (const h of $$('.mw-heading > h1, .mw-heading > h2, .mw-heading > h3, .mw-heading > h4, .mw-heading > h5, .mw-heading > h6', root)) {
      if (!h.id) continue;
      const l = document.createElement('a');
      l.className = 'hlink'; l.href = pageHref(p.title, h.id); l.textContent = '#';
      l.setAttribute('aria-label', 'Link to this section');
      h.parentElement.prepend(l);
    }
    const colls = $$('.mw-collapsible', root);
    const expandAll = $('.expand-all', main);
    if (expandAll && colls.length > 1) {
      expandAll.hidden = false;
      const sync = () => { expandAll.textContent = colls.some(c => c.classList.contains('is-collapsed')) ? 'Expand all' : 'Collapse all'; };
      expandAll.onclick = () => { const collapse = !colls.some(c => c.classList.contains('is-collapsed')); colls.forEach(c => setCollapsed(c, collapse)); sync(); };
      root.addEventListener('click', e => { if (e.target.closest('.coll-toggle')) setTimeout(sync); });
      sync();
    }
  }

  function external(a, url) {
    a.setAttribute('href', url);
    a.target = '_blank';
    a.rel = 'noopener';
    if (!$('img', a)) a.classList.add('ext');
  }

  function fullImage(img) {
    const ss = img.getAttribute('srcset');
    if (ss) {
      const last = ss.split(',').pop().trim().split(/\s+/)[0];
      if (last) return last.replace(/^\/\//, 'https://');
    }
    const src = (img.getAttribute('src') || '').replace(/^\/\//, 'https://');
    return src.replace(/\/thumb(\/[^/]+\/[^/]+\/[^/]+)\/[^/]+$/, '$1');
  }

  function setCollapsed(c, collapsed) {
    c.classList.toggle('is-collapsed', collapsed);
    const b = $(':scope > .coll-toggle, :scope > caption > .coll-toggle', c);
    if (b) b.setAttribute('aria-expanded', String(!collapsed));
  }

  function markScrollers() {
    for (const w of $$('.tw', main)) w.classList.toggle('can-scroll', w.scrollWidth > w.clientWidth + 2);
  }

  function tableShape(t) {
    const rows = Array.from(t.rows);
    if (rows.length < 3) return null;
    const cells = Array.from(rows[0].cells);
    if (!cells.length || cells.some(c => c.tagName !== 'TH' || c.colSpan > 1 || c.rowSpan > 1)) return null;
    const body = rows.slice(1);
    const n = cells.length;
    for (const r of body) {
      if (r.cells.length !== n || r.classList.contains('mid-row')) return null;
      for (const c of r.cells) if (c.colSpan > 1 || c.rowSpan > 1) return null;
    }
    if (body.some(r => Array.from(r.cells).every(c => c.tagName === 'TH'))) return null;
    return { head: cells, body };
  }

  function sortKey(cell) {
    const txt = cell.textContent.replace(/\s+/g, ' ').trim();
    const m = txt.replace(/,/g, '').match(/^[+\-]?\d+(\.\d+)?/);
    return { txt: txt.toLowerCase(), num: m ? parseFloat(m[0]) : null };
  }

  function makeSortable(t, info) {
    info.head.forEach((th, col) => {
      if (th.classList.contains('unsortable')) return;
      th.classList.add('sortable-th');
      th.tabIndex = 0;
      th.setAttribute('aria-sort', 'none');
      const sort = () => {
        const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        info.head.forEach(h => h.hasAttribute('aria-sort') && h.setAttribute('aria-sort', 'none'));
        th.setAttribute('aria-sort', dir);
        const keyed = info.body.map((r, i) => ({ r, i, k: sortKey(r.cells[col]) }));
        const allNum = keyed.every(x => x.k.num !== null || x.k.txt === '');
        const mul = dir === 'ascending' ? 1 : -1;
        keyed.sort((a, b) => (allNum ? (a.k.num ?? -Infinity) - (b.k.num ?? -Infinity) : a.k.txt.localeCompare(b.k.txt, undefined, { numeric: true })) * mul || a.i - b.i);
        const parent = info.body[0].parentElement;
        for (const x of keyed) parent.appendChild(x.r);
        info.body = keyed.map(x => x.r);
      };
      th.addEventListener('click', sort);
      th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); } });
    });
  }

  function addFilter(t, info) {
    const box = document.createElement('label');
    box.className = 'tfilter';
    box.innerHTML = `<input type="search" placeholder="Filter ${info.body.length} rows" aria-label="Filter table rows"><span></span>`;
    t.parentElement.before(box);
    const input = $('input', box), count = $('span', box);
    const texts = new Map(info.body.map(r => [r, r.textContent.toLowerCase()]));
    input.addEventListener('input', () => {
      const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const r of info.body) { const ok = terms.every(q => texts.get(r).includes(q)); r.hidden = !ok; shown += ok; }
      count.textContent = terms.length ? `${shown} of ${info.body.length}` : '';
      requestAnimationFrame(markScrollers);
    });
  }

  // ---------- table of contents ----------
  const setToc = on => { $('.layout').classList.toggle('no-toc', !on); tocRail.hidden = !on; };

  function buildToc(art, p) {
    const hs = $$('.mw-heading > h1, .mw-heading > h2, .mw-heading > h3, .mw-heading > h4', art).filter(h => h.id);
    const inline = $('.toc-inline', main);
    if (hs.length < 3) return;
    const levels = [...new Set(hs.map(h => +h.tagName[1]))].sort();
    let use = levels.slice(0, 2);
    if (hs.filter(h => use.includes(+h.tagName[1])).length > 160) use = levels.slice(0, 1);
    const items = hs.filter(h => use.includes(+h.tagName[1]));
    if (items.length < 3) return;
    const list = items.map(h => `<li><a class="l${use.indexOf(+h.tagName[1]) + 1}" href="${pageHref(p.title, h.id)}" data-a="${esc(h.id)}">${esc(h.textContent.trim())}</a></li>`).join('');
    const filter = items.length > 25 ? `<input class="toc-filter" type="search" placeholder="Filter ${items.length} sections" aria-label="Filter sections">` : '';
    tocRail.innerHTML = `<p class="toc-title">On this page</p>${filter}<nav class="toc"><ol>${list}</ol></nav>`;
    setToc(true);
    inline.hidden = false;
    $('.toc', inline).innerHTML = `${filter}<ol>${list}</ol>`;
    for (const f of [$('.toc-filter', tocRail), $('.toc-filter', inline)].filter(Boolean)) {
      f.addEventListener('input', () => {
        const q = f.value.trim().toLowerCase();
        for (const li of $$('li', f.parentElement)) li.hidden = q && !li.textContent.toLowerCase().includes(q);
      });
    }
    inline.addEventListener('click', e => { if (e.target.closest('a')) inline.open = false; });

    const links = new Map($$('a', tocRail).map(a => [a.dataset.a, a]));
    let active = null;
    const setActive = id => {
      if (active === id) return;
      active = id;
      for (const a of links.values()) a.classList.remove('on');
      const a = links.get(id);
      if (!a) return;
      a.classList.add('on');
      const r = a.getBoundingClientRect(), rr = tocRail.getBoundingClientRect();
      if (tocRail.offsetParent && (r.top < rr.top + 40 || r.bottom > rr.bottom - 20)) tocRail.scrollTop += r.top - rr.top - rr.height / 3;
    };
    const visible = new Set();
    S.spy = new IntersectionObserver(entries => {
      for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
      const first = items.find(h => visible.has(h));
      if (first) setActive(first.id);
      else { const above = items.filter(h => h.getBoundingClientRect().top < 100).pop(); if (above) setActive(above.id); }
    }, { rootMargin: '-60px 0px -65% 0px' });
    items.forEach(h => S.spy.observe(h));
  }

  // ---------- search ----------
  function loadSearch() {
    window.PD2Items.load().catch(() => {});
    window.PD2Maps.load().catch(() => {});
    window.PD2Cube.load().catch(() => {});
    window.PD2World.load().catch(() => {});
    window.PD2Gear.load().catch(() => {});
    window.PD2Guide.load().catch(() => {});
    window.PD2Filters.load().catch(() => {});
    if (S.search) return Promise.resolve(S.search);
    if (!S.searchLoading) {
      S.searchLoading = fetchJSON('data/search.json').then(list => {
        const out = [];
        const tg = S.index.targets || {};
        for (const e of list) {
          const p = S.byId.get(e.id);
          if (!p) continue;
          for (const [anchor, heading, text] of e.s) {
            // Items and skills have their own results; skip their raw wiki sections.
            if (tg[`${p.id}#${anchor}`] && anchor) continue;
            out.push({ p, anchor, heading, text, hl: heading.toLowerCase(), tl: text.toLowerCase() });
          }
        }
        S.search = out;
        return out;
      }).catch(err => { S.searchLoading = null; console.warn('Full-text search failed to load:', err); throw err; });
    }
    return S.searchLoading;
  }

  const terms = q => q.toLowerCase().replace(/[’‘]/g, "'").split(/\s+/).filter(Boolean);

  function scoreText(text, q, ts) {
    const t = text.toLowerCase().replace(/[’‘]/g, "'");
    if (t === q) return 100;
    if (t.startsWith(q)) return 85 - Math.min(20, t.length - q.length) / 2;
    const i = t.indexOf(q);
    if (i > 0 && /[\s(:/\-]/.test(t[i - 1])) return 70;
    if (i >= 0) return 55;
    if (ts.every(w => t.includes(w))) return 40;
    return 0;
  }

  function searchAll(qRaw, limits) {
    const q = qRaw.toLowerCase().replace(/[’‘]/g, "'").trim();
    const ts = terms(q);
    const pages = [];
    for (const p of S.index.pages) {
      if (/\/[a-z]{2}(-[a-z]+)?$/.test(p.title)) continue;
      const s = scoreText(displayName(p), q, ts);
      if (s) pages.push({ p, s: s + (COVERED.test(p.title) ? -15 : 0) });
    }
    pages.sort((a, b) => b.s - a.s);
    const heads = [], hits = [];
    if (S.search) {
      for (const e of S.search) {
        if (e.heading) {
          const s = scoreText(e.heading, q, ts);
          if (s >= 55) { heads.push({ e, s }); continue; }
        }
        if (hits.length < 400 && ts.every(w => e.tl.includes(w) || e.hl.includes(w))) {
          let n = 0, i = -1;
          while ((i = e.tl.indexOf(ts[0], i + 1)) >= 0 && n < 20) n++;
          hits.push({ e, s: n + (e.tl.includes(q) ? 20 : 0) });
        }
      }
      heads.sort((a, b) => b.s - a.s || a.e.heading.length - b.e.heading.length);
      hits.sort((a, b) => b.s - a.s);
    }
    return {
      items: window.PD2Items.searchItems(q, limits.items),
      skills: window.PD2Skills.search(q, limits.skills),
      pages: pages.slice(0, limits.pages), heads: heads.slice(0, limits.heads), hits: hits.slice(0, limits.hits),
    };
  }

  function snippet(text, q, width = 150) {
    const ts = terms(q);
    const lower = text.toLowerCase();
    let at = lower.indexOf(q.toLowerCase());
    if (at < 0) at = Math.max(0, ...ts.map(t => lower.indexOf(t)).filter(i => i >= 0).slice(0, 1));
    const start = Math.max(0, at - Math.floor(width / 3));
    let s = esc((start > 0 ? '…' : '') + text.slice(start, start + width) + (start + width < text.length ? '…' : ''));
    for (const t of ts.sort((a, b) => b.length - a.length)) {
      s = s.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;')})`, 'gi'), '<mark>$1</mark>');
    }
    return s;
  }

  const hlAttr = q => ` data-hl="${esc(q)}"`;
  const itemRes = (it, q) => `<a class="res" role="option" href="#/item/${it.slug}"><span class="res-ico ${window.PD2Items.kindOf(it).cls}">${it.img ? `<img src="${esc(it.img)}" alt="">` : ICONS.rune}</span><span><b class="${window.PD2Items.kindOf(it).cls}">${esc(it.name)}</b><span class="crumb">${esc(window.PD2Items.kindOf(it).one)} · ${esc(window.PD2Items.subtitle(it))}${it.lvl ? ` · lvl ${it.lvl}` : ''}</span></span></a>`;
  const skillRes = s => `<a class="res" role="option" href="#/skills/${s.c}/${encodeURIComponent(s.a)}"><span class="res-ico">${s.i ? `<img src="${esc(s.i)}" alt="">` : ICONS.skills}</span><span><b>${esc(s.n)}</b><span class="crumb">${esc(s.c)} · ${esc(s.t)} · lvl ${s.l || 1}</span></span></a>`;

  function setupSearch() {
    const input = $('#q'), box = $('#q-results');
    let sel = -1, timer;
    const narrow = matchMedia('(max-width: 520px)');
    const setPh = () => { input.placeholder = narrow.matches ? 'Search the wiki' : 'Search items, skills, runewords, pages…'; };
    setPh(); narrow.addEventListener?.('change', setPh);

    const render = () => {
      const q = input.value.trim();
      if (q.length < 2) { closeResults(); return; }
      if (!S.search || !window.PD2Items.data) {
        loadSearch().then(() => window.PD2Items.load()).then(() => { if (input.value.trim() === q) render(); }).catch(() => {});
      }
      const r = searchAll(q, { items: 6, skills: 4, pages: 4, heads: 4, hits: 4 });
      let html = '';
      // An exact rune name ("ber") goes straight to the rune.
      const exactRune = (window.PD2Gear.data?.runes.runes || []).find(x => x.name.toLowerCase() === q.toLowerCase());
      if (exactRune) html += `<div class="res-group">Rune</div><a class="res" role="option" href="#/runes#${exactRune.name.toLowerCase()}"><span class="res-ico">${exactRune.img ? `<img src="${esc(exactRune.img)}" alt="">` : ICONS.rune}</span><span><b>${esc(exactRune.name)} Rune</b><span class="crumb">#${exactRune.n} · level ${exactRune.lvl ?? '?'} · ${esc(exactRune.group)}</span></span></a>`;
      const statN = q.length >= 3 ? window.PD2Items.countMatches(q) : 0;
      if (r.items.length || statN) html += '<div class="res-group">Items</div>' + r.items.map(it => itemRes(it, q)).join('') +
        (statN > r.items.length ? `<a class="res" role="option" href="#/items?q=${encodeURIComponent(q)}"><span class="res-ico">${ICONS.items}</span><span><b>${statN} items with “${esc(q)}”</b><span class="crumb">Open in the item database</span></span></a>` : '');
      if (r.skills.length) html += '<div class="res-group">Skills</div>' + r.skills.map(skillRes).join('');
      const crafts = window.PD2Cube.search(q, 3);
      if (crafts.length) html += '<div class="res-group">Crafted items</div>' + crafts.map(c => `<a class="res" role="option" href="#/cube/crafting?type=${encodeURIComponent(c.type)}&slot=${encodeURIComponent(c.slot)}"><span class="res-ico">${c.img ? `<img src="${esc(c.img)}" alt="">` : ICONS.craft}</span><span><b>${esc(c.name)}</b><span class="crumb">${esc(c.recipe.join(' + '))}</span></span></a>`).join('');
      const gear = window.PD2Gear.search(q, 4).filter(g => !exactRune || g.r !== exactRune);
      if (gear.length) html += '<div class="res-group">Runes &amp; bases</div>' + gear.map(g => g.kind === 'rune'
        ? `<a class="res" role="option" href="#/runes#${g.r.name.toLowerCase()}"><span class="res-ico">${g.r.img ? `<img src="${esc(g.r.img)}" alt="">` : ICONS.rune}</span><span><b>${esc(g.r.name)} Rune</b><span class="crumb">#${g.r.n} · level ${g.r.lvl ?? '?'}</span></span></a>`
        : `<a class="res" role="option" href="#/bases?kind=${encodeURIComponent(g.b.kind)}&q=${encodeURIComponent(g.b.name)}"><span class="res-ico">${ICONS.items}</span><span><b>${esc(g.b.name)}</b><span class="crumb">${esc([g.b.tier, g.b.type].filter(Boolean).join(' ') || g.b.kind)} base</span></span></a>`).join('');
      const fcodes = window.PD2Filters.search(q, 3);
      if (fcodes.length) html += '<div class="res-group">Filter codes</div>' + fcodes.map(c => `<a class="res" role="option" href="#/filters/codes?q=${encodeURIComponent(q)}"><span class="res-ico">${ICONS.list}</span><span><b>${esc(c.codes.join(' / '))}</b><span class="crumb">${esc(c.sec)}${c.ctx ? ' · ' + esc(c.ctx) : ''}</span></span></a>`).join('');
      const helps = window.PD2Guide.search(q, 3);
      if (helps.length) html += '<div class="res-group">Help</div>' + helps.map(h => `<a class="res" role="option" href="#/help#${h.id}"><span class="res-ico">${ICONS.help}</span><span><b>${esc(h.q)}</b><span class="crumb">${esc(h.cat)}</span></span></a>`).join('');
      const world = window.PD2World.search(q, 4);
      if (world.length) html += '<div class="res-group">Monsters &amp; zones</div>' + world.map(w => w.kind === 'boss'
        ? `<a class="res" role="option" href="#/monsters#${w.b.slug}"><span class="res-ico">${ICONS.skull}</span><span><b>${esc(w.b.name)}</b><span class="crumb">${esc(w.b.group)}</span></span></a>`
        : `<a class="res" role="option" href="#/zones?q=${encodeURIComponent(w.z.name)}"><span class="res-ico">${ICONS.map}</span><span><b>${esc(w.z.name)}</b><span class="crumb">${w.z.act ? 'Act ' + w.z.act + ' · ' : ''}${w.z.lvl.h ? 'Hell level ' + w.z.lvl.h : 'Town'}</span></span></a>`).join('');
      const maps = window.PD2Maps.search(q, 3);
      if (maps.length) html += '<div class="res-group">Maps</div>' + maps.map(m => `<a class="res" role="option" href="#/map/${m.slug}"><span class="res-ico">${m.icon ? `<img src="${esc(m.icon)}" alt="">` : ICONS.map}</span><span><b>${esc(m.name)}</b><span class="crumb">${esc(m.tier)} map · ${m.monsters.length} monster types</span></span></a>`).join('');
      if (r.pages.length) html += '<div class="res-group">Pages</div>' + r.pages.map(({ p }) =>
        `<a class="res" role="option" href="${pageHref(p.title)}"${hlAttr(q)}><span><b>${esc(displayName(p))}</b><span class="crumb">${esc(S.groupOf.get(p.id) || '')}</span></span></a>`).join('');
      if (r.heads.length) html += '<div class="res-group">Sections</div>' + r.heads.map(({ e }) =>
        `<a class="res" role="option" href="${pageHref(e.p.title, e.anchor)}"${hlAttr(q)}><span><b>${esc(e.heading)}</b><span class="crumb">in ${esc(displayName(e.p))}</span></span></a>`).join('');
      if (r.hits.length) html += '<div class="res-group">Mentions</div>' + r.hits.map(({ e }) =>
        `<a class="res" role="option" href="${pageHref(e.p.title, e.anchor)}"${hlAttr(q)}><span><b>${esc(displayName(e.p))}${e.heading ? ` › ${esc(e.heading)}` : ''}</b><span class="snip">${snippet(e.text, q)}</span></span></a>`).join('');
      if (!S.search) html += '<div class="res-empty">Loading full-text search…</div>';
      else if (!html) html = `<div class="res-empty">Nothing found for “${esc(q)}”.</div>`;
      html += `<a class="res-all" href="#/search/${encodeURIComponent(q)}">All results for “${esc(q)}” →</a>`;
      box.innerHTML = html;
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      sel = -1;
    };

    input.addEventListener('focus', () => { loadSearch().catch(() => {}); if (input.value.trim().length >= 2) render(); });
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 90); });
    input.addEventListener('keydown', e => {
      const opts = $$('.res', box);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (box.hidden || !opts.length) return;
        e.preventDefault();
        sel = e.key === 'ArrowDown' ? (sel + 1) % opts.length : (sel <= 0 ? opts.length - 1 : sel - 1);
        opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === sel)));
        opts[sel].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const q = input.value.trim();
        if (sel >= 0 && opts[sel]) opts[sel].click();
        else if (opts[0] && !opts[0].closest('.res-all')) opts[0].click();
        else if (q) location.hash = '#/search/' + encodeURIComponent(q);
      } else if (e.key === 'Escape') { closeResults(); input.blur(); }
    });
    box.addEventListener('mousedown', e => e.preventDefault());
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-hl]');
      if (a) sessionStorage.setItem('pd2wiki-hl', a.dataset.hl);
      if (e.target.closest('#q-results a')) { input.blur(); input.value = ''; }
      if (!e.target.closest('.search')) closeResults();
    });
  }

  function closeResults() {
    const box = $('#q-results');
    if (!box) return;
    box.hidden = true;
    $('#q').setAttribute('aria-expanded', 'false');
  }

  function highlight(art, q, anchor) {
    const ts = terms(q).filter(t => t.length > 1);
    if (!ts.length) { scrollToAnchor(anchor); return; }
    const re = new RegExp(ts.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|'), 'gi');
    const walker = document.createTreeWalker(art, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement.closest('script,style,math,.hlink,.coll-toggle') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode() && nodes.length < 4000) { re.lastIndex = 0; if (re.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode); }
    const marks = [];
    for (const n of nodes) {
      if (marks.length > 300) break;
      const frag = document.createDocumentFragment();
      const text = n.nodeValue;
      let last = 0;
      for (const m of text.matchAll(re)) {
        frag.append(text.slice(last, m.index));
        const mk = document.createElement('mark'); mk.textContent = m[0]; frag.append(mk); marks.push(mk);
        last = m.index + m[0].length;
      }
      frag.append(text.slice(last));
      n.replaceWith(frag);
    }
    const start = findAnchor(anchor);
    const target = start ? marks.find(m => start.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING) : marks[0];
    if (target) {
      for (let c = target.closest('.is-collapsed'); c; c = c.parentElement?.closest('.is-collapsed')) setCollapsed(c, false);
      if (start) start.scrollIntoView({ block: 'start' });
      const r = target.getBoundingClientRect();
      if (!start || r.bottom > innerHeight - 40 || r.top < 60) target.scrollIntoView({ block: 'center' });
    } else scrollToAnchor(anchor);
  }

  async function searchView(raw) {
    let q = raw;
    try { q = decodeURIComponent(raw); } catch {}
    main.innerHTML = `<h1 class="page-title">Search</h1><div class="page-meta">Results for “${esc(q)}”</div><div class="loading">Searching…</div>`;
    try {
      await Promise.all([loadSearch(), window.PD2Items.load(), window.PD2Gear.load(), window.PD2Cube.load(), window.PD2World.load(), window.PD2Maps.load(), window.PD2Guide.load(), window.PD2Filters.load()].map(p => p.catch(() => {})));
    } catch {}
    const r = searchAll(q, { items: 60, skills: 30, pages: 30, heads: 60, hits: 120 });
    const statN = q.length >= 3 ? window.PD2Items.countMatches(q) : 0;
    const row = (href, title, crumb, extra = '', hc = '', hl = false) => `<li><a href="${href}"${hc ? ` data-hc="${esc(hc)}"` : ''}${hl ? hlAttr(q) : ''}><b>${title}</b></a>${crumb ? `<span class="crumb">${crumb}</span>` : ''}${extra}</li>`;
    const groups = [];
    const add = (id, label, n, body, exact = false) => { if (n) groups.push({ id, label, n, body, exact }); };
    const ql = q.toLowerCase();

    // Items by name, plus a way into every item whose stats mention the words.
    add('items', 'Items', r.items.length || statN, `${r.items.length ? `<div class="ilist">${r.items.map(it => window.PD2Items.row(it)).join('')}</div>` : ''}
      ${statN > r.items.length ? `<p class="smore"><a href="#/items?q=${encodeURIComponent(q)}">All ${statN} items with “${esc(q)}” in the item database →</a></p>` : ''}`, r.items.some(it => it.name.toLowerCase() === ql));
    add('skills', 'Skills', r.skills.length, `<ul class="sres2">${r.skills.map(x => row(`#/skills/${x.c}/${encodeURIComponent(x.a)}`, esc(x.n), `${esc(x.c)} · ${esc(x.t)} · level ${x.l || 1}`)).join('')}</ul>`, r.skills.some(x => x.n.toLowerCase() === ql));
    const gear = window.PD2Gear.search(q, 12);
    add('gear', 'Runes & bases', gear.length, `<ul class="sres2">${gear.map(g => g.kind === 'rune'
      ? row(`#/runes#${g.r.name.toLowerCase()}`, `${esc(g.r.name)} Rune`, `#${g.r.n} · level ${g.r.lvl ?? '?'}`, '', `rune:${g.r.name}`)
      : row(`#/bases?kind=${encodeURIComponent(g.b.kind)}&q=${encodeURIComponent(g.b.name)}`, esc(g.b.name), `${esc([g.b.tier, g.b.type].filter(Boolean).join(' ') || g.b.kind)} base`, '', `base:${g.b.slug}`)).join('')}</ul>`, gear.some(g => (g.r || g.b).name.toLowerCase() === ql));
    const crafts = window.PD2Cube.search(q, 12);
    add('crafts', 'Crafted items', crafts.length, `<ul class="sres2">${crafts.map(c => row(`#/cube/crafting?type=${encodeURIComponent(c.type)}&slot=${encodeURIComponent(c.slot)}`, esc(c.name), esc(c.recipe.join(' + ')), '', `craft:${c.slug}`)).join('')}</ul>`);
    const world = window.PD2World.search(q, 12);
    add('world', 'Monsters & zones', world.length, `<ul class="sres2">${world.map(w => w.kind === 'boss'
      ? row(`#/monsters#${w.b.slug}`, esc(w.b.name), esc(w.b.group), '', `boss:${w.b.slug}`)
      : row(`#/zones?q=${encodeURIComponent(w.z.name)}`, esc(w.z.name), `${w.z.act ? 'Act ' + w.z.act + ' · ' : ''}${w.z.lvl.h ? 'Hell level ' + w.z.lvl.h : 'Town'}`)).join('')}</ul>`);
    const maps = window.PD2Maps.search(q, 12);
    add('maps', 'Maps', maps.length, `<ul class="sres2">${maps.map(m => row(`#/map/${m.slug}`, esc(m.name), `${esc(m.tier)} map · ${m.monsters.length} monster types`)).join('')}</ul>`);
    const helps = window.PD2Guide.search(q, 12);
    add('help', 'Help', helps.length, `<ul class="sres2">${helps.map(h => row(`#/help#${h.id}`, esc(h.q), esc(h.cat), '', `faq:${h.id}`)).join('')}</ul>`);
    const fcodes = window.PD2Filters.search(q, 12);
    add('codes', 'Filter codes', fcodes.length, `<ul class="sres2">${fcodes.map(c => row(`#/filters/codes?q=${encodeURIComponent(q)}`, esc(c.codes.join(' / ')), esc(c.sec))).join('')}</ul>`);
    add('pages', 'Pages', r.pages.length, `<ul class="sres2">${r.pages.map(({ p }) => { const h = hrefFor(p); return row(h, esc(displayName(p)), esc(areaOf(h) || S.groupOf.get(p.id) || ''), p.intro ? `<p>${esc(p.intro.slice(0, 160))}${p.intro.length > 160 ? '…' : ''}</p>` : '', '', true); }).join('')}</ul>`);
    add('sections', 'Sections', r.heads.length, `<ul class="sres2">${r.heads.map(({ e }) => row(pageHref(e.p.title, e.anchor), esc(e.heading), 'in ' + esc(displayName(e.p)), `<p>${snippet(e.text, q, 180)}</p>`, '', true)).join('')}</ul>`);
    add('mentions', 'Mentions', r.hits.length, `<ul class="sres2 mentions">${r.hits.map(({ e }) => row(pageHref(e.p.title, e.anchor), esc(displayName(e.p)) + (e.heading ? ' › ' + esc(e.heading) : ''), '', `<p>${snippet(e.text, q, 200)}</p>`, '', true)).join('')}</ul>`);

    // Groups with an exact name match ("ber" → the Ber rune) come first.
    groups.sort((a, b) => b.exact - a.exact);
    const html = groups.length ? `<nav class="chips sjump" aria-label="Result types">${groups.map(g => `<a class="chip" href="#s-${g.id}" data-jump="${g.id}">${esc(g.label)} <i>${g.n}</i></a>`).join('')}</nav>
      ${groups.map(g => `<section class="sgroup" id="s-${g.id}"><h2 class="home-h">${esc(g.label)} <small>${g.n}</small></h2>${g.body}</section>`).join('')}`
      : `<div class="error"><b>Nothing found for “${esc(q)}”.</b><br>Try fewer words, or <a href="${WIKI}/w/index.php?search=${encodeURIComponent(q)}" target="_blank" rel="noopener">search the PD2 Wiki itself</a>.</div>`;
    main.innerHTML = `<h1 class="page-title">Search</h1><div class="page-meta">Results for “${esc(q)}” · hover a result for its details</div>${html}`;
    main.querySelector('.sjump')?.addEventListener('click', e => {
      const a = e.target.closest('[data-jump]');
      if (!a) return;
      e.preventDefault();
      document.getElementById('s-' + a.dataset.jump)?.scrollIntoView({ block: 'start' });
    });
  }

  // ---------- home & lists ----------
  async function lastCheck() {
    const KEY = 'pd2wiki-lastcheck';
    try {
      const c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (c && Date.now() - c.at < 10 * 60e3) return c.v;
    } catch {}
    try {
      const d = await fetchJSON(`https://api.github.com/repos/${REPO}/actions/workflows/wiki-sync.yml/runs?per_page=1&status=success`);
      const v = d.workflow_runs?.[0]?.updated_at || null;
      sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), v }));
      return v;
    } catch { return null; }
  }

  async function loadChanges() {
    if (!S.changes) S.changes = await fetchJSON('data/changes.json').catch(() => []);
    return S.changes;
  }

  async function home() {
    const pages = S.index.pages;
    const recent = pages.filter(p => p.edited && !/^Main Page/.test(p.title) && !/\/[a-z]{2}(-[a-z]+)?$/.test(p.title) && !/[^\x00-\x7F]/.test(p.title)).sort((a, b) => b.edited.localeCompare(a.edited)).slice(0, 6);
    const newest = pages.reduce((a, p) => (p.edited > a ? p.edited : a), '');
    const today = new Date().toISOString().slice(0, 10);
    const seasons = (S.index.seasons || []).filter(x => x.n && x.iso);
    const cur = seasons.filter(x => x.iso <= today).sort((a, b) => b.iso.localeCompare(a.iso))[0];
    const next = seasons.filter(x => x.iso > today).sort((a, b) => a.iso.localeCompare(b.iso))[0];
    const spoilers = (S.index.seasons || []).find(x => x.key === 'upcoming');
    const days = cur ? Math.round((new Date(today) - new Date(cur.iso)) / 864e5) : 0;
    const tool = (href, icon, label) => `<a class="qt" href="${href}">${ICONS[icon]}<span>${label}</span></a>`;
    const dir = S.sections.filter(sec => sec.name !== 'More Pages' && sec.name !== 'Patch Notes');

    main.innerHTML = `
      <section class="home-top">
        <div><h1 class="page-title">PD2 Wiki</h1>
          <p class="home-sub">Every item, skill and mechanic in Project Diablo 2. <span id="sync-pill">Synced daily${newest ? ` · last edit ${esc(ago(newest))}` : ''}</span></p></div>
        <div class="home-pop"><span>Popular</span>${[['#/item/enigma', 'Enigma'], ['#/item/harlequin-crest', 'Shako'], ['#/runes#ber', 'Ber', 'rune:Ber'], ['#/skills/Sorceress/Frozen_Orb', 'Frozen Orb'], ['#/items?t=runeword&sock=4', '4-socket runewords'], ['#/maps?tier=T3', 'Tier 3 maps']].map(([h, l, hc]) => `<a class="chip" href="${h}"${hc ? ` data-hc="${hc}"` : ''}>${esc(l)}</a>`).join('')}<span class="home-kbd">Press <kbd>/</kbd> to search</span></div>
      </section>

      <div class="home-row">
        ${cur ? `<a class="season-card" href="#/patches/${cur.key}">
          <span class="sc-k">Current season</span><b>Season ${cur.n} · ${esc(cur.name)}</b>
          <span class="sc-d">Day ${days} · started ${esc(fmtDate(cur.iso))}</span>
          <span class="sc-links"><span>Patch notes →</span></span></a>` : ''}
        ${next || spoilers ? `<a class="season-card soon" href="#/patches/${next ? next.key : 'upcoming'}">
          <span class="sc-k">Coming next</span><b>${next ? `Season ${next.n} · ${esc(next.name)}` : 'Next season'}</b>
          <span class="sc-d">${next ? `Starts ${esc(fmtDate(next.iso))}` : 'Dev streams & spoilers'}</span>
          <span class="sc-links"><span>What's changing →</span></span></a>` : ''}
        <div class="quick">
          ${tool('#/items?t=runeword', 'rune', 'Runeword finder')}
          ${tool('#/breakpoints', 'clock', 'Breakpoints')}
          ${tool('#/classes', 'skills', 'Stat planner')}
          ${tool('#/affixes', 'items', 'Affix finder')}
          ${tool('#/' + MERC_ROUTE, 'merc', 'Merc weapons')}
          ${tool('#/filters/codes', 'list', 'Filter codes')}
        </div>
      </div>

      <div class="dir">${dir.map(sec => `<section class="dir-sec">
        <h2>${ICONS[sec.icon] || ''}<span>${esc(sec.name)}</span></h2>
        ${sec.name === 'Classes & Skills' ? `<div class="dir-cls">${window.PD2Skills.CLASSES.map(c => `<a href="#/skills/${c}" title="${c} skills"><span class="cls-orb cls-${c.toLowerCase()}" aria-hidden="true">${c[0]}</span>${c}</a>`).join('')}</div>` : ''}
        <ul>${sec.links.filter(l => !(sec.name === 'Classes & Skills' && l.label === 'Skills')).map(l => `<li><a href="${l.href}">${esc(l.label)}</a></li>`).join('')}</ul></section>`).join('')}</div>

      <section class="home-recent"><h2 class="home-h">Recently updated</h2>
        <ul class="changes">${recent.map(p => { const h = hrefFor(p); return `<li><a href="${h}">${esc(displayName(p))}</a>${areaOf(h) ? `<span class="charea">${esc(areaOf(h))}</span>` : ''}<span>${esc(ago(p.edited))}</span></li>`; }).join('')}</ul>
        <a class="more-link" href="#/changes">All recent changes →</a></section>`;

    lastCheck().then(t => {
      const pill = $('#sync-pill');
      if (pill && t) pill.textContent = `Synced daily · last check ${ago(t)}`;
    });
  }

  // Where a page's link lands, as a short label ("Skills", "Patch notes").
  const AREA = { skills: 'Skills', item: 'Items', items: 'Items', patches: 'Patch notes', maps: 'Maps', map: 'Maps', cube: 'Crafting', zones: 'Zones', monsters: 'Monsters',
    mechanics: 'Mechanics', affixes: 'Affixes', bases: 'Item bases', runes: 'Runes', mercs: 'Mercenaries', filters: 'Loot filters', overview: 'What PD2 changed', about: 'About PD2',
    new: 'New in PD2', cosmetics: 'Cosmetics', classes: 'Stat planner', help: 'Help', guides: 'Guides', breakpoints: 'Breakpoints', pvp: 'PvP', glossary: 'Glossary' };
  const areaOf = href => href.startsWith('#/') ? AREA[href.slice(2).split(/[/?#]/)[0]] || '' : '';

  // One list, newest day first: every page edited on the wiki that day, where it lands here,
  // and the editor's summary from the sync log when there is one.
  async function changesView() {
    const log = await loadChanges();
    const summary = new Map(), added = new Set();
    for (const e of [...log].reverse()) {
      // "/* Section */ text" is how MediaWiki marks which section an edit touched.
      for (const u of e.updated || []) if (u.summary) summary.set(u.title, u.summary.replace(/\/\*\s*(.*?)\s*\*\/\s*/, (m, sec) => `edited ${sec}${m.trim() === u.summary.trim() ? '' : ': '}`).trim());
      for (const t of e.added || []) added.add(t);
    }
    const shown = p => p.edited && !/\/[a-z]{2}(-[a-z]+)?$/.test(p.title) && !/[^\x00-\x7F]/.test(p.title);
    const recent = [...S.index.pages].filter(shown).sort((a, b) => b.edited.localeCompare(a.edited)).slice(0, 80);
    const days = [];
    for (const p of recent) {
      const d = p.edited.slice(0, 10);
      if (days.at(-1)?.d !== d) days.push({ d, pages: [] });
      days.at(-1).pages.push(p);
    }
    const lastSync = log[0]?.date;
    const removed = log.flatMap(e => (e.removed || []).map(t => ({ t, d: e.date }))).slice(0, 10);
    const sheet = log.find(e => e.sheet);
    main.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a></nav>
      <h1 class="page-title">Recent Changes</h1>
      <p class="lead">Pages edited on the PD2 Wiki, newest first, and where each one lives here. This copy checks the wiki every 24 hours${lastSync ? `; the last change it picked up was ${esc(ago(lastSync))}` : ''}.
        <a href="${WIKI}/wiki/Special:RecentChanges" target="_blank" rel="noopener">The wiki's own change log ${ICONS.ext}</a></p>
      <div class="chlist">${days.map(day => `<section class="chday"><h2><time datetime="${day.d}">${esc(fmtDate(day.d))}</time><small>${day.pages.length} page${day.pages.length === 1 ? '' : 's'}</small></h2>
        <ul>${day.pages.map(p => {
          const href = hrefFor(p), area = areaOf(href);
          return `<li><a href="${href}">${esc(displayName(p))}</a>${added.has(p.title) ? '<em class="chnew">new</em>' : ''}${area ? `<span class="charea">${esc(area)}</span>` : ''}${summary.get(p.title) ? `<span class="chsum">${esc(summary.get(p.title))}</span>` : ''}</li>`;
        }).join('')}</ul></section>`).join('')}</div>
      ${removed.length || sheet ? `<details class="about"><summary>Removed pages and tool updates</summary><ul class="log">${removed.map(r => `<li><time>${esc(fmtDate(r.d))}</time> Removed from the wiki: ${esc(r.t)}</li>`).join('')}${sheet ? `<li><time>${esc(fmtDate(sheet.date))}</time> <a href="#/${MERC_ROUTE}">Merc weapon data</a> updated from the spreadsheet</li>` : ''}</ul></details>` : ''}`;
  }

  function allPagesView() {
    const pages = [...S.index.pages].sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { numeric: true }));
    const by = new Map();
    for (const p of pages) {
      const c = displayName(p)[0].toUpperCase();
      const k = /[A-Z]/.test(c) ? c : '#';
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(p);
    }
    main.innerHTML = `
      <h1 class="page-title">All Pages</h1>
      <div class="page-meta">All ${pages.length} pages from the PD2 Wiki, A–Z. Item and skill lists open in the item database and skill browser.</div>
      <div class="az">${[...by].map(([k, ps]) => `<h3>${esc(k)}</h3><ul>${ps.map(p => `<li><a href="${hrefFor(p)}">${esc(displayName(p))}</a></li>`).join('')}</ul>`).join('')}</div>`;
  }

  async function mercView() {
    main.innerHTML = '<div class="loading">Loading merc weapon data…</div>';
    if (!window.MercTool) { main.innerHTML = '<div class="error"><b>The merc tool failed to load.</b></div>'; return; }
    await window.MercTool.render(main, { fetchJSON, esc, pageHref, resolve });
  }

  window.PD2 = {
    S, $, $$, esc, fetchJSON, pageHref, wikiUrl, resolve, ICONS, fmtDate, ago, rerender,
    byId: id => S.byId.get(id), enhanceFragment,
  };
  document.addEventListener('DOMContentLoaded', boot);
})();
