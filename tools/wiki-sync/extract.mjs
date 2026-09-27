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

  const zones = await extractZones(await doc('Zones'), targets);
  const monsters = await extractMonsters(await doc('Monsters'), targets, zones);

  const mechanics = await extractMechanics(await doc('Game Mechanics'), targets);
  const affixes = await extractAffixes(await doc('Item Affixes'), targets);

  const bases = await extractBases(await doc('Item Bases'), targets, items);
  const runes = await extractRunes(await doc('Runes'), targets);
  const mercs = await extractMercs(await doc('Mercenaries'), await doc('Mercenary Skills'), targets);
  const classAttrs = await extractClassAttrs(await doc('Class Attributes'), targets);
  const qlvl = await extractQlvlIntro(await doc('Item Quality Levels'), targets);
  const newItems = await extractNewItems(await doc('New Items'), targets);
  const cosmetics = await extractCosmetics(await doc('Cosmetics'), targets);
  const general = await extractGeneralChanges(await doc('General Changes'), targets);
  const balance = await extractBalance(await doc('Balance Changes'), targets);
  const about = await extractAbout(await doc('Rules'), await doc('Singleplayer'), await doc('Credits'), await doc('Arrows'), targets);
  about.bugs = await extractBugs(await doc('Bugs'), targets);
  about.seasons = await extractSeasons(await doc('Seasons'), await doc('Season 13'), targets);

  const itemSkills = await extractItemSkills(await doc('Item Skills'), targets);
  if (itemSkills?.trees[0].skills.length) skills.Items = itemSkills;
  const treeDocs = [];
  for (const p of pages) if (/^This page lists \w+ skills from/i.test(p.intro || '')) treeDocs.push(await doc(p.title));
  mapTreePages(treeDocs, skills, targets);
  const skillChanges = await extractSkillChanges(await doc('Skill Changes'), skills, targets);
  cube.desecration = await extractDesecration(await doc('Desecration'), targets);
  for (const [title, route] of [['Item-Only Skills', 'skills/Items'], ['Formula Info', 'filters/Formulas']]) { const p = byTitle.get(title); if (p) targets[`${p.id}#`] = route; }
  const strays = [];
  for (const p of pages) if (p.len < 1200 || /may refer to|candidate for deletion/i.test(p.intro || '')) strays.push(await doc(p.title));
  mapStragglers(strays, items, targets);
  for (const { page } of strays) {
    const s = skills.Items?.trees[0].skills.find(x => x.name === page.title);
    if (s && !targets[`${page.id}#`]) targets[`${page.id}#`] = `skills/Items/${s.anchor}`;
  }

  const skillIndexAll = Object.values(skills).flatMap(c => c.trees.flatMap(t => t.skills.map(k => ({ c: c.cls, n: k.name, a: k.anchor }))));
  const help = await extractHelp(await doc('FAQ'), await doc('Support FAQ'), targets);
  const guides = await extractGuides(await doc('Links'), pages, doc, skillIndexAll, targets);
  const breakpoints = await extractBreakpoints(await doc('Breakpoints'), targets);
  const pvp = await extractPvp(await doc('PvP Changes'), await doc('Low Level Dueling'), skillIndexAll, targets);
  const lexicon = await extractLexicon(await doc('Lexicon of Abbreviations'), targets);

  const filters = await extractFilters(await doc('Item Filtering'), await doc('Customization'), targets);
  const fi = byTitle.get('Filter Info');
  if (fi) targets[`${fi.id}#`] = 'filters/list';

  return { items, sets, skills, targets, maps, patches, cube, world: { zones, monsters }, mechanics, affixes, gear: { bases, runes, mercs, classAttrs, qlvl, newItems, cosmetics, general, balance, about }, guide: { help, guides, breakpoints, pvp, lexicon }, filters, skillChanges };
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

// ---------- zones & monsters ----------
const zoneKey = s => String(s || '').toLowerCase().replace(/\blevel\s+/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const cellNum = c => { const m = text(c).match(/-?\d+/); return m ? +m[0] : null; };
const immTotal = t => (t.match(/\d+/g) || []).reduce((a, b) => a + +b, 0);

async function extractZones(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const zones = [], info = [];
  let corruptible = [];
  const byKey = new Map();
  for (const table of d.querySelectorAll('table')) {
    const cap = text(table.querySelector('caption'));
    const g = grid(table);
    const head = (g[0] || []).map(c => text(c).toLowerCase());
    const col = k => head.findIndex(h => h.startsWith(k));
    if (/zone levels/i.test(cap)) {
      for (const row of g.slice(1)) {
        if (!row[0] || !text(row[0])) continue;
        const loc = text(row[col('location')]);
        const act = (loc.match(/^A(\d)/) || [])[1];
        const hellCell = row[col('hell')];
        const supers = text(row[col('super')]).split(/,|\s{2,}|;/).map(s => s.replace(/\*+$/, '').trim()).filter(Boolean);
        const z = {
          name: text(row[0]), slug: slug(text(row[0])), act: act ? +act : null, parent: loc.replace(/^A\d\s*/, ''),
          lvl: { n: cellNum(row[col('normal')]), nm: cellNum(row[col('nightmare')]), h: cellNum(hellCell) },
          hellWas: col('hell was') >= 0 ? cellNum(row[col('hell was')]) : cellNum(row[6]),
          wp: /\*/.test(text(row[col('wp')])), supers,
        };
        zones.push(z);
        byKey.set(zoneKey(z.name), z);
      }
    } else if (/immunities/i.test(cap)) {
      const els = ['phys', 'magic', 'fire', 'light', 'cold', 'poison'];
      for (const row of g.slice(1)) {
        if (!row[0]) continue;
        const name = text(row[0]);
        let z = byKey.get(zoneKey(name));
        if (!z) {
          // "Hole 1" is "Hole Level 1"; also try matching by prefix within the same act.
          const k = zoneKey(name);
          z = zones.find(x => zoneKey(x.name) === k || zoneKey(x.name).replace(/ /g, '') === k.replace(/ /g, ''));
        }
        const imm = {};
        els.forEach((e, i) => { const t = text(row[1 + i]); if (t) imm[e] = { n: immTotal(t), t }; });
        const vanilla = cellNum(row[col('vanilla')]);
        if (z) { z.immune = imm; z.l85 = true; if (vanilla != null) z.vanilla = vanilla; }
        else {
          const loc = text(row[col('location')]);
          const act = (loc.match(/^A(\d)/) || [])[1];
          const nz = { name, slug: slug(name), act: act ? +act : null, parent: loc.replace(/^A\d\s*/, ''), lvl: { n: null, nm: null, h: 85 }, supers: [], immune: imm, l85: true, vanilla };
          zones.push(nz); byKey.set(zoneKey(name), nz);
        }
      }
    } else if (head[0] === 'act' && head[1] === 'zone') {
      corruptible = g.slice(1).map(row => ({ act: text(row[0]), zone: text(row[1]) })).filter(x => x.zone);
    }
  }
  for (const z of zones) if (z.lvl.h >= 85) z.l85 = true;
  // Corruptible zones: entries can list several zones ("Cave Level 1 & 2"), so match loosely.
  // "Cold Plains and The Cave" covers Cold Plains and every Cave level.
  const parts = corruptible.flatMap(c => c.zone.split(/ and | & |, /).map(p => zoneKey(p).replace(/^the /, '')));
  for (const z of zones) {
    const k = zoneKey(z.name).replace(/^the /, '');
    if (parts.some(p => p && (k === p || k === p + 's' || k.startsWith(p + ' ') || k.startsWith(p + 's ')))) z.corrupt = true;
  }
  // Prose sections (general notes, corrupted zones) as info blocks, without their big tables.
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd) continue;
    const html = sectionAfter(w, hd.level).filter(e => !e.matches('table')).map(e => clean(e.outerHTML)).join('');
    if (text({ textContent: html.replace(/<[^>]+>/g, '') })) info.push({ title: hd.text, anchor: hd.id, html });
    targets[`${page.id}#${hd.id}`] = 'zones';
  }
  targets[`${page.id}#`] = 'zones';
  return { page: page.id, zones, corruptible, info };
}

