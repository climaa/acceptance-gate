// Pencil MCP `execute` snippet: raw colours in the active .pen, by kind.
//
// Run it through the Pencil MCP against the open document (open it first with
// `open -a Pen <path>`; the MCP edits the active editor whatever path it is given).
// A .pen is encrypted, so this cannot run in the gate: it is the attended check
// behind designs/STANDARD.md's colour rule, run before an export.
//
// A raw hex never follows the `mode` theme, so inside a component it draws the
// light colours on a dark board. Three kinds are reported:
//   content — a raw hex inside a reusable component or a "Tile …" frame: must be 0;
//   exempt  — tagged `context: "colour-exempt: <reason>"`: a primitive
//             swatch or image content (the pixels of a screenshot being depicted);
//   chrome  — a tile's own card and its "home" chip, rebuilt when the boards move
//             to one tile per story (#588).
// Fully transparent fills (#00000000) are not colours and are skipped.
// The tag lives in `context` because Pencil drops `metadata` on Update.
const isRaw = (v) =>
  typeof v === 'string' && !v.startsWith('$') && v.toUpperCase() !== '#00000000';
const roots = Get((n, c) => {
  if (n.reusable || /^Tile\b/.test(n.name || '')) {
    c.skipChildren();
    return { id: n.id, name: n.name };
  }
  return undefined;
});
const tally = { content: [], exempt: 0, chrome: 0 };
for (const root of roots) {
  Get(root.id, (n) => {
    for (const prop of ['fill', 'stroke']) {
      if (!isRaw(n[prop])) continue;
      if ((n.context || '').startsWith('colour-exempt:')) tally.exempt++;
      else if (n.id === root.id || n.name === 'home' || n.name === 'h') tally.chrome++;
      else tally.content.push(`${root.name} › ${n.name || n.id} ${prop}:${n[prop]}`);
    }
    return undefined;
  });
}
Print(
  'content',
  tally.content.length,
  '| exempt',
  tally.exempt,
  '| chrome',
  tally.chrome,
);
for (const row of tally.content) Print('  ', row);
