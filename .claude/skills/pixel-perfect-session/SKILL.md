---
name: pixel-perfect-session
description: Take a shot view URL from the visual-diff console (`/set/<label>/shot/<variant key>`), read the screenshot against its tile on the design board by pixel rows, name each gap as the CSS property that moves it, and fix the component on-token until its ink lands on the tile's rows. Use for a "pixel perfect session", when the user pastes a console shot or overlay URL, compares a shot with its tile or board, or the overlay shows drift between a component and its drawing.
argument-hint: '<shot view URL> [--report] [--storybook <origin>]'
---

# Pixel perfect session

One argument starts it: the console's shot view, the page the reader was already looking at.

```text
/pixel-perfect-session http://127.0.0.1:3300/set/baselines/shot/atoms__desktop__light__atoms-badge--accent?view=overlay&blend=difference
```

Its path names the set and the variant key. The script derives the rest from those two and
prints it: the story, its source file, the Storybook URLs, the baseline, the board and the tile.
A session never rebuilds an address by hand.

A tile on a board is drawn 1:1 with the screenshot the differ takes of its story
(`designs/STANDARD.md`, "Geometry"). This skill measures the two against each other, then
moves the CSS until the screenshot's ink lands on the tile's rows. It uses the design tokens,
never the tile's literals.

Two rules hold throughout:

- **The tile is the drawing to match, and a foundation outranks it.** Board 00
  (`designs/00-foundations.pen`) and `packages/ui/src/tokens.css` are decided once. When a
  tile disagrees with them, the tile is wrong and the code keeps the foundation.
- **Nothing is decided by eye.** The overlay shows drift; the pixel rows say how much, and on
  which line.

## What runs by default

The default session compares and corrects. It measures, names each gap, fixes the CSS
on-token and verifies with the differ's check. Then it **stops before accepting**, because
`accept` rewrites the committed baselines. It shows the check's summary and asks.

| Input                 | Default                 | Effect                                                                                                                                         |
| --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `<shot view URL>`     | ask                     | Any `/set/<label>/shot/<key>` URL. The query (`?view=overlay&blend=difference`) is ignored. A bare variant key also works and reads the committed baseline. With nothing given, ask; never guess a story from the open files. |
| `--report`            | off                     | Stop after step 2 and report the proposed properties and tokens without editing anything.                                                      |
| `--storybook <origin>` | `http://localhost:6006` | Where Storybook dev runs. The script reads the story's source file from its `index.json`, and the fix measures live geometry there.           |

The set in the URL decides which screenshot is read. Pass `baselines` to read the committed
corpus. Pass a capture label taken in the console to read a fresh capture against the tile
before anything is accepted.

## 1. Measure

```sh
node .claude/skills/pixel-perfect-session/scripts/tile-rows.mjs '<shot view URL>'
```

Quote the URL, because zsh reads `?` and `&`. The output has three parts:

- **`addresses`**: every place the session reads, looks at or writes.
  - `source` is the stories file; the component sits beside it.
  - `story` is the Storybook page at the variant's theme and viewport.
  - `captured` is the iframe the differ photographs.
  - `board` is the `.pen` and the frame named by the key.
- **Both images as runs of rows**: `ink` (text), `tint` (a wash or band), `plain` (ground). An
  ink run also prints its column span, so a weight, a tracking or a face shows up as a width.
- **The ink runs paired**, with the screenshot's offset from the tile on each.

The script fetches the screenshot from the console that served the URL, so the console has to
be up. If it is down, pass the bare variant key and the script reads the baseline from disk.

Read the rows with two corrections:

- **Top edge.** The export draws a frame's stroke inside its bounds, while the differ
  photographs the DOM border as a row of its own. At the top edge the tile's rows therefore
  read **one lower** than the shot's, and a pair reading `+1` is aligned.
- **Clipping.** A tile is a fixed-height frame that clips. Once the first card drifts, every
  card below drifts one card's worth more. Judge the **first** repeat of a pattern and compute
  the rest.

Look as well as measure. If the Claude in Chrome tools are available, open the overlay
address and the `story` address, and zoom on the first repeat. Do this before the fix and
again after it.

Next, read what the tile says it is made of. A `.pen` is plain JSON, so read it, but never
edit it by hand:

```sh
node -e '
  const [file, key] = process.argv.slice(1);
  const d = JSON.parse(require("fs").readFileSync(file, "utf8"));
  const find = (n) => n.name === key ? n : (n.children ?? []).map(find).find(Boolean);
  const dump = (n, i = 0) => { const { children, ...rest } = n; console.log("  ".repeat(i) + JSON.stringify(rest)); (children ?? []).forEach((c) => dump(c, i + 1)); };
  dump(d.children.map(find).find(Boolean));
' designs/<stem>.pen <variant key>
```

Every `padding`, `gap`, `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing` and
`fontFamily` on the tile is a claim. Put each one beside the token the CSS uses.

## 2. Name each gap

Name one CSS property for every ink pair with a non-zero offset and every column span that
differs:

| What the rows show                                                | The property                          |
| ----------------------------------------------------------------- | ------------------------------------- |
| An offset that starts at one line and carries down                | A padding or a gap                    |
| An offset that grows with the font size and changes the height    | A line-height                         |
| A width at the same rows                                          | A weight or a face                    |
| A width that grows with the character count                       | A tracking (letter-spacing)           |

