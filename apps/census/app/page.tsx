import { HomeScreen } from '@/components/HomeScreen';
import { loadHomeView } from './home-view';

export default async function HomePage() {
  const view = await loadHomeView();

  return <HomeScreen view={view} />;
}
