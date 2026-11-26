/**
 * `local-integrity.mjs`, declared for the suite that imports it.
 *
 * The script exports nothing — importing it runs the local lane's check — but
 * this workspace does not set `allowJs`, so without a sibling declaration the
 * import is an implicit `any` the typecheck refuses.
 */

export {};
