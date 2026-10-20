# The .pen standard

How every `.pen` file is laid out, in this repository and in every project that copies
it. The structure exists so that a design board lines up with Storybook one story at a
time. That makes a board's sidecars a join that tooling can check, not a hand-tuned map.

This repository owns the standard. A project that copies it starts from
[`template.pen`](template.pen) and changes this file only by a pull request here first.

## Boards

A `.pen` holds one top-level frame per board, in this order. The frame's name starts with
its number. The exported PNG is named after the board's stem.

| Stem                 | Holds                                           | Tiles          |
| -------------------- | ----------------------------------------------- | -------------- |
| `00-foundations`     | Colour, type and spacing, as `tokens.css` names | Reference only |
| `01-atoms`           | One tile per atom story                         | Required       |
| `02-molecules`       | One tile per molecule story                     | Required       |
| `03-organisms`       | One tile per organism story                     | Required       |
| `04-templates`       | One tile per template story                     | Required       |
| `05-pages`           | App pages, as the apps compose them             | Reference only |
| `06-flows-decisions` | Flows and the decisions behind the design       | None           |

- **Reference only** means the board is shown beside a screenshot but is never a join
  target. No app page is ever photographed: the differ captures `packages/ui` stories
  only, so `05-pages` has no screenshot to match.
- **Project boards** take an `x-` prefix (`x-console-components`, `x-visual-diff-pages`) and
  sit after `06`. The tier rules do not apply to them. A component with no story of its own
  is drawn on one, in a frame named `Drawing <Name>`; once it gains a story it moves to its
  tier board as tiles.
- **Paging.** Pencil caps an export's long side at 8192 px. A tier board that would export
  below 1× splits into `01-atoms-1`, `01-atoms-2`, …, never into a renamed board.

## Tiles

A tile is the frame on a tier board that draws one story.

- **One tile per story**, in the light theme, named with the story's literal variant key:
  `tier__viewport__theme__storyId` (`packages/visual-diff/src/policy.mjs:95-104`), for
  example `atoms__desktop__light__atoms-badge--accent`. A name is either a variant key or
  the tile is not a tile.
- **Dark is a theme, not a drawing.** The light tile is a reusable frame; the dark tile is a `ref` of it with
  `theme: {mode: "dark"}` and the `dark` key. Only the `--color-*` roles change under
  `[data-theme='dark']` (`packages/ui/src/tokens.css:238`), and a ref resolves the same
  variables in the other mode.
- **Mobile only where a mobile screenshot exists.** That covers organisms and templates, plus any
  story tagged `visual-diff:all-viewports` (`policy.mjs:34-39`, `:60`).
- **Which tiles are required** is the planned variants (`planCaptures`,
  `packages/visual-diff/src/storybook-index.mjs:162`). Stories tagged `visual-diff:skip`
  (`policy.mjs:51`) and MDX docs pages have no screenshot, so they have no tile.

### Geometry

A tile is drawn at 1:1 with the screenshot it is read against.

| Shot                                     | Width                     | Height        |
| ---------------------------------------- | ------------------------- | ------------- |
| Desktop                                  | 1248 px                   | the content's |
| Mobile                                   | 358 px                    | the content's |
| `visual-diff:fullpage` (`policy.mjs:55`) | the viewport, 1280 or 390 | 800 or 844    |

The differ shoots `#storybook-root` (`policy.mjs:62`) with its display set to block and
no padding of its own (`apps/storybook/.storybook/preview.tsx:38-47`). Storybook's 16 px
canvas padding is what turns the 1280 and 390 px viewports (`policy.mjs:26-27`) into
1248 and 358 px.

The content's height is read off the baseline, not guessed from the drawing: a tile is a
fixed-size frame exactly as tall as its screenshot in `packages/visual-diff/__baselines__`,
clipping what overflows. A drawing that runs short or long then shows as a gap or a cut,
not as a tile that quietly disagrees with the shot it is read against.

### Colour

Every fill and stroke inside a tile is a variable. A raw hex never follows the theme, so
a dark ref of a tile with hard-coded colours would draw the light colours on a dark
board. The variables mirror `tokens.css` role for role. Where a drawing and `tokens.css`
disagree, the CSS wins: the board is read against screenshots of the shipping CSS.

Two kinds of raw hex are exempt, and each exempt node says so in its `context` field
(`colour-exempt: primitive swatch` or `colour-exempt: image content`). The tag goes in
`context` because Pencil drops `metadata` on update.

- **Primitive swatches** that show the palette itself.
- **Image content:** the pixels of a screenshot being drawn, such as a diff's red marks.

An image a drawing shows, such as the fixture a `PanZoom` story pans, lives in
[`assets/`](assets/) and is filled from there. Never fill from `exports/`: an export is
rewritten, and its old boards deleted, every time the boards move.

[`scripts/pen/check-colours.js`](../scripts/pen/check-colours.js) counts the rest. Run it
through the Pencil MCP before an export; it must report 0.

## Exports and sidecars

Every board is exported to `exports/<stem>.png`, at 2× or at the scale that puts its long
side at 8192 px when that is smaller. Two JSON files sit beside it, both written by the
export and never edited by hand:

- `<stem>.json`: the board's size in design pixels and the scale it was exported at.
- `<stem>.tiles.json`, on a tier board only: for each tile, its variant key and its
  rectangle in that PNG's pixels, at that scale.

To export, with the `.pen` open as the active document:

1. Run [`scripts/pen/export-boards.js`](../scripts/pen/export-boards.js) through the
   Pencil MCP. It writes each board's PNG (named by node id, the only name `Export` can
   give it) and prints one line starting `MANIFEST`.
2. Save that line to a file and run `node scripts/pen/finish-export.mjs <file>`. It names
   the PNGs by stem, writes the sidecars, and deletes anything in `exports/` that is no
   longer a board.

[`scripts/board-scale-integrity.mjs`](../scripts/board-scale-integrity.mjs) holds each PNG to
its sidecar.

**The trust boundary.** A `.pen` is only read through the Pencil app, so no headless check
can prove that a sidecar matches the drawing. The gate's `boards` check
(`pnpm turbo run boards:check`) proves the sidecars against Storybook: every required tile
is present, on its own tier's board, no tile is extra, and every name is a variant key. The match between drawing and sidecar rests on the export being the only thing that
writes them.

## In a child project

A project that copies this standard draws only its own product on its boards. A story it
shares with acceptance-gate is drawn here, on the parent's tier boards, and nowhere else.
The child lists those stories in `designs/shared-stories.json`, and its `boards` check asks
no tile of them. The parent prints the list:

```sh
node scripts/board-scale-integrity.mjs --print-stories > ../<child>/designs/shared-stories.json
```

Print it again whenever a shared story is added or renamed in the parent, in the same pass
that ports the story to the child.

## Working on a .pen

- Pencil's MCP edits the editor's **active** document whatever path it is given. Open
  the file first with `open -a Pen <path>` and confirm it with `get_app_state` before
  the first edit.
- A story and its tile ship in the same pull request.