async function extractMonsters(r, targets, zones) {
  if (!r) return null;
  const { page, d } = r;
  const bosses = [], info = [], statRows = [];
  let group = '', sub = '', cur = null, block = null;
  const ENTRY_GROUPS = /special monsters|ubers/i;
  const els = flatten(d.querySelector('.mw-parser-output'));
  for (const el of els) {
    const hd = headingOf(el);
    const bare = !hd && /^H[3-5]$/.test(el.tagName) ? { level: +el.tagName[1], id: el.id, text: text(el) } : null;
    const h = hd || bare;
    if (h) {
      if (h.level === 2) { group = h.text; sub = ''; cur = null; block = { title: h.text, anchor: h.id, html: '' }; info.push(block); targets[`${page.id}#${h.id}`] = `monsters#${h.id}`; continue; }
      const isSubGroup = /key holders/i.test(h.text);
      if (isSubGroup) { sub = h.text; cur = null; block = { title: h.text, anchor: h.id, html: '', parent: group }; info.push(block); targets[`${page.id}#${h.id}`] = `monsters#${h.id}`; continue; }
      if (ENTRY_GROUPS.test(group)) {
        const g = sub && h.level > 3 ? sub : /ubers/i.test(group) ? 'Ubers' : 'Act Bosses';
        if (h.level === 3) sub = '';
        cur = { name: h.text, slug: slug(h.text), group: g, anchor: h.id, html: '' };
        bosses.push(cur);
        block = null;
        targets[`${page.id}#${h.id}`] = `monsters#${slug(h.text)}`;
        continue;
      }
      cur = null; block = { title: h.text, anchor: h.id, html: '', parent: group }; info.push(block);
      targets[`${page.id}#${h.id}`] = `monsters#${h.id}`;
      continue;
    }
    if (el.matches('table') && /monster/i.test(text(el.querySelector('th')))) {
      const g = grid(el);
      const head = g[0].map(c => text(c).toLowerCase());
      if (head.includes('phys')) {
        for (const row of g.slice(1)) {
          const o = { name: text(row[0]) };
          head.forEach((k, i) => { if (i) o[k] = text(row[i]); });
          o.where = cur ? cur.slug : (sub || group);
          statRows.push(o);
        }
        continue;
      }
    }
    const target = cur || block;
    if (target && text(el)) target.html += clean(el.outerHTML);
  }
  // Attach stat rows to bosses of the same name; the rest (e.g. Uber Andariel) stay as a table.
  const EL6 = ['phys', 'magic', 'fire', 'light', 'cold', 'poison'];
  for (const row of statRows) {
    const b = bosses.find(x => x.name.toLowerCase() === row.name.toLowerCase());
    row.res = Object.fromEntries(EL6.map(e => [e, parseInt(row[e], 10) || 0]));
    if (b) b.stats = row;
  }
  // Where each boss lives, from the zone list's super uniques.
  for (const b of bosses) {
    const k = b.name.toLowerCase().replace(/^the /, '');
    b.zones = (zones?.zones || []).filter(z => z.supers.some(s => s.toLowerCase().replace(/^the /, '') === k)).map(z => z.slug);
  }
  targets[`${page.id}#`] = 'monsters';
  return { page: page.id, bosses, info: info.filter(b => b.html), stats: statRows };
}

// ---------- game mechanics & item affixes ----------
// Game Mechanics: one topic per h2, with its h3s inside.
async function extractMechanics(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const topics = [];
  let topic = null, intro = '';
  for (const el of flatten(d.querySelector('.mw-parser-output'))) {
    const hd = headingOf(el);
    if (hd && hd.level <= 2) {
      topic = { title: hd.text, anchor: hd.id, html: '', subs: [] };
      topics.push(topic);
      targets[`${page.id}#${hd.id}`] = `mechanics/${hd.id}`;
      continue;
    }
    if (hd && topic) {
      topic.subs.push({ title: hd.text, anchor: hd.id });
      topic.html += `<h3 class="mech-sub" id="${hd.id}">${hd.text.replace(/</g, '&lt;')}</h3>`;
      targets[`${page.id}#${hd.id}`] = `mechanics/${topic.anchor}#${hd.id}`;
      continue;
    }
    if (!text(el) && !el.querySelector('img,math')) continue;
    if (topic) topic.html += clean(el.outerHTML); else intro += clean(el.outerHTML);
  }
  targets[`${page.id}#`] = 'mechanics';
  return { page: page.id, intro, topics };
}

// Item Affixes: every prefix/suffix table, the PD2 changes table, removed affixes,
// base item quality levels (for the affix-level calculator) and the rules sections.
async function extractAffixes(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const affixes = [], removed = [], bases = [], info = [];
  const changes = new Map();
  const range = t => { const m = String(t).match(/(\d+)(?:\s*-\s*(\d+))?/); return m ? [+m[1], m[2] ? +m[2] : null] : [null, null]; };
  for (const table of d.querySelectorAll('table')) {
    const cap = text(table.querySelector('caption'));
    const g = grid(table);
    if (!g.length) continue;
    const head = g[0].map(c => text(c).toLowerCase());
    const ci = k => head.findIndex(h => h === k || h.startsWith(k));
    const m = cap.match(/^(Equipment|Jewel|Small Charm|Large Charm|Grand Charm) (Prefixes|Suffixes)$/i);
    if (m) {
      for (const row of g.slice(1)) {
        if (!row[ci('affix')]) continue;
        const [amin, amax] = range(text(row[ci('alvl')]));
        const types = [...new Set(text(row[ci('item types')]).split(/,\s*|\s{2,}/).map(s => s.trim()).filter(Boolean))];
        affixes.push({
          id: +text(row[ci('id')]) || null, cat: m[1], ps: m[2][0].toUpperCase(),
          name: text(row[ci('affix')]), attr: htmlOf(row[ci('attributes')]).replace(/<br\s*\/?>/g, ' · '),
          types, amin, amax, rlvl: cellNum(row[ci('rlvl')]), freq: cellNum(row[ci('freq')]), group: cellNum(row[ci('group')]),
        });
      }
      continue;
    }
    if (ci('changes') >= 0 && ci('affix') >= 0) {
      for (const row of g.slice(1)) {
        const key = `${text(row[ci('affix')])}|${text(row[ci('p/s')])[0] || ''}`;
        changes.set(key, htmlOf(row[ci('changes')]));
      }
      continue;
    }
    if (ci('affix') >= 0 && head.some(h => /item type \(alvl\)/.test(h))) {
      for (const row of g.slice(1)) removed.push({ name: text(row[ci('affix')]), ps: text(row[ci('p/s')]), attr: htmlOf(row[ci('attributes')]), where: text(row[head.findIndex(h => /item type/.test(h))]) });
      continue;
    }
    if (/qlvls/i.test(cap)) {
      const kind = cap.replace(/\s*qlvls/i, '');
      for (const row of g.slice(1)) {
        for (let i = 0; i < row.length - 1; i++) {
          const nm = text(row[i]), q = text(row[i + 1]);
          if (nm && /^\d+$/.test(q) && !/^\d+$/.test(nm)) {
            const tier = /exceptional/i.test(head[i]) ? 'Exceptional' : /elite/i.test(head[i]) ? 'Elite' : /normal/i.test(head[i]) ? 'Normal' : '';
            bases.push({ name: nm, qlvl: +q, kind, tier });
          }
        }
      }
    }
  }
  for (const a of affixes) { const c = changes.get(`${a.name}|${a.ps}`); if (c) a.change = c; }
  // Rules sections (everything before the big tables), without those tables.
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd) continue;
    targets[`${page.id}#${hd.id}`] = hd.level === 1 || /general|magic|rare|crafted|affix level|quality|item types/i.test(hd.text) ? `affixes/rules#${hd.id}` : 'affixes';
    if (hd.level < 2 || !/magic items|rare items|crafted items|affix level|item types/i.test(hd.text)) continue;
    const html = sectionAfter(w, hd.level).filter(e => !(e.matches('table') && e.querySelectorAll('tr').length > 12)).map(e => clean(e.outerHTML)).join('');
    info.push({ title: hd.text, anchor: hd.id, html });
  }
  targets[`${page.id}#`] = 'affixes';
  return { page: page.id, affixes, removed, bases, info };
}

