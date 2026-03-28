import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import mammoth from "mammoth";

/** Markdown-achtige notities naar leesbare platte tekst (regels behouden). */
export function markdownToPlainText(md: string): string {
  if (!md?.trim()) return "";
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "")
    .trim();
}

/**
 * Verslag voor in Word ({{notes}}): koppen als duidelijke regels + witregels,
 * zodat het in je huisstijl-sjabloon leesbaar blijft (secties zoals in Markdown).
 */
export function markdownToWordBody(md: string): string {
  if (!md?.trim()) return "";
  let s = md
    .replace(/^######\s+(.+)$/gm, "\n\n$1\n")
    .replace(/^#####\s+(.+)$/gm, "\n\n$1\n")
    .replace(/^####\s+(.+)$/gm, "\n\n$1\n")
    .replace(/^###\s+(.+)$/gm, "\n\n$1\n")
    .replace(/^##\s+(.+)$/gm, "\n\n$1\n")
    .replace(/^#\s+(.+)$/gm, "\n\n$1\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "• ")
    .trim();
  return s.replace(/\n{4,}/g, "\n\n\n");
}

export type DocxTemplateData = {
  meetingTitle: string;
  meetingDate: string;
  notes: string;
  actionItems: string;
  /** Extra velden uit Word ({{samenvatting}}, …) — AI per sectie */
  placeholders?: Record<string, string>;
};

/** Alle {{naam}} tags uit word/document.xml (docxtemplater). */
export function extractDocxPlaceholderKeys(docxBuffer: Buffer): string[] {
  const zip = new PizZip(docxBuffer);
  const xml = zip.file("word/document.xml")?.asText() || "";
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) set.add(m[1]);
  return [...set].sort();
}

/** Voor de AI: velden die wij niet vullen (wel meetingTitle, meetingDate, actionItems). */
export function aiFillPlaceholderKeys(allKeys: string[]): string[] {
  const app = new Set(["meetingTitle", "meetingDate", "actionItems"]);
  return allKeys.filter((k) => !app.has(k));
}

/** Vul lege Word-velden vanuit Markdown (## key-naam secties) + fallback hele verslag → notes */
export function mergePlaceholdersFromNotes(
  placeholders: Record<string, string> | undefined,
  templateKeys: string[],
  notesMarkdown: string
): Record<string, string> {
  const out: Record<string, string> = { ...(placeholders || {}) };
  const md = notesMarkdown || "";
  const app = new Set(["meetingTitle", "meetingDate", "actionItems"]);
  for (const k of templateKeys) {
    if (app.has(k)) continue;
    if ((out[k] || "").trim()) continue;
    const label = k.replace(/_/g, " ");
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`##\\s*${escaped}\\s*\\n+([\\s\\S]*?)(?=\\n##|$)`, "i");
    const m = md.match(re);
    if (m?.[1]?.trim()) out[k] = m[1].trim();
  }
  if (templateKeys.includes("notes") && !(out.notes || "").trim() && md.trim()) {
    out.notes = md;
  }
  return out;
}

function escapeOoxmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type OoxmlHeadingStyles = { h1: string; h2: string; h3: string };

/** Run properties (font, kleur, grootte) uit sjabloon-paragraaf voor opmaak. */
export type OoxmlStyleRefs = {
  pStyles: OoxmlHeadingStyles;
  /** w:rPr XML per niveau (font, kleur, etc.) — leeg = Word-default */
  rPr: { h1: string; h2: string; h3: string; body: string };
};

/** Haalt w:rPr uit eerste <w:r> van een paragraaf-inner. */
function extractRunPropertiesFromParagraph(inner: string): string {
  const rMatch = inner.match(/<w:r[^>]*>([\s\S]*?)<\/w:r>/);
  if (!rMatch) return "";
  const rPrMatch = rMatch[1].match(/<w:rPr[^>]*>[\s\S]*?<\/w:rPr>/);
  return rPrMatch ? rPrMatch[0] : "";
}

/** Stijlen + run properties uit template body (voor export in huisstijl). */
function extractStyleRefsFromBody(inner: string): OoxmlStyleRefs {
  const pStyles = extractHeadingStylesFromBodyInner(inner);
  const rPr = { h1: "", h2: "", h3: "", body: "" };
  const re = /<w:p(\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  const headingRe = /<w:pStyle\s+w:val="([^"]+)"/i;
  const isH1 = (v: string) => /^(Heading1|Kop1|KOP1|Title)$/i.test(v);
  const isH2 = (v: string) => /^(Heading2|Kop2|KOP2|Subtitle)$/i.test(v);
  const isH3 = (v: string) => /^(Heading3|Kop3|KOP3)$/i.test(v);
  while ((m = re.exec(inner)) !== null) {
    const sm = m[2].match(headingRe);
    const v = sm?.[1] ?? "";
    const r = extractRunPropertiesFromParagraph(m[2]);
    if (!r) continue;
    if (isH1(v) && !rPr.h1) rPr.h1 = r;
    else if (isH2(v) && !rPr.h2) rPr.h2 = r;
    else if (isH3(v) && !rPr.h3) rPr.h3 = r;
    else if (!rPr.body && !isH1(v) && !isH2(v) && !isH3(v)) rPr.body = r;
    if (rPr.h1 && rPr.h2 && rPr.h3 && rPr.body) break;
  }
  if (!rPr.h1 && rPr.h2) rPr.h1 = rPr.h2;
  if (!rPr.h3 && rPr.h2) rPr.h3 = rPr.h2;
  if (!rPr.body) rPr.body = rPr.h2 || rPr.h1;
  return { pStyles, rPr };
}

/** Word-paragrafen; koppen + body gebruiken sjabloon-stijlen én opmaak (font, kleur). */
function markdownToOoxmlParagraphs(
  md: string,
  styles: OoxmlHeadingStyles = { h1: "Heading1", h2: "Heading2", h3: "Heading3" },
  styleRefs?: OoxmlStyleRefs | null
): string {
  if (!md?.trim()) {
    return `<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`;
  }
  const rPr = styleRefs?.rPr;
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const pushPara = (style: string | null, text: string, level: "h1" | "h2" | "h3" | "body") => {
    const t = text.trim();
    if (!t) return;
    const stylePr = style
      ? `<w:pPr><w:pStyle w:val="${escapeOoxmlText(style)}"/></w:pPr>`
      : "";
    const runPr = rPr?.[level] || "";
    const chunks: string[] = [];
    let rest = t;
    while (rest.length > 0) {
      chunks.push(rest.slice(0, 200));
      rest = rest.slice(200);
    }
    const runs = chunks
      .map(
        (c) =>
          `<w:r>${runPr}<w:t xml:space="preserve">${escapeOoxmlText(c)}</w:t></w:r>`
      )
      .join("");
    out.push(`<w:p>${stylePr}${runs}</w:p>`);
  };
  const s = styleRefs?.pStyles ?? styles;
  let buf: string[] = [];
  const flushBuf = () => {
    const text = buf.join("\n").trim();
    if (text) pushPara(null, text, "body");
    buf = [];
  };
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    if (h1) {
      flushBuf();
      pushPara(s.h1, h1[1], "h1");
      continue;
    }
    if (h2) {
      flushBuf();
      pushPara(s.h2, h2[1], "h2");
      continue;
    }
    if (h3) {
      flushBuf();
      pushPara(s.h3, h3[1], "h3");
      continue;
    }
    const plain = line
      .replace(/^#{4,6}\s+/, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1");
    if (!plain.trim()) {
      flushBuf();
      continue;
    }
    if (/^[-*•]\s/.test(plain) || /^\d+\.\s/.test(plain)) {
      buf.push(plain.replace(/^[-*]\s+/, "• ").replace(/^\d+\.\s+/, "• "));
    } else {
      buf.push(plain);
    }
  }
  flushBuf();
  return out.join("") || `<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`;
}

/**
 * Vervangt de alinea met alleen {{notes}} door gestileerde paragrafen (huisstijl-koppen).
 * NL-Word gebruikt vaak Kop1/Kop2 i.p.v. Heading1/Heading2 — we zetten dubbele blokken
 * niet; Heading1/2 zitten in elk normaal .docx. Ontbreekt de stijl, valt Word terug op Normal.
 */
/** Zichtbare tekst van één <w:p>…</w:p> (ook als Word {{notes}} over meerdere <w:t> knipt). */
function paragraphVisibleText(inner: string): string {
  return inner
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function injectNotesAsStyledParagraphs(zip: PizZip, notesMarkdown: string): boolean {
  const path = "word/document.xml";
  const f = zip.file(path);
  if (!f) return false;
  let xml = f.asText();
  const bodyOpen = xml.indexOf("<w:body");
  const bodyTagEnd = bodyOpen >= 0 ? xml.indexOf(">", bodyOpen) + 1 : 0;
  const sectIdx = xml.lastIndexOf("<w:sectPr");
  const bodyInner =
    bodyTagEnd > 0 && sectIdx > bodyTagEnd ? xml.slice(bodyTagEnd, sectIdx) : "";
  const styleRefs = bodyInner ? extractStyleRefsFromBody(bodyInner) : null;
  let replaced = false;
  xml = xml.replace(/<w:p(\s[^>]*)?>([\s\S]*?)<\/w:p>/g, (full, _pAttr: string | undefined, inner: string) => {
    const textOnly = paragraphVisibleText(inner);
    if (!/^\{\{\s*notes\s*\}\}$/i.test(textOnly)) return full;
    replaced = true;
    return markdownToOoxmlParagraphs(
      notesMarkdown,
      styleRefs?.pStyles ?? { h1: "Heading1", h2: "Heading2", h3: "Heading3" },
      styleRefs
    );
  });
  if (!replaced) return false;
  zip.file(path, xml);
  return true;
}

/** Alle word/*.xml in het pakket (headers, footers, document, enz.) voor normalisatie. */
function listWordXmlPaths(zip: PizZip): string[] {
  return Object.keys(zip.files).filter(
    (p) => p.startsWith("word/") && p.endsWith(".xml") && !zip.files[p].dir
  );
}

/**
 * Eerste Kop1/Heading1, Kop2, Kop3 uit het sjabloon →zelfde ids voor gegenereerde koppen.
 * Veel sjablonen gebruiken alleen Kop2 voor secties; dan is h1 soms Title — maakt niet uit.
 */
function extractHeadingStylesFromBodyInner(inner: string): OoxmlHeadingStyles {
  let h1 = "Heading1";
  let h2 = "Heading2";
  let h3 = "Heading3";
  const re = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const sm = m[1].match(/<w:pStyle\s+w:val="([^"]+)"/i);
    if (!sm) continue;
    const v = sm[1];
    if (/^(Heading1|Kop1|KOP1|Title)$/i.test(v) && h1 === "Heading1") h1 = v;
    if (/^(Heading2|Kop2|KOP2|Subtitle)$/i.test(v) && h2 === "Heading2") h2 = v;
    if (/^(Heading3|Kop3|KOP3)$/i.test(v) && h3 === "Heading3") h3 = v;
  }
  if (h1 === "Heading1" && h2 !== "Heading2") {
    h1 = h2;
    h3 = h3 === "Heading3" ? h2 : h3;
  }
  return { h1, h2, h3 };
}

type TemplateSection = {
  headingFull: string;
  headingText: string;
  contentFull: string;
};

/** Secties uit template body: koppen (Kop2 etc.) + inhoud tot volgende kop. */
function parseTemplateSections(inner: string): { intro: string; sections: TemplateSection[] } {
  const headingRe = /<w:pStyle\s+w:val="([^"]+)"/i;
  const isHeading = (v: string) =>
    /^(Heading1|Heading2|Heading3|Kop1|Kop2|Kop3|KOP1|KOP2|KOP3|Title|Subtitle)$/i.test(v);
  const re = /<w:p(\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  const paras: { full: string; inner: string; isHeading: boolean; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const full = `<w:p${m[1] || ""}>${m[2]}</w:p>`;
    const sm = m[2].match(headingRe);
    const styleVal = sm?.[1] ?? "";
    const he = isHeading(styleVal);
    paras.push({
      full,
      inner: m[2],
      isHeading: he,
      text: paragraphVisibleText(m[2]),
    });
  }
  let intro = "";
  const sections: TemplateSection[] = [];
  let i = 0;
  while (i < paras.length && !paras[i].isHeading) {
    intro += paras[i].full;
    i++;
  }
  while (i < paras.length) {
    if (!paras[i].isHeading) {
      i++;
      continue;
    }
    const headingFull = paras[i].full;
    const headingText = paras[i].text.trim();
    i++;
    let contentFull = "";
    while (i < paras.length && !paras[i].isHeading) {
      contentFull += paras[i].full;
      i++;
    }
    sections.push({ headingFull, headingText, contentFull });
  }
  return { intro, sections };
}

/** Secties uit notes markdown: ## Kopnaam → content. */
function parseNotesIntoSections(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /##\s+(.+?)\s*\n+([\s\S]*?)(?=\n##|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const name = m[1].trim().toLowerCase().replace(/\s+/g, " ");
    const content = m[2].trim();
    if (!out[name]) out[name] = content;
  }
  return out;
}

