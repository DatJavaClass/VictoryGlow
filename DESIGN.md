# VictoryGlow Design

Foundry VTT module for the Pathfinder 1e (pf1) system. Tints inventory rows of magic items by identification state and aura strength, on actor sheets and on Item Piles loot piles, so players stop walking away from unidentified loot.

Author: Victor S. (DatJavaClass). License: MIT. Module id: `victory-glow`. Title: Victory Glow. Starting version: 1.0.0.

## 1. Problem

Players open a loot pile, see a row of plain looking items, and leave the unidentified magic behind. The pf1 sheet already knows an item is unidentified and knows its aura strength. Nothing surfaces that visually. VictoryGlow paints the whole inventory row so the state is impossible to miss.

## 2. Scope

In scope:

1. pf1 actor sheet inventories: character, NPC, and loot sheets. Every list that renders physical items with a `data-item-id` row.
2. pf1 container item sheets (the inner inventory of a bag or chest item).
3. Item Piles inventory windows, only when the pile's type is `pile`.
4. World settings for the five colors, tint opacity, and per surface enable toggles.

Out of scope, and do not build:

1. Item Piles types `merchant`, `vault`, `container`. Leave them untouched.
2. Any other system. pf1 only. Refuse to activate if `game.system.id !== "pf1"`.
3. Changing item data. VictoryGlow is read only. It never writes to items, actors, flags, or piles.
4. Chat cards, token HUD, compendium browsers, the item sheet itself.
5. A README. Not yet.

## 3. Color Rules

Classification runs per item and yields exactly one class, in this priority order:

| Priority | Condition | Class | Default color |
|---|---|---|---|
| 1 | magic item, not identified | `vglow-unidentified` | yellow `#ffe135` |
| 2 | identified, aura strength faint | `vglow-faint` | green `#3cb44b` |
| 3 | identified, aura strength moderate | `vglow-moderate` | lime `#8fbc3f` |
| 4 | identified, aura strength strong | `vglow-strong` | amber `#e6a23c` |
| 5 | identified, aura strength overwhelming | `vglow-overwhelming` | orange `#ff7f0e` |
| none | mundane (no aura, CL 0) in any state, or not a physical item | no class | no tint |

Rules that the table implies but must be stated:

1. Unidentified wins over everything. An unidentified item is yellow and only yellow. Its true aura strength must never leak through color, class name, tooltip, or title attribute. Players read the DOM.
2. Identification state is read from item data, not from who is looking. The GM sees the same yellow the players see. That is the point: the GM needs to see what the players see.
3. Faint is the lowest strength and green. Overwhelming is the highest and orange. The ramp between them is green to orange.
4. The whole row is tinted, background included, not just the name text. The name text keeps its normal color for legibility.
5. All five colors and the opacity are world settings. Defaults are the table above. Setting changes re-render open sheets and piles without a reload.

Known tension: lime (moderate) sits near yellow (unidentified). The default treatment mitigates this with a solid left border strip in the class color and a slightly stronger tint on unidentified. If it still reads badly at the table, the GM changes the moderate color in settings. Do not solve this by changing the priority order.

## 4. Item Data (pf1)

Verify every path below against the pf1 system version installed in the world before writing code. Read the system source under `systems/pf1/` in the Foundry data folder, or inspect a real magic item with `item.toObject()` in the console. Paths drift between pf1 majors. The paths listed are the expected ones as of pf1 10.x and 11.x.

| Purpose | Expected path | Notes |
|---|---|---|
| physical item test | `item.isPhysical` or `item.system.quantity !== undefined` | only physical items get classified |
| identified flag | `item.system.identified` | boolean, missing means identified |
| unidentified display name | `item.system.unidentified.name` | pf1 shows this to non GM |
| aura school | `item.system.aura.school` | empty string means no aura |
| caster level | `item.system.cl` | number, drives strength |
| aura strength | `item.auraStrength` getter | returns `faint`, `moderate`, `strong`, `overwhelming`, or empty |
| strength labels | `pf1.config.auraStrengths` | localization keys |

Strength derivation, if the getter does not exist or returns nothing: caster level 1 to 5 is faint, 6 to 11 moderate, 12 to 20 strong, 21 and above overwhelming. Caster level 0 or missing with an empty aura school means no aura, no class. Prefer the system getter when it exists so VictoryGlow tracks pf1's own rule.

"Magic item" for VictoryGlow means: physical item with a non empty aura school, or a caster level above zero. Either qualifies. The identified flag alone does not: pf1 marks gear added to NPCs as unidentified by default, and that mundane gear must stay colorless. Classification checks magic first, then identification.

## 5. Actor Sheet Surface

Hook: `renderActorSheet` (covers every pf1 actor sheet class through inheritance). Also hook `renderItemSheet` for pf1 container items, gated on the item having an inner inventory (`item.items` collection exists and is non empty).

Row discovery: query `[data-item-id]` inside the rendered `html`. For each row, resolve the item from the sheet's document (`app.document.items.get(id)`, or `app.document.items.get(id)` on the container item for the container case). Skip rows whose id does not resolve. Skip header rows and non physical items.

