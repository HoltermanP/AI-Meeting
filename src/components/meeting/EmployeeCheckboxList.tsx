"use client";

import { cn } from "@/lib/utils";

type Employee = { id: string; firstName: string; lastName: string; email: string };

type Props = {
  employees: Employee[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  loading?: boolean;
  className?: string;
};

export default function EmployeeCheckboxList({ employees, selected, onChange, loading, className }: Props) {
  if (loading) {
    return <p className="text-xs text-muted-foreground py-1">Laden…</p>;
  }
  if (employees.length === 0) {
    return <p className="text-xs text-muted-foreground py-1">Geen medewerkers gevonden.</p>;
  }

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  }

  return (
    <div className={cn("max-h-44 overflow-y-auto rounded-lg border divide-y", className)}>
      {employees.map((e) => {
        const name = `${e.firstName} ${e.lastName}`;
        const checked = selected.has(e.id);
        const initials = `${e.firstName[0] ?? ""}${e.lastName[0] ?? ""}`.toUpperCase();
        return (
          <label
            key={e.id}
            className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50 select-none"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(e.id)}
              className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
            />
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-gray-800">{name}</p>
              {e.email && <p className="truncate text-[11px] text-gray-400">{e.email}</p>}
            </div>
          </label>
        );
      })}
    </div>
  );
}
