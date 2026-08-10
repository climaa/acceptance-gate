import type { Meta, StoryObj } from '@storybook/react';

import { Prose } from './Prose';

const meta: Meta<typeof Prose> = {
  title: 'Atoms/Prose',
  component: Prose,
};

export default meta;

type Story = StoryObj<typeof Prose>;

// Fixed sample: every element .ds-prose has a rule for, so the capture is one
// baseline that exercises the whole stylesheet rather than several thin ones.
export const Default: Story = {
  args: {
    children: (
      <>
        <h2>Setting up the pipeline</h2>
        <p>
          The gate runs every check on a fresh checkout, no cached state carried between
          runs. It reads its configuration from <code>turbo.json</code> and the workspace
          manifests.
        </p>
        <h3>Steps</h3>
        <ul>
          <li>Install dependencies with a frozen lockfile</li>
          <li>Run lint, typecheck, build and test for every workspace</li>
          <li>Capture and diff the design system&rsquo;s baselines</li>
        </ul>
        <blockquote>
          <p>A gate that only sometimes runs is not a gate.</p>
        </blockquote>
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Scope</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Lint</td>
              <td>Per workspace</td>
            </tr>
            <tr>
              <td>Visual diff</td>
              <td>packages/ui</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
};
