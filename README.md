# PD2 Hub

The main page that links all of RoofooEvazan's Project Diablo 2 tools together. The tools are built on the game's own code, reverse engineered from PD2's client files.

**Live site:** https://roofooevazan.github.io/

| Tool | Site | Repo |
|---|---|---|
| IAS Calculator | https://roofooevazan.github.io/pd2-ias-calc/ | [pd2-ias-calc](https://github.com/RoofooEvazan/pd2-ias-calc) |
| Advanced Stats | https://roofooevazan.github.io/pd2-advanced-stats/ | [pd2-advanced-stats](https://github.com/RoofooEvazan/pd2-advanced-stats) |
| Hit Chance | https://roofooevazan.github.io/pd2-hit-chance/ | [pd2-hit-chance](https://github.com/RoofooEvazan/pd2-hit-chance) |
| Damage Atlas | https://roofooevazan.github.io/pd2-damage-atlas/ | [pd2-damage-atlas](https://github.com/RoofooEvazan/pd2-damage-atlas) |
| Spawn Simulator | https://roofooevazan.github.io/pd2-spawn-simulator/ | [pd2-spawn-simulator](https://github.com/RoofooEvazan/pd2-spawn-simulator) |
| Base Finder | https://roofooevazan.github.io/pd2-base-finder/ | [pd2-base-finder](https://github.com/RoofooEvazan/pd2-base-finder) |
| Loot Filter Builder | https://roofooevazan.github.io/Roofoo-s-PD2-Loot-Filter/ | [Roofoo-s-PD2-Loot-Filter](https://github.com/RoofooEvazan/Roofoo-s-PD2-Loot-Filter) |
| PD2 Wiki | https://roofooevazan.github.io/wiki/ | this repo, [`wiki/`](wiki/) |

## PD2 Wiki

**https://roofooevazan.github.io/wiki/**

