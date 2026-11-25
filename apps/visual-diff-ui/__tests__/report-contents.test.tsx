// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import { ReportContents } from '../components/ReportContents';
import type { ReportTemplateProps } from '../components/ReportTemplate';
import { readCanonicalSet } from '../lib/baselines';
import { FIXTURES_DIR } from '../lib/data';
import { repoRoot } from '../lib/git';
import { resetRequestHeaders, setRequestHost } from './stubs/next-headers';
import { NOT_FOUND } from './stubs/next-navigation';

/**
 * The read behind a report page, against the committed fixtures.
 *
 * Asserted on the element it returns rather than rendered, as the comparison's
 * and the shot's are: what matters is whether the page is frozen, what reaches
 * the template, and that an unknown id never does.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';

const contentsFor = (id: string) => ReportContents({ params: Promise.resolve({ id }) });

const propsOf = async (id: string) =>
  (await contentsFor(id)).props as ReportTemplateProps;

afterEach(() => {
  resetRequestHeaders();
  delete process.env.VISUAL_DIFF_DATA_DIR;
});

describe('ReportContents', () => {
  it('is a not-found for a report this instance does not have', async () => {
    // Arrange
    const id = 'nothing__here';

    // Act
    const read = contentsFor(id);

    // Assert
    await expect(read).rejects.toThrow(NOT_FOUND);
  });

  it('freezes the sample instance, even on the machine running it', async () => {
    // Arrange: no data directory configured, and the stub's default loopback host.

    // Act
    const props = await propsOf(REPORT);

    // Assert
    expect(props.frozen).toBe(true);
  });

  it('freezes a console with its own data reached from off the machine', async () => {
    // Arrange
    process.env.VISUAL_DIFF_DATA_DIR = FIXTURES_DIR;
    setRequestHost('visual-diff.example.com');

    // Act
    const props = await propsOf(REPORT);

    // Assert
    expect(props.frozen).toBe(true);
  });

  // The fixtures named as the data directory read as this instance's own data:
  // the resolution asks only whether the directory holds something.
  it('leaves a local console with its own data unfrozen', async () => {
    // Arrange
    process.env.VISUAL_DIFF_DATA_DIR = FIXTURES_DIR;

    // Act
    const props = await propsOf(REPORT);

    // Assert
    expect(props.frozen).toBe(false);
  });

  it('hands the template the report, its id, the registry and the corpus', async () => {
    // Arrange
    const corpus = await readCanonicalSet(repoRoot());

    // Act
    const props = await propsOf(REPORT);

    // Assert
    expect({
      id: props.id,
      hasReport: props.report !== null,
      hasSets: props.sets.length > 0,
      corpus: props.corpus,
    }).toEqual({ id: REPORT, hasReport: true, hasSets: true, corpus });
  });
});
