// Turns the mirrored wiki pages into structured data for the reader's own views:
//   items.json          every unique, set item and runeword, with stats and PD2 changes
//   skills/<Class>.json every class skill, grouped by tree
// plus `targets`, a map from "pageId#anchor" to the reader route that now shows it, so
// wiki links like [[Grief]] open the item card instead of a long wiki page.
//
// Parsing is by the wiki's own markup conventions (item-info-box, Before/After tables,
// d2-gold / d2-green headings, skill-info). Anything that doesn't fit is simply left
// to the page view, so a wiki layout change degrades gracefully rather than breaking.

import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SLOT_PAGES = {
  Axes: ['Weapon', 'Axe'], Maces: ['Weapon', 'Mace'], Swords: ['Weapon', 'Sword'], Daggers: ['Weapon', 'Dagger'],
  Throwing: ['Weapon', 'Throwing'], Spears: ['Weapon', 'Spear'], Polearms: ['Weapon', 'Polearm'], Bows: ['Weapon', 'Bow'],
  Crossbows: ['Weapon', 'Crossbow'], Staves: ['Weapon', 'Staff'], Wands: ['Weapon', 'Wand'], Scepters: ['Weapon', 'Scepter'],
  'Class Weapons': ['Weapon', 'Class Weapon'], Arrows: ['Quiver'],
  Helms: ['Helm'], Chests: ['Armor'], Shields: ['Shield'], Gloves: ['Gloves'], Boots: ['Boots'], Belts: ['Belt'],
  Quivers: ['Quiver'], Amulets: ['Amulet'], Rings: ['Ring'], Charms: ['Charm'], Jewel: ['Jewel'],
};
const RW_PAGES = { RWHelms: 'Helm', RWChests: 'Armor', RWShields: 'Shield', RWQuivers: 'Quiver', RWWeapons: 'Weapon' };
const SET_PAGES = ['Normal', 'Exceptional', 'Elite'];
const EXTRA_PAGES = ['New Equipment', 'Cosmetics'];
export const CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];

