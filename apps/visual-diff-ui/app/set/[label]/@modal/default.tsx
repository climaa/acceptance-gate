/** No screenshot is open: the set alone. Without this, a cold load of a set
 *  would find no match for the slot and answer 404. */
export default function NoShot() {
  return null;
}
