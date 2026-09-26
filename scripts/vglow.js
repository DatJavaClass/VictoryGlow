/* Tint magic item rows by aura strength. */
const MODULE_ID = 'victory-glow', PILE_APP = 'ItemPileInventoryApp', LOG = false;
const COLORS = { unidentified: '#ffe135', faint: '#3cb44b', moderate: '#8fbc3f', strong: '#e6a23c', overwhelming: '#ff7f0e' };
const TIERS = ['', 'faint', 'moderate', 'strong', 'overwhelming']; // pf1 auraStrength index
const CLASSES = Object.keys(COLORS).map((k) => `vglow-${k}`);
const rows = new WeakMap(), watched = new WeakMap(), queued = new WeakSet();
let failed = false;

const note = (...a) => console.log('VGLOW |', ...a), say = (...a) => LOG && note(...a);
const get = (k) => game.settings.get(MODULE_ID, k), colorKey = (k) => `color${k.capitalize()}`;
const rootOf = (h) => (h instanceof HTMLElement ? h : h?.[0]);
const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { if (!failed) console.error('VGLOW |', e); failed = true; } };

/* ColorField may return a Color, want hex. */
function hex(v, d) {
  const c = foundry.utils.Color.from(v ?? d);
  return c.valid ? c.css : d;
}

/* Fallback when color-mix is missing. */
function rgba(c, a) {
  const [r, g, b] = foundry.utils.Color.from(c).rgb.map((v) => Math.round(v * 255));
  return `rgba(${r}, ${g}, ${b}, ${Math.min(a, 1)})`;
}

/* Push colors and alpha into root vars. */
function applyVars() {
  const st = document.documentElement.style, a = Number(get('alpha')) || 0.25;
  st.setProperty('--vglow-alpha', a);
  for (const [k, d] of Object.entries(COLORS)) {
    const c = hex(get(colorKey(k)), d);
    st.setProperty(`--vglow-${k}`, c);
    st.setProperty(`--vglow-${k}-bg`, rgba(c, k === 'unidentified' ? a * 1.25 : a));
  }
}

/* pf1 getter first, CL ramp as fallback. */
function tier(item) {
  const cl = Number(item.system.cl) || 0;
  const v = item.auraStrength ?? (cl < 1 ? 0 : cl < 6 ? 1 : cl < 12 ? 2 : cl < 21 ? 3 : 4);
  return typeof v === 'number' ? TIERS[v] ?? '' : TIERS.includes(v) ? v : '';
}

/* One class per item, unidentified wins. */
function classify(item) {
  if (!item?.system || !(item.isPhysical ?? (item.system.quantity !== undefined))) return null;
  if (item.system.identified === false) return 'vglow-unidentified';
  const t = tier(item);
  return t ? `vglow-${t}` : null;
}

/* Swap old vglow class for the new one. */
function paint(row, item) {
  const cls = classify(item);
  for (const c of CLASSES) row.classList.toggle(c, c === cls);
  // say('paint', item?.id, cls);
}

/* Actor and container sheet rows, one pass. */
function onSheet(app, html) {
  const items = app.document?.items, root = rootOf(html);
  if (!items?.size || !root || !get('enableSheets')) return;
  for (const row of root.querySelectorAll('[data-item-id]')) {
    const item = items.get(row.dataset.itemId);
    if (item) paint(row, item);
  }
}

/* Loose loot piles only, read through API. */
const isLoosePile = safe((actor) => {
  const ip = game.itempiles, data = actor && ip.API.getActorFlagData(actor.token ?? actor);
  return !!data?.enabled && data.type === (ip.pile_types?.PILE ?? 'pile');
});

/* Paint every row in one pile window. */
function pass(app, off = false) {
  const list = rootOf(app.element)?.querySelectorAll('.item-piles-item-row') ?? [];
  for (const row of list) paint(row, off ? null : rows.get(row));
}

/* One pass per window per frame. */
function schedule(app) {
  if (queued.has(app)) return;
  queued.add(app);
  requestAnimationFrame(safe(() => {
    queued.delete(app);
    if (watched.has(app)) pass(app);
  }));
}

/* One observer per pile window content. */
function watch(app) {
  const root = rootOf(app.element), box = root?.querySelector('.window-content') ?? root;
  if (watched.has(app) || !box) return;
  const obs = new MutationObserver(() => schedule(app));
  obs.observe(box, { childList: true, subtree: true });
  watched.set(app, obs);
  say('watch', app.appId);
}

/* Never return false, close hooks stop on it. */
function unwatch(app) {
  if (!watched.has(app)) return;
  watched.get(app).disconnect();
  watched.delete(app);
  say('unwatch', app.appId);
}

/* Pile window rendered, gate by type. */
const onPileRender = safe((app) => {
  if (get('enablePiles') && isLoosePile(app.actor)) {
    watch(app);
    pass(app);
  } else if (watched.has(app)) {
    unwatch(app);
    pass(app, true);
  }
});

/* Item Piles hands each row its item. */
const onPileRow = safe((el, item) => {
  rows.set(el, item);
  const app = ui.windows[el.closest('[data-appid]')?.dataset.appid];
  if (watched.has(app)) paint(el, item);
});

/* Transfer touched a pile, repaint its windows. */
const onTransfer = safe((src, dst) => {
  const ids = [src, dst].flat();
  for (const app of Object.values(ui.windows)) {
    const a = app.actor;
    if (watched.has(app) && [a?.uuid, a?.token?.uuid].some((u) => u && ids.includes(u))) schedule(app);
  }
});

/* Setting changed, vars then rerender open views. */
function refresh() {
  applyVars();
  const v2 = foundry.applications.instances?.values() ?? [];
  for (const app of [...Object.values(ui.windows), ...v2]) {
    const doc = app.document, pile = app.constructor.name === PILE_APP;
    if ((doc?.items && doc.sheet === app) || (pile && (watched.has(app) || isLoosePile(app.actor)))) app.render();
  }
}

/* World settings, all in the config panel. */
function register() {
  const reg = (k, o) => game.settings.register(MODULE_ID, k, { name: `VGLOW.Settings.${k}.Name`, hint: `VGLOW.Settings.${k}.Hint`, scope: 'world', config: true, onChange: refresh, ...o });
  reg('enableSheets', { type: Boolean, default: true });
  reg('enablePiles', { type: Boolean, default: true });
  for (const [k, c] of Object.entries(COLORS)) reg(colorKey(k), { type: new foundry.data.fields.ColorField({ nullable: false, initial: c }), default: c });
  reg('alpha', { type: Number, range: { min: 0.05, max: 0.6, step: 0.05 }, default: 0.25 });
}

/* Pile hooks, names verified against Item Piles 3.2.33. */
const hookPiles = safe(() => {
  const H = game.itempiles.hooks;
  Hooks.on(`render${PILE_APP}`, onPileRender);
  Hooks.on(`close${PILE_APP}`, unwatch);
  Hooks.on(H.RENDER_PILE_ITEM, onPileRow);
  for (const h of [H.ITEM.TRANSFER, H.ITEM.TRANSFER_ALL, H.TRANSFER_EVERYTHING]) Hooks.on(h, onTransfer);
});

Hooks.once('init', () => {
  if (game.system.id !== 'pf1') return note('pf1 only, staying off in', game.system.id);
  register();
  for (const h of ['renderActorSheet', 'renderItemSheet', 'renderActorSheetV2', 'renderItemSheetV2']) Hooks.on(h, onSheet);
  Hooks.once('ready', () => {
    applyVars();
    if (game.modules.get('item-piles')?.active) hookPiles();
    else note('Item Piles not active, pile surface off');
  });
});
