"use client";

import Link from "next/link";
import { formatDateTime, formatDuration, platformIcon, platformLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Clock, Users, Folder } from "lucide-react";

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
  transcript?: { id: string } | null;
};

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    draft: "secondary",
    recording: "warning",
    processing: "warning",
    completed: "success",
  };
  const labels: Record<string, string> = {
    draft: "Draft",
    recording: "Recording",
    processing: "Processing",
    completed: "Completed",
  };
  return (
    <Badge variant={(variants[status] as any) || "secondary"}>
      {labels[status] || status}
    </Badge>
  );
}

export default function MeetingCard({ meeting }: { meeting: Meeting }) {
  const totalItems = meeting.actionItems?.length || 0;
  const doneItems = meeting.actionItems?.filter((i) => i.completed).length || 0;

  return (
    <Link href={`/meetings/${meeting.id}`}>
      <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{platformIcon(meeting.platform)}</span>
              <h3 className="font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                {meeting.title}
              </h3>
            </div>
            {meeting.notes?.summary && (
              <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                {meeting.notes.summary}
              </p>
            )}
          </div>
          <StatusBadge status={meeting.status} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
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
              {meeting.participants?.length} participants
            </span>
          )}

          {totalItems > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />
              {doneItems}/{totalItems} tasks
            </span>
          )}

          {meeting.folder && (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: meeting.folder.color + "20",
                color: meeting.folder.color,
              }}
            >
              <Folder className="h-3 w-3" />
              {meeting.folder.name}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
