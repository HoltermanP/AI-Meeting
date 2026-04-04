"use client";

import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X, Users, Mail, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type FormState = { firstName: string; lastName: string; email: string };
const empty: FormState = { firstName: "", lastName: "", email: "" };

export default function MedewerkersPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(empty);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => { setEmployees(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function addEmployee() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Opslaan mislukt"); return; }
      setEmployees((prev) => [...prev, data].sort((a, b) => a.lastName.localeCompare(b.lastName)));
      setForm(empty);
      setAdding(false);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Opslaan mislukt"); return; }
      setEmployees((prev) => prev.map((e) => (e.id === id ? data : e)).sort((a, b) => a.lastName.localeCompare(b.lastName)));
      setEditId(null);
    } finally {
      setSaving(false);
    }
  }

  async function deleteEmployee(id: string) {
    if (!confirm("Medewerker verwijderen?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/employees/${id}`, { method: "DELETE" });
      setEmployees((prev) => prev.filter((e) => e.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <MainLayout title="Medewerkers">
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
              <Users className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Medewerkers</h1>
              <p className="text-xs text-gray-500">{employees.length} medewerker{employees.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          {!adding && (
            <Button onClick={() => setAdding(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Toevoegen
            </Button>
          )}
        </div>

        {/* Add form */}
        {adding && (
          <div className="mb-4 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-800">Nieuwe medewerker</p>
            {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Voornaam</label>
                <Input
                  autoFocus
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  placeholder="Jan"
                  className="text-sm"
                  onKeyDown={(e) => e.key === "Enter" && addEmployee()}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Achternaam</label>
                <Input
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Jansen"
                  className="text-sm"
                  onKeyDown={(e) => e.key === "Enter" && addEmployee()}
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-500">E-mailadres</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jan@bedrijf.nl"
                  className="text-sm"
                  onKeyDown={(e) => e.key === "Enter" && addEmployee()}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setAdding(false); setForm(empty); setError(null); }}>
                Annuleren
              </Button>
              <Button
                size="sm"
                onClick={addEmployee}
                disabled={saving || !form.firstName.trim() || !form.lastName.trim() || !form.email.trim()}
                className="gap-2"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Opslaan
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          </div>
        ) : employees.length === 0 && !adding ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
              <Users className="h-6 w-6 text-gray-400" />
            </div>
            <div>
              <p className="font-medium text-gray-700">Nog geen medewerkers</p>
              <p className="mt-0.5 text-sm text-gray-400">Voeg medewerkers toe om ze aan meetings te koppelen</p>
            </div>
            <Button onClick={() => setAdding(true)} size="sm" className="mt-1 gap-2">
              <Plus className="h-4 w-4" />
              Eerste medewerker toevoegen
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className={cn(
                  "rounded-2xl border bg-white transition-shadow",
                  editId === emp.id ? "border-indigo-200 shadow-sm" : "border-gray-100 hover:border-gray-200"
                )}
              >
                {editId === emp.id ? (
                  <div className="p-4">
                    {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">Voornaam</label>
                        <Input
                          autoFocus
                          value={editForm.firstName}
                          onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">Achternaam</label>
                        <Input
                          value={editForm.lastName}
                          onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                          className="text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-gray-500">E-mailadres</label>
                        <Input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditId(null); setError(null); }}>
                        Annuleren
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(emp.id)} disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Opslaan
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                      {emp.firstName[0]}{emp.lastName[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <p className="flex items-center gap-1 truncate text-xs text-gray-500">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        {emp.email}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        onClick={() => { setEditId(emp.id); setEditForm({ firstName: emp.firstName, lastName: emp.lastName, email: emp.email }); setError(null); }}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        title="Bewerken"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteEmployee(emp.id)}
                        disabled={deleting === emp.id}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                        title="Verwijderen"
                      >
                        {deleting === emp.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
