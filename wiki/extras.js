/* New in PD2 and Cosmetics, from gear.json (New Items and Cosmetics pages).
 *   #/new[#section]        everything PD2 added: item cards, consumables, maps
 *   #/cosmetics[#entry]    aura effects and alternate item skins
 */
(() => {
  'use strict';
  const P = () => window.PD2;
  const attrib = id => { const p = P().byId(id); return `<p class="attrib">From <a href="${p ? P().wikiUrl(p.title) : '#'}" target="_blank" rel="noopener">${P().esc(p?.title || 'the PD2 Wiki')}</a> on the Project Diablo 2 Wiki, shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`; };
  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Wiki</a><span aria-hidden="true">›</span><a href="#/items">Items</a></nav>`;

  async function newItems(root, anchor) {
    const { esc, pageHref, resolve } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    let g;
    try { [g] = await Promise.all([window.PD2Gear.load(), window.PD2Items.load(), window.PD2Maps.load().catch(() => null)]); }
    catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load new items.</b><br>${esc(e.message)}</div>`; return; }
    const N = g.newItems;
    const items = window.PD2Items.data.items;
    const maps = window.PD2Maps.data?.maps || [];
    const itemsNamed = n => items.filter(i => i.name.toLowerCase() === n.toLowerCase());
    const mapNamed = n => maps.find(m => m.name.toLowerCase() === n.toLowerCase());
    const linkFor = node => {
      if (!node.link) return '';
      const r = resolve(node.link.split('#')[0]);
      return r ? pageHref(r.page.title, node.link.split('#')[1] || r.frag) : '';
    };
    // Groups whose entries are all equipment render as item cards; everything else as a list.
    const leafCards = nodes => {
      const cards = [], rest = [];
      for (const n of nodes) {
        const its = itemsNamed(n.name);
        if (its.length && !n.kids.length) cards.push(...its); else rest.push(n);
      }
      return { cards, rest };
    };
    const listNode = n => {
      const href = linkFor(n);
      const m = mapNamed(n.name);
      const label = m ? `<a href="#/map/${m.slug}">${esc(n.name)}</a>` : href ? `<a href="${href}">${esc(n.name)}</a>` : esc(n.name);
      return `<li><span class="nn">${label}</span>${n.note ? `<span class="nnote">${esc(n.note)}</span>` : ''}${n.kids.length ? `<ul>${n.kids.map(listNode).join('')}</ul>` : ''}</li>`;
    };
    const group = (n, depth) => {
      const { cards, rest } = leafCards(n.kids);
      const title = depth === 0 ? `<h2 class="home-h">${esc(n.name)}</h2>` : `<h3 class="sub-h">${esc(n.name)}${n.note ? ` <small>${esc(n.note)}</small>` : ''}</h3>`;
      const sub = rest.filter(x => x.kids.length && x.kids.some(k => itemsNamed(k.name).length));
      const plain = rest.filter(x => !sub.includes(x));
      return `<section class="ngroup">${title}
        ${cards.length ? `<div class="igrid">${cards.map(i => window.PD2Items.card(i)).join('')}</div>` : ''}
        ${sub.map(x => group(x, depth + 1)).join('')}
        ${plain.length ? `<ul class="nlist">${plain.map(listNode).join('')}</ul>` : ''}</section>`;
    };
    root.innerHTML = `${crumbs}<h1 class="page-title">New in PD2</h1>
      <p class="lead">Everything Project Diablo 2 adds on top of Lord of Destruction: new runewords, set items and uniques, new consumables and uber keys, and maps.</p>
      <div class="chips njump">${N.sections.map(s => `<a class="chip" href="#/new#${esc(s.anchor)}">${esc(s.title)}</a>`).join('')}<a class="chip" href="#/cosmetics">Cosmetics</a></div>
      ${N.sections.map(s => `<section class="nsec" id="${esc(s.anchor)}"><h2 class="page-sub">${esc(s.title)}</h2>
        ${s.tree.map(n => n.kids.length ? group(n, 0) : `<ul class="nlist">${listNode(n)}</ul>`).join('')}</section>`).join('')}
      ${attrib(N.page)}`;
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  }

  async function cosmetics(root, anchor) {
    const { esc, $$, enhanceFragment } = P();
    root.innerHTML = '<div class="loading">Loading…</div>';
    let g;
    try { [g] = await Promise.all([window.PD2Gear.load(), window.PD2Items.load()]); }
    catch (e) { root.innerHTML = `<div class="error"><b>Couldn't load cosmetics.</b><br>${esc(e.message)}</div>`; return; }
    const C = g.cosmetics;
    const items = window.PD2Items.data.items;
    const card = e => {
      const it = e.unique && items.find(i => i.name === e.name);
      return `<article class="cos${e.premium ? ' premium' : ''}" id="${esc(e.anchor)}">
        <header><h3>${it ? `<a href="#/item/${it.slug}">${esc(e.name)}</a>` : esc(e.name)}</h3>${e.premium ? '<em>Premium</em>' : ''}</header>
        ${e.imgs.length ? `<div class="cos-imgs">${e.imgs.map(im => `<a class="img-link" href="${esc(im.full)}"><img src="${esc(im.thumb)}" alt="${esc(im.alt || e.name)}" loading="lazy"></a>`).join('')}</div>` : ''}
        ${e.base ? `<p class="cos-base">${esc(e.base)}</p>` : ''}
        ${e.facts.length ? `<ul class="kv">${e.facts.map(f => `<li><span>${esc(f.label)}</span><b>${f.html}</b></li>`).join('')}</ul>` : ''}
        ${e.notes ? `<div class="wiki cos-notes">${e.notes}</div>` : ''}
      </article>`;
    };
    root.innerHTML = `${crumbs}<h1 class="page-title">Cosmetics</h1>
      <p class="lead">Character auras earned from achievements and events, and alternate looks for some items.</p>
      ${C.groups.map(gr => `<section class="cgroup" id="${esc(gr.anchor || '')}">
        <h2 class="home-h">${esc(gr.title)}${gr.parent && gr.parent !== gr.title ? ` <small>${esc(gr.parent)}</small>` : ''}</h2>
        ${gr.intro ? `<div class="wiki lead">${gr.intro}</div>` : ''}
        ${gr.entries.length ? `<div class="cos-grid">${gr.entries.map(card).join('')}</div>` : ''}</section>`).join('')}
      ${attrib(C.page)}`;
    for (const el of $$('.wiki', root)) enhanceFragment(el, P().byId(C.page));
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  }

  window.PD2Extras = { newItems, cosmetics };
})();
