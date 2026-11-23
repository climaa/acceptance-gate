import { describe, expect, it } from 'vitest';

import { blobHref } from '@/lib/links.ts';

const COMMIT = '0514dc9a3f6e2b7c8d1e4f5a6b7c8d9e0f1a2b3c';

describe('blobHref', () => {
  it('links a path to its blob at the measured commit', () => {
    // Arrange
    const at = { repo: 'climaa/acceptance-gate', commit: COMMIT };

    // Act
    const href = blobHref(at, 'packages/ui/src/atoms/Badge/Badge.tsx');

    // Assert
    expect(href).toBe(
      `https://github.com/climaa/acceptance-gate/blob/${COMMIT}/packages/ui/src/atoms/Badge/Badge.tsx`,
    );
  });

  it('joins a workspace path and a workspace-relative file', () => {
    const href = blobHref({ repo: 'o/r', commit: COMMIT }, 'apps/blog', 'lib/posts.ts');

    expect(href).toBe(`https://github.com/o/r/blob/${COMMIT}/apps/blog/lib/posts.ts`);
  });

  it('escapes each segment, keeping the slashes', () => {
    const href = blobHref({ repo: 'o/r', commit: COMMIT }, 'app/[slug]/page #1.tsx');

    expect(href).toBe(
      `https://github.com/o/r/blob/${COMMIT}/app/%5Bslug%5D/page%20%231.tsx`,
    );
  });
});
