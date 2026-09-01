import { AppSidebar } from "@/components/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        {/*
          No fixed width here (beyond a generous ultra-wide ceiling): with
          the sidebar's width itself being the only other flex child, main
          already grows to fill whatever it frees up when collapsed — that
          reflow is automatic and needs no coordination with AppSidebar.
        */}
        <div className="mx-auto w-full max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}
