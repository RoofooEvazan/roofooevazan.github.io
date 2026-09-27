/* Character stat planner & class comparison, from gear.json's classAttrs (Class Attributes page).
 *   #/classes?cls=Paladin     plan a level: stat points, life, mana, stamina, attack rating, defense
 * Every level gives 5 stat points; Lam Esen's Tome gives 5 more per difficulty (15 total).
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const STATS = ['Strength', 'Dexterity', 'Vitality', 'Energy'];
  const STORE = 'pd2wiki-planner';
  const getS = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
  const setS = s => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch {} };

  async function render(root, qs) {
    const { esc, $, $$, enhanceFragment, byId, wikiUrl } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    let data;
    try { data = await window.PD2Gear.load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load class attributes.</b><br>${esc(e.message)}</div>`; return; }
    const C = data.classAttrs;
    if (!C?.classes.length) { root.innerHTML = '<div class="error"><b>No class data yet.</b></div>'; return; }
    const saved = getS();
    const want = new URLSearchParams(qs || '').get('cls') || saved.cls || 'Paladin';
    const cls = C.classes.find(c => c.cls.toLowerCase() === want.toLowerCase()) || C.classes[0];
    document.title = `${cls.cls} Stat Planner · PD2 Wiki`;
    const st = { lvl: 90, lam: true, add: {}, items: {}, reqStr: '', reqDex: '', ...(saved.byCls?.[cls.cls] || {}) };
    for (const s of STATS) { st.add[s] = st.add[s] ?? 0; st.items[s] = st.items[s] ?? 0; }
    const row = l => cls.rows.find(r => r.label === l);
    const page = byId(C.page);

    root.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/skills/${cls.cls}">Skills</a></nav>
      <h1 class="page-title">Stat Planner</h1>
      <div class="segs cls-tabs" role="group" aria-label="Class">${C.classes.map(c => `<a class="seg${c === cls ? ' on' : ''}" href="#/classes?cls=${c.cls}">${c.cls}</a>`).join('')}</div>
      <section class="calc planner">
        <div class="cgrid">
          <label class="cf"><span>Character level</span><input type="number" id="pl-lvl" min="1" max="99" value="${st.lvl}"></label>
          <label class="cf cb"><input type="checkbox" id="pl-lam"${st.lam ? ' checked' : ''}><span>Lam Esen's Tome in all 3 difficulties (+15 points)</span></label>
          <label class="cf"><span>Gear needs Strength</span><input type="number" id="pl-rs" placeholder="e.g. 156" value="${esc(st.reqStr)}"></label>
          <label class="cf"><span>Gear needs Dexterity</span><input type="number" id="pl-rd" placeholder="e.g. 136" value="${esc(st.reqDex)}"></label>
        </div>
        <div class="pl-actions"><button type="button" class="chip" data-act="gear">Minimum for gear, rest into Vitality</button><button type="button" class="chip" data-act="reset">Reset points</button></div>
        <div class="tw"><table class="restable pl-table"><thead><tr><th>Attribute</th><th>Base</th><th>Points added</th><th>From items</th><th>Total</th></tr></thead><tbody>
          ${STATS.map(s => `<tr><td class="mn">${s}</td><td class="r">${row(s)?.base ?? 0}</td>
            <td><div class="stepper"><button type="button" data-step="-5" data-s="${s}" aria-label="Remove 5 ${s}">-5</button><input type="number" min="0" data-add="${s}" value="${st.add[s]}" aria-label="${s} points"><button type="button" data-step="5" data-s="${s}" aria-label="Add 5 ${s}">+5</button></div></td>
            <td><input type="number" class="pl-items" data-items="${s}" value="${st.items[s]}" aria-label="${s} from items"></td><td class="r pl-total" data-total="${s}"></td></tr>`).join('')}
        </tbody></table></div>
        <div class="cout" id="pl-out"></div>
      </section>
      <details class="about"${cls.notes ? '' : ' hidden'}><summary>${esc(cls.cls)} attributes and what PD2 changed</summary><div class="wiki">
        <div class="tw"><table class="restable"><thead><tr><th>Attribute</th><th>Level 1</th><th>Per level</th><th>Per point</th></tr></thead>
        <tbody>${cls.rows.map(r => `<tr${r.changed ? ' class="chg"' : ''}><td class="mn">${r.stat ? `<b>${esc(r.label)}</b>` : `&nbsp;&nbsp;${esc(r.label)}`}</td><td class="r">${r.base ?? ''}</td><td class="r">${r.perLevel != null ? '+' + r.perLevel : ''}</td><td class="r">${r.perPoint != null ? '+' + r.perPoint : ''}</td></tr>`).join('')}</tbody></table></div>
        ${cls.notes}</div></details>
      <h2 class="home-h">All classes at level 1</h2>
      <div class="tw"><table class="restable cmp"><thead><tr><th>Class</th>${['Strength', 'Dexterity', 'Vitality', 'Energy', 'Life', 'Mana', 'Stamina'].map(l => `<th>${l}</th>`).join('')}<th title="Life per level / per Vitality">Life +lvl / +vit</th><th title="Mana per level / per Energy">Mana +lvl / +ene</th></tr></thead>
        <tbody>${C.classes.map(c => { const g = l => c.rows.find(r => r.label === l); return `<tr${c === cls ? ' class="cur"' : ''}><td class="mn"><a href="#/classes?cls=${c.cls}">${c.cls}</a></td>${['Strength', 'Dexterity', 'Vitality', 'Energy', 'Life', 'Mana', 'Stamina'].map(l => `<td class="r">${g(l)?.base ?? ''}</td>`).join('')}<td class="r">+${g('Life')?.perLevel ?? '?'} / +${g('Life')?.perPoint ?? '?'}</td><td class="r">+${g('Mana')?.perLevel ?? '?'} / +${g('Mana')?.perPoint ?? '?'}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="attrib">From <a href="${page ? wikiUrl(page.title) : '#'}" target="_blank" rel="noopener">Class Attributes</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Totals leave out skills, auras and item bonuses to life, mana or attack rating.</p>`;
    for (const el of $$('.about .wiki', root)) enhanceFragment(el, page);

    const lvlIn = $('#pl-lvl', root);
    const pool = () => Math.max(0, (Math.min(99, Math.max(1, +lvlIn.value || 1)) - 1) * 5 + ($('#pl-lam', root).checked ? 15 : 0));
    const spent = () => STATS.reduce((a, s) => a + (+st.add[s] || 0), 0);
    const calc = () => {
      st.lvl = Math.min(99, Math.max(1, +lvlIn.value || 1));
      st.lam = $('#pl-lam', root).checked;
      st.reqStr = $('#pl-rs', root).value; st.reqDex = $('#pl-rd', root).value;
      const L = st.lvl;
      const tot = s => (row(s)?.base || 0) + (+st.add[s] || 0) + (+st.items[s] || 0);
      for (const s of STATS) { const cell = root.querySelector(`[data-total="${s}"]`); cell.textContent = tot(s); }
      const grow = (label, pointsFrom) => { const r = row(label); if (!r) return null; return r.base + (L - 1) * (r.perLevel || 0) + ((+st.add[pointsFrom] || 0) + (+st.items[pointsFrom] || 0)) * (r.perPoint || 0); };
      const life = grow('Life', 'Vitality'), mana = grow('Mana', 'Energy'), stam = grow('Stamina', 'Vitality');
      const ar = (row('Attack Rating')?.base || 0) + ((+st.add.Dexterity || 0) + (+st.items.Dexterity || 0)) * (row('Attack Rating')?.perPoint || 5);
      const def = Math.floor(tot('Dexterity') * (row('Defense')?.perPoint || 0.25));
      const left = pool() - spent();
      const reqS = +st.reqStr || 0, reqD = +st.reqDex || 0;
      $('#pl-out', root).innerHTML = `
        <div class="stat${left < 0 ? ' bad' : ''}"><b>${left}</b><span>stat points left of ${pool()}</span></div>
        <div class="stat big"><b>${Math.floor(life)}</b><span>life</span></div>
        <div class="stat"><b>${Math.floor(mana)}</b><span>mana</span></div>
        <div class="stat"><b>${Math.floor(stam)}</b><span>stamina</span></div>
        <div class="stat"><b>${ar}</b><span>attack rating from Dexterity</span></div>
        <div class="stat"><b>${def}</b><span>defense from Dexterity</span></div>
        ${reqS || reqD ? `<p class="cnote">${reqS ? `Strength ${tot('Strength')} / ${reqS} ${tot('Strength') >= reqS ? '✓' : '— short by ' + (reqS - tot('Strength'))}` : ''}${reqS && reqD ? ' · ' : ''}${reqD ? `Dexterity ${tot('Dexterity')} / ${reqD} ${tot('Dexterity') >= reqD ? '✓' : '— short by ' + (reqD - tot('Dexterity'))}` : ''}</p>` : ''}`;
      const all = getS(); all.cls = cls.cls; all.byCls = { ...(all.byCls || {}), [cls.cls]: { lvl: st.lvl, lam: st.lam, add: st.add, items: st.items, reqStr: st.reqStr, reqDex: st.reqDex } }; setS(all);
    };
    root.querySelector('.planner').addEventListener('input', e => {
      const a = e.target.dataset.add, it = e.target.dataset.items;
      if (a) st.add[a] = Math.max(0, +e.target.value || 0);
      if (it) st.items[it] = +e.target.value || 0;
      calc();
    });
    root.querySelector('.planner').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.step) {
        const s = b.dataset.s;
        st.add[s] = Math.max(0, (+st.add[s] || 0) + +b.dataset.step);
        root.querySelector(`[data-add="${s}"]`).value = st.add[s];
      } else if (b.dataset.act === 'reset') {
        for (const s of STATS) { st.add[s] = 0; root.querySelector(`[data-add="${s}"]`).value = 0; }
      } else if (b.dataset.act === 'gear') {
        const need = (s, req) => Math.max(0, (+req || 0) - (row(s)?.base || 0) - (+st.items[s] || 0));
        st.add.Strength = need('Strength', $('#pl-rs', root).value);
        st.add.Dexterity = need('Dexterity', $('#pl-rd', root).value);
        st.add.Energy = 0;
        st.add.Vitality = Math.max(0, pool() - st.add.Strength - st.add.Dexterity);
        for (const s of STATS) root.querySelector(`[data-add="${s}"]`).value = st.add[s];
      }
      calc();
    });
    calc();
  }

  window.PD2Classes = { render };
})();
