import type { Metadata } from 'next';
import { Prose, Stack } from '@gate/ui';

export const metadata: Metadata = {
  title: 'About',
  description: 'Carlos Lima — senior frontend engineer in Barcelona.',
};

export default function AboutPage() {
  return (
    <Stack gap={8}>
      <h1 className="page-title">About</h1>
      <Prose>
        <p>
          I am Carlos Lima, a senior frontend engineer in Barcelona. I work mostly with
          Next.js and TypeScript, focusing on what many people find boring: making sure
          what we build can be verified automatically and repeatably.
        </p>
        <h2>What I work on</h2>
        <p>
          End-to-end test suites with Cypress and Gherkin, visual regression for
          components, designing accurate CI pipelines, and developing my own quality
          tools. Recently, I&apos;ve been considering how these aspects shift when an
          agent contributes to the code.
        </p>
        <p>
          Most of this has happened in startups, and that&apos;s where I like to be. HUB
          International&apos;s insurance quote wizard went from nothing to a shipped MVP
          in three months, with teams across Argentina, Mexico, the US. `acceptance-gate`
          — this blog, its design system, its CI gate, a tagged v1.0.0 — took a week.
          Along the way I&apos;ve built proofs-of-concept at several companies whose whole
          job was to answer a question fast enough that the answer still mattered.
        </p>
        <p>
          That&apos;s also where the interest in verification comes from. Building fast is
          the easy half. The hard half is knowing which of the things you built
          you&apos;re allowed to trust—and that question gets sharper, not softer, when an
          agent is writing the code.
        </p>
        <h2>Contact</h2>
        <p>
          <a href="https://github.com/climaa">GitHub</a> ·{' '}
          <a href="https://www.linkedin.com/in/carlos-lima-frontend/">LinkedIn</a>
        </p>
      </Prose>
    </Stack>
  );
}
