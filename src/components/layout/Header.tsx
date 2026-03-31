"use client";

import { useSession, signOut } from "next-auth/react";
import { Bell, LogOut, User, ChevronDown } from "lucide-react";
import { useState } from "react";

export default function Header({ title }: { title?: string }) {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

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

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold">
              {session?.user?.name?.[0]?.toUpperCase() || <User className="h-4 w-4" />}
            </div>
            <span className="hidden sm:block">{session?.user?.name || session?.user?.email}</span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                <div className="p-2">
                  <div className="px-3 py-2 text-xs text-gray-500">
                    {session?.user?.email}
                  </div>
                  <hr className="my-1 border-gray-100" />
                  <button
                    onClick={() => signOut({ callbackUrl: "/auth/login" })}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