/** Normaliseer kopnaam voor matching (lowercase, spaties). */
function normalizeSectionName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Alleen body-paragrafen uit Markdown (geen koppen); voor sectie-inhoud. */
function markdownContentToOoxml(contentMd: string, styleRefs: OoxmlStyleRefs): string {
  if (!contentMd?.trim()) {
    return `<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`;
  }
  return markdownToOoxmlParagraphs(
    contentMd,
    styleRefs.pStyles,
    styleRefs
  );
}

/**
 * Vult de secties van het template: elke kop uit het formatdocument behoudt zijn
 * plek; de inhoud eronder wordt vervangen door de bijbehorende content uit de notities.
 */
function fillTemplateSections(
  zip: PizZip,
  data: DocxTemplateData,
  notesMd: string
): boolean {
  const path = "word/document.xml";
  const f = zip.file(path);
  if (!f) return false;
  let xml = f.asText();
  const bodyOpen = xml.indexOf("<w:body");
  if (bodyOpen < 0) return false;
  const bodyTagEnd = xml.indexOf(">", bodyOpen) + 1;
  const sectIdx = xml.lastIndexOf("<w:sectPr");
  if (sectIdx < bodyTagEnd) return false;
  const inner = xml.slice(bodyTagEnd, sectIdx);
  const { intro, sections } = parseTemplateSections(inner);
  if (sections.length < 1) return false;

  const styleRefs = extractStyleRefsFromBody(inner);
  const notesSections = parseNotesIntoSections(notesMd || "");
  const actions = (data.actionItems || "").trim();
  const hasActions = actions && actions !== "—";

  let newInner = intro;
  for (const sec of sections) {
    newInner += sec.headingFull;
    const name = normalizeSectionName(sec.headingText);
    let contentMd = notesSections[name] ?? "";
    if (/actiepunten|actie.?punten/i.test(sec.headingText) && hasActions) {
      contentMd = actions;
    } else if (/^(vergadering|titel|meeting|datum|verslag)$/i.test(name)) {
      contentMd = [data.meetingTitle || "", data.meetingDate || ""].filter(Boolean).join("\n\n");
    }
    const newContent = markdownContentToOoxml(
      contentMd || "(Geen inhoud)",
      styleRefs
    );
    newInner += newContent;
  }
  xml = xml.slice(0, bodyTagEnd) + newInner + xml.slice(sectIdx);
  zip.file(path, xml);
  return true;
}

