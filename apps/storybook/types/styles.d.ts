/**
 * The preview imports a stylesheet for its side effect. The blog gets this
 * declaration from `next-env.d.ts`, which only exists where `next build` runs —
 * this app is built by Storybook's Vite builder, so it states it itself.
 */
declare module '*.css';
