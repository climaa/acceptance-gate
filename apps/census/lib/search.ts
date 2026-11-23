/**
 * The ⌘K index, built at build from the measurement: workspaces, components,
 * files, gaps and scenarios. The palette only matches entries; where one leads
 * is kept beside it in `hrefs`, keyed by the entry's id.
 */
import type { SearchEntry } from '@gate/ui';

import { LOCAL_FEATURES } from './features.ts';
import { gapAnchor } from './filter.ts';
import { blobHref } from './links.ts';
import type { Measurement, Workspace } from './measurement.ts';
import { workspaceHref } from './workspace-address.ts';

export interface SearchIndex {
  entries: SearchEntry[];
  hrefs: Record<string, string>;
}

type Indexed = SearchEntry & { href: string };

/** `src/atoms/Badge/Badge.tsx` → `Badge`; a file whose name is not PascalCase is no component. */
const componentName = (path: string) => {
  const base = String(path.split('/').at(-1)).replace(/\.[^.]+$/, '');
  return /^[A-Z][A-Za-z0-9]*$/.test(base) ? base : undefined;
};

function workspaceEntries(m: Measurement): Indexed[] {
  return m.workspaces.map((ws) => ({
    id: `workspace:${ws.path}`,
    kind: 'workspace',
    title: ws.name,
    meta: ws.category,
    href: workspaceHref(ws),
  }));
}

const filesOf = (ws: Workspace) =>
  ws.dimensions.code.state === 'measured' ? ws.dimensions.code.files : [];

function fileEntries(m: Measurement): Indexed[] {
  return m.workspaces.flatMap((ws) =>
    filesOf(ws).map((file) => ({
      id: `file:${ws.path}/${file.path}`,
      kind: 'file' as const,
      title: `${ws.path}/${file.path}`,
      meta: ws.name,
      href: blobHref(m, ws.path, file.path),
    })),
  );
}

function componentEntries(m: Measurement): Indexed[] {
  return m.workspaces.flatMap((ws) =>
    filesOf(ws).flatMap((file) => {
      const name = componentName(file.path);
      if (name === undefined || file.group === undefined) return [];
      return [
        {
          id: `component:${ws.path}/${file.path}`,
          kind: 'component' as const,
          title: name,
          meta: `${file.group} · ${ws.name}`,
          href: blobHref(m, ws.path, file.path),
        },
      ];
    }),
  );
}

function gapEntries(m: Measurement): Indexed[] {
  return m.gaps.map((gap) => ({
    id: `gap:${gap.id}`,
    kind: 'gap',
    title: gap.title,
    meta: gap.kind,
    href: `#${encodeURIComponent(gapAnchor(gap.id))}`,
  }));
}

const featureFile = (name: string) =>
  `apps/e2e/features/${LOCAL_FEATURES.has(name) ? 'local' : 'acceptance'}/${name}.feature`;

function scenarioEntries(m: Measurement): Indexed[] {
  return m.workspaces.flatMap((ws) => {
    const acceptance = ws.dimensions.acceptance;
    if (acceptance.state !== 'measured') return [];
    return acceptance.features.map((name) => ({
      id: `scenario:${name}`,
      kind: 'scenario' as const,
      title: name,
      meta: ws.name,
      href: blobHref(m, featureFile(name)),
    }));
  });
}

/** Every entry the palette can find, and where each one leads. */
export function searchIndex(m: Measurement): SearchIndex {
  const indexed = [
    ...workspaceEntries(m),
    ...componentEntries(m),
    ...fileEntries(m),
    ...gapEntries(m),
    ...scenarioEntries(m),
  ];
  return {
    entries: indexed.map(({ href: _href, ...entry }) => entry),
    hrefs: Object.fromEntries(indexed.map((e) => [e.id, e.href])),
  };
}