Everything from the [Project Diablo 2 wiki](https://wiki.projectdiablo2.com/), reorganized in this site's own style so it's faster to find things, on desktop or phone:

- **Item database** with every unique, set item and runeword as a card. Filter by type, slot, weapon type, tier, sockets, base type and level; search by name, rune or any stat ("faster cast rate"); show only what PD2 changed. Each item has its own page with a D2-style tooltip that marks what PD2 added, changed (with the old value beneath) or removed, beside the base item (with its hover card), other uniques and sets on the same base, the rest of its set, notes and patch history.
- **Skill browser** for each class, with the three trees laid out by level (on wide screens beside the chosen skill, so picking one never scrolls) and a skill-level slider in place of the wiki's 60-column tables; each skill shows what PD2 changed from vanilla and which items grant it. The item-only skills (Blade Dance, Blink, Bone Nova, Lesser Fade, Vampire Form) have their own tab, and every skill change from vanilla is searchable by class, with the oskill and item-aura tables. The per-tree pages open the matching tree.
- **Map explorer** with every map as a card showing what's immune, filterable by tier, monster type, and "no monsters immune to" (e.g. cold, for a cold build). Each map has its monster resistance table, notes and screenshots, and map events, modifying and affixes have their own tabs.
- **Crafting & Cube**: every Horadric Cube recipe as ingredients → result, searchable and filterable by group, section and rune; all 70 crafted items (7 craft types × 10 slots) with recipe and stats, comparable by type or slot; and corruption outcomes by item type and rarity (search one modifier to see every item that can roll it and at which rarity), with desecration (a second corruption on amulets after Lucion) and its odds by tier.
- **Zones & monsters**: every zone's Normal/Nightmare/Hell level, sortable, filterable by act, level 85, corruptible and "no monsters immune to"; and a bestiary of act bosses, key holders and ubers with resistances, stats, where they spawn and their PD2 changes.
- **Game mechanics** by topic, with calculators for crit chance and average crit damage, life/mana leech, crushing blow, breaking immunities and resistance, and yards to tiles, all following the wiki's formulas.
- **Affix finder**: pick an item type, item level and (optionally) base to see every prefix and suffix that can roll, with each one's share of the rolls, using the wiki's affix-level rules; plus PD2's changed and removed affixes.
- **Item bases, runes & mercenaries**: all 506 bases in one-line sortable rows by type and tier (PD2-changed values in gold, each base's upgrade path, stats and the uniques and sets on it on hover); every rune with its cube upgrade and the runewords that use it, plus gems and jewels; and all mercenaries compared at one level (auras, HP, defense, attributes, attack rating, resist, damage) with the rules for hiring and gear, plus each mercenary's page with a level slider and skill cards that give the skill level at your merc level and the class skill's own numbers.
- **Help, builds & breakpoints**: the FAQ and Support FAQ as a searchable help center (two columns of questions, each answer previewed on hover); a build directory of every guide from the wiki's Links page plus the wiki's own guides, one line each by class, season, starter and where it's hosted, with key skills inline and the intro on hover; and a breakpoint lookup for cast rate, hit recovery, block rate and attack speed (item IAS, skill IAS and WSM), with diminishing-returns calculators for IAS, run/walk and magic find.
- **Loot filters & game setup**: the filter guide by topic (in-game settings, syntax, strictness, formulas); a code finder over all 2,237 filter codes (one line each, color codes in their color) (item codes, groups, stats, skills, map and stat IDs, colors, keywords), searchable by code or meaning with click-to-copy; the public filter list as compact rows (full description on hover) next to the Loot Filter Builder; and the ProjectDiablo.cfg, UI.ini and ddraw.ini setup notes.
- **Stat planner & quality levels**: plan any class's stat points at a level (with Lam Esen's Tome and gear Str/Dex requirements) to see life, mana, stamina, attack rating and defense, with all seven classes compared; and every base family's quality level, linked to the affix finder.
- **New in PD2 & cosmetics**: every PD2-added runeword, set item and unique as item cards by group, plus new consumables, uber keys and maps (linked to the map explorer); and every character aura and alternate item skin with its pictures and how to unlock it.
- **What PD2 changed**: every general change from the original game (out-of-game, quality of life, balancing, items, recipes, NPCs, PvP, bug fixes), searchable by category, with links to changed items, new items, skill changes and patch notes; plus the outdated Season 1 skill notes, clearly labelled, with each skill linked to its current page.
- **PvP & dueling**: arena rules and tournaments; every skill's PvP damage multiplier (Normal/Nightmare and Hell) next to how it plays differently, by class and searchable; and the Low Level Dueling guide with jump links to its item sections.
- **Abbreviations**: the slang and abbreviations glossary, searchable by term or meaning, with A–Z jumps and the item-color key.
- **About PD2**: the rules as searchable numbered cards; a season timeline (every ladder season and league with its length and notes, filled in from the patch notes when the wiki's table lags); known bugs with fixes and recently confirmed ones marked; singleplayer differences and bugs; and the credits by role. The Arrows page (marked redundant on the wiki) opens the quiver list in the item database.
- **Patch notes by season**: a timeline from Season 1 to the upcoming season, each split into General, Classes, Items, Maps & Ubers, PvP and Hotfixes, with class filters and a search across every season; each section folds to one line with its number of changes (Expand all opens everything, and links into a section open it). Item and skill pages show their own patch history.
- **Compact layout**: the home page is a one-screen directory with the current and next season and quick tools; the sidebar lists one link per view (Items, Classes & Skills, Crafting & Cube, Endgame, Mechanics, Guides & Help, Patch Notes, About) and keeps only the current section open. Items, maps, crafted items, cube recipes, zones, affixes and runes default to one-line rows (cards are one click away), and monsters are one table per group whose rows open their notes.
- **Hover cards**: point at any item, skill, map or rune anywhere on the site (lists, patch notes, wiki text) to see its full stats: an item's tooltip, a skill's numbers at your chosen level and what PD2 changed, a map's screenshot and immunities, a rune's bonuses, upgrade and runewords, a boss's resistances and PD2 changes, a craft's full recipe and old values, an affix's item types, levels and group. Pages that no section lists still appear under More Pages.
- **Search** finds items and skills first, then pages, sections and full-text mentions, as you type. Press `/` to jump to it.
- **Every other page** uses the site's style, with a sticky outline, sortable and filterable tables, and collapsible changelogs. Item lists inside pages become item cards.
- **Act 2 Merc Weapon Compare** turns the [merc weapon spreadsheet](https://docs.google.com/spreadsheets/d/1EnksMO35WPthXshjlNCg_wmbfYB_kcgUT321p6GhcsI/edit?gid=0) into a tool: set item and skill IAS (and optionally merc Str/Dex) to rank every weapon, see the best weapon at each IAS, and how much IAS the next breakpoint needs.

**Daily sync.** [`.github/workflows/wiki-sync.yml`](.github/workflows/wiki-sync.yml) runs [`tools/wiki-sync/sync.mjs`](tools/wiki-sync/sync.mjs) every day at 07:23 UTC. It asks the wiki's API which pages changed, re-fetches only those, pulls the spreadsheet, rebuilds the item, skill, map, crafting, zone, monster, mechanics, affix, base, rune, mercenary, help, guide, breakpoint, loot filter, class attribute, new item, cosmetic, general change, rules, singleplayer, credits and patch-note data with [`extract.mjs`](tools/wiki-sync/extract.mjs), and commits anything new to `wiki/data/`, which Pages then republishes. Each run's changes are listed on the wiki's Recent Changes page. To sync right away, open **Actions → Wiki sync → Run workflow** (tick *full* to re-fetch every page). To run it locally:

```
npm ci --prefix tools/wiki-sync
node tools/wiki-sync/sync.mjs
```

Wiki content is by the PD2 Wiki's contributors under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); every page links back to its original and history.

## Site navigation bar

[`assets/site-nav.js`](assets/site-nav.js) draws the bar at the top of the main page and the wiki. The list of pages lives in that one file. Any tool can show the same bar by adding this as the first line inside `<body>`:

```html
<script src="https://roofooevazan.github.io/assets/site-nav.js"></script>
```

## Tristram theme

The main page and the wiki use the Tristram theme: pixel stone, a blood-red rule and gold trim over a dimmed cathedral-night plate. [`assets/tristram.css`](assets/tristram.css) holds the colors, fonts (Silkscreen for headings, Almendra for text), the page ground and the red/outlined buttons; the wiki's resizing for the pixel font is in [`wiki/tristram.css`](wiki/tristram.css). Any tool can take on the same look:

```html
<link rel="stylesheet" href="https://roofooevazan.github.io/assets/tristram.css">
<!-- then <body class="tri"> for the page ground -->
```

The calculators share one older "stone and gold" design (`--void`, `--stone`, `--display`… and the HD dungeon skin). [`assets/tristram-tools.css`](assets/tristram-tools.css) turns that design into the Tristram theme, so each tool links it after its own styles, next to `tristram.css`.

**Chaos theme.** The nav bar has a Tristram / Chaos switch. The choice is saved in the browser (`localStorage` key `rf-theme`) and `site-nav.js` applies it as `<html data-theme="chaos">` before the page draws, so it follows the visitor to every page of the site. Chaos (black stone, dull brass, Cinzel headings, the lava-lit seal plate `assets/chaos.jpg`) is a `:root[data-theme="chaos"]` block in each theme sheet: `assets/tristram.css`, `assets/tristram-tools.css`, `wiki/tristram.css` and the Filter Builder's `docs/css/tristram.css`.

## Loot Filter Builder

**https://roofooevazan.github.io/Roofoo-s-PD2-Loot-Filter/**

A no-code way to make [Roofoo's PD2 loot filter](https://github.com/RoofooEvazan/Roofoo-s-PD2-Loot-Filter) your own. It always starts from the latest filter on GitHub and downloads a ready-to-use `.filter` file.

- **Colors & sounds:** pick a color theme or restyle any highlight, and choose drop sounds with in-browser previews.
- **Items:** every unique, set, rare, magic, base, rune, gem and potion in collapsible sections. Set star tiers, turn Mystery drops on or off, and show or hide anything per filter level, narrowed by ethereal, sockets, superior, item level or character level.
- **Test an item** and **Overview & review:** see how any item looks on every filter level, or everything your filter shows and hides, with in-game style item cards.
- **Save & install:** download the filter, share your setup as a link, or load it back later.

Custom filters leave out the live market prices (rune values, Rainbow Facet values, slam suggestions), which only stay current in the launcher version. They also always show items newer than the filter, marked `[Missing]`, so a game patch can't hide new drops.

The builder lives in the filter repo's `docs/` folder. How it works and how to update it is in [`tools/site/README.md`](https://github.com/RoofooEvazan/Roofoo-s-PD2-Loot-Filter/blob/main/tools/site/README.md).

**Screenshots:** the builder screenshots in the filter's README (`screenshots/Builder*.png`) are taken by [`tools/site/screenshots.mjs`](https://github.com/RoofooEvazan/Roofoo-s-PD2-Loot-Filter/blob/main/tools/site/screenshots.mjs), which drives headless Chrome or Edge. From the filter repo, run:

```
node --experimental-websocket tools/site/screenshots.mjs
```

It shoots the live site by default; pass a URL (e.g. `http://localhost:8765/docs/`) to shoot a local copy first. Set `BROWSER` to the path of `chrome.exe` if no browser is found.

## Adding a tool

To add a tool, add a card to the `Tools` section of `index.html` and a link to `LINKS` in `assets/site-nav.js`, then commit. GitHub Pages republishes within a minute or two.

A fan-made project. Not affiliated with or endorsed by Blizzard Entertainment or the Project Diablo 2 team.
