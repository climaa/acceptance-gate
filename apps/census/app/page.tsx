import { Suspense } from 'react';

import { FilteredHome } from '@/components/Filtered';
import { HomeScreen } from '@/components/HomeScreen';
import { pageMetadata } from '@/lib/share.ts';
import { SITE_DESCRIPTION, SITE_TITLE } from '@/lib/site.ts';
import { loadHomeView } from './home-view';

export const metadata = pageMetadata({
  path: '/',
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
});

export default async function HomePage() {
  const view = await loadHomeView();

  // Prerendered unfiltered; `?dimension=` and `?category=` apply in the browser.
  return (
    <Suspense fallback={<HomeScreen view={view} />}>
      <FilteredHome view={view} />
    </Suspense>
  );
}
