"use client";

import { useState, useRef } from "react";
import { Check, Clock, ChevronDown, GripVertical, AlignLeft } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  function persist(next: AgendaItem[]) {
    void fetch(`/api/meetings/${meetingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agenda: JSON.stringify(next) }),
    });
  }

  function update(id: string, patch: Partial<AgendaItem>) {
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    setItems(next);
    onChange?.(next);
    persist(next);
  }

  function toggle(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    update(id, { done: !items.find((i) => i.id === id)?.done });
  }

  // DnD
  function onDragStart(idx: number) { dragIdx.current = idx; }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    dragOverIdx.current = idx;
    setDragOver(idx);
  }
  function onDrop() {
    if (dragIdx.current === null || dragOverIdx.current === null || dragIdx.current === dragOverIdx.current) return;
    const next = [...items];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(dragOverIdx.current, 0, moved);
    setItems(next);
    onChange?.(next);
    persist(next);
    dragIdx.current = null;
    dragOverIdx.current = null;
    setDragOver(null);
  }
  function onDragEnd() {
    dragIdx.current = null;
    dragOverIdx.current = null;
    setDragOver(null);
  }

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const totalMinutes = items.reduce((s, i) => s + (i.duration || 0), 0);
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      {/* Progress */}
      <div className="mb-3 flex items-center gap-3 text-xs text-gray-500">
        <span>{done}/{total} besproken</span>
        <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="flex items-center gap-1 text-gray-400">
          <Clock className="h-3 w-3" />{totalMinutes} min
        </span>
      </div>

      {/* Items */}
      <div className="space-y-1">
        {items.map((item, idx) => {
          const expanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              className={cn(
                "rounded-xl border transition-all duration-150",
                dragOver === idx ? "border-indigo-300 bg-indigo-50 scale-[1.01]" :
                expanded ? "border-indigo-200 bg-white shadow-sm" :
                item.done ? "border-transparent bg-transparent opacity-50" :
                "border-transparent bg-transparent hover:bg-gray-50"
              )}
            >
              {/* Row */}
              <div
                className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5"
                onClick={() => setExpandedId(expanded ? null : item.id)}
              >
                {/* Drag handle */}
                <div
                  className="flex-shrink-0 cursor-grab text-gray-200 hover:text-gray-400 active:cursor-grabbing"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <GripVertical className="h-4 w-4" />
                </div>

                {/* Done toggle */}
                <button
                  onClick={(e) => toggle(item.id, e)}
                  className="flex-shrink-0 transition-transform active:scale-90"
                >
                  {item.done ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  ) : (
                    <div className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                      expanded ? "border-indigo-500" : "border-gray-300"
                    )}>
                      <span className="text-[9px] font-bold text-gray-400">{idx + 1}</span>
                    </div>
                  )}
                </button>

                <span className={cn(
                  "flex-1 min-w-0 truncate text-sm",
                  item.done ? "line-through text-gray-400" : "font-medium text-gray-800"
                )}>
                  {item.title}
                </span>

                {item.notes && !expanded && (
                  <AlignLeft className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                )}

                <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                  {item.duration}m
                </span>

                <ChevronDown className={cn(
                  "h-3.5 w-3.5 flex-shrink-0 text-gray-300 transition-transform duration-200",
                  expanded && "rotate-180 text-indigo-400"
                )} />
              </div>

              {/* Expanded detail */}
              {expanded && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                  {/* Editable title */}
                  <textarea
                    value={item.title}
                    onChange={(e) => update(item.id, { title: e.target.value })}
                    rows={1}
                    className="w-full resize-none bg-transparent text-sm font-semibold text-gray-900 focus:outline-none leading-snug"
                    placeholder="Agendapunt..."
                  />

                  {/* Notes */}
                  <div className="flex items-start gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm mt-0.5">
                      <AlignLeft className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Toelichting</p>
                      <Textarea
                        value={item.notes}
                        onChange={(e) => update(item.id, { notes: e.target.value })}
                        placeholder="Context, te nemen besluiten, relevante actiepunten..."
                        rows={3}
                        className="resize-none border-0 bg-transparent p-0 text-sm text-gray-700 shadow-none focus-visible:ring-0 placeholder:text-gray-400"
                      />
                    </div>
                  </div>

                  {/* Duration + done */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={item.duration}
                        onChange={(e) => update(item.id, { duration: Number(e.target.value) })}
                        className="w-14 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      />
                      <span>minuten</span>
                    </div>

                    <button
                      onClick={(e) => toggle(item.id, e)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                        item.done
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                      )}
                    >
                      {item.done
                        ? <><Check className="h-3 w-3" />Besproken</>
                        : "Markeer als besproken"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
