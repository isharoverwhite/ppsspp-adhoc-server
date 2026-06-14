import { getPerformanceSnapshots } from '@/app/actions/analytics';
import MonitoringClient from './MonitoringClient';

export const metadata = {
  title: 'Infrastructure Monitoring | Admin Dashboard',
};

export default async function MonitoringPage() {
  const snapshotsResult = await getPerformanceSnapshots(50);
  const snapshots = snapshotsResult.success ? snapshotsResult.snapshots : [];

  return (
    <div className="min-h-screen">
      <MonitoringClient snapshots={snapshots as any[]} />
    </div>
  );
}
