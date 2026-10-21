# The .pen standard

How every `.pen` file is laid out, in this repository and in every project that copies
it. The structure exists so that a design board lines up with Storybook one story at a
time. That makes a board's sidecars a join that tooling can check, not a hand-tuned map.

This repository owns the standard. A project that copies it starts from
[`template/`](template/), one starter file per board, and changes this file only by a pull
request here first.

## Boards

Each board is its own file, `designs/<stem>.pen`, holding one top-level frame named
`<stem> — <title>`. The exported PNG and its sidecars take the same stem, so a board, its
file and its exports are one name. The boards, in order:

| Stem                 | Holds                                           | Tiles          |
| -------------------- | ----------------------------------------------- | -------------- |
| `00-foundations`     | Colour, type and spacing, as `tokens.css` names | Reference only |
| `01-atoms`           | One tile per atom story                         | Required       |
| `02-molecules`       | One tile per molecule story                     | Required       |
| `03-organisms`       | One tile per organism story                     | Required       |
| `04-templates`       | One tile per template story                     | Required       |
| `05-pages`           | App pages, as the apps compose them             | Reference only |
| `05-screens`         | One tile per screen story, where there are any  | Required       |
| `06-flows-decisions` | Flows and the decisions behind the design       | None           |

- **Reference only** means the board is shown beside a screenshot but is never a join
  target. This repository's differ captures `packages/ui` stories only, so `05-pages`
  has no screenshot to match.
- **Screens** are whole app pages that a project's own differ captures as a fifth tier,
  `screens`. Such a project draws each one as a tile on `05-screens`, under the same
  rules as the other tiers. A project with no `screens` tier has no `05-screens` board.
- **Project boards** take an `x-` prefix (`x-console-components`, `x-visual-diff-pages`) and
  sit after `06`. The tier rules do not apply to them. A component with no story of its own
  is drawn on one, in a frame named `Drawing <Name>`; once it gains a story it moves to its
  tier board as tiles.
- **Paging.** Pencil caps an export's long side at 8192 px. A tier board that would export
  below 1× splits into `01-atoms-1.pen`, `01-atoms-2.pen`, …, never into a renamed board.
  The console lists each page as a board of its own and opens a variant on the page whose
  tile map holds it.
- **Variables are copied, not shared.** A Pencil document holds its own variables and
  themes, so every board file carries the same set. `00-foundations.pen` is the source:
  change a variable there and copy it to every other board file. The `boards` check reads
  each file's variables and fails on a copy that differs from `00-foundations.pen`'s.
- **Components a board instances live in that board's file.** A board that draws instances
  of reusable components (`05-pages`, `06-flows-decisions` and `x-visual-diff-pages` here)
  keeps its own `Components` frame beside the board. It is not exported.

## Tiles

A tile is the frame on a tier board that draws one story.

- **One tile per story**, in the light theme, named with the story's literal variant key:
  `tier__viewport__theme__storyId` (`packages/visual-diff/src/policy.mjs:95-104`), for
  example `atoms__desktop__light__atoms-badge--accent`. A name is either a variant key or
  the tile is not a tile.
- **Dark is a theme, not a drawing.** The light tile is a reusable frame; the dark tile is
  a `ref` of it with `theme: {mode: "dark"}` and the `dark` key. Only the `--color-*`
  roles change under `[data-theme='dark']` (`packages/ui/src/tokens.css:238`), and a ref
  resolves the same variables in the other mode.
- **Mobile only where a mobile screenshot exists.** That covers organisms, templates and
  screens,
  plus any story tagged `visual-diff:all-viewports` (`policy.mjs:34-39`, `:60`).
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
| A screen                                 | the viewport, 1280 or 390 | the page's    |

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

Only files named like a board's exports (`NN-…` or `x-…`) belong to the export. An image
another script derives from the boards, such as a stitched page or a social card, may sit
beside them in `exports/` under any other name; the export and the `boards` check leave it
alone.

To export, for each board file that changed:

