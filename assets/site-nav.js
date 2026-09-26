/* Shared navigation bar for RoofooEvazan's PD2 pages.
 *
 * Include it as the first thing in <body> on any page of the site:
 *   <script src="https://roofooevazan.github.io/assets/site-nav.js"></script>
 * It inserts the bar right where the script tag is, so the page doesn't jump.
 * To add or rename a page, edit LINKS below; every page picks it up.
 */
(function () {
  var ORIGIN = 'https://roofooevazan.github.io';
  var LINKS = [
    { label: 'Home', path: '/' },
    { label: 'Wiki', path: '/wiki/' },
    { label: 'IAS Calculator', path: '/pd2-ias-calc/' },
    { label: 'Advanced Stats', path: '/pd2-advanced-stats/' },
    { label: 'Hit Chance', path: '/pd2-hit-chance/' },
    { label: 'Damage Atlas', path: '/pd2-damage-atlas/' },
    { label: 'Spawn Simulator', path: '/pd2-spawn-simulator/' },
    { label: 'Base Finder', path: '/pd2-base-finder/' },
    { label: 'Loot Filter Builder', path: '/Roofoo-s-PD2-Loot-Filter/' }
  ];

  // On the live site links stay root-relative; anywhere else (a local preview,
  // a page hosted elsewhere) they point at the live site.
  var onSite = location.hostname === 'roofooevazan.github.io';
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  function href(path) { return onSite || local ? path : ORIGIN + path; }

  var here = location.pathname.replace(/index\.html$/, '');
  function isActive(path) {
    if (path === '/') return here === '/';
    return here.toLowerCase().indexOf(path.toLowerCase()) === 0;
  }

  var css = [
    '.rsn{position:relative;z-index:50;background:linear-gradient(180deg,#120e0a,#0b0906);border-bottom:1px solid #3a3024;font:500 14.5px/1.3 "Alegreya Sans",system-ui,sans-serif;color:#e8dfcf}',
    '.rsn *{box-sizing:border-box}',
    '.rsn-in{max-width:1280px;margin:0 auto;padding:0 16px;height:48px;display:flex;align-items:center;gap:18px}',
    '.rsn-brand{display:flex;align-items:center;gap:9px;flex:none;color:#d9b25f;text-decoration:none;font-family:Cinzel,serif;font-weight:700;letter-spacing:.05em;font-size:15px}',
    '.rsn-orb{width:18px;height:18px;border-radius:50%;border:2px solid #b8974f;background:radial-gradient(circle at 50% 70%,#e0342a,#8c1310 50%,#2a0404)}',
    '.rsn-links{display:flex;align-items:center;gap:2px;margin:0;padding:0;list-style:none;min-width:0;overflow:hidden}',
    '.rsn-links a{display:block;padding:6px 10px;border-radius:6px;color:#a89c86;text-decoration:none;white-space:nowrap}',
    '.rsn-links a:hover{color:#f3d58c;background:rgba(217,178,95,.07)}',
    '.rsn-links a[aria-current=page]{color:#f3d58c;background:rgba(217,178,95,.12);box-shadow:inset 0 -2px 0 #d9b25f}',
    '.rsn a:focus-visible,.rsn button:focus-visible{outline:2px solid #f3d58c;outline-offset:2px}',
    '.rsn-toggle{display:none;margin-left:auto;align-items:center;gap:8px;height:34px;padding:0 12px;border-radius:6px;border:1px solid #3a3024;background:#14110d;color:#e8dfcf;font:inherit;cursor:pointer}',
    '.rsn-toggle svg{width:18px;height:18px}',
    '@media (max-width:1020px){',
    ' .rsn-toggle{display:inline-flex}',
    ' .rsn-links{display:none;position:absolute;left:0;right:0;top:48px;flex-direction:column;align-items:stretch;gap:0;padding:6px 10px 12px;background:#0f0c09;border-bottom:1px solid #3a3024;box-shadow:0 14px 30px rgba(0,0,0,.6)}',
    ' .rsn.open .rsn-links{display:flex}',
    ' .rsn-links a{padding:11px 12px;font-size:16px}',
    ' .rsn-links a[aria-current=page]{box-shadow:inset 3px 0 0 #d9b25f}',
    '}',
    '@media print{.rsn{display:none}}'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var items = LINKS.map(function (l) {
    var cur = isActive(l.path) ? ' aria-current="page"' : '';
    return '<li><a href="' + href(l.path) + '"' + cur + '>' + l.label + '</a></li>';
  }).join('');

  var nav = document.createElement('nav');
  nav.className = 'rsn';
  nav.setAttribute('aria-label', 'Site');
  nav.innerHTML =
    '<div class="rsn-in">' +
      '<a class="rsn-brand" href="' + href('/') + '"><span class="rsn-orb" aria-hidden="true"></span>Roofoo’s PD2</a>' +
      '<button class="rsn-toggle" type="button" aria-expanded="false" aria-controls="rsn-links">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>Menu</button>' +
      '<ul class="rsn-links" id="rsn-links">' + items + '</ul>' +
    '</div>';

  var me = document.currentScript;
  if (me && me.parentNode && me.parentNode !== document.head) me.parentNode.insertBefore(nav, me);
  else document.body.insertBefore(nav, document.body.firstChild);

  var btn = nav.querySelector('.rsn-toggle');
  function setOpen(open) {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  }
  btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!nav.classList.contains('open')); });
  document.addEventListener('click', function (e) { if (!nav.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
})();
