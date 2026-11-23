import { WorkspaceScreen } from '@/components/WorkspaceScreen';
import { parseCommitted } from '@/lib/committed.ts';
import { homeView } from '@/lib/home.ts';
import { workspaceView } from '@/lib/workspace.ts';
import measurement from '../../fixtures/sample/measurement.json';
import history from '../../fixtures/sample/history.json';
import { inCensus } from './frame';

/** `/[workspace]`: one workspace, detailed. Baselined, as a screen is, at both viewports. */
const meta = {
  title: 'Screens/Census/Workspace',
  component: WorkspaceScreen,
  parameters: { screen: { routes: ['/[workspace]'] } },
};

export default meta;

/** The sample measurement read as the build reads it, through the validators. */
const committed = parseCommitted({
  measurement: JSON.stringify(measurement),
  history: JSON.stringify(history),
});
if (committed.state !== 'measured') throw new Error('the sample is measured');

/** The build's clock: the evening of 20 Nov 2026, the sample's day, as the home's stories. */
const FRAME = homeView(committed, Date.parse('2026-11-20T20:00:00.000Z'));

const pageOf = (slug: string) => {
  const view = workspaceView(committed.measurement, slug);
  if (view === null) throw new Error(`the sample has no workspace at /${slug}`);
  return view;
};

/** `@gate/ui`: every dimension that applies measured, its files drawn three ways. */
export const Sample = {
  ...inCensus(FRAME, '/ui'),
  args: { view: pageOf('ui') },
};

/** `@gate/blog`: Code not measured, and why; its screens without a tile. */
export const Unmeasured = {
  ...inCensus(FRAME, '/blog'),
  args: { view: pageOf('blog') },
};
