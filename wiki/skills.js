/* Skill browser: #/skills/<Class>[/<skill or tree anchor>], from data/skills/<Class>.json.
 * Each class shows its three trees laid out by required level, and the chosen skill
 * below with a level slider in place of the wiki's 60-column level tables.
 *   #/skills/Items                   skills only items grant (Blade Dance, Blink, ...)
 *   #/skills/changes?cls=…&q=…       every skill change from vanilla, and skills on items
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];
  const EXTRA = [['Items', 'Item skills'], ['changes', 'Changes from vanilla']];
  const cache = new Map();
  const load = cls => {
    if (!cache.has(cls)) cache.set(cls, P().fetchJSON(`data/skills/${cls}.json`).catch(e => { cache.delete(cls); throw e; }));
    return cache.get(cls);
  };
  const STORE = 'pd2wiki-slvl';
  const getLvl = () => { try { return +localStorage.getItem(STORE) || 20; } catch { return 20; } };
  const setLvl = v => { try { localStorage.setItem(STORE, String(v)); } catch {} };

  const loadChanges = () => load('changes').catch(() => null);
  const classTabs = cur => `<div class="segs cls-tabs" role="group" aria-label="Class">${CLASSES.map(c => `<a class="seg${c === cur ? ' on' : ''}" href="#/skills/${c}" aria-pressed="${c === cur}">${c}</a>`).join('')}
      ${EXTRA.map(([k, l]) => `<a class="seg seg-x${k === cur ? ' on' : ''}" href="#/skills/${k}" aria-pressed="${k === cur}">${l}</a>`).join('')}</div>`;

  const showTab = root => { if (matchMedia('(max-width: 900px)').matches) root.querySelector('.cls-tabs .on')?.scrollIntoView({ inline: 'center', block: 'nearest' }); };

  async function render(root, cls, anchor) {
    const { esc, $, $$, enhanceFragment, byId, wikiUrl } = P();
    const [c0, qs = ''] = String(cls || '').split('?');
    if (c0.toLowerCase() === 'changes') return changes(root, qs, anchor);
    cls = [...CLASSES, 'Items'].find(c => c.toLowerCase() === c0.toLowerCase()) || CLASSES[0];
    const isItems = cls === 'Items';
    root.innerHTML = '<div class="loading">Loading skills…</div>';
    let d;
    try { d = await load(cls); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load ${esc(cls)} skills.</b><br>${esc(e.message)}</div>`; return; }
    const label = isItems ? 'Item-only Skills' : `${cls} Skills`;
    document.title = `${label} · PD2 Wiki`;
    const all = d.trees.flatMap(t => t.skills.map(s => ({ ...s, tree: t.name })));
    const sel = all.find(s => s.anchor === anchor) || null;
    const page = byId(d.page);
    const tiers = [...new Set(all.map(s => s.lvl || 1))].sort((a, b) => a - b);
    const activeTree = sel ? sel.tree : (d.trees.find(t => t.anchor === anchor) || d.trees[0])?.name;

    root.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>Skills</span></nav>
      <h1 class="page-title">${esc(label)}</h1>
      ${classTabs(cls)}
      ${isItems && d.intro ? `<div class="wiki lead items-intro">${d.intro}</div>` : ''}
      <div class="tree-tabs" role="tablist"${d.trees.length < 2 ? ' hidden' : ''}>${d.trees.map(t => `<button type="button" role="tab" class="seg${t.name === activeTree ? ' on' : ''}" data-tree="${esc(t.name)}" aria-selected="${t.name === activeTree}">${esc(t.name)}</button>`).join('')}</div>
      <div class="trees" style="--tiers:${tiers.length}">
        ${d.trees.map(t => `<section class="tree${t.name === activeTree ? ' on' : ''}" data-tree="${esc(t.name)}">
          <h2>${esc(t.name)}</h2>
          <div class="tiers">${tiers.map(lv => {
            const here = t.skills.filter(s => (s.lvl || 1) === lv);
            return `<div class="tier"><span class="tier-lv">${lv}</span><div class="tier-skills">${here.map(s => `
              <a class="skill-btn${sel && sel.anchor === s.anchor ? ' on' : ''}" href="#/skills/${cls}/${encodeURIComponent(s.anchor)}" title="${esc(s.name)} · level ${s.lvl || 1}">
                ${s.img ? `<img src="${esc(s.img)}" alt="" loading="lazy">` : '<span class="noimg"></span>'}<span>${esc(s.name)}</span></a>`).join('')}</div></div>`;
          }).join('')}</div>
        </section>`).join('')}
      </div>
      <div id="skill-detail">${sel ? '' : `<p class="hint">Pick a skill to see what it does, its synergies and its numbers at any level.</p>`}</div>
      ${d.intro && !isItems ? `<details class="cls-intro"><summary>${esc(cls)} attributes &amp; notes</summary><div class="wiki">${d.intro}</div></details>` : ''}
      <p class="tile-links">${isItems ? `<a href="#/skills/changes#OSkills">Class skills items grant →</a>` : `<a href="#/classes?cls=${cls}">Plan ${esc(cls)} stat points →</a><a href="#/guides?cls=${cls}">${esc(cls)} builds →</a>`}<a href="#/skills/changes${isItems ? '' : '?cls=' + cls}">What PD2 changed →</a></p>
      <p class="attrib">From <a href="${page ? wikiUrl(page.title) : '#'}" target="_blank" rel="noopener">${esc(page?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`;

    for (const b of $$('.tree-tabs button', root)) b.addEventListener('click', () => {
      for (const x of $$('.tree-tabs button', root)) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); }
      for (const t of $$('.tree', root)) t.classList.toggle('on', t.dataset.tree === b.dataset.tree);
    });
    showTab(root);
    const intro = $('.cls-intro .wiki, .items-intro', root);
    if (intro) enhanceFragment(intro, page);

    if (!sel) {
      if (anchor) requestAnimationFrame(() => $('.trees', root)?.scrollIntoView({ block: 'start' }));
      return;
    }
    document.title = `${sel.name} · ${cls} · PD2 Wiki`;
    const byName = new Map(all.map(s => [s.name.toLowerCase(), s]));
    const det = $('#skill-detail', root);
    det.innerHTML = `
      <article class="skill">
        <header class="skill-head">
          ${sel.img ? `<img src="${esc(sel.img)}" alt="">` : ''}
          <div><h2 id="${esc(sel.anchor)}">${esc(sel.name)}</h2>
            <p>${esc(sel.tree)} · Required level ${sel.lvl || 1}</p></div>
        </header>
        ${sel.desc ? `<p class="skill-desc">${esc(sel.desc)}</p>` : ''}
        ${sel.reqItems ? `<p class="skill-req"><span>Granted by</span><span class="wiki">${sel.reqItems}</span></p>` : ''}
        ${sel.reqSkills.length ? `<p class="skill-req"><span>Requires</span>${sel.reqSkills.map(n => {
          const s = byName.get(n.toLowerCase());
          return s ? `<a class="chip" href="#/skills/${cls}/${encodeURIComponent(s.anchor)}">${esc(n)}</a>` : `<span class="chip">${esc(n)}</span>`;
        }).join('')}</p>` : ''}
        <div class="wiki skill-body">${sel.body}</div>
      </article>`;
    const body = $('.skill-body', det);
    for (const el of $$('.skill-req .wiki', det)) enhanceFragment(el, page);
    enhanceFragment(body, page);
    levelTables(body);
    const art = det.querySelector('.skill');
    if (!isItems) loadChanges().then(ch => {
      const h = ch && vsVanilla(ch, cls, sel);
      if (!h || !art.isConnected) return;
      body.insertAdjacentHTML('beforebegin', h);
      for (const el of $$('.skill-vs .wiki', art)) enhanceFragment(el, byId(ch.page));
    });
    window.PD2Patches?.historyHtml(sel.name).then(h => { if (h && art.isConnected) art.insertAdjacentHTML('beforeend', h); });
    if (anchor) requestAnimationFrame(() => det.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  // What PD2 changed about one skill, and which items grant it as an oskill or aura.
  function vsVanilla(ch, cls, sel) {
    const { esc } = P();
    const strip = h => String(h).replace(/<[^>]+>/g, '').trim().toLowerCase();
    const mine = ch.classes.find(c => c.cls === cls)?.trees.flatMap(t => t.skills).find(s => s.anchor === sel.anchor || s.name.toLowerCase() === sel.name.toLowerCase());
    const grants = ch.onItems.flatMap(b => b.tables.flatMap(t => t.rows.filter(r => strip(r[0]) === sel.name.toLowerCase() && r[1] && strip(r[1])).map(r => ({ b, r }))));
    if (!mine && !grants.length) return '';
    return `<section class="skill-vs">
      ${mine ? `<h3>Changed from vanilla</h3><ul class="wiki">${mine.changes.map(c => `<li>${c}</li>`).join('')}</ul>` : ''}
      ${grants.map(({ b, r }) => `<p class="wiki"><b>${b.title === 'OSkills' ? 'Granted as an oskill by' : 'Granted as an aura by'}:</b> ${r[1]}${r[2] && strip(r[2]) ? ` <span class="muted">(${r[2]})</span>` : ''}</p>`).join('')}
      <a class="more" href="#/skills/changes?cls=${cls}${mine ? '&q=' + encodeURIComponent(sel.name) : ''}">All ${esc(cls)} changes →</a></section>`;
  }

  // #/skills/changes: the Skill Changes page, searchable by class, plus the skills items grant.
  async function changes(root, qs, anchor) {
    const { esc, $, $$, enhanceFragment, byId, wikiUrl } = P();
    root.innerHTML = '<div class="loading">Loading skill changes…</div>';
    const ch = await loadChanges();
    if (!ch) { root.innerHTML = `<div class="error"><b>Couldn't load skill changes.</b></div>`; return; }
    document.title = 'Skill Changes · PD2 Wiki';
    const p = new URLSearchParams(qs);
    const f = { cls: CLASSES.includes(p.get('cls')) || p.get('cls') === 'items' ? p.get('cls') : '', q: p.get('q') || '' };
    const page = byId(ch.page);
    const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&#160;|&nbsp;/g, ' ').replace(/\s+/g, ' ').toLowerCase();
    const skillHref = (c, s) => s.anchor ? `#/skills/${c}/${encodeURIComponent(s.anchor)}` : '';
    root.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/skills">Skills</a><span aria-hidden="true">›</span><span>Changes</span></nav>
      <h1 class="page-title">Skill Changes from Vanilla</h1>
      ${classTabs('changes')}
      ${ch.stub ? `<p class="warnbox"><b>Partly out of date.</b> ${esc(ch.stub)} Newer changes are in the <a href="#/patches">patch notes</a>, and each skill's page lists its patch history.</p>` : ''}
      ${ch.intro ? `<p class="lead wiki">${ch.intro}</p>` : ''}
      <div class="filters"><div class="frow">
        <label class="fsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="scq" value="${esc(f.q)}" placeholder="Search skills or changes, e.g. Fend, splash, cooldown" aria-label="Search skill changes" autocomplete="off"></label></div>
        <div class="chips">${[['', 'All classes'], ...CLASSES.map(c => [c, c]), ['items', 'Skills on items']].map(([k, l]) => `<button type="button" class="chip${k === f.cls ? ' on' : ''}" data-c="${k}">${l}</button>`).join('')}</div></div>
      <div class="chg-box"></div>
      <p class="attrib">From <a href="${page ? wikiUrl(page.title) : '#'}" target="_blank" rel="noopener">${esc(page?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`;
    showTab(root);
    const box = $('.chg-box', root);
    const draw = () => {
      const ts = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      const hit = s => ts.every(t => s.includes(t));
      const classes = ch.classes.filter(c => !f.cls || f.cls === c.cls).map(c => {
        const trees = c.trees.map(t => {
          const sk = t.skills.filter(s => hit(strip(`${s.name} ${s.changes.join(' ')} ${t.name} ${c.cls}`)));
          const notes = ts.length ? t.notes.filter(n => hit(strip(n))) : t.notes;
          return sk.length || notes.length ? `<h3 class="sub-h" id="${esc(t.anchor)}">${esc(t.name)}</h3>
            ${notes.map(n => `<p class="wiki muted">${n}</p>`).join('')}
            <div class="chgl">${sk.map(s => `<div class="chg-row"><a class="chg-name"${skillHref(c.cls, s) ? ` href="${skillHref(c.cls, s)}"` : ''}>${esc(s.name)}</a><ul class="wiki">${s.changes.map(x => `<li>${x}</li>`).join('')}</ul></div>`).join('')}</div>` : '';
        }).join('');
        return trees ? `<section class="info-card" id="${esc(c.anchor)}"><h2 class="home-h">${esc(c.cls)}</h2>${trees}</section>` : '';
      }).join('');
      const items = !f.cls || f.cls === 'items' ? ch.onItems.map(b => {
        const tables = b.tables.map(t => {
          const rows = t.rows.filter(r => hit(strip(r.join(' '))));
          return rows.length ? `<div class="tw"><table class="restable chg-t">${t.head.length ? `<thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${rows.map(r => `<tr>${r.map(c => `<td class="wiki">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
        }).join('');
        const notes = !ts.length || hit(strip(b.notes)) ? b.notes : '';
        if (!tables && !notes) return '';
        const about = notes ? (b.tables.length ? `<details class="about"><summary>How ${esc(b.title.toLowerCase())} work</summary><div class="wiki">${notes}</div></details>` : `<div class="wiki">${notes}</div>`) : '';
        return `<section class="info-card" id="${esc(b.anchor)}"><h2 class="home-h">${esc(b.title)}</h2>${about}${tables}</section>`;
      }).join('') : '';
      box.innerHTML = (f.cls === 'items' ? items : classes + items) || '<div class="empty">No skill changes match.</div>';
      for (const el of $$('.wiki', box)) enhanceFragment(el, page);
    };
    draw();
    const sync = () => {
      const u = new URLSearchParams();
      if (f.cls) u.set('cls', f.cls);
      if (f.q) u.set('q', f.q);
      history.replaceState(null, '', '#/skills/changes' + (u.toString() ? '?' + u : ''));
    };
    root.querySelector('.filters').addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      f.cls = b.dataset.c;
      for (const x of $$('[data-c]', root)) x.classList.toggle('on', x === b);
      sync(); draw();
    });
    let t;
    $('#scq', root).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); sync(); draw(); }, 150); });
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  }


  // Turns "Level | 1 | 2 | ... | 60" tables into a slider that shows one level at a time,
  // keeping the full table one click away.
  function levelTables(root) {
    const { esc } = P();
    for (const t of root.querySelectorAll('table')) {
      const rows = [...t.rows];
      if (rows.length < 2) continue;
      const head = [...rows[0].cells].map(c => c.textContent.trim());
      if (!/^level$/i.test(head[0]) || head.length < 6 || !head.slice(1, 5).every(h => /^\d+$/.test(h))) continue;
      const levels = head.slice(1).map(Number);
      const data = rows.slice(1).map(r => ({ label: r.cells[0]?.textContent.trim() || '', cells: [...r.cells].slice(1).map(c => c.innerHTML.trim()) }))
        .filter(r => r.label);
      if (!data.length) continue;
      const max = levels.length;
      const box = document.createElement('div');
      box.className = 'lvlw';
      box.innerHTML = `
        <div class="lvlw-head"><label for="">Skill level <b class="lvlw-n"></b></label>
          <input type="range" min="1" max="${max}" aria-label="Skill level"></div>
        <dl class="lvlw-vals"></dl>
        <details class="lvlw-full"><summary>Full table (levels 1–${levels[max - 1]})</summary></details>`;
      const wrap = t.closest('.tw') || t;
      wrap.before(box);
      box.querySelector('.lvlw-full').appendChild(wrap);
      const range = box.querySelector('input'), n = box.querySelector('.lvlw-n'), vals = box.querySelector('.lvlw-vals');
      const show = i => {
        n.textContent = levels[i - 1];
        vals.innerHTML = data.map(r => {
          const v = r.cells[i - 1] ?? '';
          const prev = i > 1 ? r.cells[i - 2] : null;
          const up = prev !== null && prev !== v;
          return `<div><dt>${esc(r.label)}</dt><dd${up ? ' class="up"' : ''}>${v || '—'}</dd></div>`;
        }).join('');
      };
      range.value = Math.min(getLvl(), max);
      show(+range.value);
      range.addEventListener('input', () => { show(+range.value); setLvl(+range.value); });
    }
  }

  // Hover card: icon, tree, level, description, a few numbers at the saved skill level,
  // and what PD2 changed.
  async function tip(cls, anchor) {
    const { esc } = P();
    const c = [...CLASSES, 'Items'].find(x => x.toLowerCase() === String(cls).toLowerCase());
    if (!c) return '';
    const d = await load(c);
    let tree = null, s = null;
    for (const t of d.trees) { s = t.skills.find(x => x.anchor === anchor); if (s) { tree = t; break; } }
    if (!s) return '';
    const ch = c === 'Items' ? null : await loadChanges();
    const mine = ch?.classes.find(x => x.cls === c)?.trees.flatMap(t => t.skills).find(x => x.anchor === s.anchor || x.name === s.name);
    // Numbers at the reader's skill level, from the first "Level | 1 | 2 | …" table.
    const lvl = getLvl();
    let nums = [];
    const tpl = document.createElement('template');
    tpl.innerHTML = s.body;
    const t = [...tpl.content.querySelectorAll('table')].find(x => /^level$/i.test(x.rows[0]?.cells[0]?.textContent.trim() || ''));
    if (t) {
      const head = [...t.rows[0].cells].map(x => x.textContent.trim());
      const col = Math.min(head.indexOf(String(lvl)) > 0 ? head.indexOf(String(lvl)) : head.length - 1, head.length - 1);
      nums = [...t.rows].slice(1).map(r => [r.cells[0]?.textContent.trim(), r.cells[col]?.textContent.trim()]).filter(([k, v]) => k && v).slice(0, 6);
    }
    const strip = h => String(h).replace(/<a\b[^>]*>|<\/a>/g, '');
    return `<div class="hc-skill">
      <div class="hc-head">${s.img ? `<img src="${esc(s.img)}" alt="">` : ''}<span><b class="hc-name">${esc(s.name)}</b><span class="hc-sub">${c === 'Items' ? 'Item skill' : esc(c)} · ${esc(tree.name)} · req. level ${s.lvl || 1}</span></span></div>
      ${s.desc ? `<p class="hc-desc">${esc(s.desc)}</p>` : ''}
      ${s.reqSkills.length ? `<div class="hc-req">Requires ${esc(s.reqSkills.join(', '))}</div>` : ''}
      ${nums.length ? `<div class="hc-lvl">At skill level ${esc(t.rows[0].cells[Math.min(Math.max(1, [...t.rows[0].cells].findIndex(x => x.textContent.trim() === String(lvl))), t.rows[0].cells.length - 1)].textContent.trim())}</div><ul class="hc-kv">${nums.map(([k, v]) => `<li><span>${esc(k)}</span> ${esc(v)}</li>`).join('')}</ul>` : ''}
      ${mine ? `<div class="hc-lvl">Changed from vanilla</div><ul class="hc-list">${mine.changes.slice(0, 4).map(x => `<li>${strip(x)}</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  function search(q, n) {
    const idx = P().S.index.skillIndex || [];
    const ql = q.toLowerCase();
    const out = [];
    for (const s of idx) {
      const nm = s.n.toLowerCase();
      const sc = nm === ql ? 100 : nm.startsWith(ql) ? 80 : nm.includes(' ' + ql) ? 60 : nm.includes(ql) ? 45 : 0;
      if (sc) out.push({ s, sc });
    }
    return out.sort((a, b) => b.sc - a.sc).slice(0, n).map(x => x.s);
  }

  window.PD2Skills = { render, search, tip, CLASSES };
})();
