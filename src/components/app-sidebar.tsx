"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Calendar,
  Target,
  ClipboardList,
  ChartColumn,
  Table2,
  ListChecks,
  Landmark,
  Building2,
  Receipt,
  TrendingUp,
  FileText,
  Banknote,
  Upload,
  CloudUpload,
  FileUp,
  Clock,
  House,
  Users,
  Map,
  Percent,
  Calculator,
  Flag,
  Settings,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  type LucideIcon,
} from "lucide-react";

const SIDEBAR_COLLAPSED_KEY = "aasha-sidebar-collapsed";

// A minimal external store for the collapsed preference (read via
// useSyncExternalStore below) rather than useState+useEffect — this is the
// React-recommended way to read a browser-only value without either a
// hydration-mismatch flash or a same-tab setItem that the storage event
// can't see (the storage event only fires in *other* tabs).
const collapsedListeners = new Set<() => void>();
let collapsedCache: boolean | null = null;

function readStoredCollapsed(): boolean {
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
}

function subscribeCollapsed(callback: () => void) {
  collapsedListeners.add(callback);
  return () => collapsedListeners.delete(callback);
}

function getCollapsedSnapshot(): boolean {
  if (collapsedCache === null) collapsedCache = readStoredCollapsed();
  return collapsedCache;
}

function getServerCollapsedSnapshot(): boolean {
  return false;
}

function setCollapsedPreference(value: boolean) {
  collapsedCache = value;
  window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
  collapsedListeners.forEach((listener) => listener());
}

interface NavItem {
  label: string;
  icon: LucideIcon;
  href?: string;
  day?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// Mirrors docs/PRODUCT_SPEC.md §5 — a conceptual map, not a page-creation
// mandate. Only Configuration has hrefs (built this session); every other
// item is a disabled roadmap placeholder, never a dead link, per CLAUDE.md
// rule 9 ("don't build a page merely because there is a menu item").
const NAV_SECTIONS: NavSection[] = [
  { label: "Overview", items: [{ label: "Dashboard", day: "Day 7", icon: LayoutDashboard }] },
  {
    label: "Commercial",
    items: [
      { label: "Monthly Performance", href: "/commercial/monthly-performance", icon: Calendar },
      { label: "Summary", href: "/commercial/summary", icon: Table2 },
      { label: "Road to Target", href: "/commercial/road-to-target", icon: Target },
      { label: "All Bookings", href: "/commercial/all-bookings", icon: ClipboardList },
      { label: "Channel Performance", day: "Day 7 (optional)", icon: ChartColumn },
    ],
  },
  {
    label: "Reconciliation",
    items: [
      { label: "Booking Reconciliation", day: "Day 7", icon: ListChecks },
      { label: "OTA Settlement", day: "Day 5", icon: Landmark },
      { label: "Bank Reconciliation", day: "Day 6", icon: Building2 },
    ],
  },
  { label: "Operations", items: [{ label: "Expenses", day: "Phase 2", icon: Receipt }] },
  {
    label: "Finance",
    items: [
      { label: "P&L", day: "Phase 2", icon: TrendingUp },
      { label: "Owner Statements", day: "Phase 2", icon: FileText },
      { label: "Owner Payout", day: "Phase 2", icon: Banknote },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "Daily Upload", href: "/data/upload", icon: Upload },
      { label: "Settlement Upload", day: "Day 5", icon: CloudUpload },
      { label: "Bank Mutation Upload", day: "Day 6", icon: FileUp },
      { label: "Import History", href: "/data/import-history", icon: Clock },
    ],
  },
  {
    label: "Configuration",
    items: [
      { label: "Villas", href: "/configuration/villas", icon: House },
      { label: "Owners", href: "/configuration/owners", icon: Users },
      { label: "Villa Mapping", href: "/configuration/villa-mapping", icon: Map },
      { label: "Channel Payment Rules", href: "/configuration/channel-payment-rules", icon: Percent },
      { label: "Tax Profiles", href: "/configuration/tax-profiles", icon: Calculator },
      { label: "Revenue Targets", href: "/configuration/revenue-targets", icon: Flag },
      { label: "Settings", href: "/configuration/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, getServerCollapsedSnapshot);
  const [transitionsReady, setTransitionsReady] = useState(false);

  // Enable the width transition only after mount, so a returning
  // collapsed-preferring user doesn't see the sidebar visibly animate
  // open-then-shut as the stored preference is applied.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setTransitionsReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  function toggleCollapsed() {
    setCollapsedPreference(!collapsed);
  }

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar",
        transitionsReady && "transition-[width] duration-150 ease-out",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex items-center border-b border-sidebar-border py-4",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        {!collapsed && (
          <div>
            <p className="text-sm font-semibold text-sidebar-foreground">AASHA</p>
            <p className="text-xs text-muted-foreground">Villa Management</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-2 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;

                if (item.href) {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                }

                return (
                  <div
                    key={item.label}
                    title={collapsed ? `${item.label} — ${item.day}` : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground/60",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <span className="flex flex-1 items-center justify-between">
                        <span>{item.label}</span>
                        <span className="text-[10px] text-muted-foreground/60">{item.day}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <form action={signOut}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            title={collapsed ? "Sign out" : undefined}
            className={cn("w-full", collapsed && "px-0")}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span>Sign out</span>}
          </Button>
        </form>
      </div>
    </aside>
  );
}
