"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CheckSquare, Square, Plus, Calendar, User, ChevronRight, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

export default function ProjectActionItemsList({
  projectId,
  items: initialItems,
  participants = [],
  onChange,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const participantChoices = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const p of participants) {
      const n = p.name?.trim();
      if (!n) continue;
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ id: p.id, name: n });
    }
    return list;
  }, [participants]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const map = debounceRef.current;
    return () => { map.forEach((t) => clearTimeout(t)); };
  }, []);

  // Keep selectedItem in sync with items list
  useEffect(() => {
    if (selectedItem) {
      const updated = items.find((i) => i.id === selectedItem.id);
      if (updated) setSelectedItem(updated);
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const t = setTimeout(() => {
        map.delete(itemId);
        void saveField(itemId, patch);
      }, 500);
      map.set(itemId, t);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, onChange]
  );

  async function toggleItem(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const updated = items.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i));
    setItems(updated);
    onChange?.(updated);
    await fetch(`/api/projects/${projectId}/action-items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id, completed: !item.completed }),
    });
    if (selectedItem?.id === id) setSelectedItem((s) => s ? { ...s, completed: !s.completed } : s);
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
        const updated = items.filter((i) => i.id !== id);
        setItems(updated);
        onChange?.(updated);
        if (selectedItem?.id === id) setSelectedItem(null);
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
      const updated = [...items, item];
      setItems(updated);
      setNewTitle("");
      setAdding(false);
      onChange?.(updated);
    } finally {
      setSaving(false);
    }
  }

  function updateSelectedField(patch: Partial<ActionItem>) {
    if (!selectedItem) return;
    const merged = { ...selectedItem, ...patch };
    setSelectedItem(merged);
    setItems((prev) => {
      const next = prev.map((i) => (i.id === merged.id ? merged : i));
      onChange?.(next);
      return next;
    });
    scheduleField(merged.id, patch);
  }

  const done = items.filter((i) => i.completed).length;
  const open = items.filter((i) => !i.completed);
  const completed = items.filter((i) => i.completed);
  const sorted = [...open, ...completed];

  return (
    <>
      <div className="space-y-1">
        {items.length > 0 && (
          <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
            <span>{done}/{items.length} afgerond</span>
          </div>
        )}

        {sorted.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedItem(item)}
            className={cn(
              "group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-gray-100",
              item.completed && "opacity-60"
            )}
          >
            <button
              onClick={(e) => toggleItem(item.id, e)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-700"
            >
              {item.completed
                ? <CheckSquare className="h-4 w-4 text-green-600" />
                : <Square className="h-4 w-4" />}
            </button>

            <span className={cn("flex-1 min-w-0 truncate font-medium text-gray-800", item.completed && "line-through text-gray-400")}>
              {item.title}
            </span>

            <div className="flex flex-shrink-0 items-center gap-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-100">
              {item.assignee && (
                <span className="hidden items-center gap-1 sm:flex">
                  <User className="h-3 w-3" />
                  {item.assignee.split(" ")[0]}
                </span>
              )}
              {item.dueDate && (
                <span className={cn(
                  "hidden items-center gap-1 sm:flex",
                  !item.completed && new Date(item.dueDate) < new Date() && "text-red-500"
                )}>
                  <Calendar className="h-3 w-3" />
                  {new Date(item.dueDate).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                </span>
              )}
            </div>

            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors" />
          </div>
        ))}

        {adding ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <Square className="h-4 w-4 flex-shrink-0 text-gray-300" />
            <Input
              autoFocus
              placeholder="Actietitel..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-7 flex-1 text-sm border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent"
              onKeyDown={(e) => {
                if (e.key === "Enter") addItem();
                if (e.key === "Escape") { setNewTitle(""); setAdding(false); }
              }}
            />
            <Button size="sm" onClick={addItem} disabled={!newTitle.trim() || saving} className="h-7 text-xs px-2">
              {saving ? "..." : "Toevoegen"}
            </Button>
            <button onClick={() => { setNewTitle(""); setAdding(false); }} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Actie toevoegen
          </button>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedItem && (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-start gap-3">
                  <button
                    onClick={(e) => toggleItem(selectedItem.id, e)}
                    className="mt-1 flex-shrink-0 text-gray-400 hover:text-gray-700"
                  >
                    {selectedItem.completed
                      ? <CheckSquare className="h-5 w-5 text-green-600" />
                      : <Square className="h-5 w-5" />}
                  </button>
                  <SheetTitle className="text-left leading-snug">
                    <textarea
                      value={selectedItem.title}
                      onChange={(e) => updateSelectedField({ title: e.target.value })}
                      rows={2}
                      className="w-full resize-none bg-transparent text-lg font-semibold text-gray-900 focus:outline-none"
                    />
                  </SheetTitle>
                </div>
              </SheetHeader>

              <div className="space-y-5">
                {/* Assignee */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500">Actiehouder</label>
                  <Select
                    value={selectedItem.assignee || "__none__"}
                    onValueChange={(val) => updateSelectedField({ assignee: val === "__none__" ? null : val })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Niemand toegewezen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Niemand toegewezen</SelectItem>
                      {participantChoices.map((p) => (
                        <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Due date */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500">Deadline</label>
                  <Input
                    type="date"
                    className="h-9 text-sm"
                    value={selectedItem.dueDate ? selectedItem.dueDate.slice(0, 10) : ""}
                    onChange={(e) =>
                      updateSelectedField({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                    }
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500">Omschrijving</label>
                  <Textarea
                    placeholder="Voeg een omschrijving toe..."
                    value={selectedItem.description || ""}
                    onChange={(e) => updateSelectedField({ description: e.target.value || null })}
                    rows={4}
                    className="text-sm resize-none"
                  />
                </div>

                {/* Status badge */}
                <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                  Status:{" "}
                  <span className={cn("font-medium", selectedItem.completed ? "text-green-700" : "text-indigo-700")}>
                    {selectedItem.completed ? "Afgerond" : "Open"}
                  </span>
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteItem(selectedItem.id)}
                  disabled={deleting === selectedItem.id}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting === selectedItem.id ? "Verwijderen..." : "Verwijder actie"}
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
