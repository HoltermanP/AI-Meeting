"use client";

import { useState, useEffect } from "react";
import { Plus, X, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Participant = {
  id: string;
  name: string;
  email: string | null;
  employeeId: string | null;
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type Props = {
  meetingId: string;
  participants: Participant[];
  onChange?: (participants: Participant[]) => void;
};

export default function ParticipantsList({ meetingId, participants: initial, onChange }: Props) {
  const [participants, setParticipants] = useState(initial);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => { setParticipants(initial); }, [initial]);

  useEffect(() => {
    if (adding && employees.length === 0) {
      fetch("/api/employees")
        .then((r) => r.json())
        .then((data) => setEmployees(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [adding, employees.length]);

  const addedIds = new Set(participants.map((p) => p.employeeId).filter(Boolean));
  const available = employees.filter((e) => !addedIds.has(e.id));

  async function add(employeeId: string) {
    setAddingId(employeeId);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId }),
      });
      if (!res.ok) return;
      const participant = await res.json();
      const next = [...participants, participant];
      setParticipants(next);
      onChange?.(next);
      if (available.length <= 1) setAdding(false);
    } finally {
      setAddingId(null);
    }
  }

  async function remove(participantId: string) {
    setRemoving(participantId);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/participants`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId }),
      });
      if (!res.ok) return;
      const next = participants.filter((p) => p.id !== participantId);
      setParticipants(next);
      onChange?.(next);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div>
      {/* Participant chips */}
      <div className="flex flex-wrap gap-2">
        {participants.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm"
          >
            <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
              {p.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </div>
            <span className="text-gray-800">{p.name}</span>
            <button
              onClick={() => remove(p.id)}
              disabled={removing === p.id}
              className="ml-0.5 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              {removing === p.id
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <X className="h-3 w-3" />}
            </button>
          </div>
        ))}

        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-gray-200 px-3 py-1.5 text-xs text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Deelnemer toevoegen
          </button>
        )}
      </div>

      {/* Employee picker */}
      {adding && (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-xs font-semibold text-gray-600">Medewerker kiezen</span>
            <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          {available.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Users className="h-5 w-5 text-gray-300" />
              <p className="text-xs text-gray-400">
                {employees.length === 0
                  ? "Geen medewerkers gevonden. Voeg ze toe via Medewerkers."
                  : "Alle medewerkers zijn al toegevoegd."}
              </p>
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto p-1.5">
              {available.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => add(emp.id)}
                  disabled={addingId === emp.id}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-indigo-50",
                    addingId === emp.id && "opacity-60"
                  )}
                >
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {emp.firstName} {emp.lastName}
                    </p>
                    <p className="truncate text-xs text-gray-400">{emp.email}</p>
                  </div>
                  {addingId === emp.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
