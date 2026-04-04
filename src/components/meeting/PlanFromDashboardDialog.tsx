"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, CalendarDays, Loader2, Wand2, Plus, Trash2, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AgendaItem } from "@/components/meeting/AgendaView";

type Project = { id: string; name: string; color: string };

type Props = {
  projects: Project[];
  onClose: () => void;
  onCreated: (meeting: { id: string; title: string; scheduledAt: string; projectId?: string }) => void;
};

type Mode = "pick" | "project-agenda" | "standalone";

export default function PlanFromDashboardDialog({ projects, onClose, onCreated }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("pick");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Shared fields
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  // Agenda (project flow)
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [lastMeetingTitle, setLastMeetingTitle] = useState<string | null>(null);
  const [agendaStep, setAgendaStep] = useState<"generate" | "edit">("generate");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalMinutes = agendaItems.reduce((s, i) => s + (i.duration || 0), 0);

  function selectProject(p: Project) {
    setSelectedProject(p);
    setTitle(`Vergadering – ${p.name}`);
    setMode("project-agenda");
  }

  function selectStandalone() {
    setTitle("");
    setMode("standalone");
  }

  async function generateAgenda() {
    if (!selectedProject) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/generate-agenda`, { method: "POST" });
      if (!res.ok) throw new Error("Genereren mislukt");
      const data = await res.json();
      setAgendaItems((data.items as AgendaItem[]).map((i) => ({ ...i, done: false })));
      setLastMeetingTitle(data.lastMeetingTitle || null);
      setAgendaStep("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout");
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
    setAgendaItems((prev) => [...prev, { id: String(Date.now()), title: "", notes: "", duration: 10, done: false }]);
  }

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          status: "scheduled",
          ...(selectedProject ? { projectId: selectedProject.id } : {}),
        }),
      });
      if (!res.ok) throw new Error("Aanmaken mislukt");
      const meeting = await res.json();

      await fetch(`/api/meetings/${meeting.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          status: "scheduled",
          ...(agendaItems.length > 0 ? { agenda: JSON.stringify(agendaItems) } : {}),
        }),
      });

      onCreated({ id: meeting.id, title: meeting.title, scheduledAt, projectId: selectedProject?.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout");
    } finally {
      setSaving(false);
    }
  }

  const canSave = title.trim() && (mode === "standalone" || (mode === "project-agenda" && agendaItems.length > 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {mode !== "pick" && (
              <button onClick={() => { setMode("pick"); setSelectedProject(null); setAgendaItems([]); setAgendaStep("generate"); }} className="text-gray-400 hover:text-gray-600">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900">Vergadering plannen</h2>
              {mode === "project-agenda" && selectedProject && (
                <p className="text-sm text-gray-500 mt-0.5">{selectedProject.name}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          {/* Step 1: pick type */}
          {mode === "pick" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Wat voor vergadering wil je plannen?</p>

              {projects.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Projectvergadering</p>
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectProject(p)}
                      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-indigo-200 hover:bg-indigo-50 transition-colors"
                    >
                      <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: p.color + "20", color: p.color }}>
                        <Briefcase className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.name}</p>
                        <p className="text-xs text-gray-400">AI-agenda op basis van vorig verslag</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {projects.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Of</p>}
                <button
                  onClick={selectStandalone}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-gray-100 flex items-center justify-center">
                    <CalendarDays className="h-4 w-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">Losse vergadering</p>
                    <p className="text-xs text-gray-400">Zonder project, zelf agenda invullen</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Shared title + date (modes 2 & 3) */}
          {mode !== "pick" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Titel</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vergadering titel..." className="text-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Datum & tijd</label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="text-sm" />
              </div>
            </div>
          )}

          {/* Project: AI agenda */}
          {mode === "project-agenda" && agendaStep === "generate" && (
            <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5 text-center">
              <Wand2 className="mx-auto mb-3 h-8 w-8 text-indigo-400" />
              <p className="text-sm font-medium text-gray-700">Agenda genereren met AI</p>
              <p className="mt-1 text-xs text-gray-500">Op basis van het vorige verslag en openstaande actiepunten.</p>
              <Button onClick={generateAgenda} disabled={generating} className="mt-4 gap-2" size="sm">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {generating ? "Genereren..." : "Genereer agenda"}
              </Button>
              <p className="mt-3 text-xs text-gray-400">
                of{" "}
                <button onClick={() => { setAgendaItems([]); setAgendaStep("edit"); }} className="underline hover:text-gray-600">
                  lege agenda
                </button>
              </p>
            </div>
          )}

          {/* Agenda editor (project + standalone) */}
          {(mode === "project-agenda" && agendaStep === "edit") || mode === "standalone" ? (
            <div className="space-y-2">
              {lastMeetingTitle && (
                <p className="text-xs text-gray-400">Gebaseerd op: <span className="font-medium text-gray-600">{lastMeetingTitle}</span></p>
              )}
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Agenda {agendaItems.length > 0 && `(${agendaItems.length} punten)`}
                </label>
                {totalMinutes > 0 && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />{totalMinutes} min
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {agendaItems.map((item, idx) => (
                  <div key={item.id} className="group flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <span className="mt-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <input
                        value={item.title}
                        onChange={(e) => updateItem(item.id, { title: e.target.value })}
                        placeholder="Agendapunt..."
                        className="w-full bg-transparent text-sm font-medium text-gray-800 focus:outline-none placeholder:text-gray-400"
                      />
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <input
                        type="number" min={1} max={120} value={item.duration}
                        onChange={(e) => updateItem(item.id, { duration: Number(e.target.value) })}
                        className="w-12 rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-center text-xs text-gray-600 focus:outline-none"
                      />
                      <span className="text-[10px] text-gray-400">m</span>
                      <button onClick={() => removeItem(item.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity ml-1">
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
                <Plus className="h-3.5 w-3.5" /> Punt toevoegen
              </button>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {mode !== "pick" && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
            <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
            <Button size="sm" onClick={save} disabled={saving || !canSave} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Inplannen
            </Button>
          </div>
        )}
        {mode === "pick" && (
          <div className="border-t border-gray-100 px-6 py-4">
            <Button variant="outline" size="sm" onClick={onClose} className="w-full">Annuleren</Button>
          </div>
        )}
      </div>
    </div>
  );
}
