"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CheckSquare, Square, Plus, User, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ActionItem = {
  id: string;
  title: string;
  assignee: string | null;
  description: string | null;
  dueDate: string | null;
  completed: boolean;
};

type Participant = { id: string; name: string; email?: string | null };

type Props = {
  meetingId: string;
  items: ActionItem[];
  /** Ingeschreven deelnemers — snelkeuze + suggesties bij typen (datalist). */
  participants?: Participant[];
  onChange?: (items: ActionItem[]) => void;
};

export default function ActionItemsList({
  meetingId,
  items: initialItems,
  participants = [],
  onChange,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const datalistId = `action-assignees-${meetingId}`;
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
      const res = await fetch(`/api/meetings/${meetingId}/action-items`, {
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
    [meetingId, onChange]
  );

  const scheduleAssigneeSave = useCallback(
    (itemId: string, value: string) => {
      const map = debounceRef.current;
      const prev = map.get(itemId);
      if (prev) clearTimeout(prev);
      const t = setTimeout(() => {
        map.delete(itemId);
        void flushAssignee(itemId, value || null);
      }, 450);
      map.set(itemId, t);
    },
    [flushAssignee]
  );

  useEffect(() => {
    return () => {
      debounceRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  async function toggleItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const updated = items.map((i) =>
      i.id === id ? { ...i, completed: !i.completed } : i
    );
    setItems(updated);

    await fetch(`/api/meetings/${meetingId}/action-items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id, completed: !item.completed }),
    });
    onChange?.(updated);
  }

  async function addItem() {
    if (!newTitle.trim()) return;
    const res = await fetch(`/api/meetings/${meetingId}/action-items`, {
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
    setAdding(false);
    onChange?.(updated);
  }

  const done = items.filter((i) => i.completed).length;

  return (
    <div className="space-y-3">
      <datalist id={datalistId}>
        {participantChoices.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>

      {items.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            {done}/{items.length} afgerond
          </span>
          <div className="flex-1 mx-3 h-1.5 rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-transparent p-2 hover:border-gray-100 hover:bg-gray-50/80 group"
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => toggleItem(item.id)}
                className="mt-0.5 flex-shrink-0"
              >
                {item.completed ? (
                  <CheckSquare className="h-4 w-4 text-indigo-500" />
                ) : (
                  <Square className="h-4 w-4 text-gray-300 group-hover:text-gray-400" />
                )}
              </button>
              <div className="flex-1 min-w-0 space-y-1.5">
                <p
                  className={cn(
                    "text-sm",
                    item.completed ? "line-through text-gray-400" : "text-gray-700"
                  )}
                >
                  {item.title}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <User className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                    <Input
                      value={item.assignee ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) =>
                          prev.map((i) => (i.id === item.id ? { ...i, assignee: v || null } : i))
                        );
                        scheduleAssigneeSave(item.id, v);
                      }}
                      onBlur={(e) => {
                        const map = debounceRef.current;
                        const t = map.get(item.id);
                        if (t) {
                          clearTimeout(t);
                          map.delete(item.id);
                        }
                        void flushAssignee(item.id, e.target.value);
                      }}
                      list={participantChoices.length ? datalistId : undefined}
                      placeholder="Toegewezen aan…"
                      className="h-8 max-w-[16rem] text-xs"
                      aria-label="Toegewezen aan"
                    />
                  </div>
                  {item.dueDate && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="h-3 w-3" />
                      {new Date(item.dueDate).toLocaleDateString("nl-NL")}
                    </span>
                  )}
                </div>
                {participantChoices.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {participantChoices.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setItems((prev) =>
                            prev.map((i) =>
                              i.id === item.id ? { ...i, assignee: p.name } : i
                            )
                          );
                          const map = debounceRef.current;
                          const prevT = map.get(item.id);
                          if (prevT) clearTimeout(prevT);
                          map.delete(item.id);
                          void flushAssignee(item.id, p.name);
                        }}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                          item.assignee === p.name
                            ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        )}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Actiepunt…"
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 shrink-0 text-gray-400" />
            <Input
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              placeholder="Toegewezen aan (optioneel, vrije naam)"
              className="h-8 flex-1 text-sm"
              list={participantChoices.length ? datalistId : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter") addItem();
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addItem} className="h-8">
              Toevoegen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)} className="h-8">
              Annuleren
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg p-2 w-full"
        >
          <Plus className="h-4 w-4" />
          Actie toevoegen
        </button>
      )}
    </div>
  );
}