/**
 * Zonder {{…}} in het document: probeer eerst secties te vullen (inhoud onder juiste kop).
 * Lukt dat niet (geen duidelijke structuur), voeg verslag toe na een pagina-einde.
 */
function appendStructuredReportBeforeSectPr(
  zip: PizZip,
  data: DocxTemplateData,
  notesMd: string
): boolean {
  const path = "word/document.xml";
  const f = zip.file(path);
  if (!f) return false;
  let xml = f.asText();
  const bodyOpen = xml.indexOf("<w:body");
  if (bodyOpen < 0) return false;
  const bodyTagEnd = xml.indexOf(">", bodyOpen) + 1;
  const sectIdx = xml.lastIndexOf("<w:sectPr");
  if (sectIdx < bodyTagEnd) return false;
  const inner = xml.slice(bodyTagEnd, sectIdx);
  const styleRefs = extractStyleRefsFromBody(inner);

  const actions = (data.actionItems || "").trim();
  let notesWithActions = notesMd?.trim() || "(Geen verslag.)";
  if (actions && actions !== "—") {
    const actieRe = /(##\s*Actiepunten\s*\n+)([\s\S]*?)(?=\n##|$)/i;
    if (actieRe.test(notesWithActions)) {
      notesWithActions = notesWithActions.replace(actieRe, `$1${actions}\n\n`);
    } else {
      notesWithActions = notesWithActions + `\n\n## Actiepunten\n\n${actions}`;
    }
  }
  const fullMd = [
    `# ${data.meetingTitle || "Meeting"}`,
    "",
    data.meetingDate || "",
    "",
    notesWithActions,
  ].join("\n");

  const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  const newParas = markdownToOoxmlParagraphs(
    fullMd,
    styleRefs.pStyles,
    styleRefs
  );
  const newInner = inner + pageBreak + newParas;
  xml = xml.slice(0, bodyTagEnd) + newInner + xml.slice(sectIdx);
  zip.file(path, xml);
  return true;
}

/**
 * Word knipt placeholders vaak in stukken ({{ + naam + }} in aparte <w:t>).
 * Docxtemplater herkent dan geen tag → lege export. Per alinea: als de zichtbare
 * tekst alleen {{key}} is, herschrijven naar één <w:t>{{key}}</w:t>.
 */
export function normalizeDocxPlaceholderTags(zip: PizZip, xmlPaths: string[] = ["word/document.xml"]): void {
  for (const path of xmlPaths) {
    const f = zip.file(path);
    if (!f) continue;
    let xml = f.asText();
    // Dubbele pass: geneste <w:p> in tabellen — eerst binnenste alinea's normaliseren
    let prev = "";
    let guard = 0;
    while (prev !== xml && guard++ < 8) {
      prev = xml;
      xml = xml.replace(/<w:p(\s[^>]*)?>([\s\S]*?)<\/w:p>/g, (_full, pAttr: string | undefined, inner: string) => {
        const textOnly = paragraphVisibleText(inner);
        const m = textOnly.match(/^\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}$/);
        if (!m) return `<w:p${pAttr || ""}>${inner}</w:p>`;
        const key = m[1];
        const pPrMatch = inner.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
        const pPr = pPrMatch ? pPrMatch[0] : "";
        const run = `<w:r><w:t xml:space="preserve">{{${key}}}</w:t></w:r>`;
        return `<w:p${pAttr || ""}>${pPr}${run}</w:p>`;
      });
    }
    zip.file(path, xml);
  }
}

