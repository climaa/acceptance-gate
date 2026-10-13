/** No comparison is open: the report alone. Without this, a cold load of a
 *  report would find no match for the slot and answer 404. */
export default function NoComparison() {
  return null;
}
