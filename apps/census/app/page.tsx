import { Suspense } from 'react';

import { FilteredHome } from '@/components/Filtered';
import { HomeScreen } from '@/components/HomeScreen';
import { loadHomeView } from './home-view';

export default async function HomePage() {
  const view = await loadHomeView();

  // Prerendered unfiltered; `?dimension=` and `?category=` apply in the browser.
  return (
    <Suspense fallback={<HomeScreen view={view} />}>
      <FilteredHome view={view} />
    </Suspense>
  );
}
