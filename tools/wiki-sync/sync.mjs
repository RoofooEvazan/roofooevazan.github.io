// Mirrors the Project Diablo 2 wiki (https://wiki.projectdiablo2.com) into wiki/data/
// for the reader at /wiki/. Runs daily from .github/workflows/wiki-sync.yml.
//
// Only pages whose MediaWiki "touched" time or revision changed are re-fetched, and
// files are only rewritten when their content changes, so a run with nothing new
// leaves the working tree clean and the workflow makes no commit.
//
// Usage: node tools/wiki-sync/sync.mjs [--full]   (--full re-fetches every page)

import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract } from './extract.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'wiki', 'data');
const PAGES = join(OUT, 'pages');
const API = 'https://wiki.projectdiablo2.com/w/api.php';
const WIKI = 'https://wiki.projectdiablo2.com';
const SHEET_ID = '1EnksMO35WPthXshjlNCg_wmbfYB_kcgUT321p6GhcsI';
const SHEET_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const UA = 'RoofooPD2WikiMirror/1.0 (+https://roofooevazan.github.io/wiki/; daily sync)';
const NAMESPACES = [0, 3000]; // articles and Patch: pages
const FULL = process.argv.includes('--full');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 5) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status} for ${url}`);
      if (i >= tries) throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (e) {
      if (i >= tries || /HTTP 4/.test(e.message)) throw e;
    }
    await sleep(1500 * i);
  }
}

async function api(params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params });
  const data = await (await get(`${API}?${qs}`)).json();
  if (data.error) throw new Error(`API ${data.error.code}: ${data.error.info}`);
  return data;
}

async function apiAll(params, pick) {
  const out = [];
  let cont = {};
  for (;;) {
    const d = await api({ ...params, ...cont });
    out.push(...pick(d));
    if (!d.continue) return out;
    cont = d.continue;
  }
}

async function readJSON(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

// Writes only when the content changed; returns whether it did.
async function put(file, content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 1) + '\n';
  if (existsSync(file) && (await readFile(file, 'utf8')) === text) return false;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  return true;
}

const decode = s => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, '&');

const plain = html => decode(html
  .replace(/<(script|style|math)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>|<\/(p|div|li|tr|td|th|h\d)>/gi, ' ')
  .replace(/<[^>]+>/g, ''))
  .replace(/\s+/g, ' ').trim();

// Splits a page into [anchor, heading, text] sections for full-text search.
function sections(html) {
  const out = [];
  const re = /<h([2-6])[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  let last = 0, anchor = '', heading = '', m;
  while ((m = re.exec(html))) {
    const text = plain(html.slice(last, m.index));
    if (text) out.push([anchor, heading, text]);
    anchor = decode(m[2]); heading = plain(m[3]); last = re.lastIndex;
  }
  const text = plain(html.slice(last));
  if (text || heading) out.push([anchor, heading, text]);
  return out;
}

// The wiki's own main page lists its sections as .home-menu boxes; reuse them as the nav.
function navFromMainPage(html) {
  const nav = [];
  const boxes = html.split(/<div class="home-menu">/).slice(1);
  for (const box of boxes) {
    const title = plain((box.match(/<div class="home-menu-title">([\s\S]*?)<\/div>/) || [])[1] || '');
    const items = [...box.matchAll(/<li>\s*<a href="\/wiki\/([^"#]+)(#[^"]*)?"[^>]*>([\s\S]*?)<\/a>/g)]
      .map(m => ({ label: plain(m[3]), title: decode(decodeURIComponent(m[1])).replace(/_/g, ' '), hash: m[2] ? decodeURIComponent(m[2].slice(1)) : undefined }));
    if (title && items.length) nav.push({ title, items });
  }
  return nav;
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const width = Math.max(0, ...rows.map(r => { let n = r.length; while (n && !r[n - 1]) n--; return n; }));
  return rows.map(r => r.slice(0, width).concat(Array(Math.max(0, width - r.length)).fill('')));
}

async function syncSheet() {
  try {
    const grid = parseCSV(await (await get(SHEET_CSV)).text());
    if (grid.length < 5) throw new Error('sheet came back empty');
    const file = join(OUT, 'merc-weapons.json');
    const old = await readJSON(file, null);
    if (old && JSON.stringify(old.grid) === JSON.stringify(grid)) return false;
    await put(file, {
      source: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=0`,
      fetched: new Date().toISOString(),
      grid,
    });
    return true;
  } catch (e) {
    console.warn(`! merc sheet: ${e.message} (keeping the previous copy)`);
    return false;
  }
}

