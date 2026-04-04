"use client";

/**
 * Herbruikbare agenda-editor voor plan-dialogen.
 * Ondersteunt: inline detail bewerken, drag-to-reorder, punten toevoegen/verwijderen.
 */

import { useRef, useState } from "react";
import { Plus, Trash2, GripVertical, Clock, ChevronDown, AlignLeft } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AgendaItem } from "@/components/meeting/AgendaView";

type Props = {
  items: AgendaItem[];
  onChange: (items: AgendaItem[]) => void;
  lastMeetingTitle?: string | null;
};

export default function AgendaEditor({ items, onChange, lastMeetingTitle }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const totalMinutes = items.reduce((s, i) => s + (i.duration || 0), 0);

  function update(id: string, patch: Partial<AgendaItem>) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function addItem() {
    const newItem: AgendaItem = {
      id: String(Date.now()),
      title: "",
      notes: "",
      duration: 10,
      done: false,
    };
    onChange([...items, newItem]);
    setExpandedId(newItem.id);
  }

  // DnD handlers
  function onDragStart(idx: number) {
    dragIdx.current = idx;
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    dragOverIdx.current = idx;
    setDragOver(idx);
  }

  function onDrop() {
    if (dragIdx.current === null || dragOverIdx.current === null) return;
    if (dragIdx.current === dragOverIdx.current) return;
    const next = [...items];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(dragOverIdx.current, 0, moved);
    onChange(next);
    dragIdx.current = null;
    dragOverIdx.current = null;
    setDragOver(null);
  }

  function onDragEnd() {
    dragIdx.current = null;
    dragOverIdx.current = null;
    setDragOver(null);
  }

  return (
    <div className="space-y-1.5">
      {lastMeetingTitle && (
        <p className="mb-2 text-xs text-gray-400">
          Gebaseerd op: <span className="font-medium text-gray-600">{lastMeetingTitle}</span>
        </p>
      )}

      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {items.length} {items.length === 1 ? "punt" : "punten"}
        </span>
        {totalMinutes > 0 && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="h-3 w-3" />
            {totalMinutes} min totaal
          </span>
        )}
      </div>

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
              dragOver === idx ? "border-indigo-300 bg-indigo-50" : expanded ? "border-indigo-200 bg-white shadow-sm" : "border-gray-100 bg-gray-50"
            )}
          >
            {/* Row */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="flex-shrink-0 cursor-grab text-gray-300 hover:text-gray-500 active:cursor-grabbing">
                <GripVertical className="h-4 w-4" />
              </div>

              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600">
                {idx + 1}
              </span>

              <input
                value={item.title}
                onChange={(e) => update(item.id, { title: e.target.value })}
                placeholder="Agendapunt..."
                onClick={() => setExpandedId(expanded ? null : item.id)}
                className="flex-1 min-w-0 bg-transparent text-sm font-medium text-gray-800 focus:outline-none placeholder:text-gray-400"
              />

              <div className="flex flex-shrink-0 items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={item.duration}
                  onChange={(e) => update(item.id, { duration: Number(e.target.value) })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-12 rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-center text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
                <span className="text-[10px] text-gray-400">m</span>

                <button
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className="text-gray-300 hover:text-indigo-400 transition-colors"
                >
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180 text-indigo-400")} />
                </button>

                <button
                  onClick={() => remove(item.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors ml-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Expanded detail */}
            {expanded && (
              <div className="border-t border-gray-100 px-4 pb-3 pt-3">
                <div className="flex items-start gap-2">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 mt-0.5">
                    <AlignLeft className="h-3 w-3 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Toelichting / context</p>
                    <Textarea
                      value={item.notes}
                      onChange={(e) => update(item.id, { notes: e.target.value })}
                      placeholder="Wat moet er besproken worden? Welke beslissing is nodig? Welke actiepunten zijn relevant?"
                      rows={3}
                      className="resize-none border-0 bg-gray-50 text-sm text-gray-700 shadow-none focus-visible:ring-1 focus-visible:ring-indigo-200 placeholder:text-gray-400"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={addItem}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-400 hover:border-indigo-200 hover:text-indigo-500 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Punt toevoegen
      </button>
    </div>
  );
}
