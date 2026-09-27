/* Skill browser: #/skills/<Class>[/<skill anchor>], from data/skills/<Class>.json.
 * Each class shows its three trees laid out by required level, and the chosen skill
 * below with a level slider in place of the wiki's 60-column level tables.
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];
  const cache = new Map();
  const load = cls => {
    if (!cache.has(cls)) cache.set(cls, P().fetchJSON(`data/skills/${cls}.json`).catch(e => { cache.delete(cls); throw e; }));
    return cache.get(cls);
  };
  const STORE = 'pd2wiki-slvl';
  const getLvl = () => { try { return +localStorage.getItem(STORE) || 20; } catch { return 20; } };
  const setLvl = v => { try { localStorage.setItem(STORE, String(v)); } catch {} };

  async function render(root, cls, anchor) {
    const { esc, $, $$, enhanceFragment, byId, wikiUrl } = P();
    cls = CLASSES.find(c => c.toLowerCase() === String(cls || '').toLowerCase()) || CLASSES[0];
    root.innerHTML = '<div class="loading">Loading skills…</div>';
    let d;
    try { d = await load(cls); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load ${esc(cls)} skills.</b><br>${esc(e.message)}</div>`; return; }
    document.title = `${cls} Skills · PD2 Wiki`;
    const all = d.trees.flatMap(t => t.skills.map(s => ({ ...s, tree: t.name })));
    const sel = all.find(s => s.anchor === anchor) || null;
    const page = byId(d.page);
    const tiers = [...new Set(all.map(s => s.lvl || 1))].sort((a, b) => a - b);
    const activeTree = sel ? sel.tree : d.trees[0]?.name;

    root.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>Skills</span></nav>
      <h1 class="page-title">${esc(cls)} Skills</h1>
      <div class="segs cls-tabs" role="group" aria-label="Class">${CLASSES.map(c => `<a class="seg${c === cls ? ' on' : ''}" href="#/skills/${c}" aria-pressed="${c === cls}">${c}</a>`).join('')}</div>
      <div class="tree-tabs" role="tablist">${d.trees.map(t => `<button type="button" role="tab" class="seg${t.name === activeTree ? ' on' : ''}" data-tree="${esc(t.name)}" aria-selected="${t.name === activeTree}">${esc(t.name)}</button>`).join('')}</div>
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
      ${d.intro ? `<details class="cls-intro"><summary>${esc(cls)} attributes &amp; notes</summary><div class="wiki">${d.intro}</div></details>` : ''}
      <p class="attrib">From <a href="${page ? wikiUrl(page.title) : '#'}" target="_blank" rel="noopener">${esc(page?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`;

    for (const b of $$('.tree-tabs button', root)) b.addEventListener('click', () => {
      for (const x of $$('.tree-tabs button', root)) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); }
      for (const t of $$('.tree', root)) t.classList.toggle('on', t.dataset.tree === b.dataset.tree);
    });
    const intro = $('.cls-intro .wiki', root);
    if (intro) enhanceFragment(intro, page);

    if (!sel) return;
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
        ${sel.reqSkills.length ? `<p class="skill-req"><span>Requires</span>${sel.reqSkills.map(n => {
          const s = byName.get(n.toLowerCase());
          return s ? `<a class="chip" href="#/skills/${cls}/${encodeURIComponent(s.anchor)}">${esc(n)}</a>` : `<span class="chip">${esc(n)}</span>`;
        }).join('')}</p>` : ''}
        <div class="wiki skill-body">${sel.body}</div>
      </article>`;
    const body = $('.skill-body', det);
    enhanceFragment(body, page);
    levelTables(body);
    const art = det.querySelector('.skill');
    window.PD2Patches?.historyHtml(sel.name).then(h => { if (h && art.isConnected) art.insertAdjacentHTML('beforeend', h); });
    if (anchor) requestAnimationFrame(() => det.scrollIntoView({ block: 'start', behavior: 'smooth' }));
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

  window.PD2Skills = { render, search, CLASSES };
})();
