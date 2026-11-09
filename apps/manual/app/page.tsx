import type { Metadata } from 'next';
import { IndexScreen } from '@/components/IndexScreen';
import { pageMetadata } from '@/lib/share';
import { SITE_DEFAULT_TITLE, SITE_DESCRIPTION } from '@/lib/site';

export const metadata: Metadata = pageMetadata({
  path: '/',
  title: { absolute: SITE_DEFAULT_TITLE },
  description: SITE_DESCRIPTION,
});

export default function IndexPage() {
  return <IndexScreen />;
}