const text = el => (el?.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const fixUrl = u => (u || '').replace(/^\/\//, 'https://');
const slug = s => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clean = html => (html || '').replace(/\s+style="[^"]*"/g, '').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();

function headingOf(el) {
  const h = el.matches?.('.mw-heading') ? el.querySelector('h1,h2,h3,h4,h5,h6') : null;
  return h ? { h, level: +h.tagName[1], id: h.id, text: text(h) } : null;
}

// Elements after a heading wrapper, up to the next heading of the same or higher level
// (or any heading when `stopAtAny`).
function sectionAfter(wrapper, level, stopAtAny = true) {
  const out = [];
  for (let n = wrapper.nextElementSibling; n; n = n.nextElementSibling) {
    const h = headingOf(n);
    if (h && (stopAtAny || h.level <= level)) break;
    out.push(n);
  }
  return out;
}

// Reads an item-info-box: first bold line is the base (or runeword sockets), then
// "Label: value" lines, with the base's own properties in a nested list.
function readInfo(box) {
  const lines = [];
  let head = '', headHtml = '';
  const ps = [...box.children].flatMap(c => c.tagName === 'UL' ? [...c.querySelectorAll('li')].map(li => ({ el: li, base: true })) : c.tagName === 'P' ? [{ el: c, base: false }] : []);
  for (const { el, base } of ps) {
    const t = text(el);
    if (!t) continue;
    const b = el.querySelector('b');
    const m = t.match(/^([^:]{2,40}):\s*(.*)$/);
    if (m && b && text(b).endsWith(':')) {
      const clone = el.cloneNode(true);
      clone.querySelector('b')?.remove();
      lines.push({ label: m[1].trim(), html: clean(clone.innerHTML).replace(/^<p>\s*|\s*<\/p>$/g, ''), text: m[2].trim(), base });
    } else if (!head) { head = t; headHtml = clean(el.innerHTML); }
    else lines.push({ label: '', html: clean(el.innerHTML), text: t, base });
  }
  return { head, headHtml, lines };
}

// Before/After (or single "New") stat table -> [{html, old, st}] where st is
// same | changed | new | removed.
function readStats(table) {
  const rows = [...table.querySelectorAll('tr')];
  if (!rows.length) return null;
  const heads = [...rows[0].children].map(text);
  if (!heads.length || rows[0].querySelector('td')) return null;
  const two = heads.length === 2;
  const stats = [];
  for (const r of rows.slice(1)) {
    const cells = [...r.children];
    if (!cells.length) continue;
    const after = two ? cells[1] : cells[0];
    const before = two ? cells[0] : null;
    const at = text(after), bt = before ? text(before) : '';
    if (!at && !bt) continue;
    let st = 'same';
    if (!two) st = /^new$/i.test(heads[0]) ? 'new' : 'same';
    else if (!bt) st = 'new';
    else if (/^removed\b/i.test(at)) st = 'removed';
    else if (bt !== at || after.querySelector('.nmod')) st = 'changed';
    stats.push({ html: clean(after?.innerHTML), ...(st === 'changed' || st === 'removed' ? { old: bt } : {}), st });
  }
  return stats;
}

// One entry: heading wrapper + image + info box + stats table + trailing notes.
function readEntry(wrapper, page) {
  const hd = headingOf(wrapper);
  const els = sectionAfter(wrapper, hd.level);
  let img = '', info = null, stats = null;
  const notes = [];
  for (const el of els) {
    const im = el.matches('.item-image-text,.item-image-table,.shared-bonus-image,figure') ? el.querySelector('img') : null;
    if (im && !img && !info) { img = fixUrl(im.getAttribute('src')); continue; }
    if (el.matches('.item-info-box') && !info) { info = readInfo(el); continue; }
    if (el.matches('table.wikitable') && info && !stats) { stats = readStats(el); if (stats) continue; }
    const h = clean(el.outerHTML);
    if (text(el) && !/^<p>\s*(<br\s*\/?>\s*)*<\/p>$/.test(h)) notes.push(h);
  }
  if (!info) return null;
  return { id: hd.id, name: text(hd.h), img, info, stats: stats || [], notes: notes.join(''), page: page.id, anchor: hd.id };
}

const num = s => { const m = String(s || '').match(/\d+/); return m ? +m[0] : null; };
const reqOf = lines => {
  const r = {};
  for (const l of lines) {
    if (/^Required Level$/i.test(l.label)) r.lvl = num(l.text);
    else if (/^Required Strength$/i.test(l.label)) r.str = num(l.text);
    else if (/^Required Dexterity$/i.test(l.label)) r.dex = num(l.text);
  }
  return r;
};
const tierOf = s => (s.match(/\b(Normal|Exceptional|Elite)\b/) || [])[1] || '';

export async function extract(pages, dir) {
  const byTitle = new Map(pages.map(p => [p.title, p]));
  const docs = new Map();
  const doc = async title => {
    const p = byTitle.get(title);
    if (!p) return null;
    if (!docs.has(title)) {
      const html = await readFile(join(dir, 'pages', `${p.id}.html`), 'utf8');
      docs.set(title, parseHTML(`<html><body>${html}</body></html>`).document);
    }
    return { page: p, d: docs.get(title) };
  };
  const wrappers = d => [...d.querySelectorAll('.mw-heading')];

  const items = [];
  const seen = new Set();
  const setSlot = new Map();
  const sets = [];
  const targets = {};
  const add = (item, page) => {
    const key = `${item.kind}|${item.name}|${item.kind === 'runeword' ? item.group : ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    item.slug = slug(item.name);
    if (items.some(i => i.slug === item.slug)) item.slug += '-' + slug(item.group || item.kind);
    items.push(item);
    targets[`${page.id}#${item.anchor}`] = `item/${item.slug}`;
    return true;
  };

  // Which slot each set item belongs to, from the slot pages that also list them.
  for (const [title, [slot]] of Object.entries(SLOT_PAGES)) {
    const r = await doc(title);
    if (!r) continue;
    for (const w of wrappers(r.d)) {
      const hd = headingOf(w);
      if (hd?.h.querySelector('.d2-green')) setSlot.set(hd.text, slot);
    }
  }

  // Set items, grouped under their set, with each set's shared bonuses.
  for (const title of SET_PAGES) {
    const r = await doc(title);
    if (!r) continue;
    let rarity = '', setName = '', cur = null;
    for (const w of wrappers(r.d)) {
      const hd = headingOf(w);
      if (!hd) continue;
      if (hd.level === 2) rarity = hd.text.replace(/\s*Sets?$/i, '');
      else if (hd.level === 3) {
        setName = hd.text;
        cur = { name: setName, slug: slug(setName), rarity, tier: title === 'Normal' ? 'Normal' : title, items: [], bonuses: [], page: r.page.id, anchor: hd.id };
        sets.push(cur);
        targets[`${r.page.id}#${hd.id}`] = `items?t=set&set=${cur.slug}`;
      } else if (hd.level === 4 && cur) {
        const e = readEntry(w, r.page);
        if (!e) continue;
        if (/^Set Bonuses for/i.test(hd.text)) { cur.bonuses = e.stats; continue; }
        if (!hd.h.querySelector('.d2-green')) continue;
        const item = {
          kind: 'set', name: e.name, set: setName, setSlug: cur.slug, group: setName, slot: setSlot.get(e.name) || 'Weapon',
          base: e.info.head, tier: cur.tier, rarity, req: reqOf(e.info.lines), img: e.img,
          info: e.info.lines, stats: e.stats, notes: e.notes, page: e.page, anchor: e.anchor,
        };
        if (add(item, r.page)) cur.items.push(item.slug);
      }
    }
  }

  // Uniques from the slot pages (and a few pages of new items).
  for (const title of [...Object.keys(SLOT_PAGES), ...EXTRA_PAGES]) {
    const r = await doc(title);
    if (!r) continue;
    const [slot, sub] = SLOT_PAGES[title] || ['Other'];
    let tierCtx = '';
    for (const w of wrappers(r.d)) {
      const hd = headingOf(w);
      if (!hd) continue;
      if (!hd.h.querySelector('.d2-gold')) { tierCtx = tierOf(hd.text) || (hd.level <= 3 ? '' : tierCtx); continue; }
      const e = readEntry(w, r.page);
      if (!e) continue;
      const item = {
        kind: 'unique', name: e.name, group: title, slot, ...(sub ? { sub } : {}),
        base: e.info.head, tier: tierCtx, req: reqOf(e.info.lines), img: e.img,
        info: e.info.lines, stats: e.stats, notes: e.notes, page: e.page, anchor: e.anchor,
      };
      if (!add(item, r.page)) targets[`${r.page.id}#${e.anchor}`] = `item/${items.find(i => i.kind === 'unique' && i.name === e.name)?.slug}`;
    }
  }

  // Runewords.
  for (const [title, slot] of Object.entries(RW_PAGES)) {
    const r = await doc(title);
    if (!r) continue;
    for (const w of wrappers(r.d)) {
      const hd = headingOf(w);
      if (!hd || hd.level < 3) continue;
      const e = readEntry(w, r.page);
      if (!e) continue;
      const m = e.info.head.match(/^(\d)-Socket\s+(.+)$/);
      if (!m) continue;
      const runeLine = e.info.lines.find(l => !l.label && /•/.test(l.text));
      const bases = m[2].replace(/\s*\(.*$/, '');
      const item = {
        kind: 'runeword', name: e.name, group: title, slot, sockets: +m[1],
        base: bases, types: bases.split('/').map(s => s.trim()).filter(Boolean),
        runes: runeLine ? runeLine.text.split('•').map(s => s.trim()) : [],
        req: reqOf(e.info.lines), img: '',
        info: e.info.lines.filter(l => l !== runeLine), baseHtml: e.info.headHtml,
        stats: e.stats, notes: e.notes, page: e.page, anchor: e.anchor,
      };
      add(item, r.page);
    }
  }

  // Whole list pages open the matching filtered view.
  const listView = {
    'All Unique Weapons': 'items?t=unique&slot=Weapon', 'All Unique Non-Weapons': 'items?t=unique', 'All Set Items': 'items?t=set',
    Normal: 'items?t=set&tier=Normal', Exceptional: 'items?t=set&tier=Exceptional', Elite: 'items?t=set&tier=Elite',
  };
  for (const [title, [slot, sub]] of Object.entries(SLOT_PAGES)) listView[title] = `items?t=unique&slot=${encodeURIComponent(slot)}${sub ? '&sub=' + encodeURIComponent(sub) : ''}`;
  for (const [title, v] of Object.entries(listView)) { const p = byTitle.get(title); if (p) targets[`${p.id}#`] = v; }

  // Point links to the other copies of each item (All Items, runeword-by-type pages, ...)
  // at the same card.
  const bySlugName = new Map(items.map(i => [i.name, i.slug]));
  for (const p of pages) {
    if (!/^(All Items|All Runewords|All Set Items|All Unique|.* Runewords$|New Runewords|New Equipment)/.test(p.title)) continue;
    const r = await doc(p.title);
    for (const w of wrappers(r.d)) {
      const hd = headingOf(w);
      const s = hd && bySlugName.get(hd.text);
      if (s && !targets[`${p.id}#${hd.id}`]) targets[`${p.id}#${hd.id}`] = `item/${s}`;
    }
  }

  // Skills, one file per class.
  const skills = {};
  for (const cls of CLASSES) {
    const r = await doc(`All ${cls} Skills`);
    if (!r) continue;
    const all = wrappers(r.d);
    const trees = [];
    let tree = null;
    // Top-of-page material (class attributes table) before the first tree heading.
    const intro = [];
    for (let n = r.d.querySelector('.mw-parser-output')?.firstElementChild; n && !n.matches('.mw-heading'); n = n.nextElementSibling) intro.push(clean(n.outerHTML));
    const treeLevel = Math.min(...all.map(w => headingOf(w)?.level || 9));
    for (const w of all) {
      const hd = headingOf(w);
      if (!hd) continue;
      if (hd.level === treeLevel) {
        tree = { name: hd.text.replace(/\s*\([^)]*\)$/, ''), anchor: hd.id, skills: [] };
        trees.push(tree);
        continue;
      }
      if (!tree || hd.level !== treeLevel + 1) continue;
      const els = sectionAfter(w, hd.level, false);
      let img = '', desc = '', lvl = null, reqSkills = [];
      const body = [];
      for (const el of els) {
        if (el.matches('.skill-image') && !img) { img = fixUrl(el.querySelector('img')?.getAttribute('src')); continue; }
        if (el.matches('.skill-info') && !desc) {
          for (const li of el.querySelectorAll('li')) {
            const t = text(li);
            if (/^Description:/i.test(t)) desc = t.replace(/^Description:\s*/i, '');
            else if (/^Required Level:/i.test(t)) lvl = num(t);
            else if (/^Required Skills:/i.test(t)) reqSkills = t.replace(/^Required Skills:\s*/i, '').split(',').map(s => s.replace(/\[\d+\]/, '').trim()).filter(s => s && !/^none$/i.test(s));
          }
          continue;
        }
        if (el.matches('p') && el.querySelector('.expand-or-collapse-all-button')) continue;
        body.push(clean(el.outerHTML));
      }
      tree.skills.push({ name: hd.text, anchor: hd.id, img, desc, lvl, reqSkills, body: body.join('') });
      targets[`${r.page.id}#${hd.id}`] = `skills/${cls}/${hd.id}`;
    }
    targets[`${r.page.id}#`] = `skills/${cls}`;
    for (const t of trees) targets[`${r.page.id}#${t.anchor}`] = `skills/${cls}`;
    if (trees.some(t => t.skills.length)) skills[cls] = { cls, page: r.page.id, intro: intro.join(''), trees };
  }

  const maps = await extractMaps(await doc('Maps'), targets);
  const patches = await extractPatches(await doc('Patch Notes'), targets, pages, doc);
  const recent = byTitle.get('Recent Patch Notes');
  if (recent) targets[`${recent.id}#`] = 'patches';

  const cube = {
    recipes: await extractRecipes(await doc('Recipes'), targets),
    crafts: await extractCrafts(await doc('Crafting'), targets),
    corruptions: await extractCorruptions(await doc('Corruptions'), targets),
  };

  return { items, sets, skills, targets, maps, patches, cube };
}

// ---------- maps ----------
const ELEMENTS = ['phys', 'magic', 'fire', 'light', 'cold', 'poison'];
const largest = img => {
  const ss = img.getAttribute('srcset');
  if (ss) return fixUrl(ss.split(',').pop().trim().split(/\s+/)[0]);
  return fixUrl(img.getAttribute('src')).replace(/\/thumb(\/[^/]+\/[^/]+\/[^/]+)\/[^/]+$/, '$1');
};

async function extractMaps(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const maps = [];
  const info = [];
  const events = [];
  let tier = '', inMaps = false;
  const TAB = { Map_Events: 'events', Modification: 'modify', Affixes: 'affixes' };
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd) continue;
    if (hd.level === 2) { inMaps = /individual maps/i.test(hd.text); continue; }
    if (hd.level === 3 && !inMaps) {
      const els = sectionAfter(w, 3);
      if (hd.id === 'Map_Events') {
        let quote = null;
        for (const el of els) {
          if (el.tagName === 'UL' && el.querySelector('.d2-red')) quote = text(el);
          else if (el.tagName === 'DL' && quote !== null) { events.push({ quote, html: clean(el.querySelector('dd')?.innerHTML || el.innerHTML) }); quote = null; }
          else if (el.tagName === 'P' && text(el)) info.push({ tab: 'events', html: clean(el.outerHTML) });
        }
      } else if (TAB[hd.id]) {
        info.push({ tab: TAB[hd.id], title: hd.text, html: els.map(e => clean(e.outerHTML)).join('') });
      }
      targets[`${page.id}#${hd.id}`] = TAB[hd.id] ? `maps/${TAB[hd.id]}` : 'maps';
      continue;
    }
    if (hd.level === 3 && inMaps) {
      const t = hd.text.match(/Tier\s*(\d)/i);
      tier = /dungeon/i.test(hd.text) ? 'Dungeon' : /unique/i.test(hd.text) ? 'Unique' : t ? 'T' + t[1] : hd.text;
      targets[`${page.id}#${hd.id}`] = `maps?tier=${tier}`;
      continue;
    }
    if (hd.level !== 4 || !inMaps) continue;
    const holder = d.createElement('div');
    for (const el of sectionAfter(w, 4)) holder.appendChild(el.cloneNode(true));
    const icon = fixUrl(hd.h.querySelector('img')?.getAttribute('src'));
    const table = [...holder.querySelectorAll('table')].find(t => /monster/i.test(text(t.querySelector('th'))));
    const monsters = [];
    if (table) {
      const trs = [...table.querySelectorAll('tr')];
      const head = [...trs[0].children].map(c => text(c).toLowerCase());
      const col = k => head.findIndex(h => h.startsWith(k));
      for (const row of trs.slice(1)) {
        const c = [...row.children];
        if (!c.length) continue;
        const res = {};
        for (const e of ELEMENTS) {
          const cell = c[col(e)];
          const v = cell ? parseInt(text(cell), 10) : NaN;
          res[e] = Number.isFinite(v) ? v : 0;
        }
        const nm = text(c[0]);
        monsters.push({
          name: nm.replace(/\*$/, ''), minion: !!c[0].querySelector('i'), boss: /\*$/.test(nm),
          res, type: col('type') >= 0 ? text(c[col('type')]) : '', drain: col('drain') >= 0 ? parseInt(text(c[col('drain')]), 10) || null : null,
        });
      }
      table.remove();
    }
    const shots = [...holder.querySelectorAll('img')].map(im => ({ thumb: fixUrl(im.getAttribute('src')), full: largest(im) }));
    for (const im of [...holder.querySelectorAll('img')]) (im.closest('p') || im).remove();
    const notes = [...holder.querySelectorAll('li')].map(li => clean(li.innerHTML));
    for (const ul of [...holder.querySelectorAll('ul')]) ul.remove();
    const desc = [...holder.querySelectorAll('p')].filter(p => text(p)).map(p => clean(p.outerHTML)).join('');
    const immune = {};
    for (const e of ELEMENTS) { const n = monsters.filter(m => !m.minion && m.res[e] >= 100).length; if (n) immune[e] = n; }
    const m = {
      slug: slug(hd.text), name: hd.text, tier, icon, monsters, notes, desc, shots, immune,
      types: [...new Set(monsters.map(x => x.type).filter(Boolean))], anchor: hd.id,
    };
    maps.push(m);
    targets[`${page.id}#${hd.id}`] = `map/${m.slug}`;
  }
  targets[`${page.id}#`] = 'maps';
  return { page: page.id, maps, events, info };
}

