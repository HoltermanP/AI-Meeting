"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CheckSquare, Square, Plus, Calendar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [newAssignee, setNewAssignee] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
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

  const flushAssignee = useCallback(
    async (itemId: string, assignee: string | null) => {
      const res = await fetch(`/api/projects/${projectId}/action-items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          assignee: assignee?.trim() ? assignee.trim() : null,
        }),
      });
      if (!res.ok) return;
      const updatedRow = await res.json();
      setItems((prev) => {
        const next = prev.map((i) => (i.id === itemId ? { ...i, assignee: updatedRow.assignee } : i));
        onChange?.(next);
        return next;
      });
    },
    [projectId, onChange]
  );

  const scheduleAssigneeSave = useCallback(
    (itemId: string, value: string) => {
      const map = debounceRef.current;
      const prev = map.get(itemId);
      if (prev) clearTimeout(prev);
      const t = setTimeout(() => {
        map.delete(itemId);
        void flushAssignee(itemId, value === "__none__" ? null : value || null);
      }, 450);
      map.set(itemId, t);
    },
    [flushAssignee]
  );

  useEffect(() => {
    const map = debounceRef.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
    };
  }, []);

  async function toggleItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const updated = items.map((i) =>
      i.id === id ? { ...i, completed: !i.completed } : i
    );
    setItems(updated);

    await fetch(`/api/projects/${projectId}/action-items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id, completed: !item.completed }),
    });
    onChange?.(updated);
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
      }
    } finally {
      setDeleting(null);
    }
  }

  async function addItem() {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/action-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          assignee: newAssignee.trim() || undefined,
        }),
      });
      const item = await res.json();
      const updated = [...items, item];
      setItems(updated);
      setNewTitle("");
      setNewAssignee("");
      onChange?.(updated);
    } finally {
      setAdding(false);
    }
  }

  const done = items.filter((i) => i.completed).length;

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            {done}/{items.length} afgerond
          </span>
        </div>
      )}

      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
          <div className="flex items-start gap-2">
            <button
              onClick={() => toggleItem(item.id)}
              className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-gray-600"
            >
              {item.completed ? (
                <CheckSquare className="h-4 w-4 text-green-600" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium", item.completed && "line-through text-gray-400")}>
                {item.title}
              </p>
              {item.description && (
                <p className="mt-1 text-xs text-gray-500">{item.description}</p>
              )}
            </div>
            <button
              onClick={() => deleteItem(item.id)}
              disabled={deleting === item.id}
              className="flex-shrink-0 text-gray-400 hover:text-red-600 disabled:text-gray-300"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-2 pl-6 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex-1">
              <Select value={item.assignee || "__none__"} onValueChange={(val) => scheduleAssigneeSave(item.id, val)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Assignee..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Geen toewijzing</SelectItem>
                  {participantChoices.map((p) => (
                    <SelectItem key={p.id} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {item.dueDate && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Calendar className="h-3 w-3" />
                <span>{new Date(item.dueDate).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      ))}

      {adding ? (
        <div className="space-y-2 rounded-lg bg-blue-50 p-3">
          <Input
            autoFocus
            placeholder="Actietitel..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
              if (e.key === "Escape") {
                setNewTitle("");
                setNewAssignee("");
                setAdding(false);
              }
            }}
          />
          <Select value={newAssignee} onValueChange={setNewAssignee}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Selecteer actiehouder..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Geen toewijzing</SelectItem>
              {participantChoices.map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={addItem}
              disabled={!newTitle.trim()}
              className="h-7 text-xs"
            >
              Toevoegen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setNewTitle("");
                setNewAssignee("");
                setAdding(false);
              }}
              className="h-7 text-xs"
            >
              Annuleren
            </Button>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setAdding(true)}
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs h-8"
        >
          <Plus className="h-3 w-3" />
          Actie toevoegen
        </Button>
      )}
    </div>
  );
}
