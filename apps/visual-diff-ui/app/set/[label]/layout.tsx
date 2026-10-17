/**
 * The set and the slot a screenshot opens in over it.
 *
 * `modal` is filled only when a screenshot in the set viewer is pressed — the
 * `(.)shot` route intercepts it, and the set under the modal stays mounted with
 * its filters and scroll where the reader left them. Loaded cold, the same
 * address is `shot/[key]` in `children` instead, and this slot falls back to
 * `@modal/default.tsx`: nothing. The same arrangement as app/report/[id].
 */
export default function SetLayout({ children, modal }: LayoutProps<'/set/[label]'>) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
