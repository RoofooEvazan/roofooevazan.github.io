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

  return { items, sets, skills, targets };
}
