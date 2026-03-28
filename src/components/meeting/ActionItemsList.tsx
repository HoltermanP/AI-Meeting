"use client";

import { useState } from "react";
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

type Props = {
  meetingId: string;
  items: ActionItem[];
  onChange?: (items: ActionItem[]) => void;
};

export default function ActionItemsList({ meetingId, items: initialItems, onChange }: Props) {
  const [items, setItems] = useState(initialItems);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

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
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    const item = await res.json();
    const updated = [...items, item];
    setItems(updated);
    setNewTitle("");
    setAdding(false);
    onChange?.(updated);
  }

  const done = items.filter((i) => i.completed).length;

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{done}/{items.length} completed</span>
          <div className="flex-1 mx-3 h-1.5 rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 rounded-lg p-2 hover:bg-gray-50 group"
          >
            <button
              onClick={() => toggleItem(item.id)}
              className="mt-0.5 flex-shrink-0"
            >
              {item.completed ? (
                <CheckSquare className="h-4 w-4 text-indigo-500" />
              ) : (
                <Square className="h-4 w-4 text-gray-300 group-hover:text-gray-400" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm",
                  item.completed ? "line-through text-gray-400" : "text-gray-700"
                )}
              >
                {item.title}
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                {item.assignee && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <User className="h-3 w-3" />
                    {item.assignee}
                  </span>
                )}
                {item.dueDate && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Calendar className="h-3 w-3" />
                    {new Date(item.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Actiepunt…"
            className="flex-1 h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <Button size="sm" onClick={addItem} className="h-8">
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)} name="h-8">
            Cancel
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg p-2 w-full"
        >
          <Plus className="h-4 w-4" />
          Add action item
        </button>
      )}
    </div>
  );
}
