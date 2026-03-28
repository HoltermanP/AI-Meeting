"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
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
} from "lucide-react";

type Template = {
  id: string;
  name: string;
  description: string | null;
  content: string;
  actionItemsInstructions: string | null;
  userId: string;
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState(session?.user?.name || "");
  const [openaiKey, setOpenaiKey] = useState("");

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formActionInstructions, setFormActionInstructions] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
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
    setDialogOpen(true);
  }

  function openEdit(t: Template) {
    if (t.userId !== session?.user?.id) return;
    setEditing(t);
    setFormName(t.name);
    setFormDescription(t.description || "");
    setFormContent(t.content);
    setFormActionInstructions(t.actionItemsInstructions || "");
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
    if (t.userId !== session?.user?.id) return;
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

  const ownTemplates = templates.filter((t) => t.userId === session?.user?.id);

  return (
    <MainLayout title="Instellingen">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
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
              <Input value={session?.user?.email || ""} disabled className="bg-muted" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileStack className="h-5 w-5 text-indigo-600" />
                Verslag- en actielijst-templates
              </CardTitle>
              <CardDescription className="mt-1.5 max-w-2xl space-y-2">
                <p>
                  <strong>Word-sjabloon (.docx):</strong> je volledige bestand (logo’s, afbeeldingen, marges,
                  kop/voet, tabellen op de eerste pagina’s) blijft behouden. Het verslag uit de app wordt
                  daar <strong>onder</strong> gezet (nieuwe pagina), met dezelfde Kop1/Kop2-stijlen als in
                  jouw document.
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Optioneel — tags in Word:</strong>{" "}
                  <code className="bg-muted px-1 rounded">{"{{meetingTitle}} {{meetingDate}} {{notes}} {{actionItems}}"}</code>{" "}
                  op de plek waar je ze wilt. <code className="bg-muted px-1 rounded">{"{{notes}}"}</code> het
                  liefst in <strong>één lege alinea</strong> alleen die tag — dan vloeien de Markdown-koppen
                  van je notulen als echte Word-koppen in je huisstijl. Andere tags (bv.{" "}
                  <code className="bg-muted px-1 rounded">{"{{samenvatting}}"}</code>) worden na upload
                  herkend; de AI vult ze bij genereren.
                </p>
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1 shrink-0" onClick={openNew}>
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
                  Vaak na een lege database: uitloggen en opnieuw registreren/inloggen. Controleer ook{" "}
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
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Zet <code className="font-mono text-xs bg-amber-100 px-1 rounded">OPENAI_API_KEY</code>{" "}
              voor transcriptie en notities.
            </div>
            <div className="space-y-1.5">
              <Label>OpenAI API Key (lokaal voorbeeld)</Label>
              <Input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
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
