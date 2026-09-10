import { useNavigate } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Bell,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Search,
  Share2,
  Store,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PROFILES, ROLES } from '@/lib/data';
import type { RoleKey } from '@/lib/types';
import type { ViewKey } from '@/dashboards/Views';

interface NavEntry {
  section?: string;
  title?: string;
  icon?: LucideIcon;
  /** Which dashboard view this entry shows. */
  view?: ViewKey;
}

/**
 * Sidebar contents per role.
 *
 * Admin sees everything; the three specialist roles see their own agent plus
 * the shared operational views. Same shape as the `rolesMeta` switcher in the
 * original portal, just expressed as nav rather than tabs.
 */
const NAV: Record<RoleKey, NavEntry[]> = {
  admin: [
    { section: 'Overview' },
    { title: 'Dashboard', icon: LayoutDashboard, view: 'overview' },
    { title: 'Agent signal flow', icon: Share2, view: 'signals' },
    { section: 'Agents' },
    { title: 'TrustGate · listings', icon: ClipboardCheck, view: 'trustgate' },
    { title: 'CosmicCare · complaints', icon: MessageSquare, view: 'cosmiccare' },
    { title: 'DeadStock Zero · stock', icon: Package, view: 'deadstock' },
    { section: 'Operations' },
    { title: 'Review queue', icon: Bell, view: 'queue' },
    { title: 'Weekly brief', icon: FileText, view: 'brief' },
    { section: 'Administration' },
    { title: 'Staff & roles', icon: Users, view: 'staff' },
  ],
  trustgate: [
    { section: 'Overview' },
    { title: 'Dashboard', icon: LayoutDashboard, view: 'overview' },
    { section: 'My agent' },
    { title: 'TrustGate · listings', icon: ClipboardCheck, view: 'trustgate' },
    { section: 'Operations' },
    { title: 'Review queue', icon: Bell, view: 'queue' },
  ],
  cosmiccare: [
    { section: 'Overview' },
    { title: 'Dashboard', icon: LayoutDashboard, view: 'overview' },
    { section: 'My agent' },
    { title: 'CosmicCare · complaints', icon: MessageSquare, view: 'cosmiccare' },
    { section: 'Operations' },
    { title: 'Review queue', icon: Bell, view: 'queue' },
  ],
  deadstock: [
    { section: 'Overview' },
    { title: 'Dashboard', icon: LayoutDashboard, view: 'overview' },
    { section: 'My agent' },
    { title: 'DeadStock Zero · stock', icon: Package, view: 'deadstock' },
    { section: 'Operations' },
    { title: 'Weekly brief', icon: FileText, view: 'brief' },
  ],
};

const VIEW_TITLES: Record<ViewKey, string> = {
  overview: 'Overview',
  signals: 'Agent signal flow',
  trustgate: 'TrustGate listings',
  cosmiccare: 'CosmicCare complaints',
  deadstock: 'DeadStock Zero inventory',
  queue: 'Review queue',
  brief: 'Weekly brief',
  staff: 'Staff & roles',
};

export function DashboardShell({
  role,
  view,
  onView,
  children,
}: {
  role: RoleKey;
  view: ViewKey;
  onView: (v: ViewKey) => void;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const profile = PROFILES.find((p) => p.role === role) ?? PROFILES[3];
  const meta = ROLES[role];

  function signOut() {
    sessionStorage.removeItem('cosmictrust.role');
    navigate('/');
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neutral-900 text-sm font-semibold text-white">
              C
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold">CosmicTrust</div>
              <div className="truncate text-xs text-muted-foreground">{meta.label}</div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {NAV[role].map((entry, i) =>
            entry.section ? (
              <SidebarGroupLabel key={`s-${i}`} className="mt-2 px-4">
                {entry.section}
              </SidebarGroupLabel>
            ) : (
              <SidebarGroup key={entry.title} className="py-0">
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={entry.view === view}
                        onClick={() => entry.view && onView(entry.view)}
                      >
                        {entry.icon && <entry.icon className="size-4" />}
                        <span>{entry.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )
          )}
        </SidebarContent>

        <SidebarFooter className="p-3">
          <button
            onClick={() => navigate('/')}
            className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Store className="size-4" />
            View storefront
          </button>
          <Separator className="my-1" />
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${profile.colour}`}
            >
              {profile.initials}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium">{profile.name}</div>
              <div className="truncate text-xs text-muted-foreground">{profile.email}</div>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Hello {profile.name.split(' ')[0]}</div>
            <div className="truncate text-xs text-muted-foreground">
              {VIEW_TITLES[view]} · {meta.agent}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-9">
              <Search className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-9">
              <Bell className="size-4" />
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 lg:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
