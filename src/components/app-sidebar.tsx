"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
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
  { label: "Overview", items: [{ label: "Dashboard", day: "Day 7" }] },
  {
    label: "Commercial",
    items: [
      { label: "Monthly Performance", day: "Day 7" },
      { label: "Road to Target", day: "Day 7" },
      { label: "All Bookings", day: "Day 7" },
      { label: "Channel Performance", day: "Day 7 (optional)" },
    ],
  },
  {
    label: "Reconciliation",
    items: [
      { label: "Booking Reconciliation", day: "Day 7" },
      { label: "OTA Settlement", day: "Day 5" },
      { label: "Bank Reconciliation", day: "Day 6" },
    ],
  },
  { label: "Operations", items: [{ label: "Expenses", day: "Phase 2" }] },
  {
    label: "Finance",
    items: [
      { label: "P&L", day: "Phase 2" },
      { label: "Owner Statements", day: "Phase 2" },
      { label: "Owner Payout", day: "Phase 2" },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "Daily Upload", day: "Day 2" },
      { label: "Settlement Upload", day: "Day 5" },
      { label: "Bank Mutation Upload", day: "Day 6" },
      { label: "Import History", day: "Day 2" },
    ],
  },
  {
    label: "Configuration",
    items: [
      { label: "Villas", href: "/configuration/villas" },
      { label: "Owners", href: "/configuration/owners" },
      { label: "Villa Mapping", href: "/configuration/villa-mapping" },
      { label: "Channel Payment Rules", href: "/configuration/channel-payment-rules" },
      { label: "Tax Profiles", href: "/configuration/tax-profiles" },
      { label: "Revenue Targets", href: "/configuration/revenue-targets" },
      { label: "Settings", href: "/configuration/settings" },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="border-b border-sidebar-border px-4 py-4">
        <p className="text-sm font-semibold text-sidebar-foreground">AASHA</p>
        <p className="text-xs text-muted-foreground">Villa Management</p>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "block rounded-md px-2 py-1.5 text-sm transition-colors",
                      pathname === item.href
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground/60"
                  >
                    <span>{item.label}</span>
                    <span className="text-[10px] text-muted-foreground/60">{item.day}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
