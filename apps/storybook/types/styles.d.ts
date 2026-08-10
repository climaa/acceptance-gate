/**
 * The preview imports a stylesheet for its side effect. The blog gets this
 * declaration from `next-env.d.ts`, which only exists where `next build` runs —
 * this app is built by Storybook's Vite builder, so it states it itself.
 */
declare module '*.css';

/**
 * The Tokens docs page reads tokens.css as text rather than retyping its
 * values. Vite's `?raw` suffix resolves the specifier and inlines the file's
 * contents as a string import; this app's own build never goes through
 * `next-env.d.ts`, so the declaration lives here too.
 */
declare module '*.css?raw' {
  const content: string;
  export default content;
}
