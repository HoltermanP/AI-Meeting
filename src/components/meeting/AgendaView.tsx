"use client";

import { useState } from "react";
import { Check, Clock, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgendaItem = {
  id: string;
  title: string;
  notes: string;
  duration: number;
  done: boolean;
};

type Props = {
  meetingId: string;
  items: AgendaItem[];
  onChange?: (items: AgendaItem[]) => void;
};

export default function AgendaView({ meetingId, items: initialItems, onChange }: Props) {
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState<string | null>(null);

  function toggle(id: string) {
    const next = items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
    setItems(next);
    onChange?.(next);
    // Persist
    void fetch(`/api/meetings/${meetingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agenda: JSON.stringify(next) }),
    });
  }

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const totalMinutes = items.reduce((s, i) => s + (i.duration || 0), 0);
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      {/* Progress header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-gray-500">{done}/{total} besproken</span>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          {totalMinutes} min
        </span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Items */}
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div key={item.id}>
            <div
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors",
                item.done ? "opacity-50" : "hover:bg-gray-50",
                activeId === item.id && !item.done && "bg-indigo-50 ring-1 ring-indigo-100"
              )}
              onClick={() => setActiveId(activeId === item.id ? null : item.id)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); toggle(item.id); }}
                className="mt-0.5 flex-shrink-0 transition-transform active:scale-90"
              >
                {item.done ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                ) : (
                  <div className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                    activeId === item.id ? "border-indigo-500" : "border-gray-300"
                  )}>
                    <span className="text-[9px] font-bold text-gray-400">{idx + 1}</span>
                  </div>
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-medium leading-snug",
                  item.done ? "text-gray-400 line-through" : "text-gray-800"
                )}>
                  {item.title}
                </p>
              </div>

              <span className={cn(
                "flex-shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                item.done ? "bg-gray-100 text-gray-400" : "bg-gray-100 text-gray-500"
              )}>
                {item.duration}m
              </span>
            </div>

            {/* Expanded notes */}
            {activeId === item.id && item.notes && !item.done && (
              <div className="ml-11 mb-1 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800 border border-indigo-100">
                {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
