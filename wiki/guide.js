/* Help center, build directory and breakpoints, from data/guide.json.
 *   #/help[?cat=…][#<question id>]        FAQ + Support FAQ as a searchable help center
 *   #/guides?cls=Paladin&starter=1 | #/guides/links   builds and community resources
 *   #/breakpoints[/fcr|fhr|fbr|ias|thresholds|changes] breakpoint lookup & calculators
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  let data = null, loading = null;
  const load = () => {
    if (data) return Promise.resolve(data);
    if (!loading) loading = P().fetchJSON('data/guide.json').then(d => (data = d)).catch(e => { loading = null; throw e; });
    return loading;
  };
  const CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];
  const attrib = (ids, label) => {
    const ps = [].concat(ids).map(id => P().byId(id)).filter(Boolean);
    return `<p class="attrib">From ${ps.map(p => `<a href="${P().wikiUrl(p.title)}" target="_blank" rel="noopener">${P().esc(p.title)}</a>`).join(' and ') || P().esc(label || 'the PD2 Wiki')} on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`;
  };
  const searchBox = (id, val, ph) => `<label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input type="search" id="${id}" value="${P().esc(val)}" placeholder="${P().esc(ph)}" aria-label="${P().esc(ph)}" autocomplete="off"></label>`;
  const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  // ---------- help center ----------
  async function help(root, qs, anchor) {
    const { esc, $, $$, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load help.</b><br>${esc(e.message)}</div>`; return; }
    const H = data.help;
    for (const it of H.items) it._s = it._s || (it.q + ' ' + strip(it.html)).toLowerCase();
    const cats = [...new Set(H.items.map(i => i.cat))];
    const p = new URLSearchParams(qs || '');
    let cat = p.get('cat') || '';
    if (cat === 'support') cat = '';
    const f = { cat, q: '' };
    root.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>Help</span></nav>
      <h1 class="page-title">Help Center</h1>
      <p class="lead">Common questions about Project Diablo 2, plus fixes for crashes, performance, the launcher and connection problems.</p>
      <div class="filters"><div class="frow">${searchBox('hq', '', 'Describe the problem, e.g. crash, black screen, port 6112')}</div>
        <div class="chips" role="group" aria-label="Category">${['', ...cats].map(c => `<button type="button" class="chip${f.cat === c ? ' on' : ''}" data-cat="${esc(c)}">${c ? esc(c) : 'All'} <i>${c ? H.items.filter(i => i.cat === c).length : H.items.length}</i></button>`).join('')}</div></div>
      <div class="rcount" aria-live="polite"></div>
      <div class="faq"></div>
      <p class="muted">Still stuck? The PD2 Discord's support channels are linked from the <a href="#/guides/links">community links</a>.</p>
      ${attrib(H.pages)}`;
    const box = $('.faq', root), count = $('.rcount', root);
    const draw = () => {
      const ts = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = H.items.filter(i => (!f.cat || i.cat === f.cat) && ts.every(t => i._s.includes(t)));
      count.textContent = `${hits.length} answer${hits.length === 1 ? '' : 's'}`;
      const groups = [...new Set(hits.map(i => i.cat))];
      box.innerHTML = groups.map(g => `<section class="qa-grp"><h2 class="home-h">${esc(g)} <small>${hits.filter(i => i.cat === g).length}</small></h2><div class="qa-grid">${hits.filter(i => i.cat === g).map(i => `
        <details class="qa" id="${esc(i.id)}"${ts.length && hits.length <= 3 ? ' open' : ''}><summary data-hc="faq:${esc(i.id)}">${esc(i.q)}</summary><div class="wiki">${i.html}</div></details>`).join('')}</div></section>`).join('')
        || `<div class="empty">No answers match. Try fewer words.</div>`;
      for (const el of $$('.qa .wiki', box)) enhanceFragment(el, P().byId(H.items.find(i => i.id === el.parentElement.id)?.page));
    };
    draw();
    $('.filters', root).addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; f.cat = b.dataset.cat; for (const x of $$('[data-cat]', root)) x.classList.toggle('on', x === b); draw(); });
    let t;
    $('#hq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); draw(); }, 150); });
    if (anchor) requestAnimationFrame(() => { const el = document.getElementById(anchor); if (el) { el.open = true; el.scrollIntoView({ block: 'start' }); } });
  }

  // Hover card: the start of an answer, so most questions never need opening.
  async function faqTip(id) {
    const { esc } = P();
    await load();
    const it = data.help.items.find(i => i.id === id);
    if (!it) return '';
    const tpl = document.createElement('template');
    tpl.innerHTML = it.html;
    const text = tpl.content.textContent.replace(/\s+/g, ' ').trim();
    return `<div class="hc-faq"><b class="hc-name">${esc(it.q)}</b>
      <p class="hc-desc">${esc(text.length > 520 ? text.slice(0, 500).replace(/\s+\S*$/, '') + '…' : text)}</p>
      <div class="hc-foot">${esc(it.cat)} · click to open${text.length > 520 ? ' the full answer' : ''}</div></div>`;
  }

  // ---------- build directory ----------
  async function guides(root, tab, qs) {
    const { esc, $, $$, pageHref, byId, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading guides…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load guides.</b><br>${esc(e.message)}</div>`; return; }
    const G = data.guides;
    const segs = `<div class="segs" role="group">${[['', 'Builds'], ['links', 'Community links']].map(([k, l]) => `<a class="seg${k === tab ? ' on' : ''}" href="#/guides${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;
    const head = t => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>Guides &amp; Builds</span></nav><h1 class="page-title">${t}</h1>${segs}`;
    const linkOf = e => e.page ? `href="${pageHref(byId(e.page)?.title || '')}"` : `href="${esc(e.href)}" target="_blank" rel="noopener"`;

    if (tab === 'links') {
      const secs = [...new Set(G.resources.map(r => r.section))];
      root.innerHTML = `${head('Community Links')}
        ${secs.map(s => `<h2 class="home-h">${esc(s)}</h2><div class="links">${G.resources.filter(r => r.section === s).map(r => `
          <a class="link" ${linkOf(r)}><b>${esc(r.name)}</b>${r.author ? `<span class="by">${esc(r.author)}</span>` : ''}${r.desc ? `<span class="desc">${strip(r.desc) ? r.desc.replace(/<a\b[^>]*>|<\/a>/g, '') : ''}</span>` : ''}</a>`).join('')}</div>`).join('')}
        ${attrib(G.page)}`;
      return;
    }

    const p = new URLSearchParams(qs || '');
    const f = { cls: p.get('cls') || '', starter: p.get('starter') === '1', where: p.get('where') || '', q: p.get('q') || '' };
    // One list: every build from the wiki's Links page, plus wiki guides it doesn't list.
    const metaBy = new Map(G.guides.map(m => [m.page, m]));
    const listed = new Set(G.builds.map(b => b.page).filter(Boolean));
    const all = [
      ...G.builds.map(b => ({ ...b, meta: b.page ? metaBy.get(b.page) : null })),
      ...G.guides.filter(m => !listed.has(m.page)).map(m => ({ name: m.title, author: m.author, date: '', page: m.page, cls: m.cls || 'General', season: m.season, meta: m })),
    ];
    for (const b of all) {
      b.starter = b.meta?.starter || /starter|beginner|budget|league start|new player/i.test(b.name);
      b._s = [b.name, b.author, b.cls, b.host, ...(b.meta?.skills || []).map(s => s.n)].join(' ').toLowerCase();
      b.sort = b.season ?? (b.meta?.edited ? 0 : -1);
    }
    const url = ff => { const u = new URLSearchParams(); if (ff.cls) u.set('cls', ff.cls); if (ff.starter) u.set('starter', '1'); if (ff.where) u.set('where', ff.where); if (ff.q) u.set('q', ff.q); const s = u.toString(); return '#/guides' + (s ? '?' + s : ''); };
    root.innerHTML = `${head('Build Directory')}
      <div class="filters">
        <div class="frow">${searchBox('gq', f.q, 'Build, skill or author, e.g. Zeal, Blizzard, TDL')}</div>
        <div class="chips" role="group" aria-label="Class">${['', ...CLASSES, 'General'].map(c => `<a class="chip${f.cls === c ? ' on' : ''}" href="${url({ ...f, cls: c })}">${c ? `<span class="cls-orb cls-${c.toLowerCase()}" aria-hidden="true">${c[0]}</span>${c}` : 'All classes'}</a>`).join('')}</div>
        <div class="chips">
          <a class="chip toggle${f.starter ? ' on' : ''}" href="${url({ ...f, starter: !f.starter })}">Starter builds</a>
          ${[['', 'Anywhere'], ['wiki', 'On this wiki'], ['video', 'Videos'], ['web', 'Other sites']].map(([k, l]) => `<a class="chip${f.where === k ? ' on' : ''}" href="${url({ ...f, where: k })}">${l}</a>`).join('')}</div>
      </div>
      <div class="rcount" aria-live="polite"></div><div class="builds"></div>${attrib(G.page)}`;
    const box = $('.builds', root), count = $('.rcount', root);
    // One line per build; the guide's intro and skill list are on the hover card.
    lastBuilds = all;
    const card = b => {
      const cls = CLASSES.includes(b.cls) ? b.cls : '';
      const where = b.page ? 'Wiki' : b.host || 'Link';
      return `<a class="brow${b.page ? ' local' : ''}" ${linkOf(b)} data-hc="build:${all.indexOf(b)}">
        ${cls ? `<span class="cls-orb cls-${cls.toLowerCase()}" aria-hidden="true">${cls[0]}</span>` : '<span class="cls-orb gen" aria-hidden="true">?</span>'}
        <span class="br-name"><b>${esc(b.name)}</b>${b.starter ? '<em class="starter">Starter</em>' : ''}</span>
        <span class="br-skills">${(b.meta?.skills || []).slice(0, 3).map(s => esc(s.n)).join(' · ')}</span>
        <span class="br-by">${esc(b.author || '')}</span>
        <span class="br-s">${b.season ? `S${b.season}` : esc(b.date || '')}</span>
        <span class="br-where w-${where === 'Wiki' ? 'wiki' : /YouTube/.test(where) ? 'yt' : 'web'}">${esc(where)}</span></a>`;
    };
    const draw = () => {
      const ts = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = all.filter(b => (!f.cls || b.cls === f.cls) && (!f.starter || b.starter) &&
        (!f.where || (f.where === 'wiki' ? b.page : f.where === 'video' ? /YouTube/.test(b.host || '') : !b.page && !/YouTube/.test(b.host || ''))) &&
        ts.every(t => b._s.includes(t))).sort((a, b) => (b.sort - a.sort) || a.name.localeCompare(b.name));
      count.textContent = `${hits.length} build${hits.length === 1 ? '' : 's'} & guide${hits.length === 1 ? '' : 's'}, newest season first`;
      const groups = f.cls ? [f.cls] : [...CLASSES, 'General'].filter(c => hits.some(b => b.cls === c));
      box.innerHTML = groups.map(c => `<h2 class="home-h">${esc(c)} <small>${hits.filter(b => b.cls === c).length}</small></h2><div class="blist">${hits.filter(b => b.cls === c).map(card).join('')}</div>`).join('')
        || '<div class="empty">No builds match.</div>';
    };
    draw();
    let t;
    $('#gq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); history.replaceState(null, '', url(f)); draw(); }, 150); });
  }

  let lastBuilds = [];
  async function buildTip(i) {
    const { esc } = P();
    const b = lastBuilds[+i];
    if (!b) return '';
    const m = b.meta;
    const desc = m?.intro || String(b.desc || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return `<div class="hc-build">
      <b class="hc-name">${esc(b.name)}</b>
      <span class="hc-sub">${[b.cls, b.author && 'by ' + b.author, b.season ? 'Season ' + b.season : b.date].filter(Boolean).map(esc).join(' · ')}</span>
      ${m?.skills?.length ? `<div class="hc-lvl">Key skills</div><p class="hc-desc">${m.skills.map(s => esc(s.n)).join(', ')}</p>` : ''}
      ${desc ? `<p class="hc-desc">${esc(desc.length > 300 ? desc.slice(0, 290).replace(/\s+\S*$/, '') + '…' : desc)}</p>` : ''}
      <div class="hc-foot">${b.page ? `On this wiki${m?.words ? ` · about ${Math.max(1, Math.round(m.words / 230))} min read` : ''}` : `Opens ${esc(b.host || 'an outside site')}`}</div></div>`;
  }

  // "My character": one class, three numbers, every animation's frames for cast rate,
  // hit recovery and block rate side by side, with what the next breakpoint needs.
  function myBreakpoints(root, head, B) {
    const { esc, $ } = P();
    const STATS = [['fcr', 'Faster Cast Rate', 'Cast rate'], ['fhr', 'Faster Hit Recovery', 'Hit recovery'], ['fbr', 'Faster Block Rate', 'Block rate']];
    const tables = Object.fromEntries(STATS.map(([k, st]) => [k, B.tables.find(t => t.stat === st)]));
    const who = r => r.name.replace(/\s*\(.*\)$/, '');
    const whos = [...new Set(STATS.flatMap(([k]) => (tables[k]?.rows || []).map(who)))];
    const saved = { cls: 'Sorceress', fcr: 105, fhr: 42, fbr: 0, ...(getS().me || {}) };
    root.innerHTML = `${head}
      <p class="lead">Enter your character's cast rate, hit recovery and block rate to see your frames for every animation at once, and how much more you need for the next breakpoint. The other tabs have the full charts; attack speed depends on the weapon, so it has its own tab.</p>
      <section class="calc bp-me">
        <div class="cgrid">
          <label class="cf wide"><span>Class or mercenary</span><select id="me-cls">${whos.map(w => `<option${w === saved.cls ? ' selected' : ''}>${esc(w)}</option>`).join('')}</select></label>
          ${STATS.map(([k, , l]) => `<label class="cf"><span>${l} %</span><input type="number" id="me-${k}" min="0" value="${esc(saved[k])}"></label>`).join('')}
        </div>
      </section>
      <div class="tw"><table class="restable bp-me-t"><thead><tr><th>Stat</th><th>Animation</th><th>Frames now</th><th>Next breakpoint</th><th>Ladder</th></tr></thead><tbody></tbody></table></div>
      <p class="muted">Fewer frames is faster. Frames are at 25 per second, so 8 frames is 0.32 seconds.</p>
      ${attrib(B.page)}`;
    const body = $('tbody', root);
    const draw = () => {
      const cls = $('#me-cls', root).value;
      const vals = Object.fromEntries(STATS.map(([k]) => [k, Math.max(0, +$('#me-' + k, root).value || 0)]));
      setS({ ...getS(), me: { cls, ...vals } });
      body.innerHTML = STATS.flatMap(([k, , label]) => {
        const rows = (tables[k]?.rows || []).filter(r => who(r) === cls);
        return rows.map((r, i) => {
          const v = vals[k];
          let cur = r.bps[0], next = null;
          for (const bp of r.bps) { if (bp[0] <= v) cur = bp; else { next = bp; break; } }
          const variant = (r.name.match(/\((.*)\)$/) || [])[1] || '—';
          return `<tr${i === 0 ? ' class="grp"' : ''}><td class="st">${i === 0 ? `<a href="#/breakpoints/${k}">${label}</a> <small>${v}%</small>` : ''}</td><td class="an">${esc(variant)}</td>
            <td class="r fr"><b>${cur[1]}</b></td>
            <td class="nx">${next ? `<b>${next[1]} frames</b> at ${next[0]}% <span class="need">+${next[0] - v}%</span>` : '<span class="maxed">fastest</span>'}</td>
            <td class="ld">${r.bps.map(bp => `<span class="${bp === cur ? 'on' : bp[0] <= v ? 'past' : ''}" title="${bp[1]} frames at ${bp[0]}%">${bp[0]}</span>`).join('')}</td></tr>`;
        });
      }).join('') || '<tr><td colspan="5" class="empty">No breakpoints listed for that choice.</td></tr>';
    };
    root.querySelector('.bp-me').addEventListener('input', draw);
    draw();
  }

  // A strip of facts above a wiki-hosted guide's page.
  async function guideHeader(page) {
    try { await load(); } catch { return ''; }
    const m = data.guides.guides.find(g => g.page === page.id);
    if (!m) return '';
    const { esc } = P();
    return `<div class="guide-facts">${m.cls ? `<a class="chip" href="#/guides?cls=${m.cls}"><span class="cls-orb cls-${m.cls.toLowerCase()}" aria-hidden="true">${m.cls[0]}</span>${m.cls}</a>` : ''}
      ${m.season ? `<span class="chip">Season ${m.season}</span>` : ''}${m.starter ? '<span class="chip">Starter</span>' : ''}${m.author ? `<span class="chip">by ${esc(m.author)}</span>` : ''}
      <span class="chip">~${Math.max(1, Math.round(m.words / 230))} min read</span>
      ${m.skills.map(s => `<a class="chip" href="#/skills/${s.c}/${encodeURIComponent(s.a)}">${esc(s.n)}</a>`).join('')}
      <a class="chip" href="#/guides${m.cls ? '?cls=' + m.cls : ''}">More ${m.cls || ''} builds →</a></div>`;
  }

  // ---------- breakpoints ----------
  const TABS = [['', 'My character', ''], ['fcr', 'Cast rate', 'Faster Cast Rate'], ['fhr', 'Hit recovery', 'Faster Hit Recovery'], ['fbr', 'Block rate', 'Faster Block Rate'],
    ['ias', 'Attack speed', 'Attack Speed'], ['thresholds', 'Diminishing returns'], ['changes', 'What PD2 changed']];
  const eias = i => Math.floor(120 * i / (120 + i));
  const STORE = 'pd2wiki-bp';
  const getS = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
  const setS = s => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch {} };

  async function breakpoints(root, tabId) {
    const { esc, $, $$, enhanceFragment, byId } = P();
    root.innerHTML = '<div class="loading">Loading breakpoints…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load breakpoints.</b><br>${esc(e.message)}</div>`; return; }
    const B = data.breakpoints;
    const page = byId(B.page);
    const tab = TABS.find(t => t[0] === tabId) || TABS[0];
    const info = t => B.info.find(i => i.title.toLowerCase() === t.toLowerCase());
    const segs = `<div class="segs bp-tabs" role="group">${TABS.map(([k, l]) => `<a class="seg${k === tab[0] ? ' on' : ''}" href="#/breakpoints${k ? '/' + k : ''}">${l}</a>`).join('')}</div>`;
    const head = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/mechanics">Mechanics</a></nav><h1 class="page-title">Breakpoints</h1>${segs}`;
    const save = getS();

    if (tab[0] === '') return myBreakpoints(root, head, B);
    if (tab[0] === 'changes') {
      root.innerHTML = `${head}<section class="info-card"><div class="wiki">${info('Changes')?.html || ''}</div></section>${attrib(B.page)}`;
      enhanceFragment($('.wiki', root), page);
      return;
    }
    if (tab[0] === 'thresholds') {
      root.innerHTML = `${head}
        <section class="calc"><h2>Diminishing returns calculator</h2>
          <div class="cgrid">
            <label class="cf"><span>Item attack speed (IAS)</span><input type="number" id="t-ias" value="${save.ias ?? 40}"></label>
            <label class="cf"><span>Item faster run/walk</span><input type="number" id="t-frw" value="${save.frw ?? 30}"></label>
            <label class="cf"><span>Magic find</span><input type="number" id="t-mf" value="${save.mf ?? 300}"></label>
          </div><div class="cout" id="t-out"></div></section>
        ${['Diminishing Return Thresholds', 'Attack Speed Thresholds', 'Faster Run/Walk Thresholds', 'Magic Find Thresholds'].map(info).filter(Boolean).map(i => `<details class="about"><summary>${esc(i.title)}</summary><div class="wiki">${i.html}</div></details>`).join('')}
        ${attrib(B.page)}`;
      for (const el of $$('.wiki', root)) enhanceFragment(el, page);
      const out = $('#t-out', root);
      const run = () => {
        const v = id => Math.max(0, parseFloat($('#' + id, root).value) || 0);
        const ias = v('t-ias'), frw = v('t-frw'), mf = v('t-mf');
        setS({ ...getS(), ias, frw, mf });
        const efrw = Math.floor(150 * frw / (150 + frw));
        out.innerHTML = `<div class="stat"><b>${eias(ias)}</b><span>effective IAS from ${ias} item IAS</span></div>
          <div class="stat"><b>+${efrw}%</b><span>movement speed from ${frw} FRW · run ${(9 * (1 + efrw / 100)).toFixed(2)} / walk ${(6 * (1 + efrw / 100)).toFixed(2)} yd/s</span></div>
          <div class="stat big"><b>${mf}% / ${Math.floor(600 * mf / (600 + mf))}% / ${Math.floor(500 * mf / (500 + mf))}% / ${Math.floor(250 * mf / (250 + mf))}%</b><span>effective magic find for magic / rare / set / unique items</span></div>
          <p class="cnote">Effective IAS = ⌊120 × IAS ÷ (120 + IAS)⌋ · effective FRW = ⌊150 × FRW ÷ (150 + FRW)⌋ · MF for rares ⌊600 × MF ÷ (600 + MF)⌋, sets ÷500, uniques ÷250. FRW from skills (Burst of Speed, Vigor) adds directly.</p>`;
      };
      root.addEventListener('input', run);
      run();
      return;
    }

    const tables = B.tables.filter(t => t.stat === tab[2]);
    const subs = [...new Set(tables.map(t => t.sub).filter(Boolean))];
    const ias = tab[0] === 'ias';
    const key = `${tab[0]}`;
    const saved = save[key] || {};
    const firstSub = saved.sub && subs.includes(saved.sub) ? saved.sub : subs[0] || '';
    root.innerHTML = `${head}
      ${info(tab[2])?.html ? `<div class="wiki lead">${info(tab[2]).html}</div>` : ''}
      ${ias ? `<p class="lead">Attack speed depends on your weapon, so these charts use <b>total attack speed</b>: effective item IAS + skill IAS − the weapon's speed modifier (WSM). For a full weapon-and-skill breakdown, use the <a href="/pd2-ias-calc/">IAS Calculator</a>.</p>` : ''}
      <section class="calc bp-calc">
        <div class="cgrid">
          ${subs.length ? `<label class="cf"><span>Chart</span><select id="bp-sub">${subs.map(s => `<option${s === firstSub ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
          <label class="cf wide"><span>${ias ? 'Class & animation' : 'Class / animation'}</span><select id="bp-row"></select></label>
          ${ias ? `<label class="cf"><span>Item IAS</span><input type="number" id="bp-ias" value="${saved.ias ?? 40}"></label>
            <label class="cf"><span>Skill IAS</span><input type="number" id="bp-skill" value="${saved.skill ?? 0}"></label>
            <label class="cf"><span>Weapon WSM</span><input type="number" id="bp-wsm" value="${saved.wsm ?? 0}"></label>`
            : `<label class="cf"><span>Your ${esc(tab[1].toLowerCase())} %</span><input type="number" id="bp-val" value="${saved.val ?? 0}"></label>`}
        </div>
        <div class="cout" id="bp-out"></div>
        <div class="bp-ladder" id="bp-ladder"></div>
      </section>
      <h2 class="home-h">All ${esc(tab[1].toLowerCase())} breakpoints</h2>
      <div class="tw"><table class="restable bp-table" id="bp-table"></table></div>
      ${ias ? subs.map(s => info(s)).filter(Boolean).map(i => `<details class="about"><summary>${esc(i.title)} notes</summary><div class="wiki">${i.html}</div></details>`).join('') : ''}
      ${ias ? ['Wereform', 'OSkill Wereform'].map(info).filter(Boolean).map(i => `<details class="about"><summary>${esc(i.title)} breakpoints</summary><div class="wiki">${i.html}</div></details>`).join('') : ''}
      ${attrib(B.page)}`;
    for (const el of $$('.wiki', root)) enhanceFragment(el, page);

    const subSel = $('#bp-sub', root), rowSel = $('#bp-row', root);
    const tableFor = () => tables.find(t => !subSel || t.sub === subSel.value) || tables[0];
    const fillRows = () => {
      const t = tableFor();
      rowSel.innerHTML = t.rows.map((r, i) => `<option value="${i}"${r.name === saved.row ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
    };
    const value = () => ias
      ? eias(Math.max(0, +$('#bp-ias', root).value || 0)) + (+$('#bp-skill', root).value || 0) - (+$('#bp-wsm', root).value || 0)
      : +$('#bp-val', root).value || 0;
    const run = () => {
      const t = tableFor();
      const row = t.rows[+rowSel.value] || t.rows[0];
      const v = value();
      const reached = row.bps.filter(([need]) => need <= v);
      const cur = reached.at(-1) || row.bps[0];
      const next = row.bps.find(([need]) => need > v);
      const nextNeed = next ? (ias ? null : next[0] - v) : null;
      $('#bp-out', root).innerHTML = `<div class="stat big"><b>${cur ? cur[1] : '?'} frames</b><span>${ias ? `at ${v} total attack speed` : `at ${v}% ${esc(tab[1].toLowerCase())}`}</span></div>
        ${next ? `<div class="stat"><b>${ias ? `${next[0]} TAS` : `+${nextNeed}%`}</b><span>for ${next[1]} frames${ias ? '' : ` (${next[0]}% total)`}</span></div>` : '<div class="stat good"><b>Max</b><span>fastest breakpoint reached</span></div>'}
        ${ias ? `<p class="cnote">Total attack speed = ⌊120 × IAS ÷ (120 + IAS)⌋ + skill IAS − WSM = ${v}.</p>` : ''}`;
      $('#bp-ladder', root).innerHTML = row.bps.map(([need, fr]) => `<span class="${need <= v ? 'on' : ''}${cur && need === cur[0] ? ' cur' : ''}"><b>${fr}f</b>${need}</span>`).join('');
      // Full chart for this stat, current row highlighted.
      const frames = [...new Set(t.rows.flatMap(r => r.bps.map(b => b[1])))].sort((a, b) => b - a);
      $('#bp-table', root).innerHTML = `<thead><tr><th>${ias ? 'Class — animation' : 'Animation'}</th>${frames.map(f => `<th>${f}f</th>`).join('')}</tr></thead>
        <tbody>${t.rows.map((r, i) => `<tr${r === row ? ' class="cur"' : ''}><td class="mn">${esc(r.name)}</td>${frames.map(f => { const b = r.bps.find(x => x[1] === f); return `<td class="r${b && r === row && cur && b[0] === cur[0] ? ' hit' : ''}">${b ? b[0] : ''}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
      const st = getS();
      st[key] = ias ? { sub: subSel?.value, row: row.name, ias: +$('#bp-ias', root).value, skill: +$('#bp-skill', root).value, wsm: +$('#bp-wsm', root).value }
        : { sub: subSel?.value, row: row.name, val: +$('#bp-val', root).value };
      setS(st);
    };
    fillRows();
    subSel?.addEventListener('change', () => { fillRows(); run(); });
    root.querySelector('.bp-calc').addEventListener('input', e => { if (e.target !== subSel) run(); });
    rowSel.addEventListener('change', run);
    run();
  }

  function search(q, n) {
    if (!data) return [];
    const ql = q.toLowerCase();
    return data.help.items.filter(i => i.q.toLowerCase().includes(ql)).slice(0, n);
  }

  window.PD2Guide = { load, help, guides, guideHeader, breakpoints, search, faqTip, buildTip, get data() { return data; } };
})();
