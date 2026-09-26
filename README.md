# PD2 Calculators

The main page that links all of RoofooEvazan's Project Diablo 2 tools together. The tools are built on the game's own code, reverse engineered from PD2's client files.

**Live site:** https://roofooevazan.github.io/

| Tool | Site | Repo |
|---|---|---|
| IAS Calculator | https://roofooevazan.github.io/pd2-ias-calc/ | [pd2-ias-calc](https://github.com/RoofooEvazan/pd2-ias-calc) |
| Advanced Stats | https://roofooevazan.github.io/pd2-advanced-stats/ | [pd2-advanced-stats](https://github.com/RoofooEvazan/pd2-advanced-stats) |
| Hit Chance | https://roofooevazan.github.io/pd2-hit-chance/ | [pd2-hit-chance](https://github.com/RoofooEvazan/pd2-hit-chance) |
| Damage Atlas | https://roofooevazan.github.io/pd2-damage-atlas/ | [pd2-damage-atlas](https://github.com/RoofooEvazan/pd2-damage-atlas) |
| Spawn Simulator | https://roofooevazan.github.io/pd2-spawn-simulator/ | [pd2-spawn-simulator](https://github.com/RoofooEvazan/pd2-spawn-simulator) |
| Loot Filter Builder | https://roofooevazan.github.io/Roofoo-s-PD2-Loot-Filter/ | [Roofoo-s-PD2-Loot-Filter](https://github.com/RoofooEvazan/Roofoo-s-PD2-Loot-Filter) |

## Loot Filter Builder

**https://roofooevazan.github.io/Roofoo-s-PD2-Loot-Filter/**

A no-code way to make [Roofoo's PD2 loot filter](https://github.com/RoofooEvazan/Roofoo-s-PD2-Loot-Filter) your own. It always starts from the latest filter on GitHub and downloads a ready-to-use `.filter` file.

- **Colors & sounds:** pick a color theme or restyle any highlight, and choose drop sounds with in-browser previews.
- **Items:** every unique, set, rare, magic, base, rune, gem and potion in collapsible sections. Set star tiers, turn Mystery drops on or off, and show or hide anything per filter level, narrowed by ethereal, sockets, superior, item level or character level.
- **Test an item** and **Overview & review:** see how any item looks on every filter level, or everything your filter shows and hides, with in-game style item cards.
- **Save & install:** download the filter, share your setup as a link, or load it back later.

Custom filters leave out the live market prices (rune values, Rainbow Facet values, slam suggestions), which only stay current in the launcher version. They also always show items newer than the filter, marked `[Missing]`, so a game patch can't hide new drops.

The builder lives in the filter repo's `docs/` folder. How it works and how to update it is in [`tools/site/README.md`](https://github.com/RoofooEvazan/Roofoo-s-PD2-Loot-Filter/blob/main/tools/site/README.md).

## Adding a tool

To add a tool, add a card to the `Tools` section of `index.html` and commit. GitHub Pages republishes within a minute or two.

A fan-made project. Not affiliated with or endorsed by Blizzard Entertainment or the Project Diablo 2 team.
