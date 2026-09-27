/* Shared navigation bar for RoofooEvazan's PD2 pages.
 *
 * Include it as the first thing in <body> on any page of the site:
 *   <script src="https://roofooevazan.github.io/assets/site-nav.js"></script>
 * It inserts the bar right where the script tag is, so the page doesn't jump.
 * To add or rename a page, edit LINKS below; every page picks it up.
 * The bar also holds the Tristram / Chaos theme switch (see THEMES).
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

  // ---- theme: Tristram (default) or Chaos, one choice for every page ----
  // All the pages share the roofooevazan.github.io origin, so one saved value
  // follows the visitor from page to page. It is applied here, before the page
  // below the bar draws; assets/tristram.css holds both themes' colors.
  var THEMES = [
    { id: 'tristram', label: 'Tristram', color: '#100c0a' },
    { id: 'chaos', label: 'Chaos', color: '#090807' }
  ];
  var KEY = 'rf-theme';
  function saved() {
    var t = null;
    try { t = localStorage.getItem(KEY); } catch (e) {}
    return t === 'chaos' ? 'chaos' : 'tristram';
  }
  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', id === 'chaos' ? THEMES[1].color : THEMES[0].color);
  }
  applyTheme(saved());

  // Colors come from the theme (--tri-*), with Tristram as the fallback.
  var css = [
    '.rsn{position:relative;z-index:50;background:var(--tri-bg,#100c0a);border-bottom:1px solid var(--tri-line,#5a4030);box-shadow:inset 0 -3px 0 var(--tri-accent,#8e261c);font:400 15px/1.3 var(--tri-body,Alegreya,Palatino,Georgia,serif);color:var(--tri-fg,#f1e2c6)}',
    '.rsn *{box-sizing:border-box}',
    '.rsn-in{max-width:1280px;margin:0 auto;padding:0 16px 3px;height:51px;display:flex;align-items:center;gap:18px}',
    '.rsn-brand{display:flex;align-items:center;gap:9px;flex:none;color:var(--tri-gold,#d2b06a);text-decoration:none;font:700 12px/1 var(--tri-display,"Tri Minus",Silkscreen,monospace);letter-spacing:.06em;text-transform:uppercase}',
    '.rsn-mark{width:14px;height:14px;flex:none;border:2px solid var(--tri-gold,#d2b06a);background:radial-gradient(var(--tri-accent,#8e261c) 0 3px,transparent 3.5px),var(--tri-bg,#100c0a)}',
    '.rsn-links{display:flex;align-items:center;gap:2px;margin:0;padding:0;list-style:none;min-width:0;overflow:hidden}',
    '.rsn-links a{display:block;padding:6px 9px;color:var(--tri-muted,#b59a76);text-decoration:none;white-space:nowrap}',
    '.rsn-links a:hover{color:var(--tri-fg,#f1e2c6);background:color-mix(in srgb,var(--tri-gold,#d2b06a) 10%,transparent)}',
    '.rsn-links a[aria-current=page]{color:var(--tri-accent-fg,#f6ead4);background:var(--tri-accent,#8e261c)}',
    '.rsn a:focus-visible,.rsn button:focus-visible{outline:2px solid var(--tri-gold,#d2b06a);outline-offset:2px}',
    '.rsn-theme{display:flex;flex:none;margin-left:auto;border:1px solid var(--tri-line,#5a4030)}',
    '.rsn-theme button{height:32px;padding:0 10px;border:0;background:transparent;color:var(--tri-muted,#b59a76);font:700 10px/1 var(--tri-display,"Tri Minus",Silkscreen,monospace);letter-spacing:.08em;text-transform:uppercase;cursor:pointer}',
    '.rsn-theme button:hover{color:var(--tri-fg,#f1e2c6)}',
    '.rsn-theme button[aria-pressed=true]{background:var(--tri-accent,#8e261c);color:var(--tri-accent-fg,#f6ead4);cursor:default}',
    '.rsn-toggle{display:none;align-items:center;gap:8px;height:34px;padding:0 12px;border:1px solid var(--tri-line,#5a4030);background:transparent;color:var(--tri-fg,#f1e2c6);font:700 11px/1 var(--tri-display,"Tri Minus",Silkscreen,monospace);letter-spacing:.08em;text-transform:uppercase;cursor:pointer}',
    '.rsn-toggle svg{width:18px;height:18px}',
    '@media (max-width:1120px){',
    ' .rsn-in{gap:10px}',
    ' .rsn-toggle{display:inline-flex}',
    ' .rsn-links{display:none;position:absolute;left:0;right:0;top:51px;flex-direction:column;align-items:stretch;gap:0;padding:6px 10px 12px;background:var(--tri-panel,#1a1410);border-bottom:4px solid var(--tri-accent,#8e261c);box-shadow:inset 0 1px 0 var(--tri-gold,#d2b06a),0 14px 30px rgba(0,0,0,.6)}',
    ' .rsn.open .rsn-links{display:flex}',
    ' .rsn-links a{padding:11px 12px;font-size:16px;border-top:1px solid color-mix(in srgb,var(--tri-line,#5a4030) 60%,transparent)}',
    ' .rsn-links li:first-child a{border-top:0}',
    '}',
    '@media (max-width:440px){ .rsn-name,.rsn-word{display:none} .rsn-toggle{padding:0 9px} }',
    '@media print{.rsn{display:none}}'
  ].join('\n');

  // The theme fonts, for pages that don't load them all already (Alegreya is
  // the body text; pages with an older font link still get it from here).
  if (!document.querySelector('link[href*="family=Alegreya:"]')) {
    var fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = 'https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&family=Cinzel:wght@500;700&family=Silkscreen:wght@400;700&display=swap';
    document.head.appendChild(fonts);
  }

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
  var switches = THEMES.map(function (t) {
    return '<button type="button" data-theme="' + t.id + '" aria-pressed="false">' + t.label + '</button>';
  }).join('');
  nav.innerHTML =
    '<div class="rsn-in">' +
      '<a class="rsn-brand" href="' + href('/') + '"><span class="rsn-mark" aria-hidden="true"></span><span class="rsn-name">PD2 Hub</span></a>' +
      '<ul class="rsn-links" id="rsn-links">' + items + '</ul>' +
      '<div class="rsn-theme" role="group" aria-label="Theme">' + switches + '</div>' +
      '<button class="rsn-toggle" type="button" aria-expanded="false" aria-controls="rsn-links" aria-label="Menu">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span class="rsn-word">Menu</span></button>' +
    '</div>';

  var me = document.currentScript;
  if (me && me.parentNode && me.parentNode !== document.head) me.parentNode.insertBefore(nav, me);
  else document.body.insertBefore(nav, document.body.firstChild);

  var themeBtns = nav.querySelectorAll('.rsn-theme button');
  function showTheme(id) {
    for (var i = 0; i < themeBtns.length; i++)
      themeBtns[i].setAttribute('aria-pressed', String(themeBtns[i].getAttribute('data-theme') === id));
  }
  showTheme(saved());
  nav.querySelector('.rsn-theme').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-theme]');
    if (!b) return;
    var id = b.getAttribute('data-theme');
    try { localStorage.setItem(KEY, id); } catch (err) {}
    applyTheme(id);
    showTheme(id);
  });
  // Another open tab of the site switched theme: follow it.
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    applyTheme(saved());
    showTheme(saved());
  });

  var btn = nav.querySelector('.rsn-toggle');
  function setOpen(open) {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  }
  btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!nav.classList.contains('open')); });
  document.addEventListener('click', function (e) { if (!nav.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
})();
