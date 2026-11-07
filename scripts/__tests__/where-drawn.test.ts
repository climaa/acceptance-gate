import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import * as whereDrawnModule from '../pen/where-drawn.mjs';

const { whereDrawn } = whereDrawnModule;

const FIXTURES = join(__dirname, 'fixtures', 'where-drawn');
const SCRIPT = join(__dirname, '..', 'pen', 'where-drawn.mjs');
const fixture = () =>
  JSON.parse(readFileSync(join(FIXTURES, '04-templates.pen'), 'utf8'));

describe('whereDrawn', () => {
  it('lists a tile that holds a nested frame of the name, with the path down to it', () => {
    // Arrange
    const document = fixture();

    // Act
    const rows = whereDrawn(document, '04-templates', ['Tab bar']);

    // Assert
    expect(rows).toContainEqual({
      board: '04-templates',
      tile: 'templates__mobile__light__templates-tabscreen--default',
      path: 'TabScreen / Tab bar',
      count: 1,
    });
  });

  it('leaves out a tile without such a frame, even where a text layer carries the name', () => {
    // Arrange
    const document = fixture();

    // Act
    const rows = whereDrawn(document, '04-templates', ['Tab bar']);

    // Assert
    expect(rows.map((row: { tile: string }) => row.tile)).toEqual([
      'templates__mobile__light__templates-tabscreen--default',
    ]);
  });

  it('lists a frame drawn more than once along one path once, with its count', () => {
    // Arrange
    const card = { type: 'frame', name: 'PostCard' };
    const document = {
      children: [
        {
          type: 'frame',
          name: 'templates__desktop__light__templates-index--default',
          children: [{ type: 'frame', name: 'posts', children: [card, card, card] }],
        },
      ],
    };

    // Act
    const rows = whereDrawn(document, '04-templates', ['PostCard']);

    // Assert
    expect(rows).toEqual([
      {
        board: '04-templates',
        tile: 'templates__desktop__light__templates-index--default',
        path: 'posts / PostCard',
        count: 3,
      },
    ]);
  });

  it('lists nothing for a name no tile draws', () => {
    // Arrange
    const document = fixture();

    // Act
    const rows = whereDrawn(document, '04-templates', ['Sheet']);

    // Assert
    expect(rows).toEqual([]);
  });
});

describe('where-drawn.mjs', () => {
  it('prints each tile that draws the frame, with its board and the path', () => {
    // Arrange
    const args = [SCRIPT, '--designs', FIXTURES, 'Tab bar'];

    // Act
    const out = execFileSync(process.execPath, args, { encoding: 'utf8' });

    // Assert
    expect(out).toBe(
      '04-templates  templates__mobile__light__templates-tabscreen--default  TabScreen / Tab bar\n',
    );
  });

  it('refuses to run without a frame name, saying how to call it', () => {
    // Arrange
    const args = [SCRIPT, '--designs', FIXTURES];

    // Act
    let status = 0;
    let stderr = '';
    try {
      execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      ({ status, stderr } = error as { status: number; stderr: string });
    }

    // Assert
    expect(status).toBe(2);
    expect(stderr).toContain('usage: node scripts/pen/where-drawn.mjs');
  });
});
