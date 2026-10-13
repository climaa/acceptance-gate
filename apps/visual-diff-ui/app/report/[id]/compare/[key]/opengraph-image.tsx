import { notFound } from 'next/navigation';
import { resolveDataDir } from '@/lib/data';
import {
  CARD_CACHE_CONTROL,
  comparisonCardBytes,
  OG_ALT,
  OG_CONTENT_TYPE,
  OG_SIZE,
} from '@/lib/og';

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * The card a shared comparison unfurls with. Drawn once per report and served
 * from cache after that — see `comparisonCardBytes`.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string; key: string }>;
}) {
  const { id, key } = await params;
  const { dir } = await resolveDataDir();
  const bytes = await comparisonCardBytes(dir, id, key);
  if (!bytes) notFound();

  return new Response(bytes, {
    headers: { 'Content-Type': OG_CONTENT_TYPE, 'Cache-Control': CARD_CACHE_CONTROL },
  });
}