// ---------- item bases, runes & gems, mercenaries ----------
// Item Bases: each table lists Normal | Exceptional | Elite side by side; merge every
// table into one record per base, keeping PD2's before/after values.
async function extractBases(r, targets, items) {
  if (!r) return null;
  const { page, d } = r;
  const byName = new Map();
  const get = (name, tier) => {
    if (!byName.has(name)) byName.set(name, { name, slug: slug(name), tier });
    const b = byName.get(name);
    if (tier && !b.tier) b.tier = tier;
    return b;
  };
  const val = c => { const t = text(c); return t === '' ? null : t; };
  const pair = (bc, ac) => {
    const before = val(bc), after = ac ? val(ac) : null;
    return after && after !== before ? { v: after, was: before } : before != null ? { v: before } : null;
  };
  const KEY = [
    [/strength and dexterity/i, 'req'], [/base damage/i, 'dmg'], [/speed modifiers/i, 'wsm'], [/melee ranges/i, 'range'],
    [/defense & required strength/i, 'def'], [/block chance/i, 'block'], [/maximum sockets/i, 'sockets'], [/durability/i, 'dur'],
    [/required levels/i, 'rlvl'], [/qlvls/i, 'qlvl'],
  ];
  const info = [];
  for (const table of d.querySelectorAll('table')) {
    const cap = text(table.querySelector('caption'));
    const key = (KEY.find(([re]) => re.test(cap)) || [])[1];
    if (!key) continue;
    const kind = /armor/i.test(cap) ? 'Armor' : /quiver/i.test(cap) ? 'Quiver' : /weapon/i.test(cap) ? 'Weapon' : /other/i.test(cap) ? 'Other' : '';
    const g = grid(table);
    const head = g[0].map(c => text(c));
    // Column groups start at each "Item …" header.
    const groups = [];
    head.forEach((h, i) => { if (/^Item/.test(h)) groups.push({ at: i, tier: (h.match(/\((\w+)\)/) || [])[1] || '' }); });
    groups.forEach((gr, gi) => {
      const end = gi + 1 < groups.length ? groups[gi + 1].at : head.length;
      gr.cols = {};
      for (let i = gr.at + 1; i < end; i++) if (head[i]) gr.cols[head[i].toLowerCase()] = i;
    });
    for (const row of g.slice(1)) {
      const fam = [];
      for (const gr of groups) {
        const name = text(row[gr.at]);
        if (!name || /^\d/.test(name)) continue;
        const b = get(name, gr.tier === 'Normal' || gr.tier === 'Exceptional' || gr.tier === 'Elite' ? gr.tier : '');
        if (kind && !b.kind) b.kind = kind;
        fam.push(name);
        const c = k => row[gr.cols[k]];
        if (key === 'req') { b.str = val(c('str')); b.dex = val(c('dex')); }
        else if (key === 'def') { b.def = pair(c('before'), c('after')); if (c('str')) b.str = b.str || val(c('str')); b.kind = b.kind || 'Armor'; }
        else if (key === 'dmg') { b.dmg = pair(c('before'), c('after')); b.avg = val(c('ø')); b.kind = b.kind || 'Weapon'; }
        else if (key === 'dur') b.dur = c('durability') ? { v: val(c('durability')) } : pair(c('before'), c('after'));
        else if (key === 'rlvl') b.rlvl = val(c('level'));
        else if (key === 'qlvl') b.qlvl = val(c('qlvl'));
        else b[key] = pair(c('before'), c('after'));
      }
      if (fam.length > 1) for (const n of fam) { const b = byName.get(n); if (!b.family) b.family = fam; }
    }
  }
  // Weapon/armor type from the item database (uniques & sets name their base).
  const typeOf = new Map();
  for (const it of items) if (it.base && it.slot && it.slot !== 'Other') typeOf.set(it.base, it.sub || it.slot);
  // Types the item database can't tell us (no unique/set on that base, or only "Weapon").
  const byNameType = [
    [/javelin|pilum|harpoon|spiculum|flying knife|throwing (axe|knife)|balanced (axe|knife)|war dart|winged|hurlbat|flying axe/i, 'Throwing'],
    [/katar|quhab|suwayyah|claw|talon|cestus|hand scythe|scissors|wrist (blade|sword|spike)|hatchet hands|fascia|war fist/i, 'Claw'],
    [/\bbow\b/i, 'Bow'], [/spear|pike/i, 'Spear'], [/blade$/i, 'Sword'], [/mace$/i, 'Mace'],
    [/\borb\b|globe|sphere|jared's stone|heavenly stone|swirling crystal|demon heart|sparkling ball|dimensional shard/i, 'Orb'],
    [/jawbone|carnage helm|fury visor|destroyer helm|conqueror crown|guardian crown|savage helmet|slayer guard|lion helm|rage mask|avenger guard|assault helmet|horned helm|barbarian helm/i, 'Helm'],
    [/pelt|antlers|wolf head|hawk helm|falcon mask|spirit mask|totemic mask|blood spirit|sun spirit|earth spirit|sky spirit|dream spirit|alpha helm|griffon headdress|hunter's guise|sacred feathers/i, 'Helm'],
    [/heraldic|protector shield|kurast shield|targe|rondache|aerin shield|crown shield|akaran|royal shield|gilded shield|zakarum shield|sacred (targe|rondache)|vortex shield/i, 'Shield'],
    [/preserved head|zombie head|unraveller|gargoyle head|demon head|mummified trophy|fetish trophy|sexton trophy|cantor trophy|hierophant trophy|minion skull|hellspawn skull|overseer skull|succubus skull|bloodlord skull/i, 'Shield'],
  ];
  for (const b of byName.values()) {
    let t = typeOf.get(b.name) || (b.family || []).map(n => typeOf.get(n)).find(x => x && x !== 'Weapon');
    if (!t || t === 'Weapon' || t === 'Class Weapon') t = (byNameType.find(([re]) => re.test(b.name)) || [])[1] || t;
    if (t) b.type = t;
    // Boots and shields list kick/smite damage, but they're armor.
    if (/^(Helm|Armor|Shield|Gloves|Boots|Belt)$/.test(b.type || '')) b.kind = 'Armor';
    if (b.kind === 'Other') b.type = b.name;
    b.changed = ['dmg', 'wsm', 'range', 'def', 'block', 'sockets', 'dur'].some(k => b[k]?.was != null);
  }
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd) continue;
    const html = sectionAfter(w, hd.level).filter(e => !(e.matches('table') && e.querySelectorAll('tr').length > 10)).map(e => clean(e.outerHTML)).join('');
    if (html.replace(/<[^>]+>/g, '').trim()) info.push({ title: hd.text, anchor: hd.id, html });
    targets[`${page.id}#${hd.id}`] = `bases/rules#${hd.id}`;
  }
  targets[`${page.id}#`] = 'bases';
  return { page: page.id, bases: [...byName.values()].filter(b => b.kind), info };
}

async function extractRunes(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const runes = [], gems = [], info = [];
  for (const table of d.querySelectorAll('table')) {
    const g = grid(table);
    const head = g[0].map(c => text(c).toLowerCase());
    const ci = k => head.findIndex(h => h.startsWith(k));
    if (head.includes('rune')) {
      for (const row of g.slice(1)) {
        const name = text(row[ci('name')]);
        if (!name) continue;
        runes.push({ n: +text(row[ci('#')]) || runes.length + 1, name, img: fixUrl(row[ci('rune')]?.querySelector('img')?.getAttribute('src')),
          lvl: cellNum(row[ci('level')]), weapon: htmlOf(row[ci('weapon')]), armor: htmlOf(row[ci('chest')]), shield: htmlOf(row[ci('shield')]), group: text(row[ci('group')]) });
      }
    } else if (head.includes('gem')) {
      for (const row of g.slice(1)) {
        const name = text(row[ci('name')]);
        if (!name) continue;
        const m = name.match(/^(Chipped|Flawed|Flawless|Perfect)?\s*(.+)$/);
        gems.push({ name, grade: m[1] || 'Normal', type: m[2], img: fixUrl(row[ci('gem')]?.querySelector('img')?.getAttribute('src')),
          lvl: cellNum(row[ci('level')]), weapon: htmlOf(row[ci('weapon')]), armor: htmlOf(row[ci('chest')]), shield: htmlOf(row[ci('shield')]) });
      }
    }
  }
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd) continue;
    const html = sectionAfter(w, hd.level).filter(e => !e.matches('table')).map(e => clean(e.outerHTML)).join('');
    info.push({ title: hd.text, anchor: hd.id, html });
    targets[`${page.id}#${hd.id}`] = /gem/i.test(hd.text) ? 'runes/gems' : /jewel/i.test(hd.text) ? 'runes/jewels' : 'runes';
  }
  targets[`${page.id}#`] = 'runes';
  return { page: page.id, runes, gems, info };
}

const MERC_KEYS = [['Rogue', 'a1'], ['Desert', 'a2'], ['Iron Wolf', 'a3'], ['Ascendant', 'a4'], ['Barbarian', 'a5']];
const mercKey = s => (MERC_KEYS.find(([k]) => new RegExp(k, 'i').test(s)) || [])[1];

