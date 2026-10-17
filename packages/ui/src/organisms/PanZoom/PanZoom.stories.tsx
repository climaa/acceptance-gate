import type { Meta, StoryObj } from '@storybook/react';

import { PanZoom } from './PanZoom';

/**
 * A board-shaped fixture: 1600×2400, a header bar and a grid of tiles, so the
 * stories have something wider than any pane to zoom into and taller than it to
 * pan through. An inline SVG rather than one of `designs/exports/`: a real
 * board is re-exported by hand and drifts on every export, which would move
 * these baselines with no change to the component.
 */
const BOARD =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='1600'%20height='2400'%3E%3Crect%20width='1600'%20height='2400'%20fill='%23f5efe0'/%3E%3Crect%20x='40'%20y='40'%20width='620'%20height='44'%20rx='6'%20fill='%2311120d'/%3E%3Crect%20x='40'%20y='120'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='64'%20y='148'%20width='140'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='64'%20y='190'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='216'%20width='200'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='260'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='430'%20y='120'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='454'%20y='148'%20width='177'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='454'%20y='190'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='216'%20width='200'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='260'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='820'%20y='120'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='844'%20y='148'%20width='214'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='844'%20y='190'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='216'%20width='200'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='260'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='1210'%20y='120'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='1234'%20y='148'%20width='251'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='1234'%20y='190'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='216'%20width='200'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='260'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='40'%20y='490'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='64'%20y='518'%20width='163'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='64'%20y='560'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='586'%20width='241'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='630'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='430'%20y='490'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='454'%20y='518'%20width='200'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='454'%20y='560'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='586'%20width='241'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='630'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='820'%20y='490'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='844'%20y='518'%20width='237'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='844'%20y='560'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='586'%20width='241'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='630'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='1210'%20y='490'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='1234'%20y='518'%20width='154'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='1234'%20y='560'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='586'%20width='241'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='630'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='40'%20y='860'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='64'%20y='888'%20width='186'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='64'%20y='930'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='956'%20width='282'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='1000'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='430'%20y='860'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='454'%20y='888'%20width='223'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='454'%20y='930'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='956'%20width='282'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='1000'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='820'%20y='860'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='844'%20y='888'%20width='140'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='844'%20y='930'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='956'%20width='282'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='1000'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='1210'%20y='860'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='1234'%20y='888'%20width='177'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='1234'%20y='930'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='956'%20width='282'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='1000'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='40'%20y='1230'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='64'%20y='1258'%20width='209'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='64'%20y='1300'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='1326'%20width='233'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='1370'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='430'%20y='1230'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='454'%20y='1258'%20width='246'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='454'%20y='1300'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='1326'%20width='233'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='1370'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='820'%20y='1230'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='844'%20y='1258'%20width='163'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='844'%20y='1300'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='1326'%20width='233'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='1370'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='1210'%20y='1230'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='1234'%20y='1258'%20width='200'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='1234'%20y='1300'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='1326'%20width='233'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='1370'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='40'%20y='1600'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='64'%20y='1628'%20width='232'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='64'%20y='1670'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='1696'%20width='274'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='1740'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='430'%20y='1600'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='454'%20y='1628'%20width='149'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='454'%20y='1670'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='1696'%20width='274'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='1740'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='820'%20y='1600'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='844'%20y='1628'%20width='186'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='844'%20y='1670'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='1696'%20width='274'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='1740'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='1210'%20y='1600'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='1234'%20y='1628'%20width='223'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='1234'%20y='1670'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='1696'%20width='274'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='1740'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='40'%20y='1970'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='64'%20y='1998'%20width='255'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='64'%20y='2040'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='2066'%20width='225'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='64'%20y='2110'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='430'%20y='1970'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='454'%20y='1998'%20width='172'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='454'%20y='2040'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='2066'%20width='225'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='454'%20y='2110'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='820'%20y='1970'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='844'%20y='1998'%20width='209'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='844'%20y='2040'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='2066'%20width='225'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='844'%20y='2110'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3Crect%20x='1210'%20y='1970'%20width='350'%20height='330'%20rx='12'%20fill='%23ffffff'%20stroke='%23d8cfbc'%20stroke-width='2'/%3E%3Crect%20x='1234'%20y='1998'%20width='246'%20height='18'%20rx='4'%20fill='%23713520'/%3E%3Crect%20x='1234'%20y='2040'%20width='300'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='2066'%20width='225'%20height='12'%20rx='4'%20fill='%23b9ada0'/%3E%3Crect%20x='1234'%20y='2110'%20width='300'%20height='160'%20rx='8'%20fill='%23efe9df'/%3E%3C/svg%3E";

/** The width a dialog's left pane gives it on desktop, give or take. */
const FRAME = { width: '28rem' };

const meta: Meta<typeof PanZoom> = {
  title: 'Organisms/PanZoom',
  component: PanZoom,
  args: { src: BOARD, alt: 'A design board of component tiles', label: 'design board' },
  decorators: [
    (Story) => (
      <div style={FRAME}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PanZoom>;

/** 100%: the board as wide as the pane, its top showing. `−` and `reset`
 *  are disabled — this is the floor, and nothing has moved. */
export const Fitted: Story = {};

/** Zoomed in about the pane's centre: every control is live. */
export const Zoomed: Story = { args: { defaultZoom: 2.25 } };

/** At the image's natural pixels, the cap: `+` is disabled. */
export const AtCap: Story = { args: { defaultZoom: 100 } };

/** Two boxes outlined on the board, in its own pixels: the first tile, and the
 *  second, emphasized — the one a reader is pointing at. They pan and zoom with
 *  the board, as the grid does. */
export const WithMarks: Story = {
  args: {
    marks: [
      { x: 40, y: 120, width: 350, height: 330 },
      { x: 430, y: 120, width: 350, height: 330, emphasis: true },
    ],
  },
};

/** One view, handed to two panes: both at 225%, both a fifth of the way in and a
 *  tenth of the way down, so the same part of each shows. Board 01's "following
 *  a view" tile. */
export const FollowingAView: Story = {
  render: (args) => (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <PanZoom {...args} view={{ zoom: 2.25, x: 0.2, y: 0.1 }} />
      <PanZoom {...args} label="the same view" view={{ zoom: 2.25, x: 0.2, y: 0.1 }} />
    </div>
  ),
};

/** A kept crop, handed back by the host: the second tile, outlined in the accent
 *  over a light wash. Board 01's "cropping" tile. */
export const WithCrop: Story = {
  args: { crop: { x: 430, y: 120, width: 350, height: 330 } },
};
