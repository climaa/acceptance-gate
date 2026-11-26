/**
 * `scripts/local-data-dir.mjs`, declared for the suite that runs it.
 *
 * The script exports nothing: it is a command, and everything it does happens
 * when it is evaluated, driven by `process.argv`. This app sets `allowJs: false`,
 * so without a sibling declaration the suite's import of it is an implicit `any`
 * that tsc refuses. See `capture-set.d.mts` for why it is a sibling file rather
 * than an ambient `declare module` block.
 */
export {};