async function extractMercs(r, rs, targets) {
  if (!r) return null;
  const { page, d } = r;
  const mercs = {};
  const merc = (key, name) => (mercs[key] = mercs[key] || { key, name, levels: [], stats: {}, auras: [], skills: [] });
  // Stats: per merc, three sideways tables (a row per stat, a column per level).
  for (const li of d.querySelectorAll('li')) {
    const label = text(li.querySelector(':scope > b'));
    const key = mercKey(label);
    if (!key || !li.querySelector('table')) continue;
    const m = merc(key, label.replace(/\s*\|\s*$/, ''));
    for (const table of li.querySelectorAll('table')) {
      const g = grid(table);
      const levels = g[0].slice(1).map(c => cellNum(c)).filter(v => v != null);
      for (const row of g.slice(1)) {
        const stat = text(row[0]).replace(/ /g, ' ');
        if (!stat) continue;
        m.stats[stat] = m.stats[stat] || {};
        levels.forEach((lv, i) => { const v = text(row[i + 1]); if (v !== '') m.stats[stat][lv] = v; });
      }
      for (const lv of levels) if (!m.levels.includes(lv)) m.levels.push(lv);
    }
    m.levels.sort((a, b) => a - b);
  }
  // Auras by merc subtype.
  const sections = [];
  let cur = null;
  for (const el of flatten(d.querySelector('.mw-parser-output'))) {
    const hd = headingOf(el);
    if (hd) { cur = { title: hd.text, anchor: hd.id, level: hd.level, html: '' }; sections.push(cur); targets[`${page.id}#${hd.id}`] = `mercs#${hd.id}`; continue; }
    if (el.matches('table') && /mercenary/i.test(text(el.querySelector('th'))) && /aura/i.test(text(el))) {
      const g = grid(el);
      let last = '';
      for (const row of g.slice(1)) {
        const who = text(row[0]) || last; last = who;
        const key = mercKey(who);
        if (key) merc(key, who).auras.push({ subtype: text(row[1]), aura: htmlOf(row[2]) });
      }
      continue;
    }
    if (!cur || el.querySelector('table.scroll') || el.matches('ul') && el.querySelector('li > b + div table')) continue;
    if (text(el)) cur.html += clean(el.outerHTML);
  }
  // Skills from the Mercenary Skills page: h1 = act, h2 = subtype/group, h3 = skill.
  if (rs) {
    let key = null, group = '';
    for (const w of rs.d.querySelectorAll('.mw-heading')) {
      const hd = headingOf(w);
      if (!hd) continue;
      if (hd.level === 1) { key = mercKey(hd.text); group = ''; targets[`${rs.page.id}#${hd.id}`] = key ? `mercs/${key}` : 'mercs'; continue; }
      if (hd.level === 2) { group = hd.text; if (key) targets[`${rs.page.id}#${hd.id}`] = `mercs/${key}`; continue; }
      if (hd.level !== 3 || !key || !mercs[key]) continue;
      mercs[key].skills.push({ name: hd.text, group, anchor: hd.id, html: sectionAfter(w, 3).map(e => clean(e.outerHTML)).join('') });
      targets[`${rs.page.id}#${hd.id}`] = `mercs/${key}#${hd.id}`;
    }
    const general = [];
    for (const w of rs.d.querySelectorAll('.mw-heading')) {
      const hd = headingOf(w);
      if (hd && hd.level === 2 && /skill info|auras/i.test(hd.text)) general.push({ title: hd.text, anchor: hd.id, html: sectionAfter(w, 2).map(e => clean(e.outerHTML)).join('') });
    }
    targets[`${rs.page.id}#`] = 'mercs';
    sections.push(...general.map(g => ({ ...g, level: 2, fromSkills: true })));
  }
  targets[`${page.id}#`] = 'mercs';
  return { page: page.id, skillsPage: rs?.page.id, mercs: MERC_KEYS.map(([, k]) => mercs[k]).filter(Boolean), sections: sections.filter(s => s.html) };
}

// ---------- help (FAQ + Support FAQ), guides & builds, breakpoints ----------
async function extractHelp(faq, support, targets) {
  const items = [];
  const take = (r, catDefault) => {
    if (!r) return;
    let cat = catDefault;
    for (const w of r.d.querySelectorAll('.mw-heading')) {
      const hd = headingOf(w);
      if (!hd) continue;
      if (hd.level === 1) { cat = hd.text; targets[`${r.page.id}#${hd.id}`] = `help?cat=${encodeURIComponent(cat)}`; continue; }
      if (hd.level !== 2) continue;
      const id = `${r.page.id}-${hd.id}`;
      items.push({ id, q: hd.text, cat, page: r.page.id, anchor: hd.id, html: sectionAfter(w, 2, false).map(e => clean(e.outerHTML)).join('') });
      targets[`${r.page.id}#${hd.id}`] = `help#${id}`;
    }
    targets[`${r.page.id}#`] = catDefault === 'General' ? 'help' : 'help?cat=support';
  };
  take(faq, 'General');
  take(support, 'Support');
  return { items, pages: [faq?.page.id, support?.page.id].filter(Boolean) };
}

const CLASS_WORDS = { Amazon: /amazon|bowazon|javazon|zon\b|valkyrie/i, Assassin: /assassin|\bsin\b|trapsin|mind blast|blade dance|death sentry|venom/i,
  Barbarian: /barbarian|\bbarb\b|whirlwind|frenzy|berserk/i, Druid: /druid|bear|wolf|fire claws|tornado|hurricane|shockwave/i,
  Necromancer: /necromancer|necro|bone spear|corpse explosion|golem|skeleton|poison strike/i, Paladin: /paladin|pala\b|zeal|hammer|smite|fanazealot|\bfoh\b/i,
  Sorceress: /sorceress|\bsorc\b|frozen orb|blizzard|meteor|nova/i };
const seasonOf = t => { const all = [...String(t).matchAll(/\b(?:S|Season\s*)(\d{1,2})\b/gi)].map(m => +m[1]).filter(n => n > 0 && n < 40); return all.length ? Math.max(...all) : null; };
const hostOf = u => { try { const h = new URL(u).hostname.replace(/^www\./, ''); return /youtu/.test(h) ? 'YouTube' : /reddit/.test(h) ? 'Reddit' : /docs\.google/.test(h) ? 'Google Docs' : /maxroll/.test(h) ? 'Maxroll' : /pd2\.tools|projectdiablo2/.test(h) ? h : h; } catch { return ''; } };

