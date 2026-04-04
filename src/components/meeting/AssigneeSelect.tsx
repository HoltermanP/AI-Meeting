"use client";

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Employee = { id: string; firstName: string; lastName: string };

type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Extra keuzes bovenop de medewerkers (bijv. huidige deelnemers van een meeting) */
  extraChoices?: { id: string; name: string }[];
  className?: string;
};

let cachedEmployees: Employee[] | null = null;

export default function AssigneeSelect({ value, onChange, extraChoices = [], className }: Props) {
  const [employees, setEmployees] = useState<Employee[]>(cachedEmployees ?? []);

  useEffect(() => {
    if (cachedEmployees) return;
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          cachedEmployees = data;
          setEmployees(data);
        }
      })
      .catch(() => {});
  }, []);

  // Build deduplicated list: employees first, then extra choices not already in employees
  const employeeNames = new Set(employees.map((e) => `${e.firstName} ${e.lastName}`));
  const extras = extraChoices.filter((c) => !employeeNames.has(c.name));

  return (
    <Select
      value={value || "__none__"}
      onValueChange={(val) => onChange(val === "__none__" ? null : val)}
    >
      <SelectTrigger className={className ?? "mt-0.5 h-auto border-0 bg-transparent p-0 text-sm font-medium text-gray-800 shadow-none focus:ring-0"}>
        <SelectValue placeholder="Niemand" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Niemand</SelectItem>
        {employees.map((e) => {
          const name = `${e.firstName} ${e.lastName}`;
          return <SelectItem key={e.id} value={name}>{name}</SelectItem>;
        })}
        {extras.map((c) => (
          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
