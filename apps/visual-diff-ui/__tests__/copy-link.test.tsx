// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COPIED, COPY_FAILED, COPY_LINK_LABEL, CopyLink } from '../components/CopyLink';

/**
 * The modal's copy-link button: what it copies, and what it says afterwards.
 *
 * jsdom has no clipboard, so each test installs the one it is about — which is
 * also how the refusal path gets exercised at all.
 */

function withClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

async function press() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: COPY_LINK_LABEL }));
  });
}

afterEach(cleanup);

describe('CopyLink', () => {
  it('says nothing until it is pressed', () => {
    render(<CopyLink />);

    expect(screen.getByRole('status').textContent).toBe('');
  });

  // Read at click time: after the arrows have walked, the address bar names
  // another variant than the one the modal opened on.
  it('copies the address as it is when pressed', async () => {
    const writeText = vi.fn(async () => {});
    withClipboard(writeText);
    render(<CopyLink />);
    window.history.replaceState(null, '', '/report/a__b/compare/k?mode=slider');

    await press();

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/report/a__b/compare/k?mode=slider`,
    );
  });

  it('says the link was copied', async () => {
    withClipboard(async () => {});
    render(<CopyLink />);

    await press();

    expect(screen.getByRole('status').textContent).toBe(COPIED);
  });

  it('points at the address bar when the clipboard refuses', async () => {
    withClipboard(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    render(<CopyLink />);

    await press();

    expect(screen.getByRole('status').textContent).toBe(COPY_FAILED);
  });

  // Outside a secure context there is no `navigator.clipboard` at all.
  it('points at the address bar when there is no clipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    render(<CopyLink />);

    await press();

    expect(screen.getByRole('status').textContent).toBe(COPY_FAILED);
  });
});
