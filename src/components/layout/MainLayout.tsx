"use client";

import { Suspense, useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export default function MainLayout({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-gray-50">
      <aside className="relative hidden h-[100dvh] w-64 shrink-0 border-r border-gray-200 md:flex md:flex-col">
        <Suspense fallback={<div className="h-full w-full bg-gray-50" aria-hidden />}>
          <Sidebar onNavigate={() => setMobileNavOpen(false)} />
        </Suspense>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-[min(20rem,calc(100vw-2rem))] max-w-[85vw] border-r border-gray-200 p-0"
        >
          <Suspense fallback={<div className="h-full w-full bg-gray-50" aria-hidden />}>
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </Suspense>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={title} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
