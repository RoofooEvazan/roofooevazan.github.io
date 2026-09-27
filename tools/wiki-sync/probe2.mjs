import fs from 'fs';
const D='../../wiki/data/';
const idx=JSON.parse(fs.readFileSync(D+'index.json','utf8'));
const by=Object.fromEntries(idx.pages.map(p=>[p.title,p]));
const [t,id,max]=process.argv.slice(2);
const html=fs.readFileSync(D+'pages/'+by[t].id+'.html','utf8');
const i=html.indexOf(id);
console.log(html.slice(i-80, i+(+max||3000)).replace(/<img[^>]*>/g,'[img]').replace(/\n+/g,'\n'));
