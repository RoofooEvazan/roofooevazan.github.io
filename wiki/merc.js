/* Act 2 merc weapon comparison, built from the "Weapon Comparison for Act 2 Mercenaries"
 * Google Sheet that tools/wiki-sync/sync.mjs copies into data/merc-weapons.json daily.
 *
 * The sheet has a breakpoint table (Total Attack Speed breakpoints and the item IAS each
 * weapon speed modifier needs) and a weapon table (relative DPS at each breakpoint).
 * Parsing finds those by their labels, so moved rows or new weapons still work.
 * Attack speed uses PD2's formula: TAS = floor(120*IAS / (120+IAS)) + skill IAS - WSM,
 * which reproduces every IAS value in the sheet's own breakpoint table.
 */
(function () {
  'use strict';

  const num = s => { const v = String(s ?? '').trim(); return /^[+\-]?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : null; };
  const eias = ias => Math.floor(120 * ias / (120 + ias));

  // Smallest item IAS whose effective IAS reaches `need`.
  function iasFor(need) {
    if (need <= 0) return 0;
    if (need >= 120) return Infinity;
    let i = Math.ceil(120 * need / (120 - need));
    while (i > 0 && eias(i - 1) >= need) i--;
    while (eias(i) < need) i++;
    return i;
  }

  function parse(grid) {
    const find = test => {
      for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) if (test(String(grid[r][c]).trim(), r, c)) return [r, c];
      return null;
    };
    const tasAt = find(v => /^total attack speed$/i.test(v));
    if (!tasAt) throw new Error('no "Total Attack Speed" row');
    const [tr, tc] = tasAt;
    const bps = [];
    for (let c = tc + 1; c < grid[tr].length; c++) {
      const v = num(grid[tr][c]);
      if (v !== null) bps.push({ tas: v, col: c });
      else if (bps.length && String(grid[tr][c]).trim() === '' && num(grid[tr][c + 1]) === null) break;
    }
    if (bps.length < 4) throw new Error('breakpoint row too short');

    const wsmRows = [];
    for (let r = tr + 1; r < Math.min(grid.length, tr + 12); r++) {
      for (let c = 0; c < bps[0].col; c++) {
        const m = String(grid[r][c]).trim().match(/^([+\-]?\d+)\s*WSM$/i);
        if (m) wsmRows.push({ wsm: +m[1], ias: bps.map(b => num(grid[r][b.col])) });
      }
    }

    // Weapon table header: a row with Str, Dex, Sockets, WSM and Weapon near the left edge.
    const headAt = find((v, r, c) => /^weapon$/i.test(v) && c < bps[0].col &&
      grid[r].slice(0, c).some(x => /^str$/i.test(String(x).trim())));
    if (!headAt) throw new Error('no weapon table header');
    const [hr, nameCol] = headAt;
    const colOf = label => grid[hr].slice(0, nameCol).findIndex(x => String(x).trim().toLowerCase() === label);
    const cStr = colOf('str'), cDex = colOf('dex'), cSock = colOf('sockets'), cWsm = colOf('wsm');

    const weapons = [];
    let lastWsm = null;
    for (let r = hr + 1; r < grid.length; r++) {
      const name = String(grid[r][nameCol]).trim();
      if (!name) { if (weapons.length) break; continue; }
      const dps = bps.map(b => num(grid[r][b.col]));
      if (!dps.some(v => v !== null)) break;
      const w = num(grid[r][cWsm]);
      if (w !== null) lastWsm = w;          // blank WSM cells are merged with the row above
      weapons.push({
        name,
        str: cStr >= 0 ? num(grid[r][cStr]) : null,
        dex: cDex >= 0 ? num(grid[r][cDex]) : null,
        sockets: cSock >= 0 ? num(grid[r][cSock]) : null,
        wsm: lastWsm ?? 0,
        dps,
      });
    }
    if (!weapons.length) throw new Error('no weapons found');

    // Every other text cell is a title or a note worth showing.
    const used = new Set(['total attack speed', 'increased attack speed', 'breakpoint type', 'breakpoints', 'relative dps per breakpoint',
      'str', 'dex', 'sockets', 'wsm', 'weapon', ...weapons.map(w => w.name.toLowerCase())]);
    const texts = [];
    for (const row of grid) for (const cell of row) {
      const v = String(cell).trim();
      if (v && num(v) === null && v !== '*' && !/^[+\-]?\d+\s*WSM$/i.test(v) && !used.has(v.toLowerCase()) && !texts.includes(v)) texts.push(v);
    }
    const title = texts.find(t => /comparison/i.test(t)) || texts[0] || 'Weapon Comparison for Act 2 Mercenaries';
    const notes = texts.filter(t => t !== title && !/highest dps .* bolded/i.test(t));

    // Sanity check the formula against the sheet's own IAS table.
    const mismatches = [];
    for (const row of wsmRows) row.ias.forEach((v, i) => {
      if (v === null) return;
      const need = iasFor(bps[i].tas + row.wsm);
      if (need !== v) mismatches.push(`${row.wsm} WSM, TAS ${bps[i].tas}: sheet ${v}, formula ${need}`);
    });
    return { title, notes, bps, wsmRows, weapons, mismatches };
  }

  // DPS for one weapon at an item IAS and skill IAS.
  function evaluate(d, w, ias, skill) {
    const tas = eias(ias) + skill - w.wsm;
    let at = -1;
    for (let i = 0; i < d.bps.length; i++) if (d.bps[i].tas <= tas && w.dps[i] !== null) at = i;
    if (at < 0) at = w.dps.findIndex(v => v !== null);
    let next = null;
    for (let i = at + 1; i < d.bps.length; i++) {
      if (w.dps[i] === null) continue;
      const need = iasFor(d.bps[i].tas - skill + w.wsm);
      if (need !== Infinity) next = { i, ias: need, dps: w.dps[i] };
      break;
    }
    return { tas, at, dps: w.dps[at], next };
  }

  const STORE = 'pd2wiki-merc';
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
  const save = s => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch {} };

  async function render(root, h) {
    const { fetchJSON, esc } = h;
    let raw, d;
    try {
      raw = await fetchJSON('data/merc-weapons.json');
      d = parse(raw.grid);
    } catch (e) {
      if (!raw) { root.innerHTML = `<div class="error"><b>Couldn't load the merc weapon data.</b><br>${esc(e.message)}</div>`; return; }
      root.innerHTML = rawTable(raw, esc, e.message);
      return;
    }
    if (d.mismatches.length) console.warn('Merc sheet vs formula:', d.mismatches);

    const saved = load();
    const st = {
      ias: Number.isFinite(saved.ias) ? saved.ias : 0,
      skill: Number.isFinite(saved.skill) ? saved.skill : 0,
      str: saved.str ?? '', dex: saved.dex ?? '',
      pick: saved.pick || null, hover: null,
    };
    const MAX = 200;

    root.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><span>Tools</span></nav>
      <h1 class="page-title">Act 2 Merc Weapon Compare</h1>
      <div class="page-meta">
        <span>${esc(d.title)}</span>
        <a href="${esc(raw.source)}" target="_blank" rel="noopener">Open the spreadsheet <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>
        <a href="${h.pageHref('Mercenaries')}">Mercenaries page</a>
      </div>

      <section class="mw-controls" aria-label="Your mercenary">
        <div class="mw-field mw-ias">
          <label for="mw-ias">Item IAS</label>
          <div class="mw-stepper">
            <button type="button" data-step="-1" aria-label="Previous breakpoint">‹</button>
            <input id="mw-ias" type="number" inputmode="numeric" min="0" max="456" value="${st.ias}">
            <button type="button" data-step="1" aria-label="Next breakpoint">›</button>
          </div>
          <input id="mw-ias-range" type="range" min="0" max="${MAX}" value="${Math.min(st.ias, MAX)}" aria-label="Item IAS slider">
          <div class="mw-ticks" aria-hidden="true"></div>
        </div>
        <div class="mw-field">
          <label for="mw-skill">Skill IAS</label>
          <input id="mw-skill" type="number" inputmode="numeric" min="0" max="200" value="${st.skill}">
          <small>From auras or skills, e.g. a Fanaticism aura. The sheet assumes 0.</small>
        </div>
        <div class="mw-field mw-stats">
          <span class="mw-label">Merc stats <small>(optional)</small></span>
          <div><input id="mw-str" type="number" inputmode="numeric" min="0" placeholder="Str" aria-label="Merc strength" value="${esc(st.str)}">
          <input id="mw-dex" type="number" inputmode="numeric" min="0" placeholder="Dex" aria-label="Merc dexterity" value="${esc(st.dex)}"></div>
          <small>Marks weapons your merc can't equip.</small>
        </div>
      </section>

      <div class="mw-best">
        <div class="mw-best-head"><b>Best weapon by item IAS</b><span>Tap a band to jump there.</span></div>
        <div class="mw-band" role="group" aria-label="Best weapon at each IAS range"></div>
        <div class="mw-band-axis"><span>0</span><span>50</span><span>100</span><span>150</span><span>${MAX} IAS</span></div>
      </div>

      <div class="mw-grid">
        <section class="mw-panel">
          <h2 class="home-h">Ranking at <span class="mw-cur"></span></h2>
          <ol class="mw-rank"></ol>
          <p class="mw-foot">Relative DPS from the sheet; higher is better. Hover or tap a weapon to trace it on the chart.</p>
        </section>
        <section class="mw-panel">
          <h2 class="home-h">DPS by item IAS</h2>
          <div class="mw-chart"></div>
          <div class="mw-tip" hidden></div>
        </section>
      </div>

      <h2 class="home-h">Attack speed breakpoints</h2>
      <p class="mw-foot">Item IAS each weapon speed needs to reach each Total Attack Speed breakpoint${st.skill ? '' : ''}, with your skill IAS applied. The highlighted cell is where you are now.</p>
      <div class="tw"><table class="wikitable mw-bp"></table></div>

      <h2 class="home-h">About this data</h2>
      <ul class="mw-notes">
        <li>Total Attack Speed = effective item IAS + skill IAS − weapon speed modifier (WSM). Effective item IAS = ⌊120 × IAS ÷ (120 + IAS)⌋.</li>
        ${d.notes.filter(n => !/^total attack speed =/i.test(n) && !/^increased attack speed/i.test(n)).map(n => `<li>${esc(n)}</li>`).join('')}
        <li>Copied from <a href="${esc(raw.source)}" target="_blank" rel="noopener">the spreadsheet</a> every day along with the wiki; last changed ${esc(new Date(raw.fetched).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))}.</li>
      </ul>`;

    injectStyles();
    const $ = s => root.querySelector(s);
    const iasIn = $('#mw-ias'), range = $('#mw-ias-range'), skillIn = $('#mw-skill'), strIn = $('#mw-str'), dexIn = $('#mw-dex');

    // Every IAS where any weapon changes breakpoint, for the stepper and slider ticks.
    const stops = () => {
      const s = new Set([0]);
      for (const w of d.weapons) for (let i = 0; i < d.bps.length; i++) {
        if (w.dps[i] === null) continue;
        const need = iasFor(d.bps[i].tas - st.skill + w.wsm);
        if (need !== Infinity && need <= 456) s.add(need);
      }
      return [...s].sort((a, b) => a - b);
    };

    const canUse = w => (st.str === '' || w.str === null || +st.str >= w.str) && (st.dex === '' || w.dex === null || +st.dex >= w.dex);

    function bestAt(ias) {
      let best = null;
      for (const w of d.weapons) {
        if (!canUse(w)) continue;
        const e = evaluate(d, w, ias, st.skill);
        if (!best || e.dps > best.dps) best = { w, dps: e.dps };
      }
      return best;
    }

    function drawBand() {
      const band = $('.mw-band');
      const segs = [];
      for (let i = 0; i <= MAX; i++) {
        const b = bestAt(i);
        const name = b ? b.w.name : '—';
        if (segs.length && segs[segs.length - 1].name === name) segs[segs.length - 1].to = i;
        else segs.push({ name, from: i, to: i });
      }
      band.innerHTML = segs.map((s, k) => {
        const pct = (s.to - s.from + 1) / (MAX + 1) * 100;
        const on = st.ias >= s.from && (st.ias <= s.to || (k === segs.length - 1 && st.ias > MAX));
        return `<button type="button" class="mw-seg${on ? ' on' : ''}${k % 2 ? ' alt' : ''}" style="flex-basis:${pct}%" data-ias="${s.from}"
          title="${esc(s.name)}: ${s.from}–${s.to} IAS"><span>${esc(s.name)}</span><em>${s.from}–${s.to}</em></button>`;
      }).join('');
    }

    function drawTicks() {
      $('.mw-ticks').innerHTML = stops().filter(v => v <= MAX).map(v => `<i style="left:${v / MAX * 100}%"></i>`).join('');
    }

    function drawRank() {
      const rows = d.weapons.map((w, k) => ({ w, k, e: evaluate(d, w, st.ias, st.skill), ok: canUse(w) }));
      rows.sort((a, b) => (b.ok - a.ok) || (b.e.dps - a.e.dps) || a.k - b.k);   // ties keep the sheet's order
      const top = rows.find(r => r.ok)?.e.dps || 1;
      const nTop = rows.filter(r => r.ok && r.e.dps === top).length;
      const lo = Math.min(...rows.map(r => r.e.dps)) * 0.9;
      $('.mw-cur').textContent = `${st.ias} IAS${st.skill ? ` + ${st.skill} skill` : ''}`;
      $('.mw-rank').innerHTML = rows.map((r, i) => {
        const { w, e } = r;
        const pct = Math.max(4, (e.dps - lo) / (top - lo) * 100);
        const diff = e.dps / top * 100 - 100;
        const next = e.next ? `+${e.next.ias - st.ias} IAS → <b>${e.next.dps}</b> at ${e.next.ias}` : 'At the last breakpoint';
        const pick = st.pick === w.name;
        const isBest = r.ok && e.dps === top;
        return `<li class="${isBest ? 'best ' : ''}${r.ok ? '' : 'no '}${pick ? 'pick' : ''}" data-w="${esc(w.name)}" tabindex="0">
          <span class="mw-pos">${r.ok ? i + 1 : '–'}</span>
          <span class="mw-name"><b>${esc(w.name)}</b><small>${w.sockets ?? '?'} os · ${w.wsm > 0 ? '+' : ''}${w.wsm} WSM${w.str !== null ? ` · ${w.str} Str` : ''}${w.dex !== null ? ` / ${w.dex} Dex` : ''}${r.ok ? '' : ' · can’t equip'}</small></span>
          <span class="mw-val"><span class="mw-bar"><i style="width:${pct}%"></i></span><b>${e.dps}</b><small>${isBest ? (nTop > 1 ? 'tied' : 'best') : (diff < 0 ? diff.toFixed(1) + '%' : '')}</small></span>
          <span class="mw-next">TAS ${e.tas} · breakpoint ${d.bps[e.at].tas}<br>${next}</span>
        </li>`;
      }).join('');
    }

    let chartW = 0;
    function drawChart() {
      const box = $('.mw-chart');
      const W = Math.max(300, box.clientWidth || 600), H = Math.round(Math.min(360, Math.max(240, W * 0.55)));
      chartW = W;
      const pad = { l: 38, r: 12, t: 12, b: 28 };
      const series = d.weapons.map(w => {
        const pts = [];
        for (let i = 0; i <= MAX; i++) pts.push(evaluate(d, w, i, st.skill).dps);
        return { w, pts, ok: canUse(w) };
      });
      const all = series.flatMap(s => s.pts);
      const y0 = Math.floor(Math.min(...all) / 5) * 5, y1 = Math.ceil(Math.max(...all) / 5) * 5;
      const X = i => pad.l + i / MAX * (W - pad.l - pad.r);
      const Y = v => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
      const path = pts => {
        let s = `M${X(0).toFixed(1)},${Y(pts[0]).toFixed(1)}`;
        for (let i = 1; i <= MAX; i++) if (pts[i] !== pts[i - 1]) s += `H${X(i).toFixed(1)}V${Y(pts[i]).toFixed(1)}`;
        return s + `H${X(MAX).toFixed(1)}`;
      };
      const best = bestAt(Math.min(st.ias, MAX));
      const focus = st.hover || st.pick || best?.w.name;
      const ticksY = [];
      for (let v = y0; v <= y1; v += (y1 - y0 > 40 ? 10 : 5)) ticksY.push(v);
      const f = series.find(s => s.w.name === focus);
      box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Relative DPS of each weapon from 0 to ${MAX} item IAS">
        ${ticksY.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" class="g"/><text x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
        ${[0, 50, 100, 150, 200].map(v => `<text x="${X(v)}" y="${H - 8}" text-anchor="middle">${v}</text>`).join('')}
        ${series.filter(s => s.w.name !== focus).map(s => `<path d="${path(s.pts)}" class="ln${s.ok ? '' : ' no'}" data-w="${esc(s.w.name)}"/>`).join('')}
        ${f ? `<path d="${path(f.pts)}" class="ln on"/>` : ''}
        <line class="cur" x1="${X(Math.min(st.ias, MAX))}" x2="${X(Math.min(st.ias, MAX))}" y1="${pad.t}" y2="${H - pad.b}"/>
        <line class="hov" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
        ${f ? `<text class="lbl" x="${X(MAX) - 4}" y="${Y(f.pts[MAX]) - 7}" text-anchor="end">${esc(f.w.name)}</text>` : ''}
        <rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}"/>
      </svg>`;
      const svg = box.querySelector('svg'), hov = svg.querySelector('.hov'), tip = root.querySelector('.mw-tip');
      const iasAt = ev => {
        const r = svg.getBoundingClientRect();
        return Math.max(0, Math.min(MAX, Math.round((ev.clientX - r.left - pad.l) / (W - pad.l - pad.r) * MAX)));
      };
      const hit = svg.querySelector('.hit');
      hit.addEventListener('pointermove', ev => {
        const i = iasAt(ev);
        hov.setAttribute('x1', X(i)); hov.setAttribute('x2', X(i)); hov.setAttribute('visibility', 'visible');
        const list = series.filter(s => s.ok).map(s => ({ n: s.w.name, v: s.pts[i] })).sort((a, b) => b.v - a.v).slice(0, 4);
        tip.innerHTML = `<b>${i} IAS</b>${list.map((x, k) => `<span${k === 0 ? ' class="top"' : ''}>${esc(x.n)}<em>${x.v}</em></span>`).join('')}`;
        tip.hidden = false;
        const br = box.getBoundingClientRect();
        const left = X(i) + 14 + 170 > W ? X(i) - 14 - 170 : X(i) + 14;
        tip.style.left = left + 'px';
        tip.style.top = (box.offsetTop + 10) + 'px';
      });
      hit.addEventListener('pointerleave', () => { hov.setAttribute('visibility', 'hidden'); tip.hidden = true; });
      hit.addEventListener('click', ev => setIas(iasAt(ev)));
    }

    function drawTable() {
      const t = $('.mw-bp');
      const wsms = [...new Set([...d.wsmRows.map(r => r.wsm), ...d.weapons.map(w => w.wsm)])].sort((a, b) => b - a);
      const names = wsm => d.weapons.filter(w => w.wsm === wsm).map(w => w.name).join(', ');
      t.innerHTML = `<tbody><tr><th>WSM</th>${d.bps.map(b => `<th>${b.tas}</th>`).join('')}</tr>
        ${wsms.map(wsm => {
          const tas = eias(st.ias) + st.skill - wsm;
          let at = -1;
          const cells = d.bps.map((b, i) => {
            const need = iasFor(b.tas - st.skill + wsm);
            if (need === Infinity || need > 999) return '';
            const prevNeed = i > 0 ? iasFor(d.bps[i - 1].tas - st.skill + wsm) : -1;
            if (need === 0 && prevNeed === 0 && i < d.bps.length - 1 && iasFor(d.bps[i + 1].tas - st.skill + wsm) === 0) return 'skip';
            if (b.tas <= tas) at = i;
            return need;
          });
          return `<tr><th title="${esc(names(wsm))}">${wsm > 0 ? '+' : ''}${wsm}<small>${esc(names(wsm))}</small></th>${cells.map((c, i) =>
            `<td class="${i === at ? 'on' : ''}${c === 'skip' || c === '' ? ' x' : ''}">${c === 'skip' ? '' : c}</td>`).join('')}</tr>`;
        }).join('')}</tbody>`;
      const first = t.rows[0];
      first.cells[0].innerHTML = 'WSM <small>TAS →</small>';
    }

    function drawAll() {
      iasIn.value = st.ias; range.value = Math.min(st.ias, MAX);
      drawBand(); drawTicks(); drawRank(); drawChart(); drawTable();
      save({ ias: st.ias, skill: st.skill, str: st.str, dex: st.dex, pick: st.pick });
    }

    function setIas(v) {
      v = Math.max(0, Math.min(456, Math.round(+v || 0)));
      st.ias = v;
      drawAll();
    }

    iasIn.addEventListener('input', () => setIas(iasIn.value));
    range.addEventListener('input', () => setIas(range.value));
    skillIn.addEventListener('input', () => { st.skill = Math.max(0, Math.min(200, Math.round(+skillIn.value || 0))); drawAll(); });
    strIn.addEventListener('input', () => { st.str = strIn.value; drawAll(); });
    dexIn.addEventListener('input', () => { st.dex = dexIn.value; drawAll(); });
    root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
      const s = stops();
      const dir = +b.dataset.step;
      const nxt = dir > 0 ? s.find(v => v > st.ias) : [...s].reverse().find(v => v < st.ias);
      if (nxt !== undefined) setIas(nxt);
    }));
    $('.mw-band').addEventListener('click', e => { const b = e.target.closest('[data-ias]'); if (b) setIas(b.dataset.ias); });
    const rank = $('.mw-rank');
    const pickFrom = e => e.target.closest('li[data-w]')?.dataset.w;
    rank.addEventListener('pointerover', e => { const n = pickFrom(e); if (n && n !== st.hover) { st.hover = n; drawChart(); } });
    rank.addEventListener('pointerleave', () => { st.hover = null; drawChart(); });
    rank.addEventListener('click', e => {
      const n = pickFrom(e); if (!n) return;
      st.pick = st.pick === n ? null : n; st.hover = null; drawAll();
    });
    rank.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.target.click(); } });

    let rt;
    const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (!root.contains($('.mw-chart'))) return ro.disconnect(); if ($('.mw-chart').clientWidth !== chartW) drawChart(); }, 120); });
    ro.observe($('.mw-chart'));
    drawAll();
  }

  function rawTable(raw, esc, why) {
    const rows = raw.grid.filter(r => r.some(c => c !== ''));
    return `<h1 class="page-title">Act 2 Merc Weapon Compare</h1>
      <div class="page-meta">The spreadsheet's layout changed (${esc(why)}), so here it is as-is. <a href="${esc(raw.source)}" target="_blank" rel="noopener">Open the spreadsheet</a></div>
      <div class="tw"><table class="wikitable"><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  let styled = false;
  function injectStyles() {
    if (styled) return;
    styled = true;
    const s = document.createElement('style');
    s.textContent = `
.mw-controls{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr);gap:14px;margin:0 0 18px}
.mw-field{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:10px;background:linear-gradient(180deg,var(--stone-2),var(--stone));border:1px solid var(--edge)}
.mw-field label,.mw-label{font-family:var(--font-display);font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}
.mw-field small{color:var(--dim);font-size:13px;line-height:1.35;font-family:var(--font-body);letter-spacing:0;text-transform:none}
.mw-field input[type=number]{height:40px;width:100%;padding:0 10px;border-radius:8px;border:1px solid var(--edge);background:#0d0b08;color:var(--text);font:inherit;font-size:18px;font-variant-numeric:tabular-nums}
.mw-field input[type=number]:focus{outline:none;border-color:var(--gold)}
.mw-stats > div{display:flex;gap:8px}
.mw-stepper{display:flex;gap:6px}
.mw-stepper input{text-align:center;font-weight:700;color:var(--gold-hi)!important}
.mw-stepper button{flex:none;width:44px;height:40px;border-radius:8px;border:1px solid var(--edge);background:#0d0b08;color:var(--gold-hi);font-size:22px;line-height:1;cursor:pointer}
.mw-stepper button:hover{border-color:var(--edge-hi)}
.mw-ias{position:relative}
.mw-ias input[type=range]{width:100%;accent-color:var(--gold);margin:6px 0 0;height:26px}
.mw-ticks{position:relative;height:6px;margin:-4px 8px 0}
.mw-ticks i{position:absolute;top:0;width:1px;height:6px;background:var(--edge-hi)}
.mw-best{margin:0 0 22px}
.mw-best-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:6px;font-size:14.5px}
.mw-best-head b{color:var(--text);font-weight:500}
.mw-best-head span{color:var(--dim)}
.mw-band{display:flex;height:46px;border-radius:8px;overflow:hidden;border:1px solid var(--edge)}
.mw-seg{min-width:0;border:0;border-right:1px solid #0d0b08;background:#2a2016;color:var(--muted);padding:3px 5px;cursor:pointer;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;text-align:left;overflow:hidden;font-size:12.5px;line-height:1.2}
.mw-seg.alt{background:#211a12}
.mw-seg span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;color:var(--text)}
.mw-seg em{font-style:normal;color:var(--dim);font-size:11.5px;white-space:nowrap}
.mw-seg:hover{background:#3a2c1c}
.mw-seg.on{background:linear-gradient(180deg,#6b5534,#4a3a22);color:var(--gold-hi)}
.mw-seg.on span{color:var(--gold-hi);font-weight:700}
.mw-seg.on em{color:var(--text)}
.mw-band-axis{display:flex;justify-content:space-between;color:var(--dim);font-size:12.5px;margin-top:3px}
.mw-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:26px;align-items:start}
.mw-panel{position:relative;min-width:0}
.mw-panel .home-h{margin-top:0}
.mw-cur{color:var(--gold-hi);text-transform:none;letter-spacing:.02em}
.mw-rank{list-style:none;margin:0;padding:0}
.mw-rank li{display:grid;grid-template-columns:26px minmax(0,1.1fr) minmax(0,1fr);grid-template-areas:"pos name val" ". next next";gap:2px 10px;align-items:center;padding:9px 10px;border-radius:8px;border:1px solid transparent;cursor:pointer}
.mw-rank li:nth-child(odd){background:rgba(20,17,13,.7)}
.mw-rank li:hover,.mw-rank li:focus-visible{border-color:var(--edge-hi);outline:none}
.mw-rank li.pick{border-color:var(--gold)}
.mw-rank li.best{background:linear-gradient(90deg,rgba(217,178,95,.16),rgba(20,17,13,.7))}
.mw-rank li.no{opacity:.45}
.mw-pos{grid-area:pos;font-family:var(--font-display);color:var(--dim);text-align:center}
.mw-rank li.best .mw-pos{color:var(--gold-hi)}
.mw-name{grid-area:name;min-width:0}
.mw-name b{display:block;color:var(--text);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mw-name small,.mw-next{color:var(--dim);font-size:13px;line-height:1.35}
.mw-val{grid-area:val;display:grid;grid-template-columns:minmax(0,1fr) auto 50px;align-items:center;gap:8px}
.mw-val b{font-variant-numeric:tabular-nums;color:var(--text);font-size:17px}
.mw-rank li.best .mw-val b{color:var(--gold-hi)}
.mw-val small{color:var(--dim);font-size:12.5px;text-align:right;font-variant-numeric:tabular-nums}
.mw-bar{height:8px;border-radius:4px;background:#0d0b08;overflow:hidden}
.mw-bar i{display:block;height:100%;border-radius:4px;background:#6b5534}
.mw-rank li.best .mw-bar i,.mw-rank li.pick .mw-bar i{background:var(--gold)}
.mw-next{grid-area:next}
.mw-next b{color:var(--muted);font-weight:500}
.mw-foot{color:var(--dim);font-size:14px;margin:8px 0 0}
.mw-chart{width:100%;min-height:240px;touch-action:pan-y}
.mw-chart svg{display:block;width:100%;height:auto;overflow:visible}
.mw-chart text{fill:var(--dim);font:12px var(--font-body)}
.mw-chart .g{stroke:#2a2016;stroke-width:1}
.mw-chart .ln{fill:none;stroke:#5a4a33;stroke-width:1.5;stroke-linejoin:round}
.mw-chart .ln.no{stroke:#2e261c}
.mw-chart .ln.on{stroke:var(--gold-hi);stroke-width:3}
.mw-chart .cur{stroke:var(--gold);stroke-width:1.5;stroke-dasharray:4 3}
.mw-chart .hov{stroke:var(--muted);stroke-width:1}
.mw-chart .lbl{fill:var(--gold-hi);font-weight:700;font-size:13px;paint-order:stroke;stroke:#070605;stroke-width:4px}
.mw-chart .hit{fill:transparent;cursor:crosshair}
.mw-tip{position:absolute;z-index:5;width:170px;pointer-events:none;padding:8px 10px;border-radius:8px;background:#100d0a;border:1px solid var(--edge-hi);box-shadow:0 10px 24px rgba(0,0,0,.6);font-size:13.5px}
.mw-tip b{display:block;color:var(--gold-hi);margin-bottom:3px}
.mw-tip span{display:flex;justify-content:space-between;gap:8px;color:var(--muted)}
.mw-tip span.top{color:var(--text)}
.mw-tip em{font-style:normal;font-variant-numeric:tabular-nums}
.wiki-free .mw-bp,.mw-bp{font-size:14px;font-variant-numeric:tabular-nums;border-collapse:collapse;background:#1c150e}
.mw-bp th,.mw-bp td{border:1px solid #2a1f14;padding:.35em .55em;text-align:center}
.mw-bp th{background:#382b1b;color:#edcf8b;font-weight:600;white-space:nowrap}
.mw-bp tr > th:first-child{text-align:left;position:sticky;left:0;z-index:1}
.mw-bp th small{display:block;font-weight:400;color:var(--muted);font-size:11.5px;max-width:190px;white-space:normal}
.mw-bp td{color:var(--body)}
.mw-bp td.x{background:#140f0a}
.mw-bp td.on{background:var(--gold);color:#140f0a;font-weight:700}
.mw-notes{color:var(--muted);padding-left:1.2em}
.mw-notes li{margin:.25em 0}
@media (max-width:1100px){.mw-grid{grid-template-columns:1fr}}
@media (max-width:760px){
  .mw-controls{grid-template-columns:1fr 1fr}
  .mw-ias{grid-column:1/-1}
  .mw-seg em{display:none}
  .mw-seg{font-size:11px;padding:2px 3px}
  .mw-best-head span{display:none}
}
@media (max-width:480px){
  .mw-controls{gap:10px}
  .mw-field{padding:12px}
  .mw-stats > div{flex-direction:column}
  .mw-rank li{grid-template-columns:22px minmax(0,1fr);grid-template-areas:"pos name" ". val" ". next"}
  .mw-tip{display:none}
}`;
    document.head.appendChild(s);
  }

  window.MercTool = { render, parse, evaluate, iasFor, eias };
})();
