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
- **Project boards** take an `x-` prefix (`x-tables-practice`, `x-visual-diff-pages`) and sit
  after `06`. The tier rules do not apply to them.
- **Paging.** Pencil caps an export's long side at 8192 px. A tier board that outgrows it
  splits into `01-atoms-1`, `01-atoms-2`, …, never into a renamed board.

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

### Colour

Every fill and stroke inside a tile is a variable. A raw hex never follows the theme, so
a dark ref of a tile with hard-coded colours would draw the light colours on a dark
board. The variables mirror `tokens.css` role for role.

## Sidecars

Each exported board carries two JSON files beside its PNG, both written by the export
snippet and never edited by hand:

- `<stem>.json`: the board's size in design pixels and the scale it was exported at.
- `<stem>.tiles.json`: for each tile, its variant key and its rectangle in that PNG's
  pixels, at that scale.

**The trust boundary.** A `.pen` is encrypted and only the Pencil app reads it, so no
headless check can prove that a sidecar matches the drawing. The gate proves the
sidecars against Storybook: every required tile is present, no tile is extra, and every
name is a variant key. The match between drawing and sidecar rests on the export snippet
being the only thing that writes them.

## Working on a .pen

- Pencil's MCP edits the editor's **active** document whatever path it is given. Open
  the file first with `open -a Pen <path>` and confirm it with `get_app_state` before
  the first edit.
- A story and its tile ship in the same pull request.