Application: remove any existing `vglow-*` class from the row, then add the one class the classifier returns. Never touch inline style attributes on rows. All styling lives in the stylesheet, keyed on the class and on CSS custom properties.

Re-render triggers that must work without a page reload:

1. Item created, updated, or deleted on the actor (pf1 re-renders the sheet, the hook fires again).
2. Item identified by the GM (this is an item update, same path).
3. Setting changed (see section 8).

Do not add MutationObservers to actor sheets. The render hook is enough because pf1 sheets are full Handlebars re-renders.

## 6. Item Piles Surface

Gate: `game.modules.get("item-piles")?.active`. If Item Piles is not active, skip this surface silently and log one line at ready.

Pile type gate: for the pile actor behind an open window, read `game.itempiles.API.getActorFlagData(actorOrToken).type` and compare against `game.itempiles.pile_types.PILE` (fall back to the string `"pile"` if the constant is missing). Anything else returns without touching the window. Merchants, vaults, and containers stay as they are.

Detection is via the API, never via a raw flag read. Pile config can live on the token delta or on the base actor, and the API resolves both. Pass the token document when the pile is an unlinked token.

Window discovery. The Item Piles inventory window is a Svelte application (TyphonJS runtime). Verify against the installed Item Piles version (world was on 3.2.33 in mid 2026, confirm current) by reading its source under `modules/item-piles/`. Expected facts to confirm, in order of preference:

1. TyphonJS SvelteApplication fires the standard Foundry render hook for its class name. Expected hook: `renderItemPileInventoryApp`. Confirm the class name in the Item Piles source and register on that.
2. Item Piles also exposes its own hook constants under `game.itempiles.hooks`. Look for a render or interface hook there and prefer it if one exists for the inventory window.
3. If neither fires reliably, fall back to `renderApplication` filtered on the app's constructor name.

Row discovery inside the window. Svelte rows are not Handlebars rows and may carry no `data-item-id`. Confirm by reading the row component source (expected names: `ItemEntry.svelte`, `ItemList.svelte`, row class `item-piles-item-row`). Strategy, in order:

1. If a row attribute carrying the item id exists, use it. Best case.
2. Otherwise match each row's displayed name and image src against the pile actor's physical items. Compare the name against both `item.name` and `item.system.unidentified.name`, because pf1 shows the unidentified name to players and Item Piles may render either depending on viewer. Match image by file name only, not full path, since Foundry may serve prefixed URLs (The Forge rewrites asset paths).
3. Duplicate name and image pairs: assign in DOM order to item order sorted the way Item Piles sorts (by name). If the match is still ambiguous, apply the most cautious class among the candidates: unidentified if any candidate is unidentified, else the lowest strength. Never guess upward.

Reactivity. Svelte re-renders rows after the Foundry render hook fires, and re-renders again on any pile change (someone takes an item). A single pass at render time is not enough. Attach one MutationObserver per open pile window, rooted at the window's content element, watching `childList` and `subtree`. On mutation, debounce to one classification pass per animation frame. Disconnect the observer on `closeItemPileInventoryApp` (or the matching close hook) and keep a `WeakMap` from app to observer so nothing leaks.

Also re-run the pass on the Item Piles transfer hooks (`item-piles-transferItems`, `item-piles-transferAllItems`, `item-piles-transferEverything`) for any open window whose pile matches the hook's target. Cheap insurance if the observer misses a batched update.

The pile's own actor sheet (the GM opening the loot actor directly) is a pf1 loot sheet and is already covered by section 5. No extra work.

## 7. Styling

One stylesheet, `styles/vglow.css`. Colors come from CSS custom properties set on `document.documentElement` at ready and on every setting change:

```
--vglow-unidentified, --vglow-faint, --vglow-moderate, --vglow-strong, --vglow-overwhelming, --vglow-alpha
```