async function extractGuides(links, pages, doc, skillIndex, targets) {
  const builds = [], resources = [];
  const guidePages = pages.filter(p => /^Guide:|guide|^Starter |^\w+Assassin$/i.test(p.title) && p.len > 2000);
  const internalByTitle = new Map(guidePages.map(p => [p.title, p]));
  if (links) {
    let h2 = '', h3 = '';
    for (const el of flatten(links.d.querySelector('.mw-parser-output'))) {
      const hd = headingOf(el);
      if (hd) {
        if (hd.level <= 2) { h2 = hd.text; h3 = ''; } else h3 = hd.text;
        const cls = /builds/i.test(h2) && h3 && CLASS_WORDS[h3] ? `?cls=${h3}` : '';
        targets[`${links.page.id}#${hd.id}`] = /builds|guides/i.test(h2 + h3) ? `guides${cls}` : 'guides/links';
        continue;
      }
      if (!el.matches('table')) continue;
      const g = grid(el);
      const head = g[0].map(c => text(c).toLowerCase());
      const ci = k => head.findIndex(h => h.startsWith(k));
      for (const row of g.slice(1)) {
        const nameCell = row[ci('name')];
        if (!nameCell || !text(nameCell)) continue;
        const a = nameCell.querySelector('a');
        let href = a?.getAttribute('href') || '', internal = null;
        if (href.startsWith('/wiki/')) { let t = decodeURIComponent(href.slice(6)).replace(/_/g, ' '); internal = pages.find(p => p.title === t)?.id || null; }
        else href = fixUrl(href);
        const entry = { name: text(nameCell), author: ci('author') >= 0 ? text(row[ci('author')]) : '', date: ci('date') >= 0 ? text(row[ci('date')]) : '',
          desc: ci('description') >= 0 ? htmlOf(row[ci('description')]) : '', href: internal ? '' : href, page: internal };
        if (/builds/i.test(h2) && h3) builds.push({ ...entry, cls: h3, season: seasonOf(entry.date) });
        else if (/general guides/i.test(h2)) builds.push({ ...entry, cls: 'General', season: seasonOf(entry.date) });
        else resources.push({ ...entry, section: h3 ? `${h2} › ${h3}` : h2 });
      }
    }
    targets[`${links.page.id}#`] = 'guides';
  }
  // Wiki-hosted guides: class, headline skills, season, starter, intro.
  const skillsByName = skillIndex.map(s => ({ ...s, re: new RegExp(`\\b${s.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g') }));
  const meta = [];
  for (const p of guidePages) {
    const r = await doc(p.title);
    const body = text(r.d.querySelector('.mw-parser-output'));
    const listed = builds.find(b => b.page === p.id);
    let cls = listed && listed.cls !== 'General' ? listed.cls : null;
    if (!cls) {
      const t = p.title + ' ' + body.slice(0, 3000);
      let best = null, bestN = 0;
      for (const [c, re] of Object.entries(CLASS_WORDS)) { const n = (t.match(new RegExp(re.source, 'gi')) || []).length + (re.test(p.title) ? 20 : 0); if (n > bestN) { best = c; bestN = n; } }
      cls = best;
    }
    const counts = skillsByName.filter(s => !cls || s.c === cls).map(s => ({ s, n: (body.match(s.re) || []).length })).filter(x => x.n >= 2).sort((a, b) => b.n - a.n);
    const intro = text([...r.d.querySelectorAll('.mw-parser-output > p')].find(x => text(x).length > 60)).slice(0, 240);
    meta.push({
      page: p.id, title: p.title.replace(/^Guide:/, ''), cls, starter: /starter|beginner|budget|league start/i.test(p.title + ' ' + body.slice(0, 1500)),
      season: listed?.season ?? seasonOf(p.title + ' ' + body.slice(0, 4000)), author: listed?.author || (p.title.match(/by (.+)$|from (\w+)/i) || []).slice(1).find(Boolean) || '',
      skills: counts.slice(0, 5).map(x => ({ n: x.s.n, c: x.s.c, a: x.s.a })), intro, edited: p.edited, words: body.split(/\s+/).length,
    });
  }
  for (const b of builds) if (b.href) b.host = hostOf(b.href);
  return { page: links?.page.id, builds, resources, guides: meta };
}

async function extractBreakpoints(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const tables = [], info = [];
  let h1 = '', h2 = '', h3 = '', block = null;
  for (const el of flatten(d.querySelector('.mw-parser-output'))) {
    const hd = headingOf(el);
    if (hd) {
      if (hd.level === 1) { h1 = hd.text; h2 = h3 = ''; } else if (hd.level === 2) { h2 = hd.text; h3 = ''; } else h3 = hd.text;
      block = { h1, title: hd.text, anchor: hd.id, level: hd.level, html: '' };
      info.push(block);
      const tab = /cast/i.test(h2) ? 'fcr' : /hit recovery/i.test(h2) ? 'fhr' : /block/i.test(h2) ? 'fbr' : /^attack speed$/i.test(h2) ? 'ias' : /threshold|diminish/i.test(h1) ? 'thresholds' : /changes/i.test(h1) ? 'changes' : '';
      targets[`${page.id}#${hd.id}`] = tab ? `breakpoints/${tab}` : 'breakpoints';
      continue;
    }
    if (el.matches('table') && /animation type/i.test(text(el.querySelector('th')))) {
      const g = grid(el);
      const frames = g[1].map(c => cellNum(c));
      const rows = [];
      for (const row of g.slice(2)) {
        // Leading header cells name the row: "Amazon", or "Amazon — 1-hand swinging" when the
        // class spans several animation rows.
        let lead = 0;
        while (lead < row.length && row[lead]?.tagName === 'TH') lead++;
        const name = row.slice(0, Math.max(1, lead)).map(c => text(c).replace(/\s+/g, ' ')).filter(Boolean).join(' — ');
        if (!name) continue;
        const bps = [];
        row.forEach((c, i) => { if (i < Math.max(1, lead)) return; const need = cellNum(c); const f = frames[i]; if (need != null && f != null) bps.push([need, f]); });
        bps.sort((a, b) => a[0] - b[0]);
        if (bps.length) rows.push({ name, bps });
      }
      // Tables in another layout (wereforms) stay as the wiki's own table.
      if (rows.length) { tables.push({ stat: h2, sub: h3, anchor: block?.anchor, rows, collapsed: el.classList.contains('mw-collapsed') }); continue; }
      if (block) block.html += clean(el.outerHTML);
      continue;
    }
    if (el.matches('table') && el.querySelectorAll('tr').length > 20) continue;
    if (block && (text(el) || el.querySelector('img,math'))) block.html += clean(el.outerHTML);
  }
  targets[`${page.id}#`] = 'breakpoints';
  return { page: page.id, tables, info: info.filter(i => i.html) };
}

// ---------- loot filter reference & customization ----------
// Every table with a "Code" column becomes code entries; each Code column starts a group
// (item codes list Normal | Exceptional | Elite side by side), and header cells to the
// left of the first Code (e.g. "Type") are shared context for the row.
async function extractFilters(r, custom, targets) {
  if (!r) return null;
  const { page, d } = r;
  const codes = [], topics = [], filters = [];
  const CODE_TOPICS = /^(filter codes|value condition ids)$/i;

  // Pass 1: prose topics (Filters, Syntax, Strictness, Formulas) in reading order.
  {
    let topic = null, inCodes = false;
    for (const el of flatten(d.querySelector('.mw-parser-output'))) {
      const hd = headingOf(el);
      if (hd) {
        if (hd.level === 2) { inCodes = CODE_TOPICS.test(hd.text); topic = inCodes ? null : { title: hd.text, anchor: hd.id, html: '', subs: [] }; if (topic) topics.push(topic); }
        else if (hd.level === 3 && CODE_TOPICS.test(hd.text)) { inCodes = true; topic = null; }
        else if (topic && !inCodes) { topic.subs.push({ title: hd.text, anchor: hd.id }); topic.html += `<h3 class="mech-sub" id="${hd.id}">${hd.text.replace(/</g, '&lt;')}</h3>`; }
        targets[`${page.id}#${hd.id}`] = inCodes ? `filters/codes?sec=${encodeURIComponent(hd.text)}` : topic ? `filters#${hd.id}` : 'filters';
        continue;
      }
      if (!topic || inCodes) continue;
      if (el.matches('table')) {
        const h0 = text(el.querySelector('th'));
        if (h0 === 'Filter' || el.querySelector('th') && /^code$/i.test(h0)) continue;
        if (el.querySelectorAll('tr').length <= 30) topic.html += clean(el.outerHTML);
        continue;
      }
      if (text(el) || el.querySelector('img')) topic.html += clean(el.outerHTML);
    }
  }

  // Pass 2: every heading and table in document order, wherever it's nested.
  const path = [];
  for (const el of d.querySelectorAll('.mw-heading, table')) {
    if (el.matches('.mw-heading')) {
      const hd = headingOf(el);
      if (!hd) continue;
      path.length = Math.max(0, hd.level - 2);
      path[hd.level - 2] = hd.text;
      continue;
    }
    if (el.parentElement?.closest('table')) continue;
    const g = grid(el);
    const head = (g[0] || []).map(c => text(c));
    if (head[0] === 'Filter' && head.some(h => /author/i.test(h))) {
      const archived = /archived/i.test(text(el.querySelector('caption')));
      for (const row of g.slice(1)) {
        const a = row[0]?.querySelector('a');
        filters.push({ name: text(row[0]), href: fixUrl(a?.getAttribute('href') || ''), updated: text(row[1]), author: text(row[2]), desc: htmlOf(row[3]), archived });
      }
      continue;
    }
    const codeCols = head.map((h, i) => /^(code|id|stat id)$/i.test(h) ? i : -1).filter(i => i >= 0);
    if (!codeCols.length || !/codes|ids|keywords|groups|items|variables|conditions|stats|gear|runes|gems|potions|quivers|armor|weapons|ears|skills|rarities|tiers|properties|elements|damage|general|level|maps|other|unused|amazon|sorceress|necromancer|paladin|barbarian|druid|assassin/i.test(path.join(' '))) continue;
    const trail = path.filter(Boolean);
    const sec = trail.slice(-2).join(' › ');
    const top = trail[1] || trail[0] || '';
    const caption = text(el.querySelector('caption'));
    // A single "code" header over several columns: every cell is a bare code (formula variables).
    if (head.length === 1 && +(g[0][0]?.getAttribute('colspan') || 1) > 1) {
      for (const row of g.slice(1)) for (const c of row) {
        const t = text(c);
        if (t) codes.push({ codes: [t], f: { details: 'formula variable, no parameters (see Formulas › Variables)' }, ctx: '', sec, top });
      }
      continue;
    }
    const isCode = h => /^(code|id|stat id)$/i.test(h);
    const groups = [];
    for (let i = 0; i < head.length; i++) {
      if (!isCode(head[i])) continue;
      const gcodes = [i];
      let j = i + 1;
      while (isCode(head[j] || '')) gcodes.push(j++);
      const fields = [];
      for (; j < head.length && head[j] && !isCode(head[j]); j++) fields.push(j);
      groups.push({ gcodes, fields });
      i = j - 1;
    }
    const ctxCols = head.slice(0, codeCols[0]).map((h, i) => (h ? i : -1)).filter(i => i >= 0);
    for (const row of g.slice(1)) {
      const ctx = ctxCols.map(i => text(row[i])).filter(Boolean).join(' · ');
      for (const gr of groups) {
        const cs = gr.gcodes.map(i => text(row[i])).filter(Boolean);
        if (!cs.length) continue;
        const f = {};
        for (const i of gr.fields) { if (text(row[i])) f[head[i]] = htmlOf(row[i]); }
        codes.push({ codes: cs, f, ctx, sec: caption ? `${trail.at(-1) || ''} › ${caption}` : sec, top });
      }
    }
  }
  targets[`${page.id}#`] = 'filters';
  // Customization: one topic per config file.
  const setup = [];
  if (custom) {
    for (const w of custom.d.querySelectorAll('.mw-heading')) {
      const hd = headingOf(w);
      if (!hd || hd.level !== 2) continue;
      if (/loot\.filter/i.test(hd.text)) { targets[`${custom.page.id}#${hd.id}`] = 'filters/list'; continue; }
      setup.push({ title: hd.text, anchor: hd.id, html: sectionAfter(w, 2, false).map(e => clean(e.outerHTML)).join('') });
      targets[`${custom.page.id}#${hd.id}`] = `filters/setup#${hd.id}`;
    }
    targets[`${custom.page.id}#`] = 'filters/setup';
  }
  return { page: page.id, customPage: custom?.page.id, codes, topics: topics.filter(t => t.html), filters, setup };
}

// ---------- class attributes & item quality levels ----------
// Each class: an Attributes table (Level 1, per level, per point) and "Vanilla" notes.
async function extractClassAttrs(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const classes = [];
  const n = s => { const m = String(s).replace(/,/g, '').match(/[+\-]?\d+(\.\d+)?/); return m ? +m[0] : null; };
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd || hd.level !== 2) continue;
    const cls = hd.text.replace(/\s*Attributes$/i, '');
    const els = sectionAfter(w, 2);
    const table = els.find(e => e.matches('table'));
    if (!table) continue;
    const rows = [];
    let parent = '';
    for (const tr of [...table.querySelectorAll('tr')].slice(1)) {
      const c = [...tr.children];
      const label = text(c[0]).replace(/^[•\s]+/, '');
      const isStat = !!c[0].querySelector('b');
      if (isStat) parent = label;
      rows.push({ label, stat: isStat, parent: isStat ? '' : parent, base: n(text(c[1])), perLevel: n(text(c[2])), perPoint: n(text(c[3])),
        changed: !!tr.querySelector('.nmod') });
    }
    const notes = els.filter(e => !e.matches('table')).map(e => clean(e.outerHTML)).join('');
    classes.push({ cls, anchor: hd.id, rows, notes });
    targets[`${page.id}#${hd.id}`] = `classes?cls=${cls}`;
  }
  targets[`${page.id}#`] = 'classes';
  return { page: page.id, classes };
}

