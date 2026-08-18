/**
 * Whether the request that reached this console came from the machine running it.
 *
 * This is the whole of "can this instance start a job". A job needs the checkout
 * it compares, a Storybook build to serve and a browser to drive it; a
 * deployment has none of the three, and the console that does is the one on the
 * reviewer's own machine.
 *
 * Deliberately not in lib/host.ts. That module answers what CONTAINER this
 * process runs in — the D3 accept gate — and two meanings of "host" in one file
 * is a reading trap.
 */

/** The names a loopback interface answers to. `0.0.0.0` is absent on purpose: it
 *  is what a server BINDS to, never what a client asked for. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * The hostname inside a `Host` header, without its port.
 *
 * IPv6 literals arrive bracketed — RFC 7230 requires it, and `[::1]:3300` is the
 * shape Node delivers — so the brackets come off before the lookup rather than
 * the set carrying a second spelling of every address.
 */
function hostnameOf(host: string): string {
  const value = host.trim().toLowerCase();
  const bracketed = /^\[(?<address>[^\]]+)\]/.exec(value);

  if (bracketed?.groups) return bracketed.groups.address as string;

  const parts = value.split(':');
  // More than one colon and no brackets is an unbracketed IPv6 literal. No
  // browser sends one, but `curl -H 'Host: ::1'` does, and splitting it on the
  // port separator would leave an empty string that matches nothing.
  if (parts.length > 2) return value;

  return parts[0] ?? '';
}

/** A header this console can read as its own machine. Anything it cannot read —
 *  a request that carried no `Host` at all — is not local: the gate fails closed,
 *  because the cost of guessing wrong is a deployment that runs jobs. */
export function isLocalHost(host: string | null | undefined): boolean {
  return host ? LOOPBACK.has(hostnameOf(host)) : false;
}
