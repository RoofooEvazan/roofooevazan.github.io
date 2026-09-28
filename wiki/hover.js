/* Hover cards: point at any link to an item, skill or map (or anything marked
 * data-hc="rune:Ber") and its details appear beside the pointer, so lists can stay
 * short. Mouse and trackpad only; on touch screens links just open their page.
 */
(() => {
  'use strict';
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const SEL = 'a[href^="#/item/"], a[href^="#/skills/"], a[href^="#/map/"], [data-hc]';
  const SKIP = '.hc, .icard, .tooltip, .results, details[open] > summary';
  const cache = new Map();
  let box = null, cur = null, timer = 0, seq = 0, px = 0, py = 0;

  const keyOf = el => {
    if (el.dataset.hc) return el.dataset.hc;
    const h = el.getAttribute('href') || '';
    let m;
    if ((m = h.match(/^#\/item\/([^?#]+)/))) return 'item:' + decodeURIComponent(m[1]);
    if ((m = h.match(/^#\/skills\/([A-Za-z]+)\/([^?#]+)/)) && m[1] !== 'changes') return `skill:${m[1]}/${decodeURIComponent(m[2])}`;
    if ((m = h.match(/^#\/map\/([^?#]+)/))) return 'map:' + decodeURIComponent(m[1]);
    return '';
  };

  function build(key) {
    if (cache.has(key)) return cache.get(key);
    const i = key.indexOf(':'), type = key.slice(0, i), arg = key.slice(i + 1);
    let p = null;
    if (type === 'item') p = window.PD2Items?.tip(arg);
    else if (type === 'skill') { const j = arg.indexOf('/'); p = window.PD2Skills?.tip(arg.slice(0, j), arg.slice(j + 1)); }
    else if (type === 'map') p = window.PD2Maps?.tip(arg);
    else if (type === 'rune') p = window.PD2Gear?.runeTip(arg);
    else if (type === 'boss') p = window.PD2World?.bossTip(arg);
    else if (type === 'craft') p = window.PD2Cube?.craftTip(arg);
    else if (type === 'affix') p = window.PD2Affixes?.tip(arg);
    else if (type === 'faq') p = window.PD2Guide?.faqTip(arg);
    else if (type === 'build') p = window.PD2Guide?.buildTip(arg);
    else if (type === 'base') p = window.PD2Gear?.baseTip(arg);
    else if (type === 'mskill') p = window.PD2Gear?.mercSkillTip(arg);
    else if (type === 'cos') p = window.PD2Extras?.cosTip(arg);
    else if (type === 'lfilter') p = window.PD2Filters?.filterTip(arg);
    p = Promise.resolve(p).catch(() => '');
    cache.set(key, p);
    return p;
  }

  // The card's size is measured once per card (and again when an image loads), not on
  // every mouse move, and it moves at most once per frame, so the mouse stays smooth.
  let w = 0, h = 0, frame = 0;
  const measure = () => { if (box && !box.hidden) { w = box.offsetWidth; h = box.offsetHeight; place(); } };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; place(); }); };
  function place() {
    if (!box || box.hidden) return;
    const gap = 18;
    let x = px + gap, y = py + gap;
    if (x + w > innerWidth - 8) x = Math.max(8, px - w - gap);
    if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
    box.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  function show(html) {
    if (!box) {
      box = document.createElement('div');
      box.className = 'hc';
      box.setAttribute('role', 'tooltip');
      document.body.appendChild(box);
    }
    box.innerHTML = html;
    box.hidden = false;
    measure();
    // Images change the size once they load.
    for (const img of box.querySelectorAll('img')) if (!img.complete) img.addEventListener('load', measure, { once: true });
  }

  function hide() {
    clearTimeout(timer);
    if (!cur && (!box || box.hidden)) return;
    seq++;
    cur = null;
    if (box) box.hidden = true;
  }

  document.addEventListener('pointermove', e => {
    px = e.clientX; py = e.clientY;
    if (cur && box && !box.hidden) schedule();
  }, { passive: true });

  document.addEventListener('pointerover', e => {
    if (!fine.matches || e.pointerType === 'touch') return;
    const el = e.target.closest?.(SEL);
    if (!el || el === cur) return;
    if (el.closest(SKIP)) return;
    const key = keyOf(el);
    if (!key) return;
    hide();
    cur = el;
    const my = seq;
    timer = setTimeout(async () => {
      const html = await build(key);
      if (my !== seq || !html || !el.isConnected) return;
      show(html);
    }, 60);
  });

  document.addEventListener('pointerout', e => {
    if (!cur) return;
    const to = e.relatedTarget;
    if (to && cur.contains(to)) return;
    hide();
  });
  addEventListener('scroll', hide, { passive: true, capture: true });
  addEventListener('hashchange', hide);
  document.addEventListener('pointerdown', hide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
})();
