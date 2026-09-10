import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { DashboardShell } from '@/components/DashboardShell';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BriefView,
  CosmicCareView,
  DeadStockView,
  Overview,
  QueueView,
  SignalFlow,
  StaffView,
  TrustGateView,
} from '@/dashboards/Views';
import type { ViewKey } from '@/dashboards/Views';
import { ROLES } from '@/lib/data';
import { useSharedState } from '@/lib/useSharedState';
import type { RoleKey } from '@/lib/types';

/**
 * One dashboard, four roles, eight views.
 *
 * The role in sessionStorage decides which sidebar entries exist; the selected
 * entry decides what renders. There is no separate /admin URL — an admin simply
 * has every entry.
 */
export function Dashboard() {
  const role = sessionStorage.getItem('cosmictrust.role') as RoleKey | null;
  const [view, setView] = useState<ViewKey>('overview');
  const { state, error, reload } = useSharedState();

  if (!role || !(role in ROLES)) return <Navigate to="/login" replace />;

  let body: React.ReactNode;

  if (error) {
    body = (
      <Card>
        <CardContent className="p-6 text-sm">
          <p className="font-medium">Could not reach the agent API.</p>
          <p className="mt-1 text-muted-foreground">
            {error} — start it with{' '}
            <code className="rounded bg-muted px-1.5 py-0.5">npm start</code> in the project root.
          </p>
        </CardContent>
      </Card>
    );
  } else if (!state) {
    body = (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  } else {
    const props = { state, reload };
    body = {
      overview: <Overview {...props} />,
      signals: <SignalFlow {...props} />,
      trustgate: <TrustGateView {...props} />,
      cosmiccare: <CosmicCareView {...props} />,
      deadstock: <DeadStockView {...props} />,
      queue: <QueueView {...props} />,
      brief: <BriefView />,
      staff: <StaffView />,
    }[view];
  }

  return (
    <DashboardShell role={role} view={view} onView={setView}>
      {body}
    </DashboardShell>
  );
}
