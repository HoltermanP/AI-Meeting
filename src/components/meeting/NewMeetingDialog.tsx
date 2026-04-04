"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Bijv. vanuit /meetings?projectId=… — vooraf geselecteerd project */
  defaultProjectId?: string | null;
};

const PLATFORMS = [
  { value: "zoom", label: "Zoom" },
  { value: "google_meet", label: "Google Meet" },
  { value: "teams", label: "Microsoft Teams" },
  { value: "slack", label: "Slack" },
  { value: "webex", label: "Webex" },
  { value: "other", label: "Overig / fysiek" },
];

export default function NewMeetingDialog({ open, onClose, defaultProjectId }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("Naamloze meeting");
  const [platform, setPlatform] = useState("other");
  const [templateId, setTemplateId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [templates, setTemplates] = useState<
    { id: string; name: string; userId: string }[]
  >([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectActions, setProjectActions] = useState<
    { id: string; title: string; completed: boolean }[]
  >([]);
  const [loadingProjectActions, setLoadingProjectActions] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/templates")
      .then((r) => r.json())
      .then((list) => setTemplates(Array.isArray(list) ? list : []))
      .catch(() => setTemplates([]));
    fetch("/api/projects")
      .then((r) => r.json())
      .then((list) => setProjects(Array.isArray(list) ? list : []))
      .catch(() => setProjects([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setProjectId(defaultProjectId || "");
  }, [open, defaultProjectId]);

  useEffect(() => {
    if (!open || !projectId) {
      setProjectActions([]);
      return;
    }
    setLoadingProjectActions(true);
    fetch(`/api/projects/${projectId}/action-items`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setProjectActions(Array.isArray(data) ? data : []))
      .catch(() => setProjectActions([]))
      .finally(() => setLoadingProjectActions(false));
  }, [open, projectId]);

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          platform,
          ...(templateId ? { templateId } : {}),
          ...(projectId ? { projectId } : {}),
        }),
      });
      const meeting = await res.json();
      router.push(`/meetings/${meeting.id}`);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe meeting</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Titel</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="bijv. Teamsync, klantgesprek"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select
              value={projectId || "__none__"}
              onValueChange={(v) => setProjectId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Kies project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Geen project (losse meeting)</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Koppel deze meeting aan een project, of laat leeg voor een standalone meeting.
            </p>
            {projectId ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">Actielijst van dit project</p>
                {loadingProjectActions ? (
                  <div className="flex justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                  </div>
                ) : projectActions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nog geen actiepunten. Na aanmaken zie je hier dezelfde lijst als in andere meetings van dit
                    project.
                  </p>
                ) : (
                  <ul className="max-h-36 space-y-1 overflow-y-auto text-sm text-foreground">
                    {projectActions.map((a) => (
                      <li
                        key={a.id}
                        className={cn(
                          "truncate border-l-2 border-indigo-200 pl-2",
                          a.completed && "text-muted-foreground line-through border-muted"
                        )}
                      >
                        {a.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Template (verslag + actielijst)</Label>
            <Select value={templateId || "__none__"} onValueChange={(v) => setTemplateId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Kies template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Geen — AI kiest format</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Kies welke verslagstructuur de AI moet volgen bij het genereren van notities.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Meeting aanmaken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
