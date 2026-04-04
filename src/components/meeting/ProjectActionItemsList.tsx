"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  CheckSquare, Square, Plus, Calendar, User, X, Trash2, AlignLeft, Check, ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ActionItem = {
  id: string;
  title: string;
  assignee: string | null;
  description: string | null;
  dueDate: string | null;
  completed: boolean;
};

type Participant = { id: string; name: string; email?: string | null; role?: string | null };

type Props = {
  projectId: string;
  items: ActionItem[];
  participants?: Participant[];
  onChange?: (items: ActionItem[]) => void;
};

export default function ProjectActionItemsList({ projectId, items: initialItems, participants = [], onChange }: Props) {
  const [items, setItems] = useState(initialItems);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const participantChoices = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const p of participants) {
      const n = p.name?.trim();
      if (!n) continue;
      if (seen.has(n.toLowerCase())) continue;
      seen.add(n.toLowerCase());
      list.push({ id: p.id, name: n });
    }
    return list;
  }, [participants]);

  useEffect(() => { setItems(initialItems); }, [initialItems]);
  useEffect(() => {
    const map = debounceRef.current;
    return () => { map.forEach((t) => clearTimeout(t)); };
  }, []);

  async function saveField(itemId: string, patch: Partial<ActionItem>) {
    const res = await fetch(`/api/projects/${projectId}/action-items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, ...patch }),
    });
    if (!res.ok) return;
    const row = await res.json();
    setItems((prev) => {
      const next = prev.map((i) => (i.id === itemId ? { ...i, ...row } : i));
      onChange?.(next);
      return next;
    });
  }

  const scheduleField = useCallback(
    (itemId: string, patch: Partial<ActionItem>) => {
      const map = debounceRef.current;
      const prev = map.get(itemId);
      if (prev) clearTimeout(prev);
      const t = setTimeout(() => { map.delete(itemId); void saveField(itemId, patch); }, 500);
      map.set(itemId, t);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, onChange]
  );

  function updateField(itemId: string, patch: Partial<ActionItem>) {
    setItems((prev) => {
      const next = prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
      onChange?.(next);
      return next;
    });
    scheduleField(itemId, patch);
  }

  async function toggleItem(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const next = items.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i));
    setItems(next);
    onChange?.(next);
    await fetch(`/api/projects/${projectId}/action-items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id, completed: !item.completed }),
    });
  }

  async function deleteItem(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/action-items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id }),
      });
      if (res.ok) {
        const next = items.filter((i) => i.id !== id);
        setItems(next);
        onChange?.(next);
        if (expandedId === id) setExpandedId(null);
      }
    } finally {
      setDeleting(null);
    }
  }

  async function addItem() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/action-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const item = await res.json();
      const next = [...items, item];
      setItems(next);
      setNewTitle("");
      setAdding(false);
      onChange?.(next);
      setExpandedId(item.id);
    } finally {
      setSaving(false);
    }
  }

  const isOverdue = (item: ActionItem) =>
    !!item.dueDate && !item.completed && new Date(item.dueDate) < new Date();

  const done = items.filter((i) => i.completed).length;
  const sorted = [...items.filter((i) => !i.completed), ...items.filter((i) => i.completed)];

  return (
    <div className="space-y-0.5">
      {items.length > 0 && (
        <p className="mb-2 text-xs text-gray-400">{done}/{items.length} afgerond</p>
      )}

      {sorted.map((item) => {
        const expanded = expandedId === item.id;
        const overdue = isOverdue(item);

        return (
          <div key={item.id} className={cn(
            "rounded-xl border transition-all duration-200",
            expanded
              ? "border-indigo-200 bg-white shadow-sm"
              : "border-transparent bg-transparent hover:bg-gray-50"
          )}>
            {/* Row */}
            <div
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2"
              onClick={() => setExpandedId(expanded ? null : item.id)}
            >
              <button
                onClick={(e) => toggleItem(item.id, e)}
                className="flex-shrink-0 transition-transform active:scale-90"
              >
                {item.completed
                  ? <CheckSquare className="h-4 w-4 text-green-500" />
                  : <Square className="h-4 w-4 text-gray-300 hover:text-gray-500" />}
              </button>

              <span className={cn(
                "flex-1 min-w-0 truncate text-sm",
                item.completed ? "line-through text-gray-400" : "font-medium text-gray-800"
              )}>
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
                  {/* Editable title */}
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
                      <Select
                        value={item.assignee || "__none__"}
                        onValueChange={(val) => updateField(item.id, { assignee: val === "__none__" ? null : val })}
                      >
                        <SelectTrigger className="mt-0.5 h-auto border-0 bg-transparent p-0 text-sm font-medium text-gray-800 shadow-none focus:ring-0">
                          <SelectValue placeholder="Niemand" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Niemand</SelectItem>
                          {participantChoices.map((p) => (
                            <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

                {/* Footer actions */}
                <div className="mt-3 flex items-center justify-between">
                  <button
                    onClick={(e) => toggleItem(item.id, e)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                      item.completed
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                    )}
                  >
                    {item.completed
                      ? <><Check className="h-3 w-3" />Afgerond</>
                      : <><Square className="h-3 w-3" />Markeer als afgerond</>}
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

      {/* Add new */}
      {adding ? (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 shadow-sm">
          <Square className="h-4 w-4 flex-shrink-0 text-gray-300" />
          <Input
            autoFocus
            placeholder="Actietitel..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="h-7 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
              if (e.key === "Escape") { setNewTitle(""); setAdding(false); }
            }}
          />
          <Button size="sm" onClick={addItem} disabled={!newTitle.trim() || saving} className="h-7 px-2 text-xs">
            {saving ? "…" : "Toevoegen"}
          </Button>
          <button onClick={() => { setNewTitle(""); setAdding(false); }} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Actie toevoegen
        </button>
      )}
    </div>
  );
}
