"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import AudioRecorder from "@/components/meeting/AudioRecorder";
import TranscriptView from "@/components/meeting/TranscriptView";
import NotesEditor from "@/components/meeting/NotesEditor";
import ActionItemsList from "@/components/meeting/ActionItemsList";
import ChatPanel from "@/components/meeting/ChatPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wand2, Trash2, Download, Loader2, Mic, FileText,
  CheckSquare, MessageSquare, Edit2, Check, X
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatDateTime, formatDuration, platformIcon } from "@/lib/utils";
import { notesToHtml } from "@/lib/notes-format";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [rawNotes, setRawNotes] = useState("");
  const [templates, setTemplates] = useState<
    { id: string; name: string; docxPath?: string | null }[]
  >([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportFormat, setExportFormat] = useState<"word" | "pdf">("word");
  const pdfSourceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMeeting();
  }, [id]);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((list) => setTemplates(Array.isArray(list) ? list : []))
      .catch(() => setTemplates([]));
  }, []);

  async function loadMeeting() {
    const data = await fetch(`/api/meetings/${id}`).then((r) => r.json());
    setMeeting(data);
    setTitle(data.title || "");
    setRawNotes(data.notes?.rawNotes || "");
    setTemplateId(data.templateId || "");
    setLoading(false);
  }

  async function saveTitle() {
    await fetch(`/api/meetings/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setMeeting((m: any) => ({ ...m, title }));
    setEditingTitle(false);
  }

  async function generateNotes() {
    setGeneratingNotes(true);
    try {
      const res = await fetch(`/api/meetings/${id}/generate-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawNotes }),
      });
      const data = await res.json();
      setMeeting((m: any) => ({
        ...m,
        notes: data.notes,
        actionItems: data.actionItems,
        template: data.template ?? m.template,
      }));
    } finally {
      setGeneratingNotes(false);
    }
  }

  async function saveTemplateChoice(nextId: string) {
    setTemplateId(nextId);
    setSavingTemplate(true);
    try {
      await fetch(`/api/meetings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: nextId || null }),
      });
      setMeeting((m: any) => ({
        ...m,
        templateId: nextId || null,
        template: nextId ? templates.find((t) => t.id === nextId) : null,
      }));
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteMeeting() {
    if (!confirm("Deze meeting verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
    await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    router.push("/meetings");
  }

  async function exportWordSimple() {
    setExportingWord(true);
    try {
      const res = await fetch(`/api/meetings/${id}/export-word`);
      if (!res.ok) {
        alert("Word-export mislukt");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${meeting.title.replace(/[^a-z0-9]/gi, "-")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingWord(false);
    }
  }

  async function exportPdf() {
    const el = pdfSourceRef.current;
    if (!el) return;
    setExportingPdf(true);
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png", 0.92);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const maxW = pageW - 2 * margin;
      const maxH = pageH - 2 * margin;
      const imgW = maxW;
      const imgH = (canvas.height * imgW) / canvas.width;
      if (imgH <= maxH) {
        pdf.addImage(imgData, "PNG", margin, margin, imgW, imgH);
      } else {
        let remaining = imgH;
        let srcY = 0;
        const pxPerMm = canvas.width / imgW;
        while (remaining > 0) {
          const sliceMm = Math.min(maxH, remaining);
          const slicePx = sliceMm * pxPerMm;
          const slice = document.createElement("canvas");
          slice.width = canvas.width;
          slice.height = Math.min(Math.ceil(slicePx), canvas.height - srcY);
          const ctx = slice.getContext("2d");
          if (ctx && slice.height > 0) {
            ctx.drawImage(canvas, 0, srcY, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
            pdf.addImage(slice.toDataURL("image/png"), "PNG", margin, margin, imgW, sliceMm);
          }
          srcY += slice.height;
          remaining -= sliceMm;
          if (remaining > 0) pdf.addPage();
        }
      }
      pdf.save(`${meeting.title.replace(/[^a-z0-9]/gi, "-")}.pdf`);
    } catch (e) {
      console.error(e);
      alert("PDF maken mislukt. Probeer Word-export.");
    } finally {
      setExportingPdf(false);
    }
  }

  async function runExport() {
    if (exportFormat === "word") await exportWordSimple();
    else await exportPdf();
  }

  const onTranscribed = useCallback((transcript: string, newTitle: string) => {
    setMeeting((m: any) => ({
      ...m,
      status: "completed",
      title: newTitle || m.title,
      transcript: { content: transcript },
    }));
    if (newTitle) setTitle(newTitle);
  }, []);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      </MainLayout>
    );
  }

  const segments = meeting.transcript?.segments
    ? JSON.parse(meeting.transcript.segments)
    : [];

  const pendingActions = meeting.actionItems?.filter((i: any) => !i.completed).length || 0;

  const notesHtml = meeting?.notes?.content ? notesToHtml(meeting.notes.content) : "";

  return (
    <MainLayout>
      {/* Off-screen bron voor PDF (zelfde opmaak als scherm) */}
      {/* PDF: alleen verslag-HTML — zelfde als gekozen format, geen extra titel/datum/actielijst */}
      {meeting?.notes && (
        <div className="fixed left-[-9999px] top-0 w-[210mm] bg-white p-8 text-gray-900">
          <div
            ref={pdfSourceRef}
            className="prose prose-slate max-w-none text-[11pt] leading-relaxed [&_h2]:text-[1.15rem] [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5"
            dangerouslySetInnerHTML={{ __html: notesHtml || "<p></p>" }}
          />
        </div>
      )}
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{platformIcon(meeting.platform)}</span>
                {editingTitle ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTitle();
                        if (e.key === "Escape") setEditingTitle(false);
                      }}
                      className="text-xl font-semibold text-gray-900 border-b-2 border-indigo-500 outline-none bg-transparent flex-1"
                      autoFocus
                    />
                    <button onClick={saveTitle} className="text-green-600 hover:text-green-700">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingTitle(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <h1
                    className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-indigo-600 transition-colors"
                    onClick={() => setEditingTitle(true)}
                  >
                    {meeting.title}
                    <Edit2 className="inline ml-2 h-3.5 w-3.5 text-gray-400 opacity-0 group-hover:opacity-100" />
                  </h1>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                <span>{formatDateTime(meeting.createdAt)}</span>
                {meeting.duration && <span>{formatDuration(meeting.duration)}</span>}
                <Badge variant={meeting.status === "completed" ? "success" : "secondary"}>
                  {meeting.status}
                </Badge>
                {pendingActions > 0 && (
                  <Badge variant="warning">{pendingActions} open taken</Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {meeting.transcript && !meeting.notes && (
                <Button
                  onClick={generateNotes}
                  disabled={generatingNotes}
                  className="gap-2"
                  size="sm"
                >
                  {generatingNotes ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Notities genereren
                </Button>
              )}
              {meeting.notes && (
                <Button onClick={generateNotes} disabled={generatingNotes} variant="outline" size="sm" className="gap-2">
                  {generatingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Opnieuw genereren
                </Button>
              )}
              {meeting.notes && (
                <>
                  <Select
                    value={exportFormat}
                    onValueChange={(v) => setExportFormat(v as "word" | "pdf")}
                  >
                    <SelectTrigger className="w-[140px] h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="word">Word (.docx)</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={runExport}
                    disabled={exportingWord || exportingPdf}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    {exportingWord || exportingPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Downloaden
                  </Button>
                </>
              )}
              <Button onClick={deleteMeeting} variant="outline" size="sm" className="gap-2 text-red-600 hover:text-red-700 hover:border-red-200">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex gap-0">
          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Recording */}
            {meeting.status !== "completed" && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Mic className="h-4 w-4" /> Opname
                </h2>
                <AudioRecorder meetingId={id} onTranscribed={onTranscribed} />
              </div>
            )}

            {/* Template vóór genereren */}
            {meeting.transcript && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-2">
                <Label className="text-gray-800">Template voor verslag & actielijst</Label>
                <Select
                  value={templateId || "__none__"}
                  onValueChange={(v) => saveTemplateChoice(v === "__none__" ? "" : v)}
                  disabled={savingTemplate}
                >
                  <SelectTrigger className="bg-white max-w-md">
                    <SelectValue placeholder="Template" />
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
                <p className="text-xs text-gray-600">
                  Kies een template voor de verslagstructuur en actielijst-instructies.
                </p>
              </div>
            )}

            {/* Raw notes input */}
            {meeting.status !== "completed" && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Jouw notities (optioneel)</h2>
                <textarea
                  value={rawNotes}
                  onChange={(e) => setRawNotes(e.target.value)}
                  placeholder="Noteer tijdens de meeting punten die mee moeten in de AI-notities."
                  className="w-full h-32 rounded-xl border border-gray-200 p-3 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Transcript */}
            {meeting.transcript && (
              <div>
                <TranscriptView
                  content={meeting.transcript.content}
                  segments={segments}
                />
              </div>
            )}

            {/* Generated Notes */}
            {meeting.notes && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Vergadernotities
                </h2>
                <NotesEditor
                  key={meeting.notes.updatedAt || meeting.notes.id}
                  meetingId={id}
                  initialContent={meeting.notes.content}
                />
              </div>
            )}

            {/* Action Items */}
            {(meeting.actionItems?.length > 0 || meeting.notes) && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" /> Actiepunten
                </h2>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <ActionItemsList
                    meetingId={id}
                    items={meeting.actionItems || []}
                    onChange={(items) => setMeeting((m: any) => ({ ...m, actionItems: items }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Chat sidebar */}
          {meeting.transcript && (
            <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
              <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                <MessageSquare className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Chat over meeting</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatPanel
                  meetingId={id}
                  initialMessages={meeting.chatMessages || []}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
