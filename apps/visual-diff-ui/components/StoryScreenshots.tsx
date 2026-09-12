import {
  DEV_STORYBOOK,
  PUBLISHED_STORYBOOK,
  showsDevStorybook,
  storybookLink,
} from '@/lib/report-view';
import type { SetShot, ShotGroup } from '@/lib/set-shots';
import { setShotUrl } from '@/lib/shots';

/**
 * One story's screenshots in one set.
 *
 * A row per viewport rather than one grid, because the two are different widths:
 * a mobile shot is 358 px and a desktop one 1248, and a single row would either
 * blow the mobile shot up to a desktop column or shrink the desktop one to fit
 * beside it. Neither is the picture that was taken.
 *
 * Only the viewports the story actually has. `TIER_VIEWPORTS` says atoms and
 * molecules are desktop-only, but `visual-diff:all-viewports` opts individual
 * stories past that, so the corpus is the only honest answer — and an empty
 * frame for a shot that was never meant to exist reads as one that failed.
 */

const cellId = (key: string) => `vd-story-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`;

/**
 * One screenshot, its caption, and the two ways out to the live story.
 *
 * The links are here rather than on the story header because `storybookLink` is
 * parameterised by THEME — a story-level link could not say which of the two it
 * meant. That is also where the report puts them (components/VariantRow.tsx), so
 * a reviewer moving between the two surfaces finds the same pair in the same
 * place, opening the same way.
 */
function VariantCell({ label, shot }: { label: string; shot: SetShot }) {
  const src = setShotUrl(label, shot.file);
  const dimensions = shot.width !== null && shot.height !== null;

  return (
    <figure
      className="vd-cell"
      // What the filter bar selects on. NOT `data-theme`: that attribute is the
      // app's theme mechanism, and `tokens.css` remaps every colour role under a
      // bare `[data-theme='dark']` selector — putting it here would re-theme this
      // cell's own caption, links and border rather than label it.
      data-shot-theme={shot.theme}
      data-shot-viewport={shot.viewport}
      // The shot's own width, so nothing is ever drawn larger than it was
      // captured. Derived from the file, not a chosen visual value.
      style={dimensions ? { maxWidth: `${shot.width}px` } : undefined}
    >
      {/* The raw PNG, at 1:1, in the browser's own viewer. The report reads
          pixels in its comparison modal; a set has one shot per cell and nothing
          to compare it against, so there is no modal to open — and a new tab
          costs the reader nothing they were looking at. */}
      <a
        className="vd-cell__open"
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`open ${shot.key} at full size`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- `next/image`
            resamples and re-encodes, and this page exists to show the committed
            bytes. `width`/`height` are the image's own, so the browser reserves
            the ratio before it arrives and nothing below shifts on load. */}
        <img
          className="vd-cell__img"
          src={src}
          alt={`${shot.storyId}, ${shot.viewport} ${shot.theme}`}
          width={shot.width ?? undefined}
          height={shot.height ?? undefined}
          loading="lazy"
          decoding="async"
        />
      </a>

      <figcaption className="vd-cell__caption vd-mono">
        {shot.viewport}/{shot.theme}
        {dimensions && ` · ${shot.width}×${shot.height}`}
      </figcaption>

      {/* Both Storybooks, as the report offers them: the one a developer has
          running beside the console, and the published build. The first only
          where it can answer — a dead link beside a live one is worse than no
          link. */}
      <span className="vd-cell__links">
        {showsDevStorybook() && (
          <a
            className="vd-cell__link"
            href={storybookLink(DEV_STORYBOOK, shot.storyId, shot.theme)}
            target="_blank"
            rel="noopener noreferrer"
          >
            dev Storybook
          </a>
        )}
        <a
          className="vd-cell__link"
          href={storybookLink(PUBLISHED_STORYBOOK, shot.storyId, shot.theme)}
          target="_blank"
          rel="noopener noreferrer"
        >
          baseline Storybook
        </a>
      </span>
    </figure>
  );
}

export interface StoryScreenshotsProps {
  label: string;
  group: ShotGroup;
}

export function StoryScreenshots({ label, group }: StoryScreenshotsProps) {
  const headingId = cellId(group.key);

  return (
    <article className="vd-story" aria-labelledby={headingId}>
      <header className="vd-story__head">
        <h3 className="vd-story__title" id={headingId}>
          {group.title}
        </h3>
        <span className="vd-mono vd-story__id" title={group.storyId}>
          {group.storyId}
        </span>
        <span className="vd-mono vd-story__count">
          {group.shots.length} screenshot{group.shots.length === 1 ? '' : 's'}
        </span>
      </header>

      {group.viewports.map((viewport) => (
        <div className="vd-story__viewport" data-shot-viewport={viewport} key={viewport}>
          <span className="vd-mono vd-story__viewport-label">{viewport}</span>
          <div className="vd-story__cells">
            {group.shots
              .filter((shot) => shot.viewport === viewport)
              .map((shot) => (
                <VariantCell key={shot.key} label={label} shot={shot} />
              ))}
          </div>
        </div>
      ))}
    </article>
  );
}
