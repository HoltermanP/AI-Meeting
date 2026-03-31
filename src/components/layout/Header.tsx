"use client";

import { UserButton } from "@clerk/nextjs";
import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Header({
  title,
  onOpenMobileNav,
}: {
  title?: string;
  onOpenMobileNav?: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onOpenMobileNav ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 md:hidden"
            onClick={onOpenMobileNav}
            aria-label="Menu openen"
          >
            <Menu className="h-5 w-5" />
          </Button>
        ) : null}
        <h1 className="truncate text-base font-semibold text-gray-900">
          {title || "MeetingAI"}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          className="rounded-lg p-2.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:p-2"
          aria-label="Meldingen"
        >
          <Bell className="h-4 w-4" />
        </button>

        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-8 w-8 sm:h-7 sm:w-7",
            },
          }}
        />
      </div>
    </header>
  );
}