async function main() {
  await mkdir(PAGES, { recursive: true });
  const prev = await readJSON(join(OUT, 'index.json'), { pages: [] });
  const prevById = new Map(prev.pages.map(p => [p.id, p]));

  // 1. Every non-redirect page, with its latest revision and touched time.
  const live = [];
  for (const ns of NAMESPACES) {
    live.push(...await apiAll(
      { action: 'query', generator: 'allpages', gapnamespace: ns, gaplimit: 'max', gapfilterredir: 'nonredirects', prop: 'info' },
      d => d.query?.pages ?? []));
  }
  if (live.length < 50) throw new Error(`only ${live.length} pages listed; refusing to prune the mirror`);

  // 2. Redirects, so links to old names land on the right page.
  const redirects = {};
  const redirectTitles = [];
  for (const ns of NAMESPACES) {
    redirectTitles.push(...await apiAll(
      { action: 'query', list: 'allpages', apnamespace: ns, aplimit: 'max', apfilterredir: 'redirects' },
      d => (d.query?.allpages ?? []).map(p => p.title)));
  }
  for (let i = 0; i < redirectTitles.length; i += 50) {
    const d = await api({ action: 'query', titles: redirectTitles.slice(i, i + 50).join('|'), redirects: '1' });
    for (const r of d.query?.redirects ?? []) redirects[r.from] = r.to + (r.tofragment ? '#' + r.tofragment : '');
  }

  // 3. Last edit time and summary for each page, 50 at a time.
  const revInfo = new Map();
  for (let i = 0; i < live.length; i += 50) {
    const ids = live.slice(i, i + 50).map(p => p.pageid).join('|');
    const d = await api({ action: 'query', pageids: ids, prop: 'revisions', rvprop: 'timestamp|comment' });
    for (const p of d.query.pages) revInfo.set(p.pageid, p.revisions?.[0] ?? {});
  }

  // 4. Re-fetch pages that changed.
  const added = [], updated = [], removed = [];
  const pages = [];
  const search = [];
  let fetched = 0;
  for (const p of live.sort((a, b) => a.title.localeCompare(b.title))) {
    const old = prevById.get(p.pageid);
    const file = join(PAGES, `${p.pageid}.html`);
    const rev = revInfo.get(p.pageid) || {};
    const stale = FULL || !old || old.rev !== p.lastrevid || old.touched !== p.touched || !existsSync(file);
    let entry = old, secs;
    if (stale) {
      const d = await api({
        action: 'parse', pageid: p.pageid, prop: 'text|displaytitle|revid',
        disableeditsection: '1', disablelimitreport: '1', disabletoc: '1',
      });
      const html = d.parse.text.replace(/<!--[\s\S]*?-->/g, '').trim();
      const changed = await put(file, html + '\n');
      secs = sections(html);
      entry = {
        id: p.pageid,
        title: p.title,
        display: plain(d.parse.displaytitle || p.title),
        rev: p.lastrevid,
        touched: p.touched,
        edited: rev.timestamp,
        len: html.length,
        intro: (secs[0]?.[0] === '' ? secs[0][2] : '').slice(0, 220),
      };
      if (!old) added.push(p.title);
      else if (changed) updated.push({ title: p.title, edited: rev.timestamp, summary: rev.comment || '' });
      fetched++;
      await sleep(300);
    } else {
      secs = sections(await readFile(file, 'utf8'));
    }
    pages.push(entry);
    search.push({ id: p.pageid, s: secs });
  }

  // 5. Drop pages that no longer exist on the wiki.
  const liveIds = new Set(live.map(p => p.pageid));
  for (const old of prev.pages) if (!liveIds.has(old.id)) removed.push(old.title);
  for (const f of await readdir(PAGES)) {
    if (f.endsWith('.html') && !liveIds.has(+f.replace('.html', ''))) await unlink(join(PAGES, f));
  }

  const main = pages.find(p => p.title === 'Main Page');
  const mainHtml = main ? await readFile(join(PAGES, `${main.id}.html`), 'utf8') : '';
  // Structured items and skills for the reader's own views. If the wiki's markup ever
  // stops parsing, keep the previous files rather than publishing empty ones.
  let targets = prev.targets || {};
  let skillIndex = prev.skillIndex || [];
  let seasons = prev.seasons || [];
  try {
    const ex = await extract(pages, OUT);
    if (ex.items.length < 300) throw new Error(`only ${ex.items.length} items found`);
    await put(join(OUT, 'items.json'), JSON.stringify({ items: ex.items, sets: ex.sets }) + '\n');
    for (const [cls, data] of Object.entries(ex.skills)) await put(join(OUT, 'skills', `${cls}.json`), JSON.stringify(data) + '\n');
    if (ex.maps?.maps.length > 10) await put(join(OUT, 'maps.json'), JSON.stringify(ex.maps) + '\n');
    if (ex.cube?.recipes?.recipes.length > 30 && ex.cube?.crafts?.crafts.length > 20) await put(join(OUT, 'cube.json'), JSON.stringify(ex.cube) + '\n');
    if (ex.patches?.seasons.length > 5) await put(join(OUT, 'patches.json'), JSON.stringify(ex.patches) + '\n');
    if (ex.patches?.seasons.length > 5) seasons = ex.patches.seasons.map(x => ({ key: x.upcoming ? 'upcoming' : 's' + x.n, n: x.n, name: x.name, iso: x.iso || '' }));
    targets = ex.targets;
    skillIndex = Object.values(ex.skills).flatMap(c => c.trees.flatMap(t => t.skills.map(k => ({ c: c.cls, n: k.name, a: k.anchor, l: k.lvl, t: t.name, i: k.img }))));
    console.log(`extracted ${ex.items.length} items, ${ex.sets.length} sets, ${Object.keys(ex.skills).length} skill classes`);
  } catch (e) {
    console.warn(`! extraction failed, keeping the previous item and skill data: ${e.message}`);
  }

  const index = {
    source: WIKI,
    license: 'CC BY-SA 4.0',
    nav: navFromMainPage(mainHtml),
    pages,
    redirects,
    targets,
    skillIndex,
    seasons,
  };
  const indexChanged = await put(join(OUT, 'index.json'), index);

  // Pages like "All Topics" and "Patch Notes" transclude other pages whole, so the same
  // section text shows up many times. Index each text once, under the smallest page it's on.
  const lenById = new Map(pages.map(p => [p.id, p.len]));
  const seen = new Set();
  const deduped = search
    .sort((a, b) => lenById.get(a.id) - lenById.get(b.id))
    .map(e => ({ id: e.id, s: e.s.filter(([, h, t]) => {
      const key = h + '\u0000' + t;
      if (t.length > 40 && seen.has(key)) return false;
      seen.add(key);
      return true;
    }) }))
    .sort((a, b) => a.id - b.id);
  await put(join(OUT, 'search.json'), JSON.stringify(deduped) + '\n');
  const sheetChanged = await syncSheet();

  // 6. Log what changed, newest first, for the reader's "Recent changes" list.
  if (added.length || updated.length || removed.length || sheetChanged) {
    const log = await readJSON(join(OUT, 'changes.json'), []);
    const first = prev.pages.length === 0;
    log.unshift({
      date: new Date().toISOString(),
      ...(first ? { initial: pages.length } : { added, updated, removed }),
      ...(sheetChanged ? { sheet: true } : {}),
    });
    await put(join(OUT, 'changes.json'), log.slice(0, 120));
  }

  console.log(`${live.length} pages, fetched ${fetched}: ${added.length} added, ${updated.length} updated, ${removed.length} removed; index ${indexChanged ? 'changed' : 'unchanged'}; sheet ${sheetChanged ? 'changed' : 'unchanged'}`);
  if (process.env.GITHUB_OUTPUT) {
    const parts = [];
    if (updated.length) parts.push(updated.length === 1 ? `update ${updated[0].title}` : `${updated.length} pages updated`);
    if (added.length) parts.push(added.length === 1 ? `add ${added[0]}` : `${added.length} pages added`);
    if (removed.length) parts.push(`${removed.length} removed`);
    if (sheetChanged) parts.push('merc sheet updated');
    await writeFile(process.env.GITHUB_OUTPUT, `summary=${parts.join(', ') || 'refresh'}
`, { flag: 'a' });
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [`### PD2 wiki sync`, `${live.length} pages checked, ${fetched} fetched.`, ''];
    for (const t of added) lines.push(`- added: ${t}`);
    for (const u of updated) lines.push(`- updated: ${u.title}${u.summary ? ` (${u.summary})` : ''}`);
    for (const t of removed) lines.push(`- removed: ${t}`);
    if (sheetChanged) lines.push('- merc weapon sheet updated');
    await writeFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', { flag: 'a' });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
