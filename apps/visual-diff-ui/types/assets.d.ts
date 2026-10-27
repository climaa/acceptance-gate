/**
 * The font files are imported for their URL alone: the bundler emits one hashed
 * asset per face and hands back the path the stylesheet's own `url()` resolves
 * to, which is what lets a preload name the byte-identical URL. Next declares
 * this for images (`next/image-types/global`) and for nothing else.
 */
declare module '*.woff2' {
  const src: string;
  export default src;
}
