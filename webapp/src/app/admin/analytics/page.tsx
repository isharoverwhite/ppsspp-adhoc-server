import { getAnalyticsData, getGeoLocations, resolveIPLocation } from '@/app/actions/analytics';
import AnalyticsClient from './AnalyticsClient';

export const metadata = {
  title: 'Analytics | Admin Dashboard',
};

export default async function AnalyticsPage() {
  const [analyticsData, rawGeoLocations] = await Promise.all([
    getAnalyticsData(),
    getGeoLocations()
  ]);

  // Resolve missing IPs in background (fire and forget for next page load)
  // Actually, we can just trigger resolveIPLocation for up to 10 unresolved IPs from history
  const historyIPs = new Set(analyticsData.history.map((h: any) => h.ip));
  const cachedIPs = new Set(rawGeoLocations.map((l: any) => l.ip));
  
  const unresolvedIPs = Array.from(historyIPs).filter(ip => !cachedIPs.has(ip)).slice(0, 5);
  // Resolve them asynchronously to not block page load too much
  // (We use await here so they show up immediately, but we limit to 5 to avoid long latency)
  await Promise.all(unresolvedIPs.map(ip => resolveIPLocation(ip as string)));
  
  // Fetch again to get the newly resolved ones
  const finalGeoLocations = await getGeoLocations();

  return (
    <div className="min-h-screen">
      <AnalyticsClient initialData={analyticsData} initialGeo={finalGeoLocations} />
    </div>
  );
}
