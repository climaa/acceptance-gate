import type { Metadata } from 'next';
import { AboutScreen } from '@/components/AboutScreen';

import { pageMetadata } from '@/lib/share';

export const metadata: Metadata = pageMetadata({
  path: '/about',
  title: 'About',
  description: 'Carlos Lima — senior frontend engineer in Barcelona.',
});

export default function AboutPage() {
  return <AboutScreen />;
}