/**
 * Vult een .docx-sjabloon.
 * - Geen {{tags}}: originele pagina’s (logo, afbeeldingen, tabellen) blijven; verslag
 *   wordt onderaan toegevoegd na een pagina-einde, met Kop1/Kop2 uit je sjabloon.
 * - Wél {{meetingTitle}}, {{notes}}, …: docxtemplater; {{notes}} in één alinea →
 *   Markdown-koppen als echte Word-koppen (zelfde stijl-id’s als in je bestand).
 */
export function fillDocxTemplate(docxBuffer: Buffer, data: DocxTemplateData): Buffer {
  const zip = new PizZip(docxBuffer);
  const allWordXml = listWordXmlPaths(zip);
  normalizeDocxPlaceholderTags(zip, allWordXml.length ? allWordXml : ["word/document.xml"]);
  const notesMd = data.placeholders?.notes ?? data.notes ?? "";
  const docXml = zip.file("word/document.xml")?.asText() || "";
  const hasPlaceholders = /\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/.test(docXml);

  if (!hasPlaceholders) {
    if (!fillTemplateSections(zip, data, notesMd)) {
      appendStructuredReportBeforeSectPr(zip, data, notesMd);
    }
    return Buffer.from(zip.generate({ type: "nodebuffer" }) as Uint8Array);
  }

  const injected = injectNotesAsStyledParagraphs(zip, notesMd);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter() {
      return "";
    },
  });
  const renderData: Record<string, string> = {
    meetingTitle: data.meetingTitle || "",
    meetingDate: data.meetingDate || "",
    notes: injected ? " " : markdownToWordBody(notesMd),
    actionItems: data.actionItems || "",
  };
  const extra = data.placeholders || {};
  for (const [k, v] of Object.entries(extra)) {
    if (k === "notes" && injected) continue;
    renderData[k] = v ?? "";
  }
  doc.render(renderData);
  const raw = doc.getZip().generate({ type: "nodebuffer" }) as Uint8Array;
  const out = Buffer.from(raw);
  const patched = patchUnresolvedPlaceholders(out, renderData);
  return Buffer.from(patched);
}