Each class sets `background-color` to the class color mixed with the alpha (use `color-mix(in srgb, var(--vglow-faint) calc(var(--vglow-alpha) * 100%), transparent)`; Foundry 12 ships Chromium and Electron builds that support it, verify on the world's client versions), plus a 4px solid `border-left` in the full class color. Unidentified adds a slightly higher alpha (multiply by 1.25, clamp at 1).

Selectors must be specific enough to beat the pf1 sheet's own row striping and hover backgrounds and the Item Piles even/odd row colors, but must not use `!important` unless a specific rule is shown to require it. Note the one rule that does, with the reason, in the stylesheet.

Hover state keeps the tint. Selected or dragging state keeps the tint. Text color, icon, and layout are untouched.

## 8. Settings

All world scope, all visible in the module settings panel:

| Key | Type | Default | Purpose |
|---|---|---|---|
| `enableSheets` | Boolean | true | actor and container sheet surface |
| `enablePiles` | Boolean | true | Item Piles surface |
| `colorUnidentified` | String (color) | `#ffe135` | unidentified tint |
| `colorFaint` | String (color) | `#3cb44b` | faint tint |
| `colorModerate` | String (color) | `#8fbc3f` | moderate tint |
| `colorStrong` | String (color) | `#e6a23c` | strong tint |
| `colorOverwhelming` | String (color) | `#ff7f0e` | overwhelming tint |
| `alpha` | Number range 0.05 to 0.6 step 0.05 | 0.25 | tint opacity |

Color settings use Foundry's `ColorField` from `foundry.data.fields` when the installed core supports it as a setting type, else a String with a color input rendered through `onChange` validation. Verify against the world's Foundry core version (12.343 was the last verified core for the sibling module Victory Lazy Loader).

`onChange` for every setting: rewrite the CSS custom properties, then re-render every open `ActorSheet`, container `ItemSheet`, and matching Item Piles window. No reload prompt.

## 9. Module Layout

Mirror the sibling modules (Victory Lazy Loader, Victory Size Extension) exactly:

```
module.json
LICENSE            MIT, Copyright (c) 2026 DatJavaClass
scripts/vglow.js   single ES module, no build step
styles/vglow.css
lang/en.json       every user facing string, prefix VGLOW.
```

`module.json` fields: `id` victory-glow, `title` Victory Glow, `authors` one entry `Victor S. (DatJavaClass)`, `compatibility` minimum 12, verified 12 (set the exact build the world runs), maximum 14, `relationships.systems` pf1 with `type: "system"`, `relationships.recommends` item-piles, `esmodules`, `styles`, `languages`, `manifest` and `download` pointing at `https://github.com/DatJavaClass/VictoryGlow/releases/...` following the Victory Lazy Loader pattern.

No dependencies beyond core Foundry and pf1. No socketlib, no libWrapper, no build tooling, no npm.

## 10. Code Style

Follow VictorsProgrammingHabits.txt. The short form for a builder that has not read it:

1. One ES module. Small functions, each reused. One classifier function feeds both surfaces.
2. Comments are in line, at most 8 words, technical, one space after the delimiter. Block comments use `/* */`. No banners, no text art, no README paragraph at the top of the file. The file may open with one comment line of at most 8 words.
3. Related lines sit together in a block with no blank lines inside; blank lines separate blocks.
4. Variables of the same type declared on one line where the language allows.
5. Try catch around anything that touches Item Piles internals or a pile actor that may be missing. A failed pile pass logs once and never throws into Foundry's render chain.
6. Debug logging behind one `LOG` flag through one `say()` helper. Leave commented debug lines in place; they are not bloat.
7. No em dashes anywhere. Not in code, comments, strings, `en.json`, `module.json`, or commit messages. Add no new hyphens to prose strings either.
8. No AI tells. No "Generated by", no co author trailers, no chatty comments, no emoji. Victor is the sole author of every commit.

## 11. Acceptance Checklist

Manual, in a pf1 world with Item Piles active. All must pass before 1.0.0 tags.

Actor sheet:

1. Character sheet with a mundane sword, a +1 sword (CL 3), a +3 sword (CL 9), a staff (CL 13), an artifact (CL 21), and an unidentified wand. Rows show: none, green, lime, amber, orange, yellow. Whole row is tinted, left strip present.
2. GM toggles identified on the wand. Row flips from yellow to its aura color with no reload.
3. Player opens the same sheet (owned). Same colors. Inspecting the wand row's DOM shows only `vglow-unidentified`, nothing that names the true strength.
4. NPC sheet and loot sheet: same six items, same result.
5. Container item (bag) holding the same six: inner rows tinted the same way.
6. Change the faint color in settings. Every open sheet updates without reload.

Item Piles:

1. Pile of type `pile` holding the six items. Open the pile window as GM and as player. Rows tinted correctly on first open.
2. Player takes the +1 sword. Remaining rows keep correct tints after the list re-renders.
3. GM identifies the wand while the player has the pile open. Player's row flips to the aura color.
4. Two identical unidentified wands in one pile. Both yellow.
5. Open a merchant, a vault, and a container pile with the same items. No tint anywhere.
6. Close the pile window. Confirm the observer disconnected (no growth in the `WeakMap`, no console errors on later mutations).
7. Disable Item Piles. Module loads, actor sheets still tint, one log line notes piles are off.

Negative:

1. Load in a non pf1 world. Module logs one line and does nothing else. No errors.
2. Item with `identified` missing entirely (older data). Treated as identified.
3. Item with an aura school but CL 0. Treated as no aura unless the pf1 getter says otherwise.
4. Mundane dagger on an NPC with identified set to false. No class, no tint.

## 12. Open Questions For The Builder

These are things to verify, not to decide. Report the finding, then proceed with the verified path.

1. Exact pf1 version in the world and whether `item.auraStrength` exists there.
2. Exact Item Piles version, the inventory app class name, whether TyphonJS fires `render<ClassName>`, and whether rows carry an item id attribute.
3. Whether `ColorField` works as a settings `type` on the world's core build.
4. Whether `color-mix()` renders in the Forge hosted client the players use. If not, precompute rgba in JavaScript and set per class custom properties instead.

Anything else that needs a decision rather than a lookup: stop and ask Victor. Do not invent a placeholder and build on it.