// ---------- patch notes ----------
const TITLE_CASE = s => /[a-z]/.test(s) ? s : s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\bPvp\b/g, 'PvP').replace(/\bD2gl\b/g, 'D2GL');
const CLASS_RE = /\b(Amazon|Assassin|Barbarian|Druid|Necromancer|Paladin|Sorceress)\b/i;
function catOf(t, parent) {
  const s = t.toLowerCase();
  if (/\bpatch\b|patches|^\d{4}-\d\d-\d\d|unknown date|hotfix/.test(s)) return 'Hotfixes';
  if (CLASS_RE.test(t) || /skill|class balance/.test(s)) return 'Classes';
  if (/pvp|dueling/.test(s)) return 'PvP';
  if (/\bmaps?\b|map events|dungeon|uber|map shuffle|\bzones?\b/.test(s)) return 'Maps & Ubers';
  if (/item|affix|unique|runeword|\brunes?\b|\bsets?\b|bases|craft|corrupt|gem|jewel|charm/.test(s)) return 'Items';
  if (/merc/.test(s)) return 'Mercenaries';
  if (parent) return parent;
  return 'General';
}
// Plain-text change lines. A short header ("Grief:", or a bold "Zeal" paragraph) followed
// by a nested list becomes one line, "Grief: point · point", so every line reads on its own.
function linesOf(el) {
  const out = [];
  const isShort = t => t.length <= 40 || /:$/.test(t);
  const listText = ul => [...ul.querySelectorAll('li')].map(li => {
    const cl = li.cloneNode(true);
    for (const sub of [...cl.querySelectorAll('ul,ol')]) sub.remove();
    return text(cl);
  }).filter(Boolean).join(' · ');
  const walk = n => {
    const kids = [...(n.children || [])];
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (c.tagName === 'LI') {
        const cl = c.cloneNode(true);
        for (const sub of [...cl.querySelectorAll('ul,ol')]) sub.remove();
        const t = text(cl);
        const nested = c.querySelector(':scope > ul, :scope > ol');
        if (t && nested && isShort(t)) { out.push(`${t.replace(/:$/, '')}: ${listText(nested)}`); continue; }
        if (t) out.push(t);
        walk(c);
      } else if (c.tagName === 'P' || c.tagName === 'DD') {
        const t = text(c);
        const next = kids[i + 1];
        if (t && next && /^(UL|OL)$/.test(next.tagName) && isShort(t)) { out.push(`${t.replace(/:$/, '')}: ${listText(next)}`); i++; continue; }
        if (t) out.push(t);
      } else walk(c);
    }
  };
  walk(el);
  return out;
}

