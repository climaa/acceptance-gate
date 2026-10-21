// Pencil MCP `execute` snippet: move the SVGs pasted into the active .pen onto their
// tiles, and name every colour by its design token.
//
// scripts/pen/tiles-from-dom.mjs writes this file into its output directory with a
// `DATA` line in front — the run's palette of [light, dark] colour pairs and its text
// styles — so run the copy there, never this template. Before running it, paste each
// tile's SVG into the board's file (scripts/pen/paste-tiles.mjs does it on macOS):
// every paste lands as a frame named `Frame` whose first text is `TILE:<variant key>`.
// Pen drops a paste into any frame under the viewport that can hold it, so a frame
// found nested inside another fresh paste is lifted out first.
//
// For each pasted frame: the tile named by its key is emptied and takes the frame as
// its `Page`; each node's sentinel colour becomes the colour variable whose light and
// dark values both match its palette pair, its alpha becomes opacity, a text's family
// becomes the font variable holding it, and its style's letter spacing is restored.
// A node drawn for one theme only is named `light-only` or `dark-only`; the dark tile,
// a ref of the light one, swaps the two through its descendant overrides.
//
// Prints one line per tile placed, `UNMATCHED` for a colour no variable holds (left
// raw, so check-colours.js reports it), and exports every tile it placed, light and
// dark, at scale 1 into OUT for tiles-from-dom.mjs --verify to compare.
/* global DATA, OUT, Get, Move, Delete, Update, Print, Export, GetVariables, document */
const near = (a, b) =>
  !!a &&
  !!b &&
  [1, 3, 5].every(
    (i) =>
      Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 2,
  );
const vars = GetVariables().variables;
const valueIn = (v, mode) =>
  Array.isArray(v.value)
    ? (v.value.find((e) => e.theme && e.theme.mode === mode) || v.value[0]).value
    : v.value;
const tokenOf = DATA.palette.map(([light, dark]) => {
  const name = Object.keys(vars).find(
    (k) =>
      vars[k].type === 'color' &&
      (!light || near(valueIn(vars[k], 'light').toUpperCase(), light)) &&
      (!dark || near(valueIn(vars[k], 'dark').toUpperCase(), dark)),
  );
  return name ? '$' + name : null;
});
const fontOf = {};
for (const k of Object.keys(vars))
  if (vars[k].type === 'string' && /^font/.test(k))
    fontOf[valueIn(vars[k], 'light')] = '$' + k;
const read = (c) => {
  let h = c.slice(1);
  if (h.length <= 4)
    h = h
      .split('')
      .map((x) => x + x)
      .join('');
  const b = (i) => parseInt(h.slice(i, i + 2), 16);
  return {
    flag: b(0),
    style: b(2),
    slot: b(4) - 1,
    alpha: h.length > 6 ? b(6) / 255 : 1,
  };
};
const isMarker = (n) => n && n.type === 'text' && (n.content || '').startsWith('TILE:');

const fresh = Get((n, c) => {
  if (!isMarker(n) || c.parentCtx.node.name !== 'Frame') return undefined;
  for (let q = c.parentCtx.parentCtx; q; q = q.parentCtx)
    if (q.node.name === 'Page') return undefined;
  return { id: c.parentCtx.node.id, depth: c.depth };
});
fresh
  .sort((a, b) => b.depth - a.depth)
  .forEach((f) => f.depth > 1 && Move(f.id, document));

const pasted = Get((n, c) => {
  c.skipChildren();
  return n.name === 'Frame' && n.type === 'frame' ? n.id : undefined;
});
const placed = [];
const unmatched = new Set();
for (const frame of pasted) {
  const marker = Get(frame, { depth: 1 }).children[0];
  if (!isMarker(marker)) throw new Error('no TILE: marker in pasted frame ' + frame);
  const key = marker.content.slice(5);
  Delete(marker.id);
  const byName = (name) => Get((n) => (n.name === name ? n.id : undefined))[0];
  const tile = byName(key);
  const dark = byName(key.replace('__light__', '__dark__'));
  if (!tile || !dark) throw new Error('no light and dark tile named ' + key);
  (Get(tile, { depth: 1 }).children || []).forEach((child) => Delete(child.id));
  Update(tile, { layout: 'none' });
  Move(frame, tile);
  Update(frame, { x: 0, y: 0, name: 'Page' });
  const swap = {};
  Get(frame, (n, c) => {
    if (c.depth === 0) return undefined;
    const prop =
      typeof n.fill === 'string'
        ? 'fill'
        : typeof n.stroke === 'string'
          ? 'stroke'
          : null;
    if (!prop) return undefined;
    const s = read(n[prop]);
    const token = tokenOf[s.slot];
    if (!token) unmatched.add(DATA.palette[s.slot].join(' / '));
    const u = { name: n.type === 'text' ? n.content.slice(0, 32) : n.type };
    if (token) u[prop] = token;
    const opacity = (n.opacity ?? 1) * s.alpha;
    if (opacity < 0.999) u.opacity = +opacity.toFixed(3);
    if (n.type === 'text') {
      if (fontOf[n.fontFamily]) u.fontFamily = fontOf[n.fontFamily];
      if (DATA.styles[s.style]) u.letterSpacing = DATA.styles[s.style];
    }
    if (s.flag === 1) {
      u.name = 'light-only';
      swap[n.id] = { enabled: false };
    }
    if (s.flag === 2) {
      u.name = 'dark-only';
      u.enabled = false;
      swap[n.id] = { enabled: true };
    }
    Update(n.id, u);
    return undefined;
  });
  Update(dark, { descendants: swap });
  placed.push(tile, dark);
  Print(tile, key);
}
for (const pair of unmatched) Print('UNMATCHED', pair);
if (placed.length) Export(placed, 'png', OUT, { scale: 1 });
