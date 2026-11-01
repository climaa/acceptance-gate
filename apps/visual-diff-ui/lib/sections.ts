import {
  APP_TIER,
  APPS,
  TIERS,
  appOf,
  type App,
  type Tier,
} from '@gate/visual-diff/policy';

/**
 * The console's sections: a design-system tier, or one app's screens.
 *
 * `screens` is one tier to the differ — `variantKey` has no app axis, and needs
 * none while no screen is baselined — but three products to a reviewer, who
 * opens a set to look at one of them. So the set's tabs and the report's regions
 * split it by app, and both split it HERE: two groupings written apart are two
 * answers to "which section is this shot in" that can drift.
 *
 * The apps are read off the policy, never listed: a fourth app is one line in
 * `APP_ROOTS` and its section appears with no change to this file.
 */

/** The app section a screen whose app the policy does not name falls into —
 *  shown, never dropped: a shot on disk must not read as a story gone missing. */
const OTHER = 'other';

export type SectionKey =
  | Exclude<Tier, typeof APP_TIER>
  | `${typeof APP_TIER}-${App}`
  | `${typeof APP_TIER}-${typeof OTHER}`;

export interface Section {
  key: SectionKey;
  /** What the tab and the heading say: `atoms`, `Screens / Visual-diff-ui`,
   *  `Screens / Other`. */
  label: string;
  /** The capture tier underneath — what `TIER_VIEWPORTS` is asked about. */
  tier: Tier;
  /** The heading's id and the tab's fragment. Prefixed by tier so an app can
   *  never share an anchor with a tier of the same name. */
  anchor: string;
}

const sectionFor = (key: SectionKey, label: string, tier: Tier): Section => ({
  key,
  label,
  tier,
  anchor: `vd-tier-${key}`,
});

/**
 * An app's section reads the way Storybook's sidebar files its screens: the
 * tier, then the app as a screen's title names it (`Screens/Visual-diff-ui/…`,
 * `Screens/Web/…`) — the app's directory with its first letter raised. The tab
 * then says both what kind of shot it holds and whose, beside tiers that are
 * not screens.
 */
const appLabel = (app: string): string =>
  `Screens / ${app.charAt(0).toUpperCase()}${app.slice(1)}`;

const appSection = (app: string): Section =>
  sectionFor(`${APP_TIER}-${app}` as SectionKey, appLabel(app), APP_TIER);

/** Every section, in the order the console walks them: the design system's own
 *  tiers innermost first, then the apps in the policy's order, then `other`. */
export const SECTIONS: readonly Section[] = [
  ...TIERS.filter((tier) => tier !== APP_TIER).map((tier) =>
    sectionFor(tier as SectionKey, tier, tier),
  ),
  ...APPS.map(appSection),
  appSection(OTHER),
];

const byKey = new Map(SECTIONS.map((section) => [section.key, section]));

const sectionAt = (key: SectionKey): Section => {
  const section = byKey.get(key);
  if (section === undefined) throw new Error(`no section ${key}`);

  return section;
};

/** The section a story's shots belong to. Total: every tier and every story id
 *  has one. */
export function sectionOf(tier: Tier, storyId: string): Section {
  if (tier !== APP_TIER) return sectionAt(tier as SectionKey);

  return sectionAt(`${APP_TIER}-${appOf(storyId) ?? OTHER}` as SectionKey);
}