/**
 * Als na render nog {{veld}} in document.xml staat (docxtemplater zag de tag niet),
 * vervang die door platte tekst zodat de download nooit "leeg" blijft.
 */
function patchUnresolvedPlaceholders(buf: Buffer, renderData: Record<string, string>): Buffer {
  const zip = new PizZip(buf);
  const path = "word/document.xml";
  const f = zip.file(path);
  if (!f) return buf;
  let xml = f.asText();
  if (!xml.includes("{{")) return buf;
  let changed = false;
  for (const [key, val] of Object.entries(renderData)) {
    if (val === undefined || val === null) continue;
    const escaped = escapeOoxmlText(String(val));
    const safe = `<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r>`;
    const re = new RegExp(
      `<w:r[^>]*>[\\s\\S]*?<w:t[^>]*>\\{\\{\\s*${key.replace(/[^a-zA-Z0-9_]/g, "")}\\s*\\}\\}</w:t>[\\s\\S]*?</w:r>`,
      "gi"
    );
    if (re.test(xml)) {
      xml = xml.replace(re, safe);
      changed = true;
    }
    const literal = `{{${key}}}`;
    if (xml.includes(literal)) {
      xml = xml.split(literal).join(escaped);
      changed = true;
    }
  }
  if (!changed) return buf;
  zip.file(path, xml);
  return Buffer.from(zip.generate({ type: "nodebuffer" }));
}

