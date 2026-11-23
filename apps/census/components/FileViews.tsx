'use client';

import { useState } from 'react';

import { Icicle, SegmentedControl } from '@gate/ui';
import type { FileView } from '@/lib/workspace.ts';
import { Legend } from './Legend';

export interface FileViewsProps {
  views: readonly FileView[];
  files: number;
  note: string;
}

/**
 * The workspace's files drawn one of three ways, CRAP first. The only state it
 * keeps is which view is chosen; every view is the server's, already built.
 */
export function FileViews({ views, files, note }: FileViewsProps) {
  const [chosen, setChosen] = useState(views[0]?.value);
  const view = views.find((v) => v.value === chosen) ?? views[0];
  if (view === undefined) return null;

  return (
    <div className="census-views">
      <div className="census-views__head">
        <h3 className="census-subtitle-caps">
          {view.label} · {files} files
        </h3>
        <SegmentedControl
          label="Draw the files by"
          options={[...views]
            .sort((a, b) => ORDER.indexOf(a.value) - ORDER.indexOf(b.value))
            .map((v) => ({ value: v.value, label: v.label }))}
          value={view.value}
          onChange={(value) => setChosen(value as FileView['value'])}
        />
      </div>
      <Legend items={view.legend} />
      <Icicle root={view.root} label={`${view.label} by file`} />
      <p className="census-caption census-views__note">{note}</p>
    </div>
  );
}

/** The switch reads in the tile's order, whichever view leads. */
const ORDER: readonly FileView['value'][] = ['coverage', 'maintainability', 'crap'];
