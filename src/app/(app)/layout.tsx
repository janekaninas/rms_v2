import { AppSidebar } from "@/components/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // h-screen + overflow-hidden (not the old min-h-screen) is what actually
    // keeps the sidebar fixed: without a bounded height here, a tall page's
    // content grows this row past one viewport and the *document* becomes
    // the scroll container, dragging the sidebar out of view with it since
    // it's a normal-flow sibling, not fixed/sticky itself. Bounding this row
    // to exactly one viewport forces main's own overflow-y-auto to be the
    // thing that scrolls instead (DESIGN_SYSTEM.md §3b).
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        {/*
          No fixed width here (beyond a generous ultra-wide ceiling): with
          the sidebar's width itself being the only other flex child, main
          already grows to fill whatever it frees up when collapsed — that
          reflow is automatic and needs no coordination with AppSidebar.
          h-full + flex-col: a normal page's content still renders top-down
          and overflows this box visually (no overflow-hidden here), so
          main's own overflow-y-auto still scrolls it exactly as before —
          h-full only matters to a page that wants to *fill* it. A page
          wanting its own bounded, independently-scrolling region (Monthly
          Performance's matrix, DESIGN_SYSTEM.md §3b) puts `h-full
          flex flex-col` on its own root and `flex-1 min-h-0 overflow-auto`
          on the scrolling child — that only resolves correctly because
          this wrapper's height is a real `h-full`, not `min-h-full`: a
          min-height yields to taller content, so a percentage-height
          grandchild would inherit that grown size instead of main's actual
          visible height, defeating the whole "scroll internally" point.
        */}
        <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col">{children}</div>
      </main>
    </div>
  );
}
