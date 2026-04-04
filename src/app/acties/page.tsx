"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import AssigneeSelect from "@/components/meeting/AssigneeSelect";
import { CheckSquare, Square, Calendar, User, Briefcase, Loader2, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type ActionItem = {
  id: string;
  title: string;
  assignee: string | null;
  dueDate: string | null;
  completed: boolean;
  description: string | null;
  meeting: { id: string; title: string } | null;
  project: { id: string; name: string; color: string } | null;
};

function isOverdue(item: ActionItem) {
  return !!item.dueDate && !item.completed && new Date(item.dueDate) < new Date();
}

export default function ActiesPage() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/action-items")
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggle(item: ActionItem) {
    setCompleting(item.id);
    try {
      const res = await fetch("/api/action-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, completed: !item.completed }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      }
    } finally {
      setCompleting(null);
    }
  }

  async function updateAssignee(itemId: string, assignee: string | null) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, assignee } : i)));
    await fetch("/api/action-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, assignee }),
    });
  }

  async function updateDueDate(itemId: string, dueDate: string) {
    const iso = dueDate ? new Date(dueDate).toISOString() : null;
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, dueDate: iso } : i)));
    await fetch("/api/action-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, dueDate: iso }),
    });
  }

  // Group by project (null = losse acties)
  const groups = items.reduce<Record<string, { label: string; color: string | null; href: string | null; items: ActionItem[] }>>((acc, item) => {
    const key = item.project?.id ?? "__none__";
    if (!acc[key]) {
      acc[key] = {
        label: item.project?.name ?? "Losse acties",
        color: item.project?.color ?? null,
        href: item.project ? `/projects/${item.project.id}` : null,
        items: [],
      };
    }
    acc[key].items.push(item);
    return acc;
  }, {});

  const overdue = items.filter(isOverdue).length;

  return (
    <MainLayout title="Open acties">
      <div className="mx-auto max-w-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
            <CheckSquare className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Open acties</h1>
            <p className="text-xs text-gray-500">
              {loading ? "…" : `${items.length} open`}
              {overdue > 0 && <span className="ml-2 font-medium text-red-500">{overdue} verlopen</span>}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">Alles afgerond!</p>
              <p className="mt-0.5 text-sm text-gray-400">Er zijn geen openstaande actiepunten.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groups).map(([key, group]) => (
              <div key={key}>
                {/* Group header */}
                <div className="mb-2 flex items-center gap-2">
                  {group.color && (
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                  )}
                  {group.href ? (
                    <Link href={group.href} className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-indigo-600 transition-colors">
                      {group.label}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-xs font-semibold text-gray-500">{group.label}</span>
                  )}
                  <span className="text-xs text-gray-400">({group.items.length})</span>
                </div>

                {/* Items */}
                <div className="space-y-1.5">
                  {group.items.map((item) => {
                    const overdue = isOverdue(item);
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "rounded-xl border bg-white p-3 transition-colors",
                          overdue ? "border-red-200" : "border-gray-100"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Toggle */}
                          <button
                            onClick={() => toggle(item)}
                            disabled={completing === item.id}
                            className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-green-500 transition-colors disabled:opacity-40"
                          >
                            {completing === item.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Square className="h-4 w-4" />}
                          </button>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 leading-snug">{item.title}</p>

                            {/* Meeting link */}
                            {item.meeting && (
                              <Link
                                href={`/meetings/${item.meeting.id}`}
                                className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-500 transition-colors"
                              >
                                <Briefcase className="h-3 w-3" />
                                {item.meeting.title}
                              </Link>
                            )}

                            {/* Assignee + date row */}
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                                <AssigneeSelect
                                  value={item.assignee}
                                  onChange={(val) => updateAssignee(item.id, val)}
                                  className="h-auto border-0 bg-transparent p-0 text-xs text-gray-500 shadow-none focus:ring-0 w-28"
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Calendar className={cn("h-3.5 w-3.5 flex-shrink-0", overdue ? "text-red-400" : "text-gray-300")} />
                                <Input
                                  type="date"
                                  value={item.dueDate ? item.dueDate.slice(0, 10) : ""}
                                  onChange={(e) => updateDueDate(item.id, e.target.value)}
                                  className={cn(
                                    "h-auto border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0 w-28 cursor-pointer",
                                    overdue ? "text-red-500 font-medium" : "text-gray-500"
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
