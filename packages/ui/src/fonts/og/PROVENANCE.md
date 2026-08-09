# `src/fonts/og/` — provenance

This directory is the one documented exemption from the "self-hosted woff2 only"
rule. `next/og` renders through satori, which reads neither page CSS nor woff2:
the OG-image route has to hand it font bytes directly, in a format it parses.
Hence a TTF, referenced by no `@font-face` in `../../fonts.css`.

`@fontsource/inter` — the pinned provenance record for every woff2 in the parent
directory — ships only `woff2` and `woff`, so this file could not come from it.
It comes from the upstream Inter release instead, recorded exactly:

| Field           | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| Upstream        | [`rsms/inter`](https://github.com/rsms/inter)                      |
| Release tag     | `v4.1`                                                             |
| Release asset   | `Inter-4.1.zip`                                                    |
| Asset sha256    | `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e` |
| Path in asset   | `extras/ttf/Inter-Regular.ttf`                                     |
| Committed file  | `Inter-Regular.ttf` (411 640 bytes)                                 |
| File sha256     | `40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82` |

Verify a checkout against the record with:

```bash
sha256sum packages/ui/src/fonts/og/Inter-Regular.ttf
```

## Licence

SIL Open Font License 1.1, the same licence as the woff2 files, whose text is
committed one level up as `../OFL-Inter.txt`.

## Weight

Regular (400) only. Satori has no notion of a weight it was not given a file
for, so a second weight here would have to be earned by an OG template that
actually asks for one.
