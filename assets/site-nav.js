/* Shared navigation bar for RoofooEvazan's PD2 pages.
 *
 * Include it as the first thing in <body> on any page of the site:
 *   <script src="https://roofooevazan.github.io/assets/site-nav.js"></script>
 * It inserts the bar right where the script tag is, so the page doesn't jump.
 * To add or rename a page, edit LINKS below; every page picks it up.
 * It also puts every page in the Chaos theme (assets/tristram.css).
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

  // RoofooEvazan's channels, as icons at the end of the bar.
  var SOCIALS = [
    { label: 'YouTube', href: 'https://www.youtube.com/@RoofooEvazan', path: 'M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .6 12a31 31 0 0 0 .4 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-4.8 31 31 0 0 0-.4-4.8zM9.7 15.1V8.9l5.5 3.1z' },
    { label: 'Twitch', href: 'https://www.twitch.tv/roofooevazan', path: 'M4.3 2 3 5.4v13.8h4.7V22h2.6l2.7-2.8h3.8l5.2-5.2V2zm16 11.1-2.9 2.9h-4.8l-2.5 2.5V16H6.2V3.7h14.1zm-3-6.4h-1.7v5h1.7zm-4.8 0h-1.7v5h1.7z' }
  ];

  // ---- theme: Chaos on every page (colors in assets/tristram.css) ----
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#090807');

  // Colors come from the theme (--tri-*), with Chaos values as the fallback.
  var css = [
    '.rsn{position:relative;z-index:50;background:var(--tri-bg,#090807);border-bottom:1px solid var(--tri-line,#6e5230);box-shadow:inset 0 -3px 0 var(--tri-accent,#c4924a);font:400 15px/1.3 var(--tri-body,"Barlow Semi Condensed","Arial Narrow",sans-serif);color:var(--tri-fg,#f0e6d6)}',
    '.rsn *{box-sizing:border-box}',
    '.rsn-in{max-width:1280px;margin:0 auto;padding:0 16px 3px;height:51px;display:flex;align-items:center;gap:18px}',
    '.rsn-brand{display:flex;align-items:center;gap:9px;flex:none;color:var(--tri-gold,#c4924a);text-decoration:none;font:700 12px/1 var(--tri-display,"Barlow Condensed","Arial Narrow",sans-serif);letter-spacing:.06em;text-transform:uppercase}',
    '.rsn-mark{width:14px;height:14px;flex:none;border:2px solid var(--tri-gold,#c4924a);background:radial-gradient(var(--tri-accent,#c4924a) 0 3px,transparent 3.5px),var(--tri-bg,#090807)}',
    '.rsn-links{display:flex;align-items:center;gap:2px;margin:0;padding:0;list-style:none;min-width:0;overflow:hidden}',
    '.rsn-links a{display:block;padding:6px 9px;color:var(--tri-muted,#a89480);text-decoration:none;white-space:nowrap}',
    '.rsn-links a:hover{color:var(--tri-fg,#f0e6d6);background:color-mix(in srgb,var(--tri-gold,#c4924a) 10%,transparent)}',
    '.rsn-links a[aria-current=page]{color:var(--tri-accent-fg,#140e08);background:var(--tri-accent,#c4924a)}',
    '.rsn a:focus-visible,.rsn button:focus-visible{outline:2px solid var(--tri-gold,#c4924a);outline-offset:2px}',
    '.rsn-social{display:flex;flex:none;margin-left:auto}',
    '.rsn-social a{display:grid;place-items:center;width:32px;height:32px;color:var(--tri-muted,#a89480)}',
    '.rsn-social a:hover{color:var(--tri-gold,#c4924a)}',
    '.rsn-social svg{width:17px;height:17px}',
    '.rsn-toggle{display:none;align-items:center;gap:8px;height:34px;padding:0 12px;border:1px solid var(--tri-line,#6e5230);background:transparent;color:var(--tri-fg,#f0e6d6);font:700 11px/1 var(--tri-display,"Barlow Condensed","Arial Narrow",sans-serif);letter-spacing:.08em;text-transform:uppercase;cursor:pointer}',
    '.rsn-toggle svg{width:18px;height:18px}',
    // .compact: the links don't fit on one line (set by fit() below), so they
    // fold into the Menu button.
    '.rsn.compact .rsn-in{gap:10px}',
    '.rsn.compact .rsn-toggle{display:inline-flex}',
    '.rsn.compact .rsn-links{display:none;position:absolute;left:0;right:0;top:51px;flex-direction:column;align-items:stretch;gap:0;padding:6px 10px 12px;background:var(--tri-panel,#1a1410);border-bottom:4px solid var(--tri-accent,#c4924a);box-shadow:inset 0 1px 0 var(--tri-gold,#c4924a),0 14px 30px rgba(0,0,0,.6)}',
    '.rsn.compact.open .rsn-links{display:flex}',
    '.rsn.compact .rsn-links a{padding:11px 12px;font-size:16px;border-top:1px solid color-mix(in srgb,var(--tri-line,#6e5230) 60%,transparent)}',
    '.rsn.compact .rsn-links li:first-child a{border-top:0}',
    '@media (max-width:440px){ .rsn-name,.rsn-word{display:none} .rsn.compact .rsn-in{gap:6px;padding-left:12px;padding-right:12px} .rsn-toggle{padding:0 9px} .rsn-social a{width:28px} }',
    '@media print{.rsn{display:none}}'
  ].join('\n');

  // The theme fonts (Barlow Semi Condensed for body text, Barlow Condensed for
  // headings, JetBrains Mono for codes), for
  // pages whose own font link doesn't include the body font yet.
  if (!document.querySelector('link[href*="Barlow+Semi+Condensed"]')) {
    var fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow+Semi+Condensed:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap';
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
  var socials = SOCIALS.map(function (l) {
    return '<a href="' + l.href + '" aria-label="RoofooEvazan on ' + l.label + '" title="' + l.label + '">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="' + l.path + '"/></svg></a>';
  }).join('');
  nav.innerHTML =
    '<div class="rsn-in">' +
      '<a class="rsn-brand" href="' + href('/') + '"><span class="rsn-mark" aria-hidden="true"></span><span class="rsn-name">PD2 Hub</span></a>' +
      '<ul class="rsn-links" id="rsn-links">' + items + '</ul>' +
      '<div class="rsn-social">' + socials + '</div>' +
      '<button class="rsn-toggle" type="button" aria-expanded="false" aria-controls="rsn-links" aria-label="Menu">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span class="rsn-word">Menu</span></button>' +
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

  // Fold the links into the Menu button whenever they don't fit on one line.
  // Measured rather than a fixed breakpoint, so adding a page or a font swap
  // can never clip the last links.
  var list = nav.querySelector('.rsn-links');
  function fit() {
    var wasOpen = nav.classList.contains('open');
    nav.classList.remove('compact');
    var tight = list.scrollWidth > list.clientWidth + 1;
    nav.classList.toggle('compact', tight);
    if (!tight && wasOpen) setOpen(false);
  }
  fit();
  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
