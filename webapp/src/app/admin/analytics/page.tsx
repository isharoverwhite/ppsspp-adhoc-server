import { getAnalyticsData, getGeoLocations, resolveIPLocation } from '@/app/actions/analytics';
import AnalyticsClient from './AnalyticsClient';

export const metadata = {
  title: 'Analytics | Admin Dashboard',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AnalyticsPage() {
  const [analyticsData, rawGeoLocations] = await Promise.all([
    getAnalyticsData(),
    getGeoLocations()
  ]);

  const historyIPs = new Set(analyticsData.history.map((h: any) => h.ip).filter(Boolean));
  const cachedIPs = new Set(rawGeoLocations.map((l: any) => l.ip));
  
  const unresolvedIPs = Array.from(historyIPs).filter(ip => !cachedIPs.has(ip)).slice(0, 10);
  if (unresolvedIPs.length > 0) {
    await Promise.all(unresolvedIPs.map(ip => resolveIPLocation(ip as string)));
  }
  
  const finalGeoLocations = await getGeoLocations();

  return (
    <div className="min-h-screen">
      <AnalyticsClient initialData={analyticsData} initialGeo={finalGeoLocations} />
    </div>
  );
}
