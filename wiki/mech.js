/* Game mechanics guide, from data/mechanics.json (the Game Mechanics page split by topic),
 * with calculators for the formulas the wiki documents.
 *   #/mechanics/<topic>[#subsection]
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  let data = null, loading = null;
  const load = () => {
    if (data) return Promise.resolve(data);
    if (!loading) loading = P().fetchJSON('data/mechanics.json').then(d => (data = d)).catch(e => { loading = null; throw e; });
    return loading;
  };

  // ---------- formulas (as written on the wiki's Game Mechanics page) ----------
  const F = {
    crit({ cc, cm, dc, dm }) {
      const CC = Math.min(cc, 75) / 100, DC = dc / 100;
      const CM = 2 + cm / 100, DM = 1.5 + dm / 100;
      const eDC = DC * (1 - CC);
      return { eDC, total: 1 - (1 - DC) * (1 - CC), avg: CC * CM + eDC * DM + (1 - CC - eDC), CM, DM };
    },
    // floor(floor(floor(leech × attack × skill) × 64 × difficulty) × physical × drain ÷ 64 ÷ 100)
    leech({ leech, attack, skill, diff, phys, drain }) {
      const a = Math.floor(leech * attack * skill);
      const b = Math.floor(a * 64 * diff);
      return { a, b, out: Math.floor(b * phys * (drain / 100) / 64 / 100) };
    },
    crush({ target, attack, players, cbe, life, missing, pdr }) {
      const T = { most: 8, super: 8, map: 30, player: 10 };
      const divisor = target === 'prime' ? (8 + missing) * 10 : T[target];
      const scale = target !== 'player' && players > 1 ? 1.4 * players : 0;
      const frac = (1 + cbe / 100) / ((divisor + scale) * attack);
      const hp = Math.floor(life * frac);
      return { divisor, scale, frac, hp, after: Math.floor(hp * (1 - Math.min(pdr, 100) / 100)) };
    },
    // Player "reduce" effects are halved (and rounded down, each on its own) against
    // 100+ resistance; "pierce" effects only work once below 100; negative results are halved.
    resist({ base, reduce, pierce }) {
      const steps = [];
      let r = base;
      const immune = base >= 100;
      for (const v of reduce.filter(x => x > 0)) {
        if (immune) { const h = Math.floor(v / 2); r -= h; steps.push(`−${v} halved against an immune → −${h} = ${r}`); }
        else { r -= v; steps.push(`−${v} = ${r}`); }
      }
      if (r >= 100) { steps.push(`Still ${r}: the immunity isn't broken, so piercing (−${pierce}) does nothing`); return { final: r, immune: true, steps }; }
      if (pierce > 0) { r -= pierce; steps.push(`−${pierce} pierce = ${r}`); }
      if (r < 0) { const h = Math.trunc(r / 2); steps.push(`Below 0, so halved: ${r} → ${h}`); r = h; }
      if (r < -100) { r = -100; steps.push('Capped at −100'); }
      return { final: r, immune: false, steps };
    },
  };

  // ---------- calculator UIs ----------
  const num = (id, label, val, attrs = '') => `<label class="cf"><span>${label}</span><input type="number" id="${id}" value="${val}" inputmode="decimal" ${attrs}></label>`;
  const sel = (id, label, opts) => `<label class="cf"><span>${label}</span><select id="${id}">${opts.map(([v, l, on]) => `<option value="${v}"${on ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const pct = x => `${(x * 100).toFixed(x < 0.1 ? 2 : 1).replace(/\.0+$/, '')}%`;

  const CALCS = {
    Critical_Damage: {
      title: 'Crit calculator',
      html: () => `<div class="cgrid">${num('cc', 'Critical Strike %', 30)}${num('cm', '+Crit Strike multiplier %', 0)}${num('dc', 'Deadly Strike %', 50)}${num('dm', '+Deadly Strike multiplier %', 0)}</div><div class="cout"></div>`,
      run: (v, out) => {
        const r = F.crit({ cc: v('cc'), cm: v('cm'), dc: v('dc'), dm: v('dm') });
        out.innerHTML = `<div class="stat"><b>${pct(r.total)}</b><span>Total crit chance</span></div>
          <div class="stat"><b>${pct(r.eDC)}</b><span>Effective Deadly Strike (after Critical Strike)</span></div>
          <div class="stat big"><b>×${r.avg.toFixed(3)}</b><span>Average physical damage multiplier (+${((r.avg - 1) * 100).toFixed(1)}%)</span></div>
          <p class="cnote">Critical Strike deals ×${r.CM.toFixed(2)} and is checked first; Deadly Strike deals ×${r.DM.toFixed(2)}. Critical Strike chance caps at 75%.</p>`;
      },
    },
    Life_and_Mana_Steal: {
      title: 'Leech calculator',
      html: () => `<div class="cgrid">${num('lp', 'Life or mana leech %', 7)}
        ${sel('la', 'Attack', [['1', 'Melee (main target)', 1], ['0.5', 'Melee splash'], ['0.5', 'Ranged']])}
        ${sel('ls', 'Skill', [['1', 'Other skills', 1], ['0.5', 'Blade Shield'], ['0.75', 'Blade Fury'], ['0.3333333', 'Leap Attack (life)']])}
        ${sel('ld', 'Difficulty', [['1', 'Normal'], ['0.5', 'Nightmare'], ['0.3333333', 'Hell', 1]])}
        ${num('lph', 'Physical damage dealt', 5000)}${num('ldr', 'Monster drain effectiveness %', 100)}</div><div class="cout"></div>`,
      run: (v, out) => {
        const r = F.leech({ leech: v('lp'), attack: v('la'), skill: v('ls'), diff: v('ld'), phys: v('lph'), drain: v('ldr') });
        out.innerHTML = `<div class="stat big"><b>${r.out}</b><span>life or mana leeched per hit</span></div>
          <p class="cnote">Steps: ⌊${v('lp')} × ${(+v('la')).toFixed(2)} × ${(+v('ls')).toFixed(2)}⌋ = ${r.a} → ⌊${r.a} × 64 × ${(+v('ld')).toFixed(2)}⌋ = ${r.b} → ⌊${r.b} × ${v('lph')} × ${v('ldr') / 100} ÷ 64 ÷ 100⌋ = ${r.out}. Every step rounds down, so small leech on reduced attacks can round to 0.
          Drain effectiveness is listed per boss on the <a href="#/monsters">Monsters</a> page.</p>`;
      },
    },
    Crushing_Blow: {
      title: 'Crushing Blow calculator',
      html: () => `<div class="cgrid">${sel('ct', 'Target', [['most', 'Most enemies', 1], ['super', 'Super uniques'], ['map', 'Map bosses'], ['prime', 'Prime Evils'], ['player', 'Players & mercenaries']])}
        ${sel('ca', 'Attack', [['1', 'Melee', 1], ['1.5', 'Ranged']])}${num('cp', 'Players in game', 1, 'min="1" max="8"')}
        ${num('ce', 'Crushing Blow Efficiency %', 0)}${num('cl', 'Target current life', 100000)}${num('cmh', 'Prime Evil missing life %', 0)}${num('cpd', 'Target physical resist %', 0)}</div><div class="cout"></div>`,
      run: (v, out) => {
        const r = F.crush({ target: v('ct', true), attack: v('ca'), players: Math.max(1, Math.min(8, v('cp'))), cbe: v('ce'), life: v('cl'), missing: v('cmh'), pdr: v('cpd') });
        out.innerHTML = `<div class="stat"><b>${pct(r.frac)}</b><span>of current life per Crushing Blow</span></div>
          <div class="stat big"><b>${r.after.toLocaleString()}</b><span>damage per Crushing Blow${v('cpd') ? ' after physical resist' : ''}</span></div>
          <p class="cnote">(1 + ${v('ce')}%) ÷ ((${r.divisor}${r.scale ? ` + ${r.scale.toFixed(1)} for ${v('cp')} players` : ''}) × ${v('ca')}). Each hit takes a share of <i>current</i> life, so repeated blows do less and less.</p>`;
      },
    },
    Reducing_Resistances: {
      title: 'Resistance calculator',
      html: () => `<div class="cgrid">${num('rb', 'Monster resistance %', 110)}${num('r1', 'Lower Resist / Conviction / etc. (−%)', 21)}${num('r2', 'Second "reduce" effect (−%)', 31)}${num('r3', 'Third "reduce" effect (−%)', 0)}${num('rp', 'Pierce from skills & gear (−%)', 0)}</div><div class="cout"></div>`,
      run: (v, out) => {
        const r = F.resist({ base: v('rb'), reduce: [v('r1'), v('r2'), v('r3')], pierce: v('rp') });
        out.innerHTML = `<div class="stat big ${r.immune ? 'bad' : 'good'}"><b>${r.final}%</b><span>${r.immune ? 'still immune' : r.final < 0 ? 'final resistance (negative)' : 'final resistance'}</span></div>
          <ol class="csteps"><li>Start at ${v('rb')}%${v('rb') >= 100 ? ' (immune)' : ''}</li>${r.steps.map(s => `<li>${s}</li>`).join('')}</ol>
          <p class="cnote">"Reduce" effects (Lower Resist, Conviction, Amplify Damage, Sanctuary, Static Field…) break immunities. "Pierce" effects (masteries, −% enemy resist on gear) only apply once the monster is below 100%.</p>`;
      },
    },
    Distance: {
      title: 'Yards ↔ tiles',
      html: () => `<div class="cgrid">${num('dy', 'Yards (as shown in game)', 10)}</div><div class="cout"></div>`,
      run: (v, out) => { out.innerHTML = `<div class="stat big"><b>${(v('dy') * 1.5).toFixed(1).replace(/\.0$/, '')}</b><span>tiles (yards × 1.5)</span></div>`; },
    },
  };

  async function render(root, topicId, anchor) {
    const { esc, $, $$, byId, wikiUrl, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load game mechanics.</b><br>${esc(e.message)}</div>`; return; }
    const topic = data.topics.find(t => t.anchor === topicId) || data.topics.find(t => CALCS[t.anchor]) || data.topics[0];
    document.title = `${topic.title} · Game Mechanics · PD2 Wiki`;
    const page = byId(data.page);
    const calc = CALCS[topic.anchor];
    const i = data.topics.indexOf(topic);
    const prev = data.topics[i - 1], next = data.topics[i + 1];
    root.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/mechanics">Game Mechanics</a></nav>
      <div class="mech">
        <nav class="mech-topics" aria-label="Topics"><ol>${data.topics.map(t => `<li><a href="#/mechanics/${encodeURIComponent(t.anchor)}" class="${t === topic ? 'on' : ''}"${t === topic ? ' aria-current="page"' : ''}>${esc(t.title)}${CALCS[t.anchor] ? '<i title="Has a calculator">calc</i>' : ''}</a></li>`).join('')}</ol>
          <p class="mech-rel">Related tools</p><ol class="mech-rel-l"><li><a href="#/breakpoints">Breakpoints</a></li><li><a href="#/classes">Stat planner</a></li><li><a href="/pd2-ias-calc/">IAS calculator</a></li><li><a href="#/glossary">Abbreviations</a></li></ol></nav>
        <article class="mech-main">
          <h1 class="page-title">${esc(topic.title)}</h1>
          ${topic.subs.length ? `<div class="chips mech-subs">${topic.subs.map(s => `<a class="chip" href="#/mechanics/${encodeURIComponent(topic.anchor)}#${encodeURIComponent(s.anchor)}">${esc(s.title)}</a>`).join('')}</div>` : ''}
          ${calc ? `<section class="calc" aria-label="${esc(calc.title)}"><h2>${esc(calc.title)}</h2>${calc.html()}</section>` : ''}
          <div class="wiki mech-body">${topic.html}</div>
          <nav class="pager">${prev ? `<a href="#/mechanics/${encodeURIComponent(prev.anchor)}">← ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="#/mechanics/${encodeURIComponent(next.anchor)}">${esc(next.title)} →</a>` : ''}</nav>
          <p class="attrib">From <a href="${page ? wikiUrl(page.title, topic.anchor) : '#'}" target="_blank" rel="noopener">Game Mechanics</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Calculators follow the formulas on that page.</p>
        </article>
      </div>`;
    enhanceFragment($('.mech-body', root), page);
    if (calc) {
      const box = $('.calc', root), out = $('.cout', box);
      const v = (id, raw) => { const el = $('#' + id, box); return raw ? el.value : (parseFloat(el.value) || 0); };
      const run = () => calc.run(v, out);
      box.addEventListener('input', run);
      box.addEventListener('change', run);
      run();
    }
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
    if (matchMedia('(max-width: 900px)').matches) $('.mech-topics a.on', root)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  window.PD2Mech = { load, render, F, get data() { return data; } };
})();
