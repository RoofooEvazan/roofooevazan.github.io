/* PD2 Wiki reader. Renders the pages that tools/wiki-sync/sync.mjs mirrors into data/.
 * Routes (all in the hash, so GitHub Pages needs no server config):
 *   #/                       home
 *   #/Page_Title#Section     a wiki page, optionally scrolled to a section
 *   #/search/<query>         full search results
 *   #/all-pages              every page A-Z
 *   #/changes                recent edits and the sync log
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
    byTitle: new Map(),     // normalized title -> page
    byId: new Map(),
    groupOf: new Map(),     // title -> sidebar group name
    groups: [],             // [{name, items:[{label, page, hash}]}]
    html: new Map(),        // page id -> html
    search: null,           // lazily loaded section index
    searchLoading: null,
    changes: null,
    current: null,          // page id on screen
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
  const displayName = p => p.nice || p.display.replace(/^Guide:/, '');

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

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} loading ${url}`);
    return res.json();
  }

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z"/></svg>',
    merc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M8 6l4-4 4 4M5 22h14M9 13h6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };

  // ---------- boot ----------
  async function boot() {
    try {
      S.index = await fetchJSON('data/index.json');
    } catch (e) {
      main.innerHTML = `<div class="error"><b>Couldn't load the wiki.</b><br>${esc(e.message)}</div>`;
      return;
    }
    for (const p of S.index.pages) { S.byTitle.set(norm(p.title), p); S.byId.set(p.id, p); }
    buildGroups();
    renderSidebar();
    setupSearch();
    setupChrome();
    window.addEventListener('hashchange', route);
    route();
  }

  // ---------- sidebar ----------
  function buildGroups() {
    const used = new Set();
    const groups = [];
    for (const g of S.index.nav) {
      const items = [];
      for (const it of g.items) {
        const r = resolve(it.title);
        if (!r) continue;
        items.push({ label: it.label, page: r.page, hash: it.hash || r.frag });
        used.add(r.page.id);
        // Code-like page names (RWChests) read better with the wiki menu's own wording.
        if (/^[A-Z]{2,}[a-z]/.test(r.page.title) && !r.page.nice) r.page.nice = `${g.title}: ${it.label}`;
      }
      if (items.length) groups.push({ name: g.title, items });
    }
    const rest = S.index.pages.filter(p => !used.has(p.id) && p.title !== 'Main Page');
    const pick = test => rest.filter(p => !p._g && test(p) && (p._g = true));
    const lang = pick(p => /\/[a-z]{2}(-[a-z]+)?$/.test(p.title) || /[^\x00-\x7F]/.test(p.title));
    const patch = pick(p => /^Patch:|Patch Notes|^Season \d+|Balance Changes/.test(p.title));
    const guides = pick(p => /^Guide:|guide|^Starter |^\w+Assassin$/i.test(p.title));
    const more = pick(() => true);
    const sortBy = arr => arr.sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { numeric: true }));
    const add = (name, arr) => arr.length && groups.push({ name, items: sortBy(arr).map(p => ({ label: displayName(p), page: p })) });
    add('Guides & Builds', guides);
    add('Patch Notes', patch);
    add('More Pages', more);
    add('Other Languages', lang);
    for (const p of S.index.pages) delete p._g;
    S.groups = groups;
    for (const g of groups) for (const it of g.items) if (!S.groupOf.has(it.page.id)) S.groupOf.set(it.page.id, g.name);
  }

  function renderSidebar() {
    const nav = $('#side-nav');
    const top = [
      ['#/', 'Home', ICONS.home, 'home'],
      ['#/' + MERC_ROUTE, 'Merc Weapon Compare', ICONS.merc, MERC_ROUTE],
      ['#/changes', 'Recent Changes', ICONS.clock, 'changes'],
      ['#/all-pages', 'All Pages A–Z', ICONS.list, 'all-pages'],
    ].map(([h, l, i, k]) => `<a class="top-link" href="${h}" data-route="${k}">${i}<span>${l}</span></a>`).join('');
    const groups = S.groups.map((g, gi) => `
      <details data-g="${gi}"${gi < 3 ? ' open' : ''}>
        <summary>${esc(g.name)}<span class="n">${g.items.length}</span></summary>
        <ul>${g.items.map(it => `<li><a href="${pageHref(it.page.title, it.hash)}" data-id="${it.page.id}">${esc(it.label)}</a></li>`).join('')}</ul>
      </details>`).join('');
    nav.innerHTML = top + '<hr>' + groups + '<div class="side-empty" hidden>No pages match.</div>';

    $('#side-filter').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      let any = false;
      for (const d of $$('details', nav)) {
        let hits = 0;
        for (const li of $$('li', d)) {
          const show = !q || li.textContent.toLowerCase().includes(q);
          li.hidden = !show; hits += show;
        }
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
    let el = typeof key === 'number' ? $(`a[data-id="${key}"]`, nav) : $(`a[data-route="${key}"]`, nav);
    if (!el) return;
    el.setAttribute('aria-current', 'page');
    const d = el.closest('details');
    if (d && !d.open) d.open = true;
    const side = $('#side');
    const r = el.getBoundingClientRect(), sr = side.getBoundingClientRect();
    if (r.top < sr.top + 60 || r.bottom > sr.bottom - 20) side.scrollTop += r.top - sr.top - sr.height / 3;
  }

  // ---------- chrome: drawer, lightbox, back-to-top ----------
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
      $('img', lb).alt = $('img', a)?.alt || '';
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
    return { path: p, anchor };
  }

  async function route() {
    const { path, anchor } = parseHash();
    S.closeDrawer?.();
    closeResults();
    if (!path) return view(home, 'home', 'PD2 Wiki');
    if (path === MERC_ROUTE) return view(mercView, MERC_ROUTE, 'Act 2 Merc Weapon Compare · PD2 Wiki');
    if (path === 'changes') return view(changesView, 'changes', 'Recent Changes · PD2 Wiki');
    if (path === 'all-pages') return view(allPagesView, 'all-pages', 'All Pages · PD2 Wiki');
    if (path.startsWith('search/')) return view(() => searchView(path.slice(7)), null, 'Search · PD2 Wiki');

    const r = resolve(path);
    if (!r) return view(() => notFound(path), null, 'Not found · PD2 Wiki');
    const want = anchor || r.frag;
    if (norm(r.page.title) !== norm(path)) {
      history.replaceState(null, '', pageHref(r.page.title, want));
    }
    if (S.current === r.page.id && $('.wiki', main)) { scrollToAnchor(want, true); return; }
    await showPage(r.page, want);
  }

  async function view(fn, sideKey, title) {
    S.current = null;
    S.spy?.disconnect();
    tocRail.innerHTML = '';
    setToc(false);
    document.title = title;
    await fn();
    markSidebar(sideKey);
    scrollTo(0, 0);
  }

  // ---------- page ----------
  async function getHtml(id) {
    if (S.html.has(id)) return S.html.get(id);
    const res = await fetch(`data/pages/${id}.html`, { cache: 'no-cache' });
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
        ${p.edited ? `<span title="${esc(new Date(p.edited).toLocaleString())}">Edited on the wiki ${esc(ago(p.edited))}</span>` : ''}
        <a href="${wikiUrl(p.title)}" target="_blank" rel="noopener">Open on PD2 Wiki ${ICONS.ext}</a>
        <a href="${WIKI}/w/index.php?title=${encTitle(p.title)}&action=history" target="_blank" rel="noopener">History ${ICONS.ext}</a>
        <button class="btn expand-all" type="button" hidden>Expand all</button>
      </div>
      ${merc}
      <details class="toc-inline" hidden><summary>On this page</summary><div class="toc"></div></details>
      <article class="wiki"></article>
      <p class="attrib">From <a href="${wikiUrl(p.title)}" target="_blank" rel="noopener">${esc(p.title)}</a> on the Project Diablo 2 Wiki,
        written by <a href="${WIKI}/w/index.php?title=${encTitle(p.title)}&action=history" target="_blank" rel="noopener">its contributors</a>
        and shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.
        This copy is re-synced every day; to fix something, edit the wiki itself.</p>`;
    const art = $('.wiki', main);
    art.innerHTML = html;
    enhance(art, p);
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
    main.innerHTML = `<div class="error"><b>No page called “${esc(path)}” in this copy of the wiki.</b><br><br>
      <a href="${wikiUrl(path)}" target="_blank" rel="noopener">Try it on the PD2 Wiki</a> · <a href="#/search/${encodeURIComponent(path)}">Search for it</a></div>`;
  }

  // Rewrites the wiki's HTML so links, images and widgets work in this reader.
  function enhance(root, p) {
    for (const el of $$('script,style,iframe,object,embed,link,meta', root)) el.remove();

    for (const a of $$('a', root)) {
      const href = a.getAttribute('href');
      if (!href) continue;
      if (/^\s*javascript:/i.test(href)) { a.removeAttribute('href'); continue; }
      if (a.classList.contains('new')) {           // red link: page doesn't exist on the wiki
        const s = document.createElement('span'); s.className = 'dead-link'; s.innerHTML = a.innerHTML; a.replaceWith(s); continue;
      }
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
          else external(a, WIKI + href.replace(/^(https?:)?\/\/wiki\.projectdiablo2\.com/, ''));
          continue;
        }
        const r = resolve(title);
        if (r) { a.setAttribute('href', pageHref(r.page.title, frag || r.frag)); a.removeAttribute('title'); }
        else external(a, WIKI + '/wiki/' + path + (frag ? '#' + encodeURIComponent(frag) : ''));
      } else if (href.startsWith('#')) {
        let f = href.slice(1);
        try { f = decodeURIComponent(f); } catch {}
        a.setAttribute('href', pageHref(p.title, f));
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

    for (const h of $$('.mw-heading > h1, .mw-heading > h2, .mw-heading > h3, .mw-heading > h4, .mw-heading > h5, .mw-heading > h6', root)) {
      if (!h.id) continue;
      const l = document.createElement('a');
      l.className = 'hlink'; l.href = pageHref(p.title, h.id); l.textContent = '#';
      l.setAttribute('aria-label', 'Link to this section');
      h.parentElement.prepend(l);
    }

    // Collapsible changelogs and boxes.
    for (const c of $$('.mw-collapsible', root)) {
      let btn;
      if (c.tagName === 'TABLE') {
        let cap = $(':scope > caption', c);
        if (!cap) { cap = document.createElement('caption'); cap.textContent = 'Details'; c.prepend(cap); }
        btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'coll-toggle';
        while (cap.firstChild) btn.appendChild(cap.firstChild);
        cap.appendChild(btn);
        cap.addEventListener('click', e => { if (e.target === cap) btn.click(); });
      } else {
        btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'coll-toggle';
        btn.textContent = c.dataset.expandtext || 'Show more';
        c.prepend(btn);
      }
      btn.addEventListener('click', () => setCollapsed(c, !c.classList.contains('is-collapsed')));
      setCollapsed(c, c.classList.contains('mw-collapsed'));
    }
    const colls = $$('.mw-collapsible', root);
    const expandAll = $('.expand-all', main);
    if (colls.length > 1) {
      expandAll.hidden = false;
      const sync = () => { expandAll.textContent = colls.some(c => c.classList.contains('is-collapsed')) ? 'Expand all' : 'Collapse all'; };
      expandAll.onclick = () => { const collapse = !colls.some(c => c.classList.contains('is-collapsed')); colls.forEach(c => setCollapsed(c, collapse)); sync(); };
      root.addEventListener('click', e => { if (e.target.closest('.coll-toggle')) setTimeout(sync); });
      sync();
    }
    for (const b of $$('.expand-or-collapse-all-button', root)) {
      const wrap = b.closest('p') || b;
      wrap.remove();
    }

    // Tables: horizontal scroll wrapper, click-to-sort, row filter for long ones.
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

  // A table is sortable when it has one header row of plain <th> and body rows
  // with the same number of cells and no row/col spans.
  function tableShape(t) {
    const rows = Array.from(t.rows);
    if (rows.length < 3) return null;
    const head = rows[0];
    const cells = Array.from(head.cells);
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
      th.title = 'Sort';
      const sort = () => {
        const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        info.head.forEach(h => h.hasAttribute('aria-sort') && h.setAttribute('aria-sort', 'none'));
        th.setAttribute('aria-sort', dir);
        const keyed = info.body.map((r, i) => ({ r, i, k: sortKey(r.cells[col]) }));
        const allNum = keyed.every(x => x.k.num !== null || x.k.txt === '');
        const mul = dir === 'ascending' ? 1 : -1;
        keyed.sort((a, b) => {
          let d;
          if (allNum) d = (a.k.num ?? -Infinity) - (b.k.num ?? -Infinity);
          else d = a.k.txt.localeCompare(b.k.txt, undefined, { numeric: true });
          return d * mul || a.i - b.i;
        });
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
      for (const r of info.body) {
        const ok = terms.every(q => texts.get(r).includes(q));
        r.hidden = !ok; shown += ok;
      }
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
    const list = items.map(h => {
      const lvl = use.indexOf(+h.tagName[1]) + 1;
      return `<li><a class="l${lvl}" href="${pageHref(p.title, h.id)}" data-a="${esc(h.id)}">${esc(h.textContent.trim())}</a></li>`;
    }).join('');
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
      if (visible.size) {
        const first = items.find(h => visible.has(h));
        if (first) setActive(first.id);
      } else {
        const above = items.filter(h => h.getBoundingClientRect().top < 100).pop();
        if (above) setActive(above.id);
      }
    }, { rootMargin: '-60px 0px -65% 0px' });
    items.forEach(h => S.spy.observe(h));
  }

  // ---------- search ----------
  function loadSearch() {
    if (S.search) return Promise.resolve(S.search);
    if (!S.searchLoading) {
      S.searchLoading = fetchJSON('data/search.json').then(list => {
        const out = [];
        for (const e of list) {
          const p = S.byId.get(e.id);
          if (!p) continue;
          for (const [anchor, heading, text] of e.s) {
            out.push({ p, anchor, heading, text, hl: heading.toLowerCase(), tl: text.toLowerCase() });
          }
        }
        S.search = out;
        return out;
      }).catch(err => { S.searchLoading = null; throw err; });
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
      const s = Math.max(scoreText(p.title.replace(/^Guide:/, ''), q, ts), scoreText(displayName(p), q, ts));
      if (s) pages.push({ p, s: s + Math.min(5, p.len / 1e5) });
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
      pages: pages.slice(0, limits.pages), heads: heads.slice(0, limits.heads), hits: hits.slice(0, limits.hits),
      total: pages.length + heads.length + hits.length,
    };
  }

  function snippet(text, q, width = 150) {
    const ts = terms(q);
    const lower = text.toLowerCase();
    let at = lower.indexOf(q.toLowerCase());
    if (at < 0) at = Math.max(0, ...ts.map(t => lower.indexOf(t)).filter(i => i >= 0).slice(0, 1));
    const start = Math.max(0, at - Math.floor(width / 3));
    let s = (start > 0 ? '…' : '') + text.slice(start, start + width) + (start + width < text.length ? '…' : '');
    s = esc(s);
    for (const t of ts.sort((a, b) => b.length - a.length)) {
      s = s.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;')})`, 'gi'), '<mark>$1</mark>');
    }
    return s;
  }

  function resultHref(p, anchor, q) {
    return `${pageHref(p.title, anchor)}" data-hl="${esc(q)}`;
  }

  function setupSearch() {
    const input = $('#q'), box = $('#q-results');
    let sel = -1, timer;
    const narrow = matchMedia('(max-width: 520px)');
    const setPh = () => { input.placeholder = narrow.matches ? 'Search the wiki' : 'Search runewords, skills, items…'; };
    setPh(); narrow.addEventListener?.('change', setPh);

    const render = () => {
      const q = input.value.trim();
      if (q.length < 2) { closeResults(); return; }
      const r = searchAll(q, { pages: 5, heads: 6, hits: 5 });
      let html = '';
      if (r.pages.length) {
        html += '<div class="res-group">Pages</div>' + r.pages.map(({ p }) =>
          `<a class="res" role="option" href="${resultHref(p, '', q)}"><b>${esc(displayName(p))}</b><span class="crumb">${esc(S.groupOf.get(p.id) || '')}</span></a>`).join('');
      }
      if (r.heads.length) {
        html += '<div class="res-group">Sections</div>' + r.heads.map(({ e }) =>
          `<a class="res" role="option" href="${resultHref(e.p, e.anchor, q)}"><b>${esc(e.heading)}</b><span class="crumb">in ${esc(displayName(e.p))}</span></a>`).join('');
      }
      if (r.hits.length) {
        html += '<div class="res-group">Mentions</div>' + r.hits.map(({ e }) =>
          `<a class="res" role="option" href="${resultHref(e.p, e.anchor, q)}"><b>${esc(displayName(e.p))}${e.heading ? ` › ${esc(e.heading)}` : ''}</b><span class="snip">${snippet(e.text, q)}</span></a>`).join('');
      }
      if (!S.search) html += '<div class="res-empty">Loading full-text search…</div>';
      else if (!html) html = `<div class="res-empty">Nothing found for “${esc(q)}”.</div>`;
      html += `<a class="res-all" href="#/search/${encodeURIComponent(q)}">See all results for “${esc(q)}” →</a>`;
      box.innerHTML = html;
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      sel = -1;
    };

    input.addEventListener('focus', () => { loadSearch().then(() => { if (document.activeElement === input) render(); }).catch(() => {}); if (input.value.trim().length >= 2) render(); });
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
        else if (q) location.hash = '#/search/' + encodeURIComponent(q);
      } else if (e.key === 'Escape') {
        closeResults(); input.blur();
      }
    });
    box.addEventListener('mousedown', e => e.preventDefault());
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-hl]');
      if (a) sessionStorage.setItem('pd2wiki-hl', a.dataset.hl);
      if (a && box.contains(a)) { input.blur(); }
      if (!e.target.closest('.search')) closeResults();
    });
  }

  function closeResults() {
    const box = $('#q-results');
    if (!box) return;
    box.hidden = true;
    $('#q').setAttribute('aria-expanded', 'false');
  }

  // Marks the search terms on the page and scrolls to the first one in the target section.
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
      re.lastIndex = 0;
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
    $('#q').value = q;
    main.innerHTML = `<h1 class="page-title">Search</h1><div class="page-meta">Results for “${esc(q)}”</div><div class="loading">Searching…</div>`;
    try { await loadSearch(); } catch {}
    const r = searchAll(q, { pages: 30, heads: 60, hits: 120 });
    const li = (href, title, crumb, snip) => `<li><a href="${href}"><b>${title}</b></a>${crumb ? `<div class="crumb">${crumb}</div>` : ''}${snip ? `<p>${snip}</p>` : ''}</li>`;
    let html = '';
    if (r.pages.length) html += `<h2 class="home-h">Pages</h2><ul class="sres">${r.pages.map(({ p }) => li(resultHref(p, '', q), esc(displayName(p)), esc(S.groupOf.get(p.id) || ''), esc(p.intro || ''))).join('')}</ul>`;
    if (r.heads.length) html += `<h2 class="home-h">Sections</h2><ul class="sres">${r.heads.map(({ e }) => li(resultHref(e.p, e.anchor, q), esc(e.heading), 'in ' + esc(displayName(e.p)), snippet(e.text, q, 200))).join('')}</ul>`;
    if (r.hits.length) html += `<h2 class="home-h">Mentions</h2><ul class="sres">${r.hits.map(({ e }) => li(resultHref(e.p, e.anchor, q), esc(displayName(e.p)) + (e.heading ? ' › ' + esc(e.heading) : ''), '', snippet(e.text, q, 220))).join('')}</ul>`;
    if (!html) html = `<div class="error"><b>Nothing found for “${esc(q)}”.</b><br>Try fewer words, or <a href="${WIKI}/w/index.php?search=${encodeURIComponent(q)}" target="_blank" rel="noopener">search the PD2 Wiki itself</a>.</div>`;
    main.innerHTML = `<h1 class="page-title">Search</h1><div class="page-meta">Results for “${esc(q)}”</div>${html}`;
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
    const newest = pages.reduce((a, p) => (p.edited > a ? p.edited : a), '');
    const recent = [...pages].filter(p => p.edited).sort((a, b) => b.edited.localeCompare(a.edited)).slice(0, 10);
    const mainPage = S.byTitle.get('Main Page');

    main.innerHTML = `
      <section class="hero">
        <h1>PD2 Wiki</h1>
        <p>Every page of the <b>Project Diablo 2 wiki</b>, rebuilt for fast reading on any screen: instant search down to single runewords and skills, sortable tables, and a page outline that follows you as you scroll.</p>
        <div class="status">
          <span class="pill"><b>${pages.length}</b> pages</span>
          <span class="pill" id="sync-pill"><i></i>Synced daily</span>
          ${newest ? `<span class="pill">Latest wiki edit <b>${esc(ago(newest))}</b></span>` : ''}
        </div>
      </section>
      <div class="welcome" id="welcome" hidden></div>
      <a class="tool-card" href="#/${MERC_ROUTE}">
        <span class="glyph" aria-hidden="true">${ICONS.merc}</span>
        <span><b>Act 2 Merc Weapon Compare</b><span>Set your merc's attack speed and see which polearm or spear hits hardest, where each breakpoint lands, and how much IAS the next one needs.</span></span>
        <span class="go">Open tool →</span>
      </a>
      <h2 class="home-h">Browse the wiki</h2>
      <div class="groups">${S.groups.filter(g => g.name !== 'Other Languages').map(g => `
        <div class="group"><h3>${esc(g.name)}</h3><ul>${g.items.slice(0, g.name === 'More Pages' ? 18 : 40).map(it =>
          `<li><a href="${pageHref(it.page.title, it.hash)}">${esc(it.label)}</a></li>`).join('')}
          ${g.name === 'More Pages' && g.items.length > 18 ? `<li><a href="#/all-pages">+${g.items.length - 18} more</a></li>` : ''}</ul></div>`).join('')}
      </div>
      <h2 class="home-h">Recently edited on the wiki</h2>
      <ul class="changes">${recent.map(p => `<li><a href="${pageHref(p.title)}">${esc(displayName(p))}</a><span>${esc(ago(p.edited))}</span></li>`).join('')}</ul>
      <a class="more-link" href="#/changes">All recent changes →</a>`;

    if (mainPage) {
      getHtml(mainPage.id).then(html => {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const intro = $('div[style*="center"]', tmp);
        const w = $('#welcome');
        if (!intro || !w) return;
        $$('figure,br', intro).forEach(n => n.remove());
        w.innerHTML = intro.innerHTML;
        enhance(w, mainPage);
        w.hidden = false;
      }).catch(() => {});
    }
    lastCheck().then(t => {
      const pill = $('#sync-pill');
      if (pill && t) pill.innerHTML = `<i></i>Synced daily · last check <b>${esc(ago(t))}</b>`;
    });
  }

  async function changesView() {
    const log = await loadChanges();
    const recent = [...S.index.pages].filter(p => p.edited).sort((a, b) => b.edited.localeCompare(a.edited)).slice(0, 40);
    const link = t => { const r = resolve(t); return r ? `<a href="${pageHref(r.page.title)}">${esc(displayName(r.page))}</a>` : esc(t); };
    const entries = log.map(e => {
      const rows = [];
      if (e.initial) rows.push(`<li><span class="tag">Import</span> First copy of all ${e.initial} pages</li>`);
      for (const t of e.added || []) rows.push(`<li><span class="tag">New</span> ${link(t)}</li>`);
      for (const u of e.updated || []) rows.push(`<li><span class="tag">Updated</span> ${link(u.title)}${u.summary ? ` <span class="sum">— ${esc(u.summary)}</span>` : ''}</li>`);
      for (const t of e.removed || []) rows.push(`<li><span class="tag">Removed</span> ${esc(t)}</li>`);
      if (e.sheet) rows.push(`<li><span class="tag">Tool</span> <a href="#/${MERC_ROUTE}">Merc weapon data</a> updated from the spreadsheet</li>`);
      return `<li><time datetime="${esc(e.date)}">${esc(fmtDate(e.date))}</time><ul>${rows.join('')}</ul></li>`;
    }).join('');
    main.innerHTML = `
      <h1 class="page-title">Recent Changes</h1>
      <div class="page-meta">This copy checks the PD2 Wiki every 24 hours and picks up anything new or edited.
        <a href="${WIKI}/wiki/Special:RecentChanges" target="_blank" rel="noopener">Wiki's own change log ${ICONS.ext}</a></div>
      <h2 class="home-h">Latest edits on the wiki</h2>
      <ul class="changes">${recent.map(p => `<li><a href="${pageHref(p.title)}">${esc(displayName(p))}</a><span title="${esc(new Date(p.edited).toLocaleString())}">${esc(fmtDate(p.edited))}</span></li>`).join('')}</ul>
      <h2 class="home-h">Sync log</h2>
      ${entries ? `<ul class="log">${entries}</ul>` : '<p>No syncs logged yet.</p>'}`;
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
      <div class="page-meta">${pages.length} pages, A–Z.</div>
      <div class="az">${[...by].map(([k, ps]) => `<h3>${esc(k)}</h3><ul>${ps.map(p => `<li><a href="${pageHref(p.title)}">${esc(displayName(p))}</a></li>`).join('')}</ul>`).join('')}</div>`;
  }

  async function mercView() {
    main.innerHTML = '<div class="loading">Loading merc weapon data…</div>';
    if (!window.MercTool) { main.innerHTML = '<div class="error"><b>The merc tool failed to load.</b></div>'; return; }
    await window.MercTool.render(main, { fetchJSON, esc, pageHref, resolve });
  }

  boot();
})();