async function extractQlvlIntro(r, targets) {
  if (!r) return null;
  const html = [...r.d.querySelector('.mw-parser-output').children].filter(e => !e.matches('table') && text(e)).map(e => clean(e.outerHTML)).join('');
  targets[`${r.page.id}#`] = 'bases/qlvl';
  return { page: r.page.id, html };
}

// ---------- new items & cosmetics ----------
// New Items: per h1 section, a tree of list items: "Name (note)" with optional nested lists.
async function extractNewItems(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const sections = [];
  const node = li => {
    const own = li.cloneNode(true);
    for (const sub of [...own.querySelectorAll('ul,ol')]) sub.remove();
    const t = text(own);
    const a = own.querySelector('a[href^="/wiki/"]');
    const m = t.match(/^(.*?)\s*\((.+)\)\s*$/);
    let link = a ? decodeURIComponent(a.getAttribute('href').slice(6)).replace(/_/g, ' ') : '';
    const kids = [...li.querySelectorAll(':scope > ul > li, :scope > ol > li')].map(node);
    return { name: (m ? m[1] : t).replace(/:$/, '').trim(), note: m ? m[2] : '', link, kids };
  };
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd || hd.level !== 1) continue;
    const els = sectionAfter(w, 1);
    const tree = els.filter(e => e.matches('ul')).flatMap(ul => [...ul.querySelectorAll(':scope > li')].map(node));
    const intro = els.filter(e => !e.matches('ul') && text(e)).map(e => clean(e.outerHTML)).join('');
    sections.push({ title: hd.text, anchor: hd.id, tree, intro });
    targets[`${page.id}#${hd.id}`] = `new#${hd.id}`;
  }
  targets[`${page.id}#`] = 'new';
  return { page: page.id, sections };
}

// Cosmetics: auras and alternate item skins, each with facts and pictures.
async function extractCosmetics(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const groups = [];
  let h1 = '', group = null;
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd) continue;
    if (hd.level === 1) { h1 = hd.text; group = null; }
    const els = sectionAfter(w, hd.level);
    const info = els.find(e => e.matches('.item-info-box'));
    const imgs = els.flatMap(e => [...e.querySelectorAll('img')]).map(im => ({ thumb: fixUrl(im.getAttribute('src')), full: largest(im), alt: im.getAttribute('alt') || '' }));
    const hasEntry = info || imgs.length;
    if (!hasEntry) {
      const intro = els.filter(e => text(e)).map(e => clean(e.outerHTML)).join('');
      group = { title: hd.level === 1 ? hd.text : hd.text, parent: h1, anchor: hd.id, intro, entries: [] };
      groups.push(group);
      targets[`${page.id}#${hd.id}`] = `cosmetics#${hd.id}`;
      continue;
    }
    if (!group || (hd.level === 2 && /aura/i.test(h1))) {
      // Aura sections are h2 entries directly under the h1 group.
      if (!group || group.parent !== h1 && group.title !== h1) { group = { title: h1, parent: h1, anchor: '', intro: '', entries: [] }; groups.push(group); }
    }
    const facts = info ? readInfo(info) : { head: '', lines: [] };
    const notes = els.filter(e => !e.matches('.item-info-box,.item-image-text,figure') && !e.querySelector('img') && text(e)).map(e => clean(e.outerHTML)).join('');
    group.entries.push({ name: hd.text, anchor: hd.id, premium: /premium/i.test(hd.text), unique: !!hd.h.querySelector('.d2-gold'),
      base: facts.head, facts: facts.lines.filter(l => l.label).map(l => ({ label: l.label, html: l.html })), imgs, notes });
    targets[`${page.id}#${hd.id}`] = `cosmetics#${hd.id}`;
  }
  targets[`${page.id}#`] = 'cosmetics';
  return { page: page.id, groups: groups.filter(g => g.entries.length || g.intro) };
}

// ---------- general changes & (outdated) balance changes ----------
async function extractGeneralChanges(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const intro = [], cats = [];
  let cat = null;
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd) continue;
    const els = sectionAfter(w, hd.level);
    // Top-level sections (Skills, Individual Items, General) are the overview's intro.
    if (hd.level === 2) {
      if (els.length) intro.push({ title: hd.text, anchor: hd.id, html: els.map(e => clean(e.outerHTML)).join('') });
      targets[`${page.id}#${hd.id}`] = 'overview';
      continue;
    }
    cat = { title: hd.text, anchor: hd.id, items: [] };
    cats.push(cat);
    for (const ul of els.filter(e => e.matches('ul'))) {
      for (const li of ul.querySelectorAll(':scope > li')) cat.items.push({ html: clean(li.innerHTML), text: text(li) });
    }
    const extra = els.filter(e => !e.matches('ul') && text(e)).map(e => clean(e.outerHTML)).join('');
    if (extra) cat.note = extra;
    targets[`${page.id}#${hd.id}`] = `overview?cat=${encodeURIComponent(hd.text)}`;
  }
  targets[`${page.id}#`] = 'overview';
  return { page: page.id, intro, cats };
}

async function extractBalance(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const classes = [];
  let cls = null, tree = '', abbr = '';
  for (const el of flatten(d.querySelector('.mw-parser-output'))) {
    const hd = headingOf(el);
    if (hd) {
      if (hd.level === 1) { cls = /reference|source/i.test(hd.text) ? null : { cls: hd.text, rows: [] }; if (cls) classes.push(cls); tree = ''; }
      else tree = hd.text;
      targets[`${page.id}#${hd.id}`] = cls ? `overview/season1?cls=${cls.cls}` : 'overview/season1';
      continue;
    }
    if (!cls && el.matches('p') && /FRW|FCR/.test(text(el)) && !abbr) { abbr = clean(el.outerHTML); continue; }
    if (!cls || !el.matches('table')) continue;
    for (const tr of el.querySelectorAll('tr')) {
      const c = [...tr.children];
      if (c.length < 2) continue;
      cls.rows.push({ tree, skill: text(c[0]), html: clean(c[1].innerHTML) });
    }
  }
  targets[`${page.id}#`] = 'overview/season1';
  return { page: page.id, classes, abbr };
}

// ---------- rules, singleplayer, credits (and arrows, which the item database covers) ----------
async function extractAbout(rules, sp, credits, arrows, targets) {
  const out = { pages: {} };
  if (rules) {
    out.pages.rules = rules.page.id;
    const groups = [];
    let g = null, rule = null;
    const intro = [];
    for (const el of flatten(rules.d.querySelector('.mw-parser-output'))) {
      const hd = headingOf(el);
      if (hd) { g = { title: hd.text, anchor: hd.id, rules: [] }; groups.push(g); rule = null; targets[`${rules.page.id}#${hd.id}`] = `about#${hd.id}`; continue; }
      if (!g) { if (text(el)) intro.push(clean(el.outerHTML)); continue; }
      const m = el.matches('p') && text(el).match(/^(\d+)\)\s*/);
      if (m) { rule = { n: +m[1], html: clean(el.innerHTML).replace(/^\s*\d+\)\s*/, ''), more: '' }; g.rules.push(rule); continue; }
      if (rule && text(el)) rule.more += clean(el.outerHTML);
      else if (text(el)) g.rules.push({ n: null, html: clean(el.innerHTML), more: '' });
    }
    out.rules = { intro: intro.join(''), groups };
    targets[`${rules.page.id}#`] = 'about';
  }
  if (sp) {
    out.pages.sp = sp.page.id;
    const sections = [];
    let intro = '';
    for (const el of flatten(sp.d.querySelector('.mw-parser-output'))) {
      const hd = headingOf(el);
      if (hd) { sections.push({ title: hd.text, anchor: hd.id, items: [], after: '' }); targets[`${sp.page.id}#${hd.id}`] = `about/singleplayer#${hd.id}`; continue; }
      const s = sections.at(-1);
      if (!s) { if (text(el)) intro += clean(el.outerHTML); continue; }
      if (el.matches('ul')) {
        for (const li of el.querySelectorAll(':scope > li')) {
          const fix = li.querySelector(':scope > dl');
          const fixHtml = fix ? clean(fix.innerHTML).replace(/<\/?dd>/g, ' ').trim() : '';
          if (fix) fix.remove();
          s.items.push({ html: clean(li.innerHTML), fix: fixHtml });
        }
      } else if (text(el)) s.after += clean(el.outerHTML);
    }
    out.sp = { intro, sections };
    targets[`${sp.page.id}#`] = 'about/singleplayer';
  }
  if (credits) {
    out.pages.credits = credits.page.id;
    const roles = [];
    let intro = '', role = null;
    for (const el of flatten(credits.d.querySelector('.mw-parser-output'))) {
      const b = el.matches('p') ? el.querySelector('b') : null;
      if (b) { role = { title: text(b).replace(/:$/, ''), note: text(el).replace(text(b), '').replace(/^[:\s]+/, ''), names: [] }; roles.push(role); continue; }
      if (el.matches('dl') && role) { role.names.push(...[...el.querySelectorAll('dd')].map(text).filter(Boolean)); continue; }
      if (!roles.length && text(el)) intro += clean(el.outerHTML);
      else if (role && text(el)) role.more = (role.more || '') + clean(el.outerHTML);
    }
    out.credits = { intro, roles };
    targets[`${credits.page.id}#`] = 'about/credits';
  }
  if (arrows) targets[`${arrows.page.id}#`] = 'items?t=unique&slot=Quiver';
  return out;
}

