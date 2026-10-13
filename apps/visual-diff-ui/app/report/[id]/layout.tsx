/**
 * The report and the slot a comparison opens in over it.
 *
 * `modal` is filled only when a compare tool on this report navigates to a
 * comparison — the `(.)compare` route intercepts it, and the report under the
 * modal stays mounted with its filters, folds and scroll where the reviewer
 * left them. Loaded cold, the same address is `compare/[key]` in `children`
 * instead, and this slot falls back to `@modal/default.tsx`: nothing.
 */
export default function ReportLayout({ children, modal }: LayoutProps<'/report/[id]'>) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
