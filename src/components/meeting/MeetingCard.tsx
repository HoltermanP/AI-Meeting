"use client";

import Link from "next/link";
import { formatDateTime, formatDuration, platformIcon } from "@/lib/utils";
import { Clock, Users, Folder, Briefcase, FileText, CheckSquare, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

type Meeting = {
  id: string;
  title: string;
  status: string;
  platform: string | null;
  createdAt: string;
  duration: number | null;
  notes?: { summary: string | null } | null;
  actionItems?: { id: string; completed: boolean }[];
  participants?: { id: string; name: string }[];
  folder?: { id: string; name: string; color: string } | null;
  project?: { id: string; name: string; color: string } | null;
  transcript?: { id: string } | null;
};

const statusConfig: Record<string, { label: string; dot: string }> = {
  draft:      { label: "Concept",     dot: "bg-gray-400" },
  recording:  { label: "Bezig",       dot: "bg-red-400 animate-pulse" },
  processing: { label: "Verwerking",  dot: "bg-yellow-400 animate-pulse" },
  completed:  { label: "Afgerond",    dot: "bg-green-500" },
  scheduled:  { label: "Gepland",     dot: "bg-indigo-400" },
};

export default function MeetingCard({ meeting }: { meeting: Meeting }) {
  const totalItems = meeting.actionItems?.length || 0;
  const doneItems = meeting.actionItems?.filter((i) => i.completed).length || 0;
  const pendingItems = totalItems - doneItems;
  const cfg = statusConfig[meeting.status] ?? { label: meeting.status, dot: "bg-gray-400" };

  return (
    <Link href={`/meetings/${meeting.id}`} className="group block">
      <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-150 hover:border-indigo-200 hover:shadow-md">
        {/* Top row: icon + title + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className="mt-0.5 shrink-0 text-base leading-none">{platformIcon(meeting.platform)}</span>
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 group-hover:text-indigo-600 transition-colors">
              {meeting.title}
            </h3>
          </div>
          {/* Status pill */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
            <span className="text-[11px] font-medium text-gray-600">{cfg.label}</span>
          </div>
        </div>

        {/* Summary */}
        {meeting.notes?.summary ? (
          <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-gray-500">
            {meeting.notes.summary}
          </p>
        ) : (
          <p className="mt-2.5 text-xs text-gray-300 italic">
            {meeting.status === "scheduled" ? "Gepland — nog geen opname" :
             meeting.transcript ? "Notities nog niet gegenereerd" : "Nog geen transcript"}
          </p>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom metadata */}
        <div className="mt-4 space-y-2">
          {/* Tags row */}
          {(meeting.project || meeting.folder) && (
            <div className="flex flex-wrap gap-1.5">
              {meeting.project && (
                <span
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: meeting.project.color + "18", color: meeting.project.color }}
                >
                  <Briefcase className="h-3 w-3" />
                  {meeting.project.name}
                </span>
              )}
              {meeting.folder && (
                <span
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: meeting.folder.color + "18", color: meeting.folder.color }}
                >
                  <Folder className="h-3 w-3" />
                  {meeting.folder.name}
                </span>
              )}
            </div>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span>{formatDateTime(meeting.createdAt)}</span>
            {meeting.duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(meeting.duration)}
              </span>
            )}
            {(meeting.participants?.length || 0) > 0 && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {meeting.participants?.length}
              </span>
            )}
            {meeting.transcript && (
              <span className="flex items-center gap-1 text-indigo-400">
                <FileText className="h-3 w-3" />
                Transcript
              </span>
            )}
            {pendingItems > 0 && (
              <span className="flex items-center gap-1 text-orange-400">
                <CheckSquare className="h-3 w-3" />
                {pendingItems} open
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
