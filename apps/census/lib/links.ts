/**
 * Where a path in the measurement lives on GitHub. Always at the measured
 * commit, never a branch: the page describes that commit, and a branch link
 * would show a file that has moved on since.
 */
export interface At {
  repo: string;
  commit: string;
}

const segments = (path: string) => path.split('/').filter(Boolean);

/** `https://github.com/<repo>/blob/<commit>/<path>`, each segment escaped; a directory redirects to its tree. */
export function blobHref(at: At, ...paths: string[]): string {
  const path = paths.flatMap(segments).map(encodeURIComponent).join('/');
  return `https://github.com/${at.repo}/blob/${at.commit}/${path}`;
}
