"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import ProjectActionItemsList from "@/components/meeting/ProjectActionItemsList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Briefcase, ArrowLeft, Users, CheckSquare, Plus, Trash2, Loader2
} from "lucide-react";
import Link from "next/link";

type Project = {
  id: string;
  name: string;
  color: string;
};

type ActionItem = {
  id: string;
  title: string;
  assignee: string | null;
  description: string | null;
  dueDate: string | null;
  completed: boolean;
};

type Participant = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
};

type Meeting = {
  id: string;
  title: string;
  createdAt: string;
  status: string;
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [newParticipantEmail, setNewParticipantEmail] = useState("");
  const [deletingParticipant, setDeletingParticipant] = useState<string | null>(null);

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadProject() {
    try {
      const [projectRes, itemsRes, participantsRes, meetingsRes] = await Promise.all([
        fetch(`/api/projects/${id}`),
        fetch(`/api/projects/${id}/action-items`),
        fetch(`/api/projects/${id}/participants`),
        fetch(`/api/meetings?projectId=${id}&minimal=true`),
      ]);

      if (!projectRes.ok) {
        router.push("/");
        return;
      }

      const [proj, items, parts, mtgs] = await Promise.all([
        projectRes.json(),
        itemsRes.json(),
        participantsRes.json(),
        meetingsRes.json(),
      ]);

      setProject(proj);
      setActionItems(items);
      setParticipants(parts);
      setMeetings(mtgs);
    } catch (err) {
      console.error("Failed to load project:", err);
    } finally {
      setLoading(false);
    }
  }

  async function addParticipant() {
    if (!newParticipantName.trim()) return;
    setAddingParticipant(true);
    try {
      const res = await fetch(`/api/projects/${id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newParticipantName.trim(),
          email: newParticipantEmail.trim() || undefined,
        }),
      });
      if (res.ok) {
        const newParticipant = await res.json();
        setParticipants([...participants, newParticipant]);
        setNewParticipantName("");
        setNewParticipantEmail("");
      }
    } finally {
      setAddingParticipant(false);
    }
  }

  async function removeParticipant(participantId: string) {
    setDeletingParticipant(participantId);
    try {
      const res = await fetch(`/api/projects/${id}/participants`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId }),
      });
      if (res.ok) {
        setParticipants(participants.filter((p) => p.id !== participantId));
      }
    } finally {
      setDeletingParticipant(null);
    }
  }

  if (loading) {
    return (
      <MainLayout title="Project">
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!project) {
    return (
      <MainLayout title="Project">
        <div className="p-8 text-red-600">Project not found</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title={project.name}>
      <div className="mx-auto max-w-4xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: project.color + "20", color: project.color }}
            >
              <Briefcase className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs font-medium text-gray-500">Actiepunten</div>
            <div className="mt-1 text-2xl font-bold">{actionItems.length}</div>
            <div className="mt-1 text-xs text-gray-400">
              {actionItems.filter((i) => i.completed).length} afgerond
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs font-medium text-gray-500">Teamleden</div>
            <div className="mt-1 text-2xl font-bold">{participants.length}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs font-medium text-gray-500">Meetings</div>
            <div className="mt-1 text-2xl font-bold">{meetings.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="actions" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="actions" className="gap-2">
              <CheckSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Acties</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Team</span>
            </TabsTrigger>
            <TabsTrigger value="meetings" className="gap-2">
              <Briefcase className="h-4 w-4" />
              <span className="hidden sm:inline">Meetings</span>
            </TabsTrigger>
          </TabsList>

          {/* Action Items Tab */}
          <TabsContent value="actions" className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Gedeelde actielijst</h2>
              <p className="mb-4 text-sm text-gray-600">
                Deze acties worden gebruikt voor alle meetings in dit project.
              </p>
              <ProjectActionItemsList
                projectId={id}
                items={actionItems}
                participants={participants}
                onChange={setActionItems}
              />
            </div>
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team" className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Teamleden</h2>
              <div className="space-y-3">
                {participants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{p.name}</p>
                      {p.email && <p className="text-xs text-gray-500">{p.email}</p>}
                    </div>
                    <button
                      onClick={() => removeParticipant(p.id)}
                      disabled={deletingParticipant === p.id}
                      className="text-gray-400 hover:text-red-600 disabled:text-gray-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t border-gray-200 pt-6">
                <h3 className="mb-3 font-medium">Teamlid toevoegen</h3>
                <div className="space-y-3">
                  <Input
                    placeholder="Naam"
                    value={newParticipantName}
                    onChange={(e) => setNewParticipantName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addParticipant();
                    }}
                  />
                  <Input
                    type="email"
                    placeholder="Email (optioneel)"
                    value={newParticipantEmail}
                    onChange={(e) => setNewParticipantEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addParticipant();
                    }}
                  />
                  <Button
                    onClick={addParticipant}
                    disabled={!newParticipantName.trim() || addingParticipant}
                    className="w-full gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    {addingParticipant ? "Toevoegen..." : "Toevoegen"}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Meetings Tab */}
          <TabsContent value="meetings" className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Meetings</h2>
              {meetings.length === 0 ? (
                <p className="text-sm text-gray-500">Geen meetings in dit project</p>
              ) : (
                <div className="space-y-2">
                  {meetings.map((m) => (
                    <Link
                      key={m.id}
                      href={`/meetings/${m.id}`}
                      className="block rounded-lg bg-gray-50 p-3 hover:bg-gray-100 transition-colors"
                    >
                      <p className="font-medium text-gray-900">{m.title}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
