"use client";

import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Check,
  Loader2,
  Key,
  User,
  Bell,
  FileStack,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  RefreshCw,
  Unlink,
  Link2,
} from "lucide-react";

type Template = {
  id: string;
  name: string;
  description: string | null;
  content: string;
  actionItemsInstructions: string | null;
  goal: string | null;
  defaultAgenda: string | null;
  aiContextInstructions: string | null;
  outputFocus: string | null;
  userId: string;
};

type MeUser = { id: string; email: string; name: string | null };

type CalendarStatus = { connected: false } | { connected: true; msEmail?: string | null };

export default function SettingsPage() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");

  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [calendarSyncResult, setCalendarSyncResult] = useState<string | null>(null);
  const [calendarDisconnecting, setCalendarDisconnecting] = useState(false);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formActionInstructions, setFormActionInstructions] = useState("");
  const [formGoal, setFormGoal] = useState("");
  const [formDefaultAgenda, setFormDefaultAgenda] = useState("");
  const [formAiContext, setFormAiContext] = useState("");
  const [formOutputFocus, setFormOutputFocus] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
    loadCalendarStatus();
  }, []);

  // Toon melding als we terugkeren van de OAuth-flow
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const cal = params.get("calendar");
    if (cal === "connected") {
      loadCalendarStatus();
      // Verwijder de query-param uit de URL
      window.history.replaceState({}, "", "/settings");
    } else if (cal === "error") {
      const msg = params.get("msg") ?? "Onbekende fout";
      alert(`Outlook koppelen mislukt: ${msg}`);
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  async function loadCalendarStatus() {
    try {
      const r = await fetch("/api/calendar/status");
      if (r.ok) setCalendarStatus(await r.json());
    } catch { /* ignore */ }
  }

  async function handleCalendarSync() {
    setCalendarSyncing(true);
    setCalendarSyncResult(null);
    try {
      const r = await fetch("/api/calendar/sync", { method: "POST" });
      const data = await r.json() as { created?: number; skipped?: number; error?: string };
      if (!r.ok) {
        setCalendarSyncResult(`Fout: ${data.error ?? r.status}`);
      } else {
        setCalendarSyncResult(
          `${data.created} nieuw geïmporteerd, ${data.skipped} overgeslagen (al aanwezig).`
        );
      }
    } catch {
      setCalendarSyncResult("Synchronisatie mislukt.");
    } finally {
      setCalendarSyncing(false);
    }
  }

  async function handleCalendarDisconnect() {
    if (!confirm("Outlook-koppeling verbreken? Bestaande meetings blijven bewaard.")) return;
    setCalendarDisconnecting(true);
    try {
      await fetch("/api/calendar/disconnect", { method: "DELETE" });
      setCalendarStatus({ connected: false });
      setCalendarSyncResult(null);
    } finally {
      setCalendarDisconnecting(false);
    }
  }

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: MeUser } | null) => {
        if (data?.user) {
          setMe(data.user);
          setName(data.user.name || "");
        }
      })
      .catch(() => {});
  }, []);

  async function loadTemplates() {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const r = await fetch("/api/templates");
      const raw = await r.text();
      let data: unknown = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
      if (r.ok && Array.isArray(data)) {
        setTemplates(data as Template[]);
        return;
      }
      const msg =
        (data as { detail?: string; error?: string })?.detail ||
        (data as { error?: string })?.error ||
        (r.status === 401
          ? "Niet ingelogd of sessie verlopen — log opnieuw in."
          : `Laden mislukt (${r.status})`);
      setTemplatesError(msg);
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }

  function openNew() {
    setEditing(null);
    setFormName("");
    setFormDescription("");
    setFormContent(`## Samenvatting
(korte weergave)

## Belangrijkste punten
-

## Beslissingen
-

## Actiepunten
- [ ]

## Vervolg
`);
    setFormActionInstructions(
      "Per actiepunt: title, assignee (wie doet het), description (wat/wanneer)."
    );
    setFormGoal("");
    setFormDefaultAgenda("");
    setFormAiContext("");
    setFormOutputFocus("");
    setDialogOpen(true);
  }

  function openEdit(t: Template) {
    if (t.userId !== me?.id) return;
    setEditing(t);
    setFormName(t.name);
    setFormDescription(t.description || "");
    setFormContent(t.content);
    setFormActionInstructions(t.actionItemsInstructions || "");
    setFormGoal(t.goal || "");
    setFormDefaultAgenda(t.defaultAgenda || "");
    setFormAiContext(t.aiContextInstructions || "");
    setFormOutputFocus(t.outputFocus || "");
    setDialogOpen(true);
  }

  async function saveTemplate() {
    const contentToSave = formContent.trim();
    if (!formName.trim() || !contentToSave.trim()) return;

    setFormSaving(true);
    try {
      let templateId: string;
      if (editing) {
        templateId = editing.id;
        await fetch(`/api/templates/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            description: formDescription || null,
            content: formContent.trim() || contentToSave,
            actionItemsInstructions: formActionInstructions.trim() || null,
            goal: formGoal.trim() || null,
            defaultAgenda: formDefaultAgenda.trim() || null,
            aiContextInstructions: formAiContext.trim() || null,
            outputFocus: formOutputFocus.trim() || null,
          }),
        });
      } else {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            description: formDescription || null,
            content: contentToSave,
            actionItemsInstructions: formActionInstructions.trim() || null,
            goal: formGoal.trim() || null,
            defaultAgenda: formDefaultAgenda.trim() || null,
            aiContextInstructions: formAiContext.trim() || null,
            outputFocus: formOutputFocus.trim() || null,
          }),
        });
        const raw = await res.text();
        let created: { id?: string; error?: string } = {};
        try {
          created = raw ? (JSON.parse(raw) as typeof created) : {};
        } catch {
          created = {};
        }
        if (!res.ok) {
          alert(created.error || raw?.slice(0, 200) || "Template opslaan mislukt");
          return;
        }
        if (!created.id) {
          alert(
            "Geen antwoord van de server. Controleer of je bent ingelogd en probeer opnieuw."
          );
          return;
        }
        templateId = created.id;
      }

      setDialogOpen(false);
      await loadTemplates();
    } finally {
      setFormSaving(false);
    }
  }

  async function deleteTemplate(t: Template) {
    if (t.userId !== me?.id) return;
    if (!confirm(`Template "${t.name}" verwijderen?`)) return;
    await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
    await loadTemplates();
  }

  async function handleSave() {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  const ownTemplates = templates.filter((t) => t.userId === me?.id);

  return (
    <MainLayout title="Instellingen">
      <div className="mx-auto max-w-3xl space-y-6 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-indigo-600" />
              Profiel
            </CardTitle>
            <CardDescription>Je accountgegevens</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Naam</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Je naam" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input value={me?.email || ""} disabled className="bg-muted" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <FileStack className="h-5 w-5 shrink-0 text-indigo-600" />
                Verslag- en actielijst-templates
              </CardTitle>
              <div className="mt-1.5 max-w-2xl space-y-2 text-sm text-muted-foreground">
                <span className="block">
                  <strong>Word-sjabloon (.docx):</strong> je volledige bestand (logo’s, afbeeldingen, marges,
                  kop/voet, tabellen op de eerste pagina’s) blijft behouden. Het verslag uit de app wordt
                  daar <strong>onder</strong> gezet (nieuwe pagina), met dezelfde Kop1/Kop2-stijlen als in
                  jouw document.
                </span>
                <span className="block text-xs">
                  <strong>Optioneel — tags in Word:</strong>{" "}
                  <code className="bg-muted px-1 rounded">{"{{meetingTitle}} {{meetingDate}} {{notes}} {{actionItems}}"}</code>{" "}
                  op de plek waar je ze wilt. <code className="bg-muted px-1 rounded">{"{{notes}}"}</code> het
                  liefst in <strong>één lege alinea</strong> alleen die tag — dan vloeien de Markdown-koppen
                  van je notulen als echte Word-koppen in je huisstijl. Andere tags (bv.{" "}
                  <code className="bg-muted px-1 rounded">{"{{samenvatting}}"}</code>) worden na upload
                  herkend; de AI vult ze bij genereren.
                </span>
              </div>
            </div>
            <Button size="sm" className="w-full shrink-0 gap-1 sm:w-auto" onClick={openNew}>
              <Plus className="h-4 w-4" />
              Template toevoegen
            </Button>
          </CardHeader>
          <CardContent>
            {templatesError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
                <p className="font-medium">Templates laden lukt niet</p>
                <p>{templatesError}</p>
                <p className="text-xs text-amber-800">
                  Vaak na een lege database of ontbrekende sessie: opnieuw inloggen. Controleer ook{" "}
                  <code className="bg-amber-100 px-1 rounded">DATABASE_URL</code> in{" "}
                  <code className="bg-amber-100 px-1 rounded">.env</code>.
                </p>
                <Button size="sm" variant="outline" onClick={() => loadTemplates()}>
                  Opnieuw proberen
                </Button>
              </div>
            ) : templatesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : ownTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Nog geen eigen templates. Standaardtemplates worden bij eerste bezoek aangemaakt, of
                voeg hierboven een template toe.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {ownTemplates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start justify-between gap-4 p-4 hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {t.actionItemsInstructions
                          ? "Eigen actielijst-regels"
                          : "Actielijst: AI kiest zelf"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)} title="Bewerken">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => deleteTemplate(t)}
                        title="Verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-indigo-600" />
              API-sleutels
            </CardTitle>
            <CardDescription>
              AI staat op de server; sleutel in <code className="text-xs bg-muted px-1 rounded">.env</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 space-y-2">
              <p>
                In <code className="font-mono text-xs bg-amber-100 px-1 rounded">.env</code> op de server:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>
                  <code className="bg-amber-100 px-1 rounded">OPENAI_API_KEY</code> — verplicht voor{" "}
                  <strong>transcriptie</strong> (Whisper). Ook gebruikt voor tekst als je geen Anthropic
                  hebt.
                </li>
                <li>
                  <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> — optioneel; voor
                  notities, chat en extractie worden dan per taak de beste Claude-modellen gebruikt
                  (Opus voor lange verslagen, Sonnet voor chat, Haiku voor titels/acties).
                </li>
                <li>
                  <code className="bg-amber-100 px-1 rounded">AI_PROVIDER</code> —{" "}
                  <code className="bg-amber-100 px-1 rounded">auto</code> (standaard: Anthropic als de
                  sleutel er is, anders OpenAI), <code className="bg-amber-100 px-1 rounded">openai</code>{" "}
                  of <code className="bg-amber-100 px-1 rounded">anthropic</code> om één provider te
                  forceren voor alle teksttaken.
                </li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label>OpenAI API Key (lokaal voorbeeld — niet opgeslagen in de app)</Label>
              <Input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Microsoft 365 / Outlook kalenderintegratie */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-600" />
              Microsoft 365 / Outlook
            </CardTitle>
            <CardDescription>
              Koppel je Outlook-agenda voor automatische synchronisatie. Geplande meetings
              verschijnen in Outlook; Teams-meetings krijgen een deelname-link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {calendarStatus === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Status laden…
              </div>
            ) : calendarStatus.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">
                    Verbonden
                    {calendarStatus.msEmail ? ` als ${calendarStatus.msEmail}` : ""}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={handleCalendarSync}
                    disabled={calendarSyncing}
                  >
                    {calendarSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Synchroniseer van Outlook
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 text-destructive hover:border-destructive/30"
                    onClick={handleCalendarDisconnect}
                    disabled={calendarDisconnecting}
                  >
                    {calendarDisconnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Unlink className="h-4 w-4" />
                    )}
                    Verbinding verbreken
                  </Button>
                </div>

                {calendarSyncResult && (
                  <p className="text-sm text-muted-foreground">{calendarSyncResult}</p>
                )}

                <p className="text-xs text-muted-foreground">
                  Nieuwe meetings die je in de app plant, worden automatisch als
                  Outlook-agenda-item aangemaakt. Verwijder je een meeting, dan verdwijnt het
                  agenda-item ook.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Nog niet gekoppeld. Na verbinden worden geplande meetings automatisch
                  gesynchroniseerd met je Outlook-agenda.
                </p>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => { window.location.href = "/api/calendar/connect"; }}
                >
                  <Link2 className="h-4 w-4" />
                  Verbinden met Outlook
                </Button>
                <p className="text-xs text-muted-foreground">
                  Vereist: <code className="bg-muted px-1 rounded">MICROSOFT_CLIENT_ID</code>,{" "}
                  <code className="bg-muted px-1 rounded">MICROSOFT_CLIENT_SECRET</code> en{" "}
                  <code className="bg-muted px-1 rounded">MICROSOFT_TENANT_ID</code> in{" "}
                  <code className="bg-muted px-1 rounded">.env</code>.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-indigo-600" />
              Platforms
            </CardTitle>
            <CardDescription>Opname via de browser</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { name: "Zoom", icon: "📹", desc: "Scherm + microfoon" },
                { name: "Google Meet", icon: "🎥", desc: "Tab-audio" },
                { name: "Teams", icon: "💼", desc: "Desktop-audio" },
                { name: "Live", icon: "🎙️", desc: "Microfoon" },
              ].map((platform) => (
                <div
                  key={platform.name}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <span className="text-xl">{platform.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{platform.name}</p>
                    <p className="text-xs text-muted-foreground">{platform.desc}</p>
                  </div>
                  <Check className="h-4 w-4 text-green-600" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saved ? "Opgeslagen!" : "Opslaan"}
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Template bewerken" : "Nieuwe template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Naam</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="bijv. Wekelijkse stand-up"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Beschrijving (optioneel)</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Wanneer gebruik je dit?"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Verslagstructuur (Markdown)</Label>
              <p className="text-xs text-muted-foreground">
                Gebruik Markdown-koppen (##) voor de secties die de AI moet genereren, bijvoorbeeld
                Samenvatting, Belangrijkste punten, Beslissingen, Actiepunten.
              </p>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Actielijst — instructies voor de AI (optioneel)</Label>
              <p className="text-xs text-muted-foreground">
                Laat leeg als de AI zelf het beste format voor actiepunten mag kiezen. Vul in om bv.
                prioriteit, deadline of RACI te vragen (als JSON-velden).
              </p>
              <Textarea
                value={formActionInstructions}
                onChange={(e) => setFormActionInstructions(e.target.value)}
                placeholder="Bv. Per item: title, assignee, dueDate (tekst), priority (hoog/medium/laag)."
                className="min-h-[80px] text-sm"
              />
            </div>

            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-semibold text-gray-700">Overlegtype-instellingen (optioneel)</p>
              <p className="text-xs text-muted-foreground -mt-2">
                Gebruik dit als dit template een vast overlegtype is (bijv. Dagstart, Weekreview). De AI past automatisch de juiste focus toe.
              </p>

              <div className="space-y-1.5">
                <Label>Doel van dit overleg</Label>
                <Textarea
                  value={formGoal}
                  onChange={(e) => setFormGoal(e.target.value)}
                  placeholder="Bijv. Kort cyclisch overleg gericht op dagelijkse operationele sturing, met focus op bezetting, commerciële kansen en knelpunten."
                  className="min-h-[80px] text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label>AI-context voor dit overlegtype</Label>
                <p className="text-xs text-muted-foreground">
                  Extra instructies die de AI krijgt als systeemcontext. Beschrijf de focus, wat wel/niet vastgelegd moet worden, en de toon van de output.
                </p>
                <Textarea
                  value={formAiContext}
                  onChange={(e) => setFormAiContext(e.target.value)}
                  placeholder="Bijv. Focus op snelheid en directe toepasbaarheid. Noteer ALLEEN afwijkingen ten opzichte van de standaardsituatie. Neem openstaande acties uit vorige dagstart mee..."
                  className="min-h-[100px] text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Output-focus (korte omschrijving)</Label>
                <input
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={formOutputFocus}
                  onChange={(e) => setFormOutputFocus(e.target.value)}
                  placeholder="Bijv. Dagstart vestiging — operationele sturing"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Standaard agenda-structuur</Label>
                <p className="text-xs text-muted-foreground">
                  Agendapunten die altijd terugkomen (één per regel). Worden gebruikt als basis bij automatisch aanmaken van een agenda.
                </p>
                <Textarea
                  value={formDefaultAgenda}
                  onChange={(e) => setFormDefaultAgenda(e.target.value)}
                  placeholder={`Opening / aanwezigheid (2 min)\nReview acties vorige dagstart (5 min)\nBezetting vandaag (5 min)\nCommerciële kansen (3 min)\nKnelpunten & acties (5 min)\nAfsluiting (1 min)`}
                  className="min-h-[120px] text-sm font-mono"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuleren
            </Button>
            <Button
              onClick={saveTemplate}
              disabled={formSaving || !formName.trim() || !formContent.trim()}
            >
              {formSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
