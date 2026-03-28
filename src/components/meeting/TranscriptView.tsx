"use client";

import { useState } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDuration } from "@/lib/utils";
import type { TranscriptSegment } from "@/types";

type Props = {
  content: string;
  segments?: TranscriptSegment[];
  /** Live browser-tekst; Whisper vervangt straks met tijdstippen. */
  isProvisional?: boolean;
};

export default function TranscriptView({ content, segments = [], isProvisional }: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const filtered = search
    ? segments.filter((s) =>
        s.text.toLowerCase().includes(search.toLowerCase())
      )
    : segments;

  const highlight = (text: string) => {
    if (!search) return text;
    const parts = text.split(new RegExp(`(${search})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === search.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
          Transcript
          <span className="text-xs text-gray-400 font-normal">
            ({segments.length} segments)
          </span>
          {isProvisional && (
            <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
              Voorlopig
            </span>
          )}
        </button>
        {!collapsed && (
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Zoek in transcript…"
              className="pl-8 h-8 text-xs w-48"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {isProvisional && !collapsed && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Dit is voorlopige tekst (live herkenning). Whisper vervangt dit door een definitieve transcriptie met
          tijdstippen zodra de verwerking klaar is.
        </p>
      )}

      {!collapsed && (
        <ScrollArea className="h-96 rounded-xl border border-gray-200 bg-gray-50">
          <div className="p-4 space-y-3">
            {segments.length > 0 ? (
              filtered.map((seg, i) => (
                <div key={i} className="flex gap-3">
                  <span className="flex-shrink-0 font-mono text-xs text-gray-400 mt-0.5 w-12">
                    {formatDuration(Math.floor(seg.start))}
                  </span>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {highlight(seg.text)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 whitespace-pre-wrap">{content}</p>
            )}
            {filtered.length === 0 && search && (
              <p className="text-sm text-gray-400 text-center py-8">
                No results for "{search}"
              </p>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
