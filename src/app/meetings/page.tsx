"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import MeetingCard from "@/components/meeting/MeetingCard";
import NewMeetingDialog from "@/components/meeting/NewMeetingDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Loader2 } from "lucide-react";

function MeetingsContent() {
  const searchParams = useSearchParams();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const folderId = searchParams.get("folderId");

  useEffect(() => {
    loadMeetings();
  }, [search, status, folderId]);

  async function loadMeetings() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
    if (folderId) params.set("folderId", folderId);

    const data = await fetch(`/api/meetings?${params}`).then((r) => r.json());
    setMeetings(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search meetings, notes, transcript..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          New Meeting
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-gray-500 font-medium">No meetings found</p>
          <p className="text-sm text-gray-400">Try a different search or create a new meeting</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {meetings.map((m) => (
            <MeetingCard key={m.id} meeting={m} />
          ))}
        </div>
      )}

      <NewMeetingDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}

export default function MeetingsPage() {
  return (
    <MainLayout title="All Meetings">
      <Suspense fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      }>
        <MeetingsContent />
      </Suspense>
    </MainLayout>
  );
}
