"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import AssigneeSelect from "@/components/meeting/AssigneeSelect";
import {
  CheckSquare, Square, Calendar, User, Loader2, Check,
  ChevronDown, AlignLeft, Trash2, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    fetch("/api/action-items")
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const map = debounceRef.current;
    return () => { map.forEach((t) => clearTimeout(t)); };
  }, []);

  async function saveField(itemId: string, patch: Partial<ActionItem>) {
    await fetch("/api/action-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, ...patch }),
    });
  }

  const scheduleField = useCallback((itemId: string, patch: Partial<ActionItem>) => {
    const map = debounceRef.current;
    const prev = map.get(itemId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => { map.delete(itemId); void saveField(itemId, patch); }, 500);
    map.set(itemId, t);
  }, []);

  function updateField(itemId: string, patch: Partial<ActionItem>) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
    scheduleField(itemId, patch);
  }

  async function toggleItem(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const item = items.find((i) => i.id === id);
    if (!item) return;
    await fetch("/api/action-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id, completed: !item.completed }),
    });
    // Remove from open list when marked complete
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  async function deleteItem(id: string) {
    setDeleting(id);
    try {
      const res = await fetch("/api/action-items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        if (expandedId === id) setExpandedId(null);
      }
    } finally {
      setDeleting(null);
    }
  }

  // Group by project (null = losse acties)
  const groups = items.reduce<Record<string, {
    label: string;
    color: string | null;
    href: string | null;
    items: ActionItem[];
  }>>((acc, item) => {
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
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  {group.color && (
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                  )}
                  {group.href ? (
                    <Link
                      href={group.href}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-600 transition-colors hover:text-indigo-600"
                    >
                      {group.label}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-xs font-semibold text-gray-500">{group.label}</span>
                  )}
                  <span className="text-xs text-gray-400">({group.items.length})</span>
                </div>

                {/* Items */}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const expanded = expandedId === item.id;
                    const overdue = isOverdue(item);

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "rounded-xl border transition-all duration-200",
                          expanded
                            ? "border-indigo-200 bg-white shadow-sm"
                            : "border-transparent bg-transparent hover:bg-gray-50"
                        )}
                      >
                        {/* Row */}
                        <div
                          className="flex cursor-pointer items-center gap-2.5 px-3 py-2"
                          onClick={() => setExpandedId(expanded ? null : item.id)}
                        >
                          <button
                            onClick={(e) => toggleItem(item.id, e)}
                            className="flex-shrink-0 transition-transform active:scale-90"
                          >
                            <Square className="h-4 w-4 text-gray-300 hover:text-gray-500" />
                          </button>

                          <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-800">
                            {item.title}
                          </span>

                          {/* Meta chips */}
                          <div className="flex flex-shrink-0 items-center gap-1.5">
                            {item.assignee && (
                              <span className="hidden rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 sm:block">
                                {item.assignee.split(" ")[0]}
                              </span>
                            )}
                            {item.dueDate && (
                              <span className={cn(
                                "hidden rounded-full px-2 py-0.5 text-[11px] sm:block",
                                overdue ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600"
                              )}>
                                {new Date(item.dueDate).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                              </span>
                            )}
                          </div>

                          <ChevronDown className={cn(
                            "h-3.5 w-3.5 flex-shrink-0 text-gray-300 transition-transform duration-200",
                            expanded && "rotate-180 text-indigo-400"
                          )} />
                        </div>

                        {/* Expanded detail */}
                        {expanded && (
                          <div className="px-4 pb-4 pt-1">
                            <div className="mb-4 border-t border-gray-100 pt-4">
                              <textarea
                                value={item.title}
                                onChange={(e) => updateField(item.id, { title: e.target.value })}
                                rows={2}
                                className="w-full resize-none bg-transparent text-base font-semibold text-gray-900 focus:outline-none leading-snug"
                              />
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              {/* Assignee */}
                              <div className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5">
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                                  <User className="h-3.5 w-3.5 text-gray-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Actiehouder</p>
                                  <AssigneeSelect
                                    value={item.assignee}
                                    onChange={(val) => updateField(item.id, { assignee: val })}
                                  />
                                </div>
                              </div>

                              {/* Due date */}
                              <div className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5">
                                <div className={cn(
                                  "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full shadow-sm",
                                  overdue ? "bg-red-100" : "bg-white"
                                )}>
                                  <Calendar className={cn("h-3.5 w-3.5", overdue ? "text-red-500" : "text-gray-400")} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Deadline</p>
                                  <Input
                                    type="date"
                                    value={item.dueDate ? item.dueDate.slice(0, 10) : ""}
                                    onChange={(e) => updateField(item.id, { dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                    className="mt-0.5 h-auto border-0 bg-transparent p-0 text-sm font-medium text-gray-800 shadow-none focus-visible:ring-0 cursor-pointer"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Description */}
                            <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5">
                              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm mt-0.5">
                                <AlignLeft className="h-3.5 w-3.5 text-gray-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Omschrijving</p>
                                <Textarea
                                  placeholder="Voeg een omschrijving toe..."
                                  value={item.description || ""}
                                  onChange={(e) => updateField(item.id, { description: e.target.value || null })}
                                  rows={2}
                                  className="mt-0.5 resize-none border-0 bg-transparent p-0 text-sm text-gray-700 shadow-none focus-visible:ring-0 placeholder:text-gray-400"
                                />
                              </div>
                            </div>

                            {/* Meeting link */}
                            {item.meeting && (
                              <div className="mt-2 px-1">
                                <Link
                                  href={`/meetings/${item.meeting.id}`}
                                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-500 transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {item.meeting.title}
                                </Link>
                              </div>
                            )}

                            {/* Footer actions */}
                            <div className="mt-3 flex items-center justify-between">
                              <button
                                onClick={(e) => toggleItem(item.id, e)}
                                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-200"
                              >
                                <Square className="h-3 w-3" />
                                Markeer als afgerond
                              </button>

                              <button
                                onClick={() => deleteItem(item.id)}
                                disabled={deleting === item.id}
                                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {deleting === item.id ? "…" : "Verwijderen"}
                              </button>
                            </div>
                          </div>
                        )}
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
