import { parseHTML } from 'linkedom';
import fs from 'fs';
const D='../../wiki/data/';
const idx=JSON.parse(fs.readFileSync(D+'index.json','utf8'));
const by=Object.fromEntries(idx.pages.map(p=>[p.title,p]));
for (const t of process.argv.slice(2)) {
  const doc=parseHTML('<html><body>'+fs.readFileSync(D+'pages/'+by[t].id+'.html','utf8')+'</body></html>').document;
  const hs=[...doc.querySelectorAll('.mw-heading > *')];
  console.log('=====',t, by[t].len, 'headings',hs.length,'tables',doc.querySelectorAll('table').length);
  console.log(hs.map(h=>h.tagName+':'+h.textContent.trim()).join(' | ').slice(0,2500));
  for (const tb of [...doc.querySelectorAll('table.wikitable')].slice(0,40)) { const tr=tb.querySelector('tr'); console.log('  T', (tb.querySelector('caption')?.textContent.trim()||'').slice(0,40), '|', [...tr.children].map(c=>c.textContent.trim()).join(' / ').slice(0,150), '| rows', tb.querySelectorAll('tr').length); }
}
