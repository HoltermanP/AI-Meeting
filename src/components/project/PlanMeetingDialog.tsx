"use client";

import { useState } from "react";
import { Loader2, Wand2, Plus, Trash2, GripVertical, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AgendaItem = {
  id: string;
  title: string;
  notes: string;
  duration: number;
  done: boolean;
};

type Props = {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onCreated: (meeting: { id: string; title: string; scheduledAt: string }) => void;
};

export default function PlanMeetingDialog({ projectId, projectName, onClose, onCreated }: Props) {
  const [step, setStep] = useState<"generate" | "edit">("generate");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(`Vergadering – ${projectName}`);
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [lastMeetingTitle, setLastMeetingTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalMinutes = agendaItems.reduce((s, i) => s + (i.duration || 0), 0);

  async function generateAgenda() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-agenda`, { method: "POST" });
      if (!res.ok) throw new Error("Agenda genereren mislukt");
      const data = await res.json();
      setAgendaItems((data.items as AgendaItem[]).map((item) => ({ ...item, done: false })));
      setLastMeetingTitle(data.lastMeetingTitle || null);
      setStep("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setGenerating(false);
    }
  }

  function updateItem(id: string, patch: Partial<AgendaItem>) {
    setAgendaItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeItem(id: string) {
    setAgendaItems((prev) => prev.filter((i) => i.id !== id));
  }

  function addItem() {
    const id = String(Date.now());
    setAgendaItems((prev) => [...prev, { id, title: "", notes: "", duration: 10, done: false }]);
  }

  async function saveMeeting() {
    if (!title.trim() || agendaItems.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), projectId, status: "scheduled" }),
      });
      if (!res.ok) throw new Error("Vergadering aanmaken mislukt");
      const meeting = await res.json();

      await fetch(`/api/meetings/${meeting.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          agenda: JSON.stringify(agendaItems),
          status: "scheduled",
        }),
      });

      onCreated({ id: meeting.id, title: meeting.title, scheduledAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Vergadering plannen</h2>
          <p className="mt-0.5 text-sm text-gray-500">{projectName}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Title + datetime */}
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                Titel
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-sm"
                placeholder="Vergadering titel..."
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                Datum & tijd
              </label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {step === "generate" ? (
            <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5 text-center">
              <Wand2 className="mx-auto mb-3 h-8 w-8 text-indigo-400" />
              <p className="text-sm font-medium text-gray-700">Agenda genereren met AI</p>
              <p className="mt-1 text-xs text-gray-500">
                De AI maakt een agenda op basis van het vorige verslag en openstaande actiepunten.
              </p>
              <Button
                onClick={generateAgenda}
                disabled={generating}
                className="mt-4 gap-2"
                size="sm"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {generating ? "Genereren..." : "Genereer agenda"}
              </Button>
              <p className="mt-3 text-xs text-gray-400">
                of{" "}
                <button
                  onClick={() => { setAgendaItems([]); setStep("edit"); }}
                  className="underline hover:text-gray-600"
                >
                  begin met een lege agenda
                </button>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {lastMeetingTitle && (
                <p className="text-xs text-gray-400">
                  Gebaseerd op: <span className="font-medium text-gray-600">{lastMeetingTitle}</span>
                </p>
              )}

              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Agenda ({agendaItems.length} punten)
                </label>
                {totalMinutes > 0 && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    {totalMinutes} min totaal
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {agendaItems.map((item, idx) => (
                  <div key={item.id} className="group flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <span className="mt-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <input
                        value={item.title}
                        onChange={(e) => updateItem(item.id, { title: e.target.value })}
                        placeholder="Agendapunt..."
                        className="w-full bg-transparent text-sm font-medium text-gray-800 focus:outline-none placeholder:text-gray-400"
                      />
                      {item.notes && (
                        <input
                          value={item.notes}
                          onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                          placeholder="Toelichting..."
                          className="w-full bg-transparent text-xs text-gray-500 focus:outline-none placeholder:text-gray-400"
                        />
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={item.duration}
                        onChange={(e) => updateItem(item.id, { duration: Number(e.target.value) })}
                        className="w-12 rounded-lg bg-white border border-gray-200 px-1.5 py-1 text-center text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      />
                      <span className="text-[10px] text-gray-400">min</span>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addItem}
                className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-400 hover:border-indigo-200 hover:text-indigo-500 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Punt toevoegen
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Annuleren
          </Button>
          {step === "edit" && (
            <Button
              size="sm"
              onClick={saveMeeting}
              disabled={saving || !title.trim() || agendaItems.length === 0}
              className="gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Vergadering inplannen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