async function extractPatches(r, targets, pages, doc) {
  if (!r) return null;
  const { page, d } = r;
  const root = d.querySelector('.mw-parser-output');
  const seasons = [];
  let season = null, block = null;
  const stack = [];
  // Each season arrives wrapped in a collapsible table (and some in divs); walk into any
  // wrapper that holds headings.
  const flat = [];
  const walk = n => { for (const c of n.children) { if (/^(DIV|TABLE|TBODY|TR|TD)$/.test(c.tagName) && !c.matches('.mw-heading') && c.querySelector('.mw-heading')) walk(c); else if (c.tagName !== 'CAPTION') flat.push(c); } };
  if (root) walk(root);
  for (const el of flat) {
    const hd = headingOf(el);
    if (hd) {
      const sm = hd.level === 1 && hd.text.match(/^Season\s+(\d+)\s+(.*?)\s*[-–—]\s*(.+)$/i);
      if (sm || (hd.level === 1 && /upcoming/i.test(hd.text))) {
        season = sm ? { n: +sm[1], name: sm[2].trim(), date: sm[3].trim(), anchor: hd.id, blocks: [] }
          : { n: 0, name: 'Upcoming spoilers', date: '', anchor: hd.id, blocks: [], upcoming: true };
        seasons.push(season);
        block = null; stack.length = 0;
        targets[`${page.id}#${hd.id}`] = `patches/${season.upcoming ? 'upcoming' : 's' + season.n}`;
        continue;
      }
      if (!season) continue;
      if (hd.level === 1 && /patch notes/i.test(hd.text)) { block = null; stack.length = 0; continue; }
      while (stack.length && stack[stack.length - 1].level >= hd.level) stack.pop();
      const parent = stack[stack.length - 1];
      const title = TITLE_CASE(hd.text);
      block = { title, level: hd.level, anchor: hd.id, cat: catOf(title, parent?.cat), parts: [] };
      const cm = title.match(CLASS_RE);
      if (cm) block.cls = cm[1][0].toUpperCase() + cm[1].slice(1).toLowerCase();
      else if (parent?.cls) block.cls = parent.cls;
      if (parent) block.parent = parent.anchor;
      season.blocks.push(block);
      stack.push(block);
      targets[`${page.id}#${hd.id}`] = `patches/${season.upcoming ? 'upcoming' : 's' + season.n}#${hd.id}`;
      continue;
    }
    if (!season) continue;
    if (block) block.parts.push(el);
    else {
      season.intro = season.intro || { title: '', cat: 'General', level: 1, anchor: season.anchor, parts: [] };
      season.intro.parts.push(el);
    }
  }
  // Serialise, keeping plain-text lines for searching and for item/skill histories.
  for (const s of seasons) {
    const fin = b => {
      const box = d.createElement('div');
      for (const p of b.parts) box.appendChild(p.cloneNode(true));
      b.html = clean(box.innerHTML);
      b.lines = linesOf(box);
      delete b.parts;
    };
    if (s.intro) fin(s.intro);
    for (const b of s.blocks) fin(b);
    s.blocks = s.blocks.filter(b => b.lines.length || b.html || s.blocks.some(x => x.parent === b.anchor));
    const dt = Date.parse(s.date.replace(/(\d+)(st|nd|rd|th)/, '$1'));
    if (Number.isFinite(dt)) s.iso = new Date(dt + 12 * 3600e3).toISOString().slice(0, 10);
  }
  // Season pages and their sections point at the same view.
  for (const p of pages) {
    const m = p.title.match(/^Patch:Season (\d+)$/);
    if (!m) continue;
    const s = seasons.find(x => x.n === +m[1]);
    if (!s) continue;
    targets[`${p.id}#`] = `patches/s${s.n}`;
    const rr = await doc(p.title);
    for (const w of rr.d.querySelectorAll('.mw-heading')) {
      const hd = headingOf(w);
      const b = hd && s.blocks.find(x => x.title === TITLE_CASE(hd.text));
      if (b) targets[`${p.id}#${hd.id}`] = `patches/s${s.n}#${b.anchor}`;
    }
  }
  targets[`${page.id}#`] = 'patches';
  return { page: page.id, seasons };
}

