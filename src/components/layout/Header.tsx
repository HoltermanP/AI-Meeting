"use client";

import { UserButton } from "@clerk/nextjs";
import { Bell } from "lucide-react";

export default function Header({ title }: { title?: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="text-base font-semibold text-gray-900">{title || "MeetingAI"}</h1>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Meldingen"
        >
          <Bell className="h-4 w-4" />
        </button>

        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-7 w-7",
            },
          }}
        />
      </div>
    </header>
  );
}