// ---------- known bugs & seasons ----------
// Bugs: h2 sections (PD2 bugs, vanilla, not bugs), bold "Label:" groups, list items with
// optional notes/fixes; "(S11)"-style tags mark bugs re-confirmed in a recent season.
async function extractBugs(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const sections = [];
  let sec = null, group = '', last = null, warning = '';
  const warn = d.querySelector('table.wikitable');
  if (warn) warning = text(warn.querySelector('span')) || '';
  for (const el of flatten(d.querySelector('.mw-parser-output'))) {
    const hd = headingOf(el);
    if (hd) {
      if (hd.level === 2) { sec = { title: hd.text, anchor: hd.id, blurb: '', bugs: [] }; sections.push(sec); group = ''; }
      else group = hd.text;
      targets[`${page.id}#${hd.id}`] = `about/bugs#${hd.id}`;
      continue;
    }
    if (!sec) continue;
    if (el.matches('p')) {
      const b = el.querySelector('b');
      if (b && text(el) === text(b)) { group = text(b).replace(/:$/, ''); continue; }
      if (el.querySelector('.emphasis') && !sec.blurb) { sec.blurb = text(el); continue; }
      if (text(el)) { if (last) last.more += clean(el.outerHTML); }
      continue;
    }
    if (el.matches('ul')) {
      for (const li of el.querySelectorAll(':scope > li')) {
        const dl = li.querySelector(':scope > dl');
        const note = dl ? clean(dl.innerHTML).replace(/<\/?dd>/g, ' ').trim() : '';
        if (dl) dl.remove();
        const t = text(li);
        const tag = t.match(/\(S(\d{1,2})\)/i);
        last = { group, html: clean(li.innerHTML), text: t, note, season: tag ? +tag[1] : null, more: '' };
        sec.bugs.push(last);
      }
      continue;
    }
    if (el.matches('dl') && last) { last.note += (last.note ? ' ' : '') + clean(el.innerHTML).replace(/<\/?dd>/g, ' ').trim(); continue; }
  }
  targets[`${page.id}#`] = 'about/bugs';
  return { page: page.id, warning, sections: sections.filter(s => s.bugs.length || s.blurb) };
}

async function extractSeasons(r, s13, targets) {
  if (!r) return null;
  const { page, d } = r;
  const seasons = [], info = [];
  const table = [...d.querySelectorAll('table')].find(t => /season/i.test(text(t.querySelector('th'))));
  if (table) {
    for (const row of grid(table).slice(1)) {
      const name = text(row[0]);
      if (!name) continue;
      const m = name.match(/^Season\s+(\d+)\s*[-–]\s*(.+)$/i);
      seasons.push({ name, n: m ? +m[1] : null, title: m ? m[2] : name, start: text(row[1]), days: cellNum(row[2]), daysText: text(row[2]), details: htmlOf(row[3]), league: !m });
    }
  }
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd || hd.level !== 2) continue;
    targets[`${page.id}#${hd.id}`] = /singleplayer/i.test(hd.text) ? 'about/singleplayer' : `about/seasons#${hd.id}`;
    if (/timeline|singleplayer/i.test(hd.text)) continue;
    info.push({ title: hd.text, anchor: hd.id, html: sectionAfter(w, 2).map(e => clean(e.outerHTML)).join('') });
  }
  targets[`${page.id}#`] = 'about/seasons';
  if (s13) targets[`${s13.page.id}#`] = 'patches/s13';
  return { page: page.id, seasons, info };
}

// ---------- remaining pages: skill trees, item skills, skill changes, PvP, glossary ----------
// One skill's block under its heading: icon, description, level, prerequisites, then the body.
function readSkill(w, hd) {
  let img = '', desc = '', lvl = null, reqSkills = [], reqItems = '';
  const body = [];
  for (const el of sectionAfter(w, hd.level, false)) {
    if (el.matches('.skill-image') && !img) { img = fixUrl(el.querySelector('img')?.getAttribute('src')); continue; }
    if (el.matches('.skill-info') && !desc) {
      for (const li of el.querySelectorAll('li')) {
        const t = text(li);
        if (/^Description:/i.test(t)) desc = t.replace(/^Description:\s*/i, '');
        else if (/^Required Level:/i.test(t)) lvl = num(t);
        else if (/^Required Skills:/i.test(t)) reqSkills = t.replace(/^Required Skills:\s*/i, '').split(',').map(s => s.replace(/\[\d+\]/, '').trim()).filter(s => s && !/^none$/i.test(s));
        else if (/^Required Items?:/i.test(t)) { const b = li.querySelector('b'); if (b) b.remove(); reqItems = clean(li.innerHTML).replace(/^:\s*/, ''); }
      }
      continue;
    }
    if (el.matches('p') && el.querySelector('.expand-or-collapse-all-button')) continue;
    body.push(clean(el.outerHTML));
  }
  return { name: hd.text, anchor: hd.id, img, desc, lvl, reqSkills, reqItems, body: body.join('') };
}

// Per-tree pages ("Cold Spells") repeat what the class's All Skills page holds.
function mapTreePages(docs, skills, targets) {
  const norm = s => s.toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/\b(skills?|spells?|tree)\b/g, '').replace(/[^a-z]+/g, ' ').trim();
  for (const { page, d } of docs) {
    const m = text(d.querySelector('.mw-parser-output > p')).match(/^This page lists (\w+) skills from the (.+?) skill tree/i);
    const cls = m && skills[m[1]] ? m[1] : null;
    if (!cls) continue;
    const tree = skills[cls].trees.find(t => norm(t.name) === norm(m[2])) || skills[cls].trees.find(t => norm(page.title).startsWith(norm(t.name)));
    targets[`${page.id}#`] = `skills/${cls}${tree ? '/' + tree.anchor : ''}`;
    const known = new Set(skills[cls].trees.flatMap(t => t.skills.map(s => s.anchor)));
    for (const w of d.querySelectorAll('.mw-heading')) {
      const hd = headingOf(w);
      if (hd && known.has(hd.id)) targets[`${page.id}#${hd.id}`] = `skills/${cls}/${hd.id}`;
    }
  }
}

async function extractItemSkills(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const skills = [];
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd || hd.level !== 2) continue;
    skills.push(readSkill(w, hd));
    targets[`${page.id}#${hd.id}`] = `skills/Items/${hd.id}`;
  }
  targets[`${page.id}#`] = 'skills/Items';
  const before = [];
  for (let n = d.querySelector('.mw-parser-output')?.firstElementChild; n && !n.matches('.mw-heading'); n = n.nextElementSibling) if (n.matches('p') && text(n)) before.push(n);
  const intro = before.map(p => clean(p.innerHTML).replace(/^(<br ?\/?>\s*)+/, '')).join(' ');
  return { cls: 'Items', page: page.id, intro: intro ? `<p>${intro}</p>` : '', trees: [{ name: 'Item-only skills', anchor: 'Item_Skills', skills }] };
}

const tableOf = t => {
  const g = grid(t);
  const head = g[0].every(c => c.tagName === 'TH') ? g.shift().map(text) : [];
  return { caption: text(t.querySelector('caption')), head, rows: g.map(r => r.map(htmlOf)) };
};
const stubNote = d => {
  const box = [...d.querySelectorAll('table')].find(t => /marked as a stub|candidate for deletion/i.test(text(t)));
  const reason = box ? (text(box).match(/Reason:\s*(.+)$/i) || [])[1] || '' : '';
  if (box) box.remove();
  return reason;
};