// ---------- crafting, cube recipes, corruptions ----------
const RUNES = ['El', 'Eld', 'Tir', 'Nef', 'Eth', 'Ith', 'Tal', 'Ral', 'Ort', 'Thul', 'Amn', 'Sol', 'Shael', 'Dol', 'Hel', 'Io', 'Lum', 'Ko', 'Fal',
  'Lem', 'Pul', 'Um', 'Mal', 'Ist', 'Gul', 'Vex', 'Ohm', 'Lo', 'Sur', 'Ber', 'Jah', 'Cham', 'Zod'];
const RUNE_SET = new Set(RUNES);

// Children of the page in reading order, stepping into plain wrapper divs.
function flatten(root) {
  const out = [];
  const walk = n => { for (const c of n.children) { if (c.tagName === 'DIV' && !c.matches('.mw-heading') && !c.className && c.querySelector('.mw-heading,table')) walk(c); else out.push(c); } };
  if (root) walk(root);
  return out;
}

// Table rows as arrays of cells, with rowspans filled in so every row is complete.
function grid(table) {
  const rows = [...table.querySelectorAll('tr')];
  const out = [];
  const carry = [];
  for (const tr of rows) {
    const cells = [];
    let src = [...tr.children];
    for (let col = 0; src.length || carry[col]; col++) {
      if (carry[col] && carry[col].left > 0) { cells.push(carry[col].cell); carry[col].left--; if (!carry[col].left) carry[col] = null; continue; }
      const c = src.shift();
      if (!c) break;
      cells.push(c);
      const rs = +(c.getAttribute('rowspan') || 1);
      if (rs > 1) carry[col] = { cell: c, left: rs - 1 };
    }
    out.push(cells);
  }
  return out;
}

