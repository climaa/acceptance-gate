// Pencil MCP `execute` snippet: export the board of the active .pen, and print the
// manifest scripts/pen/finish-export.mjs turns into its sidecars.
//
// Each board is its own file, `designs/<stem>.pen` (designs/STANDARD.md). Open one
// with `open -a Pen <path>` (the MCP edits the active editor whatever path it is
// given), run this, and save the line it prints after `MANIFEST ` to a file; do that
// for every file whose board changed, then run
// `node scripts/pen/finish-export.mjs <manifest file>…`. Two steps because `Export`
// names each PNG after its node id and cannot write anything but images.
//
// A board is a top-level frame named `<stem> — <title>`. It is exported at twice
// its size, or at the scale that puts its long side at 8192 px (the most Pencil
// exports) when that is smaller: twice keeps the text of a tile legible at a 2x
// screenshot's zoom without spending megabytes past it.
//
// A tile is any frame or ref whose name is a variant key; its rectangle is
// recorded in that PNG's pixels, at that scale. A node's bounds are relative to
// its parent, so a tile's place on the board is the sum up the chain.
const STEM = /^(\d\d-[a-z0-9-]+|x-[a-z0-9-]+) — /;
const VARIANT_KEY =
  /^(atoms|molecules|organisms|templates|screens)__(desktop|mobile)__(light|dark)__[a-z0-9-]+--[a-z0-9-]+$/;
const LONG_SIDE = 8192;
const MAX_SCALE = 2;

const boards = Get((n, c) => {
  c.skipChildren();
  const stem = STEM.exec(n.name || '');
  return stem ? { id: n.id, board: n.name, stem: stem[1] } : undefined;
});

const manifest = [];
for (const { id, board, stem } of boards) {
  const at = Get(id, (n, c) => (n.id === id ? c.bounds : undefined))[0];
  const fit = Math.floor((LONG_SIDE / Math.max(at.width, at.height)) * 1e6) / 1e6;
  const scale = Math.min(MAX_SCALE, fit);
  const px = (v) => Math.round(v * scale);
  const tiles = {};
  Get(id, (n, c) => {
    if (!VARIANT_KEY.test(n.name || '')) return undefined;
    c.skipChildren();
    let { x, y } = c.bounds;
    for (let p = c.parentCtx; p && p.node.id !== id; p = p.parentCtx) {
      x += p.bounds.x;
      y += p.bounds.y;
    }
    tiles[n.name] = [px(x), px(y), px(c.bounds.width), px(c.bounds.height)];
    return undefined;
  });
  Export([id], 'png', './exports', { scale });
  manifest.push({
    id,
    stem,
    board,
    width: Math.round(at.width),
    height: Math.round(at.height),
    scale,
    tiles,
  });
}
Print('MANIFEST ' + JSON.stringify(manifest));