Then classify the tile's value:

| The tile's value is…                                                            | Do                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A token (`--space-3`, `--text-14`, `--weight-semibold`)                          | Use it.                                                            |
| Off the scale (14px, 15px, line-height 1.1)                                      | Take the token whose ink lands within a pixel, and say which and why. |
| Against a foundation (tracking below board 00's floor, a raw hex, a gradient angle) | Keep the foundation and list it for the owner. Do not change the tile. |

The owner decides a deviation; a pull request does not. With `--report`, the session ends
here with the report (step 6).

## 3. Fix, on-token

The tier in the key decides where the CSS lives:

| Tier                                         | Edit                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `atoms`, `molecules`, `organisms`, `templates` | The component's CSS in `packages/ui/src/<tier>/`, beside the `source` the script printed              |
| `screens`                                    | The console's CSS: `apps/visual-diff-ui/app/styles/*.css` and `app/globals.css`, for the component the story renders |

Make each change the smallest one that moves the named line. In the comment, say which rows
it was measured against. Three rules apply:

- **Weights need their family.** `packages/ui/src/__tests__/tokens.test.ts` reads every rule
  that declares a `font-weight`, requires the weight to be a token, and resolves the family
  from the **same rule**, assuming the sans when none is declared. A weight on a rule without
  its `font-family` fails if that family ships no face at that weight.
- **Spacing is read by the token ledger.** The console's token ledger classifies spacing as
  `token`, `raw-on-scale` or `off-scale`. A literal that is not a token shows up there as a
  finding.
- **A screen is composed of `packages/ui`.** When the gap is inside a `packages/ui` component,
  fix the component, not the screen. Then expect its own tiers to move too.

Check the live geometry in Storybook with `getBoundingClientRect` on the story's root
elements, at the `story` address. Storybook's viewport global resizes the manager's frame,
not the iframe, so measure vertical geometry there and trust the differ for the width.

## 4. Verify, then ask before accepting

```sh
pnpm --filter @gate/storybook build
pnpm visual-diff:container check          # the pinned container; Docker must be up
```

Read `packages/visual-diff/.visual-diff/summary.md`. The change must explain every `changed`
variant: the story itself, the organisms that compose it, the templates and screens that carry
those. A variant the change does not explain is a finding, not noise.

**Stop here.** Show the ink rows before and after, plus the list of changed variants, and ask
whether to accept. Only once the user says yes:

```sh
pnpm visual-diff:accept                   # in the container, never bare-metal
node .claude/skills/pixel-perfect-session/scripts/tile-rows.mjs '<the same shot view URL>'
```

The second run reads the new baseline. Its ink pairs should now print `0`, or `+1` at the top
edge.

## 5. The tile's height

A screenshot that grows or shrinks changes the height its tile must have. `designs/STANDARD.md`
says a tile is "exactly as tall as its screenshot", and a screen is the page's height. For each
moved variant, resize its tile frame in Pencil to the new baseline's height, then re-export the
board. Follow STANDARD.md's "Working on a .pen":

1. Run `open -a Pen designs/<stem>.pen`. Confirm with the MCP's `get_app_state` that it is the
   active document, and assert the board's name before editing. The MCP edits whatever window
   is active, whatever path it is given.
2. Set the tile frame's `height`. The `board` address names the file and the frame; the
   differ's summary table holds the sizes.
3. Run `scripts/pen/export-boards.js` through the MCP and keep its `MANIFEST` line. Then run
   `node scripts/pen/finish-export.mjs <manifest>`. On a paged board (`05-screens-1…4`), run
   `finish-export` after **each** export.
4. Save the document in Pencil, then run `pnpm boards:check`.

If the Pencil MCP is not connected, say so and leave the tile. The boards check does not
compare a tile's height with its baseline, so nothing goes red, but the overlay shows a cut
until the tile is fixed.

## 6. Report

The report has two tables:

- **What moved.** The ink rows (tile, before, after) for the first repeat of each line, the
  column widths where a weight or face changed, and the differ's counts.
- **For the owner.** What the tile draws against the foundation it contradicts. The pull
  request does not decide these.

## Worked example

Take the variant `molecules__mobile__light__molecules-factrow--card`, from portafolio's #194,
where version 1 of this skill was written.

**Measured.** In the tile the number's ink began at row 65; in the shot, at 61. The note sat
at 112 in the tile and 107 in the shot. "2,351" was 80 px wide in the shot against 78 in the
tile.

**Named and fixed:**

| Found                                 | Fix                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------- |
| 14 px of body padding, off the scale  | `--space-3`                                                               |
| A 12 px gap                           | Kept `--space-2`, because the line-height's half-leading supplies the rest |
| Weight 700                            | `--weight-semibold`                                                       |
| The unit inheriting Manrope           | `--font-sans`                                                             |

**After accepting,** the pairs read 65/65 and 112/112, and the width 78/78.

**Left to the owner:**
- tracking 1.6 against the floor's 1.2;
- a vertical band against the 20° the foundations set;
- a 15 px unit that is not on the type ladder.