const runesIn = el => [...new Set([...el.querySelectorAll('.d2-orange')].map(text).filter(t => RUNE_SET.has(t)))];
const htmlOf = el => clean(el?.innerHTML || '');

async function extractRecipes(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const recipes = [], sections = [];
  let group = '', section = null;
  for (const el of flatten(d.querySelector('.mw-parser-output'))) {
    const hd = headingOf(el);
    if (hd) {
      if (hd.level === 2) group = hd.text;
      section = { group, title: hd.level === 2 ? '' : hd.text, anchor: hd.id, html: '' };
      sections.push(section);
      targets[`${page.id}#${hd.id}`] = `cube?sec=${encodeURIComponent(hd.id)}`;
      continue;
    }
    if (!section) continue;
    if (el.matches('table.wikitable')) {
      const g = grid(el);
      const head = (g[0] || []).map(c => text(c).toLowerCase());
      const ci = k => head.findIndex(h => h.startsWith(k));
      const caption = text(el.querySelector('caption'));
      let iIng = ci('ingredients'), iRes = ci('result'), iNotes = ci('notes');
      let iItem = -1, iIcon = ci('icon');
      if (iIng < 0 && ci('additional') >= 0) { iItem = ci('item'); iIng = ci('additional'); iRes = ci('effect'); }
      if (iIng < 0 || iRes < 0) { section.html += clean(el.outerHTML); continue; }
      for (const row of g.slice(1)) {
        if (!row[iIng] || !row[iRes]) continue;
        const ing = iItem >= 0 ? `${htmlOf(row[iItem])} + ${htmlOf(row[iIng])}` : htmlOf(row[iIng]);
        const icon = iIcon >= 0 ? fixUrl(row[iIcon]?.querySelector('img')?.getAttribute('src')) : '';
        recipes.push({
          group, section: section.title || group, sec: section.anchor, caption,
          ing, res: htmlOf(row[iRes]), notes: iNotes >= 0 ? htmlOf(row[iNotes]) : '',
          runes: runesIn(row[iIng]), icon,
        });
      }
      continue;
    }
    if (el.matches('figure')) continue;
    if (text(el)) section.html += clean(el.outerHTML);
  }
  targets[`${page.id}#`] = 'cube';
  return { page: page.id, recipes, sections: sections.filter(s => s.html || recipes.some(x => x.sec === s.anchor)) };
}

