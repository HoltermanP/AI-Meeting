"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Mic, FileText, FolderOpen,
  Settings, Plus, Search, ChevronRight, Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type FolderType = {
  id: string;
  name: string;
  color: string;
  _count: { meetings: number };
};

export default function Sidebar() {
  const pathname = usePathname();
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [foldersExpanded, setFoldersExpanded] = useState(true);

  useEffect(() => {
    fetch("/api/folders")
      .then((r) => r.json())
      .then(setFolders)
      .catch(() => {});
  }, []);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/meetings", label: "All Meetings", icon: FileText },
    { href: "/record", label: "New Recording", icon: Mic },
  ];

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-gray-50">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
          <Mic className="h-4 w-4 text-white" />
        </div>
        <span className="font-semibold text-gray-900">MeetingAI</span>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search meetings..."
            className="pl-8 text-xs h-8 bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery) {
                window.location.href = `/meetings?search=${encodeURIComponent(searchQuery)}`;
              }
            }}
          />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-0.5 p-2">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  pathname === href
                    ? "bg-indigo-100 text-indigo-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}

            {/* Folders section */}
            <div className="mt-4">
              <button
                onClick={() => setFoldersExpanded(!foldersExpanded)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600"
              >
                <span>Folders</span>
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    foldersExpanded && "rotate-90"
                  )}
                />
              </button>

              {foldersExpanded && (
                <div className="mt-1 space-y-0.5">
                  {folders.map((folder) => (
                    <Link
                      key={folder.id}
                      href={`/meetings?folderId=${folder.id}`}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                        pathname.includes(folder.id)
                          ? "bg-indigo-100 text-indigo-700"
                          : "text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      <Folder
                        className="h-4 w-4 flex-shrink-0"
                        style={{ color: folder.color }}
                      />
                      <span className="flex-1 truncate">{folder.name}</span>
                      <span className="text-xs text-gray-400">
                        {folder._count.meetings}
                      </span>
                    </Link>
                  ))}
                  <button
                    onClick={async () => {
                      const name = prompt("Folder name:");
                      if (!name) return;
                      await fetch("/api/folders", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name }),
                      });
                      const updated = await fetch("/api/folders").then((r) => r.json());
                      setFolders(updated);
                    }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 w-full"
                  >
                    <Plus className="h-4 w-4" />
                    New Folder
                  </button>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-gray-200 p-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            pathname === "/settings"
              ? "bg-indigo-100 text-indigo-700"
              : "text-gray-600 hover:bg-gray-100"
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
