# `src/fonts/og/` — provenance

This directory is the one documented exemption from the "self-hosted woff2 only"
rule. `next/og` renders through satori, which reads neither page CSS nor woff2:
the OG-image route has to hand it font bytes directly, in a format it parses.
Hence a TTF, referenced by no `@font-face` in `../../fonts.css`.

The face here is the display one, Fraunces: an OG card's title is a heading, and
headings are the only thing `--font-display` is for.

`@fontsource/fraunces` — the pinned provenance record for the Fraunces woff2 in
the parent directory — ships only `woff2` and `woff`, so this file could not come
from it. It comes from the upstream OFL release instead, recorded exactly:

| Field          | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Upstream       | [`undercasetype/Fraunces`](https://github.com/undercasetype/Fraunces) |
| Release tag    | `1.000`                                                               |
| Release asset  | `UnderCaseType_Fraunces_1.000.zip`                                    |
| Asset sha256   | `8d8b81dfaeb89433f5c908e1d8d0a4b202bd627bd80d4cd5ff56f311fdcad19f`    |
| Path in asset  | `Fonts - Desktop/static/ttf/Fraunces9pt-SemiBold.ttf`                 |
| Committed file | `Fraunces9pt-SemiBold.ttf` (64 856 bytes)                             |
| File sha256    | `68a5bf2872cde75f01e98681ab1633e19f73ca6783932fdff2e5459755528cf5`    |

Verify a checkout against the record with:

```bash
sha256sum packages/ui/src/fonts/og/Fraunces9pt-SemiBold.ttf
```

## Licence

SIL Open Font License 1.1, the same licence as the woff2 files, whose text is
committed one level up as `../OFL-Fraunces.txt`.

## Weight, and the optical size

SemiBold (600) only — the board's display weight, and the only Fraunces weight
`../../fonts.css` declares a web face for. Satori has no notion of a weight it
was not given a file for, so a second weight here would have to be earned by an
OG template that actually asks for one.

Fraunces is a variable family with an `opsz` axis, and the web face is Google
Fonts' instance of it at `opsz` 14 / `SOFT` 0 / `WONK` 0. The upstream release
ships statics at three optical sizes only — 9pt, 72pt and 144pt — so `9pt` is the
nearest instance to the web face, not an exact one. An OG card and a page heading
will therefore differ slightly in the serif shaping. Recording it here makes that
a decision rather than a surprise; closing the gap means instancing the variable
TTF at build time, which is a build step this package does not have.