const CRAFT_SLOTS = ['Amulet', 'Ring', 'Belt', 'Boots', 'Gloves', 'Helm', 'Armor', 'Shield', 'Weapon', 'Quiver'];
async function extractCrafts(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const crafts = [], info = [];
  let type = '', cur = null, infoBlock = null;
  for (const el of flatten(d.querySelector('.mw-parser-output'))) {
    const hd = headingOf(el);
    if (hd) {
      const m = hd.text.match(/^(\w+) Items$/);
      type = m ? m[1] : '';
      cur = null;
      infoBlock = type ? null : { title: hd.text, anchor: hd.id, html: '' };
      if (infoBlock) info.push(infoBlock);
      targets[`${page.id}#${hd.id}`] = type ? `cube/crafting?type=${type}` : 'cube/crafting';
      continue;
    }
    if (!type) { if (infoBlock && text(el)) infoBlock.html += clean(el.outerHTML); continue; }
    if (el.tagName === 'DIV' && el.id && !text(el)) { continue; }
    if (el.tagName === 'P' && el.querySelector('b') && text(el).split(' ').length <= 5 && text(el).startsWith(type)) {
      const name = text(el);
      const last = name.split(' ').pop();
      cur = { type, name, slot: CRAFT_SLOTS.find(s => s.toLowerCase() === last.toLowerCase()) || (/chest|armor/i.test(last) ? 'Armor' : last), img: '', recipe: [], stats: [], notes: '' };
      cur.slug = slug(name);
      crafts.push(cur);
      targets[`${page.id}#${name.replace(/ /g, '_')}`] = `cube/crafting?type=${type}`;
      continue;
    }
    if (!cur) continue;
    if (el.matches('.item-image-table,figure')) { cur.img = fixUrl(el.querySelector('img')?.getAttribute('src')); continue; }
    if (el.matches('table')) {
      const th = text(el.querySelector('th'));
      if (/^recipe$/i.test(th)) { cur.recipe = [...el.querySelectorAll('tr')].slice(1).map(tr => text(tr)).filter(Boolean); continue; }
      const st = readStats(el);
      if (st) { cur.stats = st; continue; }
    }
    if (text(el)) cur.notes += clean(el.outerHTML);
  }
  targets[`${page.id}#`] = 'cube/crafting';
  return { page: page.id, crafts, info };
}

