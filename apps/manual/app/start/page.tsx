import type { Metadata } from 'next';
import { StartScreen } from '@/components/StartScreen';
import { TOUR_LEAD, TOUR_TITLE } from '@/content/tour';
import { TOUR_SLUG } from '@/lib/allowlist';
import { pageMetadata } from '@/lib/share';

export const metadata: Metadata = pageMetadata({
  path: `/${TOUR_SLUG}`,
  title: TOUR_TITLE,
  description: TOUR_LEAD,
});

export default function StartPage() {
  return <StartScreen />;
}
