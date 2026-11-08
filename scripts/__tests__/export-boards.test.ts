import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * export-boards.js is a Pencil MCP snippet: it runs inside Pen, against the
 * globals `Get`, `Export` and `Print`. These run it in a VM against a fake
 * document whose walker hands each node the same context Pen does (bounds
 * relative to the parent, the parent's context, `problems`, `skipChildren`),
 * so what the snippet exports and prints can be read off the stubs.
 */
const SNIPPET = readFileSync(resolve(__dirname, '../pen/export-boards.js'), 'utf8');

type Bounds = { x: number; y: number; width: number; height: number };
type FakeNode = {
  id: string;
  name: string;
  bounds: Bounds;
  problems?: string;
  children?: FakeNode[];
};
type Ctx = {
  node: FakeNode;
  bounds: Bounds;
  problems?: string;
  parentCtx?: Ctx;
  skipChildren: () => void;
};
type Visit = (n: FakeNode, c: Ctx) => unknown;

function walk(node: FakeNode, parentCtx: Ctx | undefined, visit: Visit, out: unknown[]) {
  let skip = false;
  const ctx: Ctx = {
    node,
    bounds: node.bounds,
    problems: node.problems,
    parentCtx,
    skipChildren: () => {
      skip = true;
    },
  };
  const value = visit(node, ctx);
  if (value !== undefined) out.push(value);
  if (!skip) for (const child of node.children ?? []) walk(child, ctx, visit, out);
}

function runSnippet(document: FakeNode[]) {
  const exported: string[] = [];
  const printed: string[] = [];
  const find = (id: string, nodes: FakeNode[]): FakeNode | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const hit = find(id, n.children ?? []);
      if (hit) return hit;
    }
    return undefined;
  };
  const Get = (...args: [Visit] | [string, Visit]) => {
    const out: unknown[] = [];
    if (args.length === 1) for (const n of document) walk(n, undefined, args[0], out);
    else walk(find(args[0], document)!, undefined, args[1], out);
    return out;
  };
  const Export = (ids: string[]) => exported.push(...ids);
  const Print = (line: string) => printed.push(line);
  runInNewContext(SNIPPET, { Get, Export, Print });
  return { exported, printed };
}

const LIGHT = 'atoms__desktop__light__atoms-badge--accent';
const DARK = 'atoms__desktop__dark__atoms-badge--accent';

function board(dark: Partial<FakeNode> = {}): FakeNode {
  return {
    id: 'B1',
    name: '01-atoms — Atoms',
    bounds: { x: 0, y: 0, width: 2600, height: 400 },
    children: [
      {
        id: 'T',
        name: 'Themes',
        bounds: { x: 40, y: 100, width: 2520, height: 100 },
        children: [
          { id: 'L', name: LIGHT, bounds: { x: 0, y: 0, width: 1248, height: 100 } },
          {
            id: 'D',
            name: DARK,
            bounds: { x: 1272, y: 0, width: 1248, height: 100 },
            ...dark,
          },
        ],
      },
    ],
  };
}

describe('export-boards', () => {
  it('exports the board and prints its manifest when no tile reports a problem', () => {
    // Arrange
    const document = [board()];

    // Act
    const { exported, printed } = runSnippet(document);

    // Assert
    expect(exported).toEqual(['B1']);
    expect(printed).toHaveLength(1);
    const [entry] = JSON.parse(String(printed[0]).replace(/^MANIFEST /, ''));
    expect(entry.tiles[DARK]).toEqual([2624, 200, 2496, 200]);
  });

  it('refuses a tile Pencil reports as clipped: no PNG, no MANIFEST line, the key and the problem printed', () => {
    // Arrange
    const document = [
      board({
        bounds: { x: 1272, y: 50, width: 1248, height: 100 },
        problems: 'partially clipped',
      }),
    ];

    // Act
    const { exported, printed } = runSnippet(document);

    // Assert
    expect(exported).toEqual([]);
    expect(printed).toEqual([`REFUSED ${DARK}: partially clipped`]);
  });

  it('exports no board when a tile on another board is refused', () => {
    // Arrange
    const clean = { ...board(), id: 'B0', name: '00-foundations — Foundations' };
    const document = [clean, board({ problems: 'fully clipped' })];

    // Act
    const { exported, printed } = runSnippet(document);

    // Assert
    expect(exported).toEqual([]);
    expect(printed).toEqual([`REFUSED ${DARK}: fully clipped`]);
  });
});
