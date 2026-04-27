"use client";

import { useState, useEffect, useCallback } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import {
  Check,
  Loader2,
  Settings,
  Building2,
  Link2,
  RefreshCw,
  ExternalLink,
  Info,
} from "lucide-react";

type ConfigData = {
  config: Record<string, string>;
  envFallbacks: Record<string, string>;
};

type PlannerPlan = { id: string; title: string };
type PlannerBucket = { id: string; name: string };
type SharePointDrive = { id: string; name: string; siteName: string; driveType: string };

type Project = {
  id: string;
  name: string;
  color: string;
  templateId: string | null;
  plannerPlanId: string | null;
  plannerBucketId: string | null;
  sharePointDriveId: string | null;
  sharePointFolderPath: string | null;
  teamsWebhookUrl: string | null;
};

export default function AdminConfigPage() {
  // Microsoft 365 config
  const [configData, setConfigData] = useState<ConfigData | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [appName, setAppName] = useState("");
  const [cronSecret, setCronSecret] = useState("");
  const [savingMs, setSavingMs] = useState(false);
  const [savedMs, setSavedMs] = useState(false);

  // Planner / SharePoint per project
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [plannerPlans, setPlannerPlans] = useState<PlannerPlan[]>([]);
  const [plannerBuckets, setPlannerBuckets] = useState<PlannerBucket[]>([]);
  const [spDrives, setSpDrives] = useState<SharePointDrive[]>([]);
  const [loadingPlanner, setLoadingPlanner] = useState(false);
  const [loadingSp, setLoadingSp] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [savedProject, setSavedProject] = useState(false);

  // Lokale project veld states
  const [projPlanId, setProjPlanId] = useState("");
  const [projBucketId, setProjBucketId] = useState("");
  const [projDriveId, setProjDriveId] = useState("");
  const [projFolder, setProjFolder] = useState("");
  const [projWebhook, setProjWebhook] = useState("");

  useEffect(() => {
    loadConfig();
    loadProjects();
  }, []);

  async function loadConfig() {
    const res = await fetch("/api/admin/config");
    if (res.ok) {
      const data = (await res.json()) as ConfigData;
      setConfigData(data);
      // Toon lege velden (DB-waarde leeg = env-fallback is actief)
      setTenantId(data.config.ms_tenant_id ?? "");
      setClientId(data.config.ms_client_id ?? "");
      setClientSecret(data.config.ms_client_secret ?? "");
      setAppName(data.config.app_name ?? "");
      setCronSecret(data.config.cron_secret ?? "");
    }
  }

  async function loadProjects() {
    const res = await fetch("/api/projects");
    if (res.ok) setProjects(await res.json());
  }

  async function saveMs() {
    setSavingMs(true);
    try {
      await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ms_tenant_id: tenantId,
          ms_client_id: clientId,
          ms_client_secret: clientSecret,
          app_name: appName,
          cron_secret: cronSecret,
        }),
      });
      setSavedMs(true);
      setTimeout(() => setSavedMs(false), 2500);
      await loadConfig();
    } finally {
      setSavingMs(false);
    }
  }

  function selectProject(p: Project) {
    setSelectedProject(p);
    setProjPlanId(p.plannerPlanId ?? "");
    setProjBucketId(p.plannerBucketId ?? "");
    setProjDriveId(p.sharePointDriveId ?? "");
    setProjFolder(p.sharePointFolderPath ?? "Notulen");
    setProjWebhook(p.teamsWebhookUrl ?? "");
    setPlannerBuckets([]);
  }

  const loadPlannerPlans = useCallback(async () => {
    setLoadingPlanner(true);
    try {
      const res = await fetch("/api/admin/ms/planner-plans");
      if (res.ok) setPlannerPlans(await res.json());
    } finally {
      setLoadingPlanner(false);
    }
  }, []);

  async function loadBuckets(planId: string) {
    if (!planId) { setPlannerBuckets([]); return; }
    const res = await fetch(`/api/admin/ms/planner-plans?planId=${planId}`);
    if (res.ok) setPlannerBuckets(await res.json());
  }

  const loadSpDrives = useCallback(async () => {
    setLoadingSp(true);
    try {
      const res = await fetch("/api/admin/ms/sharepoint-drives");
      if (res.ok) setSpDrives(await res.json());
    } finally {
      setLoadingSp(false);
    }
  }, []);

  async function saveProject() {
    if (!selectedProject) return;
    setSavingProject(true);
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannerPlanId: projPlanId || null,
          plannerBucketId: projBucketId || null,
          sharePointDriveId: projDriveId || null,
          sharePointFolderPath: projFolder || null,
          teamsWebhookUrl: projWebhook || null,
        }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Project;
        setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setSelectedProject(updated);
        setSavedProject(true);
        setTimeout(() => setSavedProject(false), 2500);
      }
    } finally {
      setSavingProject(false);
    }
  }

  const envHint = (key: string) => {
    const fallback = configData?.envFallbacks[key];
    if (!fallback) return null;
    return (
      <p className="text-xs text-muted-foreground mt-1">
        <Info className="inline h-3 w-3 mr-1" />
        Actieve .env-waarde: <code className="bg-muted px-1 rounded">{fallback}</code>
        {" "}— laat leeg om .env te gebruiken
      </p>
    );
  };

  return (
    <MainLayout title="Configuratie">
      <div className="mx-auto max-w-3xl space-y-6 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
            <Settings className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Configuratie</h1>
            <p className="text-sm text-muted-foreground">
              Deployment-instellingen — wijzig hier bij elke klantimplementatie
            </p>
          </div>
        </div>

        <Tabs defaultValue="m365">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="m365" className="gap-2">
              <Building2 className="h-4 w-4" />
              Microsoft 365
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-2">
              <Link2 className="h-4 w-4" />
              Koppelingen per project
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Microsoft 365 ── */}
          <TabsContent value="m365" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-indigo-600" />
                  App-registratie (Azure)
                </CardTitle>
                <CardDescription>
                  Vul hier de credentials in van de Azure App Registration voor deze
                  organisatie. Laat een veld leeg om de waarde uit <code className="text-xs bg-muted px-1 rounded">.env</code> te gebruiken.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Tenant ID</Label>
                  <Input
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    placeholder="bijv. c00b1475-0af0-4c20-9593-cda976a4596d"
                  />
                  {envHint("ms_tenant_id")}
                </div>

                <div className="space-y-1.5">
                  <Label>Client ID (Application ID)</Label>
                  <Input
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="bijv. 17cbfb9e-de4b-436a-b565-d8bdba53cca8"
                  />
                  {envHint("ms_client_id")}
                </div>

                <div className="space-y-1.5">
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="Nieuw secret — leeg laten om bestaande te bewaren"
                  />
                  {envHint("ms_client_secret")}
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 space-y-1">
                  <p className="font-semibold">Benodigde API-permissies op de App Registration:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Calendars.ReadWrite</li>
                    <li>OnlineMeetings.ReadWrite</li>
                    <li>Tasks.ReadWrite</li>
                    <li>Files.ReadWrite</li>
                    <li>User.Read</li>
                    <li>offline_access</li>
                  </ul>
                  <p className="mt-2">
                    Redirect URI instellen:{" "}
                    <code className="bg-blue-100 px-1 rounded">
                      {typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/callback
                    </code>
                  </p>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <p className="text-sm font-medium">Na opslaan: verbind Outlook opnieuw</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => { window.location.href = "/api/calendar/connect"; }}
                    >
                      <Link2 className="h-4 w-4" />
                      Verbinden met Outlook / Teams
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => { window.open("https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade", "_blank"); }}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Azure Portal openen
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">App-instellingen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>App-naam (branding)</Label>
                  <Input
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="MeetingAI"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Cron Secret</Label>
                  <Input
                    type="password"
                    value={cronSecret}
                    onChange={(e) => setCronSecret(e.target.value)}
                    placeholder="Willekeurig sterk wachtwoord voor cron-beveiliging"
                  />
                  <p className="text-xs text-muted-foreground">
                    Stel dit ook in als <code className="bg-muted px-1 rounded">CRON_SECRET</code> in Vercel zodat de scheduler het kan gebruiken.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={saveMs} disabled={savingMs} className="gap-2">
                {savingMs ? <Loader2 className="h-4 w-4 animate-spin" /> : savedMs ? <Check className="h-4 w-4" /> : null}
                {savedMs ? "Opgeslagen!" : "Opslaan"}
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab 2: Koppelingen per project ── */}
          <TabsContent value="projects" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Project selecteren</CardTitle>
                <CardDescription>
                  Kies een project om Planner, SharePoint en Teams-webhook in te stellen.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nog geen projecten aangemaakt.</p>
                ) : (
                  <div className="space-y-1.5">
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectProject(p)}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                          selectedProject?.id === p.id
                            ? "border-indigo-300 bg-indigo-50"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="flex-1 font-medium">{p.name}</span>
                        {(p.plannerPlanId || p.sharePointDriveId || p.teamsWebhookUrl) && (
                          <span className="text-xs text-green-600 font-medium">gekoppeld</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedProject && (
              <>
                {/* Planner */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>Microsoft Planner</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={loadPlannerPlans}
                        disabled={loadingPlanner}
                      >
                        {loadingPlanner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Plannen laden
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      Actiepunten uit vergaderingen worden automatisch als Planner-taak aangemaakt.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {plannerPlans.length > 0 ? (
                      <div className="space-y-1.5">
                        <Label>Plan</Label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={projPlanId}
                          onChange={(e) => {
                            setProjPlanId(e.target.value);
                            setProjBucketId("");
                            loadBuckets(e.target.value);
                          }}
                        >
                          <option value="">— selecteer plan —</option>
                          {plannerPlans.map((p) => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label>Plan ID</Label>
                        <Input
                          value={projPlanId}
                          onChange={(e) => setProjPlanId(e.target.value)}
                          placeholder="Planner plan ID (of laad via knop hierboven)"
                        />
                      </div>
                    )}

                    {plannerBuckets.length > 0 ? (
                      <div className="space-y-1.5">
                        <Label>Bucket</Label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={projBucketId}
                          onChange={(e) => setProjBucketId(e.target.value)}
                        >
                          <option value="">— selecteer bucket —</option>
                          {plannerBuckets.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label>Bucket ID</Label>
                        <Input
                          value={projBucketId}
                          onChange={(e) => setProjBucketId(e.target.value)}
                          placeholder="Planner bucket ID"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* SharePoint */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>SharePoint</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={loadSpDrives}
                        disabled={loadingSp}
                      >
                        {loadingSp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Drives laden
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      Gegenereerde notulen worden automatisch opgeslagen in de gekozen SharePoint-locatie.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {spDrives.length > 0 ? (
                      <div className="space-y-1.5">
                        <Label>Drive / documentbibliotheek</Label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={projDriveId}
                          onChange={(e) => setProjDriveId(e.target.value)}
                        >
                          <option value="">— selecteer drive —</option>
                          {spDrives.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.siteName} › {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label>Drive ID</Label>
                        <Input
                          value={projDriveId}
                          onChange={(e) => setProjDriveId(e.target.value)}
                          placeholder="SharePoint drive ID (of laad via knop hierboven)"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label>Map</Label>
                      <Input
                        value={projFolder}
                        onChange={(e) => setProjFolder(e.target.value)}
                        placeholder="Notulen"
                      />
                      <p className="text-xs text-muted-foreground">
                        Pad in de drive, bijv. <code className="bg-muted px-1 rounded">Notulen/2026</code>
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Teams Webhook */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Teams Incoming Webhook</CardTitle>
                    <CardDescription>
                      Ontvangt notificaties over deadlines en conceptagenda&apos;s. Maak een Incoming Webhook connector aan in het gewenste Teams-kanaal en plak de URL hier.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Webhook URL</Label>
                      <Input
                        value={projWebhook}
                        onChange={(e) => setProjWebhook(e.target.value)}
                        placeholder="https://outlook.office.com/webhook/..."
                      />
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                      <p className="font-medium mb-1">Hoe instellen:</p>
                      <ol className="list-decimal list-inside space-y-0.5">
                        <li>Ga naar het Teams-kanaal → ... → Connectors</li>
                        <li>Zoek &quot;Incoming Webhook&quot; en klik Configureren</li>
                        <li>Geef het een naam (bijv. &quot;MeetingAI&quot;) en kopieer de URL</li>
                        <li>Plak de URL hierboven en sla op</li>
                      </ol>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button onClick={saveProject} disabled={savingProject} className="gap-2">
                    {savingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : savedProject ? <Check className="h-4 w-4" /> : null}
                    {savedProject ? "Opgeslagen!" : `Opslaan voor ${selectedProject.name}`}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