1. Make it the active document (`open -a Pen designs/<stem>.pen`) and run
   [`scripts/pen/export-boards.js`](../scripts/pen/export-boards.js) through the Pencil
   MCP. It writes the board's PNG (named by node id, the only name `Export` can give it)
   and prints one line starting `MANIFEST`. Save that line to a file.
2. Run `node scripts/pen/finish-export.mjs <file>…` with every manifest saved. It names
   the PNGs by stem, writes the sidecars, and deletes the exports of any board whose
   `.pen` no longer exists.

## The boards check

`pnpm turbo run boards:check` runs
[`scripts/board-scale-integrity.mjs`](../scripts/board-scale-integrity.mjs) after a
Storybook build, as the gate's `boards` check. A `.pen` is plain JSON, so the check reads
the board files themselves, not an export's account of them. It fails when:

- a board file holds anything but one board named for its stem, or has no export, or an
  export has no board file;
- a board file's variables differ from `00-foundations.pen`'s;
- a PNG's size disagrees with its sidecar, or a tile lies outside its PNG;
- a tier board's tile map lists other tiles than the board file draws: export it again;
- a planned variant has no tile, a tile has no planned variant, a tile sits on another
  tier's board or is drawn twice.

What it cannot see is the drawing itself: whether a tile looks like its screenshot is
judged by eye, beside the screenshot, in the console.

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

- Edit a `.pen` only in Pencil, never by hand: a hand edit can save a document Pencil will
  not reopen.
- Pencil's MCP edits the editor's **active** document whatever path it is given. Open the
  file first with `open -a Pen <path>` and confirm it with `get_app_state`. When a snippet
  runs across several files, have it assert something only the intended file has, such as
  its board's name, so a file that failed to open is not the one edited.
- Pencil writes a document to disk only on Cmd+S, one tab at a time. Save every tab you
  edited before committing, and close the tab of a file you deleted without saving it, or
  the save writes the file back.
- A story and its tile ship in the same pull request.

## Drawing page tiles from the stories

A tile that draws a whole page — a template here, a screen in a child — goes stale as soon
as the page changes, and drawing it again by hand is most of the work of a board.
`scripts/pen/tiles-from-dom.mjs` draws those tiles from the rendered stories instead. It
opens each planned variant the way the differ captures it (same index, viewports, theme
global, launch flags, frozen clock), in light and in dark, and writes one SVG per light
tile whose colours are named by the design token whose light and dark values both match.

```sh
pnpm turbo run build --filter=@gate/storybook
node scripts/pen/tiles-from-dom.mjs --static apps/storybook/storybook-static \
  --out /tmp/tiles --tier templates --preview
```

Then, for each board file: open it with `open -a Pen`, paste its tiles
(`node scripts/pen/paste-tiles.mjs /tmp/tiles/<key>.svg…`, macOS), run `/tmp/tiles/place.js`
through the Pencil MCP, save, and compare what it exported with the baselines
(`--verify /tmp/tiles/pen --out /tmp/tiles`). Export the board as usual afterwards.

- Run it in the baselines' own container (`.github/workflows/tiles-from-dom.yml` does, on
  every change to it): on a macOS host text lays out a few pixels differently, and the
  preview reports a size mismatch.
- A tile drawn this way mirrors the page; it no longer records a design the page is built
  from. Use it for pages, not for components that are still being designed.
- It draws boxes, borders, text, SVG shapes, the hatch of a repeating gradient and native
  selects and radios. It reports an image or any other gradient instead of drawing it, and
  does not draw a dialog's backdrop.

## Starting from the template

Copy [`template/`](template/) into the new project's `designs/`, one file per board, then:

- Rename the stems and titles that do not fit, and copy `x-example.pen` once per project
  board, renaming it `x-<what it holds>`.
- Delete the example tiles on `01`–`04` (`*-example--default`): they draw no story, so the
  `boards` check fails on each until they are gone.
- Set the variables in `00-foundations.pen` to the project's `tokens.css` and copy them to
  every other file.