async function extractCorruptions(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const types = [], blocks = [];
  let block = null, pendingType = null;
  for (const el of flatten(d.querySelector('.mw-parser-output'))) {
    const hd = headingOf(el);
    if (hd) {
      block = { title: hd.text, anchor: hd.id, html: '' };
      blocks.push(block);
      targets[`${page.id}#${hd.id}`] = `cube/corruptions#${hd.id}`;
      continue;
    }
    // Per-type tables sit under bare <h3> headings (not wiki section headings).
    if (/^H[3-5]$/.test(el.tagName)) { pendingType = { name: text(el).replace(/\s*Corruption Mods?$/i, ''), anchor: el.id }; continue; }
    if (el.matches('table.wikitable') && pendingType) {
      const g = grid(el);
      const heads = (g[0] || []).map(text);
      if (heads.some(h => /rarity/i.test(h))) {
        const cols = heads.map((h, i) => {
          const m = h.match(/^(.*?)\s*\((\d+)% chance\)/i);
          return { label: m ? m[1] : h, chance: m ? +m[2] : null, mods: g.slice(1).map(row => row[i]).filter(c => c && text(c)).map(c => htmlOf(c)) };
        });
        types.push({ ...pendingType, cols });
        if (pendingType.anchor) targets[`${page.id}#${pendingType.anchor}`] = `cube/corruptions?type=${encodeURIComponent(pendingType.name)}`;
        pendingType = null;
        continue;
      }
    }
    if (block && text(el)) block.html += clean(el.outerHTML);
  }
  targets[`${page.id}#`] = 'cube/corruptions';
  return { page: page.id, types, blocks: blocks.filter(b => b.html) };
}