async function extractSkillChanges(r, skills, targets) {
  if (!r) return null;
  const { page, d } = r;
  const stub = stubNote(d);
  const out = { page: page.id, stub, intro: '', onItems: [], classes: [] };
  const anchorOf = (cls, name) => skills[cls]?.trees.flatMap(t => t.skills).find(s => s.name.toLowerCase() === name.toLowerCase())?.anchor || '';
  const introP = [...d.querySelectorAll('.mw-parser-output > p')].find(p => /skill changes from the vanilla/i.test(text(p)));
  if (introP) out.intro = clean(introP.innerHTML);
  let cls = null, tree = null, block = null;
  for (const el of flatten(d.querySelector('.mw-parser-output'))) {
    const hd = headingOf(el);
    if (hd) {
      if (hd.level === 2 && CLASSES.includes(hd.text)) {
        cls = { cls: hd.text, anchor: hd.id, trees: [] }; out.classes.push(cls); tree = block = null;
        targets[`${page.id}#${hd.id}`] = `skills/changes?cls=${hd.text}`;
      } else if (cls && hd.level === 3) {
        tree = { name: hd.text.replace(/\s*\(.*\)$/, ''), anchor: hd.id, notes: [], skills: [] }; cls.trees.push(tree);
        targets[`${page.id}#${hd.id}`] = `skills/changes?cls=${cls.cls}#${hd.id}`;
      } else if (hd.level === 2) {
        cls = tree = null; block = { title: hd.text, anchor: hd.id, notes: '', tables: [] }; out.onItems.push(block);
        targets[`${page.id}#${hd.id}`] = `skills/changes#${hd.id}`;
      } else if (hd.level === 1) targets[`${page.id}#${hd.id}`] = 'skills/changes';
      continue;
    }
    if (block) {
      if (el.matches('table')) block.tables.push(tableOf(el));
      else if (text(el) && el !== introP) block.notes += clean(el.outerHTML);
      continue;
    }
    if (!tree) continue;
    if (el.matches('table')) {
      for (const row of grid(el)) {
        if (row.length < 2) continue;
        const name = text(row[0]);
        const changes = [...row[1].querySelectorAll('li')].filter(li => text(li) && !li.querySelector('li')).map(li => clean(li.innerHTML));
        if (name && changes.length) tree.skills.push({ name, anchor: anchorOf(cls.cls, name), changes });
      }
    } else if (text(el)) tree.notes.push(clean(el.innerHTML));
  }
  targets[`${page.id}#`] = 'skills/changes';
  return out;
}

// PvP Changes + Low Level Dueling
async function extractPvp(r, lld, skillIndex, targets) {
  if (!r) return null;
  const { page, d } = r;
  const byName = new Map(skillIndex.map(s => [s.n.toLowerCase(), s]));
  const out = { page: page.id, intro: '', sections: [], diffs: [], diffNotes: [], multIntro: '', mults: [], lld: null };
  const introP = d.querySelector('.mw-parser-output > p');
  if (introP) out.intro = clean(introP.innerHTML);
  const bySkill = new Map();
  const skill = name => {
    const k = name.toLowerCase();
    if (!bySkill.has(k)) { const s = byName.get(k); bySkill.set(k, { name: s?.n || name, cls: s?.c || '', anchor: s?.a || '', diff: '', nm: '', hell: '', type: '' }); }
    return bySkill.get(k);
  };
  for (const w of d.querySelectorAll('.mw-heading')) {
    const hd = headingOf(w);
    if (!hd || hd.level !== 2) continue;
    const els = sectionAfter(w, 2, false);
    if (/skill differences/i.test(hd.text)) {
      targets[`${page.id}#${hd.id}`] = 'pvp/skills';
      for (const li of els.filter(e => e.matches('ul')).flatMap(u => [...u.querySelectorAll(':scope > li')])) {
        const m = text(li).match(/^([^:]{2,40}):\s/);
        if (m && byName.has(m[1].trim().toLowerCase())) {
          const h = clean(li.innerHTML);
          skill(m[1].trim()).diff = h.slice(h.indexOf(':') + 1).trim();
        } else out.diffNotes.push(clean(li.innerHTML));
      }
      continue;
    }
    if (/damage multipliers/i.test(hd.text)) {
      targets[`${page.id}#${hd.id}`] = 'pvp/skills';
      out.multIntro = els.filter(e => !e.matches('table')).map(e => clean(e.outerHTML)).join('');
      const t = els.find(e => e.matches('table'));
      if (t) {
        let cur = '';
        for (const row of grid(t).slice(1)) {
          if (row.length === 1) { cur = text(row[0]); continue; }
          const name = text(row[0]).replace(/^[\s•]+/, '');
          if (!name) continue;
          const o = skill(name);
          Object.assign(o, { nm: text(row[1]), hell: text(row[2]), type: text(row[3]) });
          if (!o.cls && CLASSES.includes(cur)) o.cls = cur;
          if (cur && !CLASSES.includes(cur)) o.group = cur;
        }
      }
      continue;
    }
    targets[`${page.id}#${hd.id}`] = `pvp#${hd.id}`;
    out.sections.push({ title: hd.text, anchor: hd.id, html: els.map(e => clean(e.outerHTML)).join('') });
  }
  out.diffs = [...bySkill.values()];
  targets[`${page.id}#`] = 'pvp';
  if (lld) {
    const topics = [];
    let intro = '';
    for (const el of flatten(lld.d.querySelector('.mw-parser-output'))) {
      const hd = headingOf(el);
      if (hd) {
        if (hd.level === 2) topics.push({ title: hd.text, anchor: hd.id, html: '', subs: [] });
        else if (topics.length) { topics.at(-1).subs.push({ title: hd.text, anchor: hd.id, level: hd.level }); topics.at(-1).html += clean(el.outerHTML); }
        targets[`${lld.page.id}#${hd.id}`] = `pvp/lld#${hd.id}`;
        continue;
      }
      if (topics.length) topics.at(-1).html += clean(el.outerHTML);
      else if (text(el)) intro += clean(el.outerHTML);
    }
    targets[`${lld.page.id}#`] = 'pvp/lld';
    out.lld = { page: lld.page.id, intro, topics };
  }
  return out;
}

// Lexicon of Abbreviations: "Term: meaning" list items under letter headings.
async function extractLexicon(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const stub = stubNote(d);
  const colors = [], entries = [];
  let letter = '';
  for (const el of flatten(d.querySelector('.mw-parser-output'))) {
    const hd = headingOf(el);
    if (hd) { letter = hd.text; continue; }
    if (!el.matches('ul') || !letter) continue;
    for (const li of el.querySelectorAll(':scope > li')) {
      if (/^colors$/i.test(letter)) {
        const sp = li.querySelector('span[class^="d2"]');
        const [name, what] = text(li).split(/\s*=\s*/);
        colors.push({ cls: sp?.className || '', name, what: what || '' });
        continue;
      }
      // Split at the first colon outside a tag.
      const h = clean(li.innerHTML);
      let depth = 0, at = -1;
      for (let i = 0; i < h.length; i++) {
        const c = h[i];
        if (c === '<') depth++;
        else if (c === '>') depth--;
        else if (c === ':' && !depth) { at = i; break; }
      }
      if (at < 0) continue;
      const term = h.slice(0, at).replace(/<[^>]+>/g, '').trim();
      if (term) entries.push({ term, html: h.slice(at + 1).trim(), letter });
    }
  }
  targets[`${page.id}#`] = 'glossary';
  const intro = [...d.querySelectorAll('.mw-parser-output > p')].find(p => /slang and abbreviations/i.test(text(p)));
  return { page: page.id, stub, intro: text(intro), colors, entries };
}

async function extractDesecration(r, targets) {
  if (!r) return null;
  const { page, d } = r;
  const notes = [...d.querySelectorAll('.mw-parser-output > p')].map(p => clean(p.innerHTML)).filter(Boolean);
  const t = d.querySelector('table');
  const mods = t ? [...t.querySelectorAll('td')].map(text).filter(Boolean) : [];
  const chances = [...d.querySelectorAll('.mw-parser-output > ul > li')].map(li => text(li).match(/^(.+?):\s*(\d+)%/)).filter(Boolean).map(m => ({ tier: m[1], pct: +m[2] }));
  targets[`${page.id}#`] = 'cube/corruptions?type=Amulet#Desecration';
  return { page: page.id, notes, mods, chances };
}

// Short disambiguation or deletion-candidate pages named after a runeword go to it.
function mapStragglers(docs, items, targets) {
  for (const { page, d } of docs) {
    if (targets[`${page.id}#`]) continue;
    const t = text(d.querySelector('.mw-parser-output'));
    if (!/may refer to|candidate for deletion/i.test(t) && page.len > 400) continue;
    if (/skill/i.test(t.slice(0, 300))) continue;
    const rws = items.filter(i => i.kind === 'runeword' && i.name === page.title);
    if (rws.length) targets[`${page.id}#`] = rws.length > 1 ? `items?t=runeword&q=${encodeURIComponent(page.title)}` : `item/${rws[0].slug}`;
  }
}
