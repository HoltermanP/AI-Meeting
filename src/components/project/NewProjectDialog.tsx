"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Users, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Employee = { id: string; firstName: string; lastName: string; email: string };

type Props = {
  onClose: () => void;
  onCreated?: (project: { id: string; name: string; color: string; _count: { meetings: number } }) => void;
};

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#0ea5e9", "#64748b",
];

export default function NewProjectDialog({ onClose, onCreated }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Create project
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      if (!res.ok) throw new Error("Project aanmaken mislukt");
      const project = await res.json();

      // Add selected employees as participants
      if (selected.size > 0) {
        await Promise.all(
          [...selected].map((employeeId) => {
            const emp = employees.find((e) => e.id === employeeId)!;
            return fetch(`/api/projects/${project.id}/participants`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: `${emp.firstName} ${emp.lastName}`,
                email: emp.email,
              }),
            });
          })
        );
      }

      onCreated?.({ ...project, _count: { meetings: 0 } });
      router.push(`/projects/${project.id}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Nieuw project</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              Projectnaam
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bijv. Q2 Campagne"
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </div>

          {/* Color */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              Kleur
            </label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full transition-transform",
                    color === c && "ring-2 ring-offset-2 scale-110"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Employees */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              Deelnemers
            </label>
            {loadingEmployees ? (
              <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Laden...
              </div>
            ) : employees.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-xs text-gray-400">
                Nog geen medewerkers. Voeg ze toe via{" "}
                <a href="/medewerkers" className="underline hover:text-indigo-600">Medewerkers</a>.
              </p>
            ) : (
              <div className="space-y-1 rounded-xl border border-gray-100 p-1.5">
                {employees.map((emp) => {
                  const isSelected = selected.has(emp.id);
                  return (
                    <button
                      key={emp.id}
                      onClick={() => toggle(emp.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                        isSelected ? "bg-indigo-50" : "hover:bg-gray-50"
                      )}
                    >
                      <div className={cn(
                        "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                        isSelected ? "bg-indigo-600 text-white" : "bg-indigo-100 text-indigo-700"
                      )}>
                        {isSelected ? <Check className="h-3.5 w-3.5" /> : `${emp.firstName[0]}${emp.lastName[0]}`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {emp.firstName} {emp.lastName}
                        </p>
                        <p className="truncate text-xs text-gray-400">{emp.email}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selected.size > 0 && (
              <p className="mt-1.5 text-xs text-indigo-600">
                {selected.size} deelnemer{selected.size !== 1 ? "s" : ""} geselecteerd
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !name.trim()}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />}
            Project aanmaken
          </Button>
        </div>
      </div>
    </div>
  );
}