/**
 * Haalt uit een .docx de leesbare structuur (koppen, alinea's) als Markdown.
 * Gebruikt bij het genereren van het verslag zodat de AI dezelfde secties en volgorde
 * volgt als in je Word-sjabloon. Opmaak in Word blijft behouden bij export (docxtemplater).
 */
/** HTML van mammoth omzetten naar Markdown-achtige outline (koppen + alinea's). */
function htmlOutlineToMarkdown(html: string): string {
  let s = html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `# ${stripTags(t).trim()}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `## ${stripTags(t).trim()}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `### ${stripTags(t).trim()}\n\n`)
    .replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, (_, t) => `#### ${stripTags(t).trim()}\n\n`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => {
      const line = stripTags(t).trim();
      return line ? `${line}\n\n` : "";
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

const HEADING_STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  // Nederlandse Word-stijlen
  "p[style-name='Kop1'] => h1:fresh",
  "p[style-name='Kop2'] => h2:fresh",
  "p[style-name='Kop3'] => h3:fresh",
  "p[style-name='Kop4'] => h4:fresh",
  "p[style-name='KOP1'] => h1:fresh",
  "p[style-name='KOP2'] => h2:fresh",
  "p[style-name='KOP3'] => h3:fresh",
];

export async function extractDocxStructureAsMarkdown(docxBuffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml(
    { buffer: docxBuffer },
    { styleMap: HEADING_STYLE_MAP }
  );
  const md = htmlOutlineToMarkdown(value || "");
  if (!md) {
    const raw = await mammoth.extractRawText({ buffer: docxBuffer });
    return (raw.value || "").trim().slice(0, 12000);
  }
  return md.slice(0, 12000);
}
