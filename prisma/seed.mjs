/**
 * Seed script – ruime testdata voor AI-Meetings
 * Gebruik: node prisma/seed.mjs
 *
 * Maakt aan (voor de eerste bestaande user, of een nieuwe demo-user):
 *  - 3 Folders
 *  - 5 Tags
 *  - 2 Templates
 *  - 3 Projects (elk met deelnemers)
 *  - 12 Meetings (mix van draft + completed, verspreid over de afgelopen 3 maanden)
 *    elk met Transcript, Notes, ActionItems, Participants, ChatMessages
 */

import { randomUUID } from "crypto";
import pg from "pg";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function q(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

function cuid() {
  // Eenvoudige cuid-achtige id voor seeddata
  return "c" + randomUUID().replace(/-/g, "").slice(0, 24);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function main() {
  console.log("🌱  Start seeden…");

  // ── 0. User ────────────────────────────────────────────────────────────────
  let users = await q(`SELECT id FROM "User" LIMIT 1`);
  let userId;
  if (users.length > 0) {
    userId = users[0].id;
    console.log(`   Gebruik bestaande user: ${userId}`);
  } else {
    userId = cuid();
    await q(
      `INSERT INTO "User"(id, email, name, "createdAt", "updatedAt")
       VALUES($1, $2, $3, NOW(), NOW())`,
      [userId, "demo@ai-meetings.app", "Demo Gebruiker"]
    );
    console.log(`   Nieuwe demo-user aangemaakt: ${userId}`);
  }

  // ── 1. Folders ─────────────────────────────────────────────────────────────
  const folderIds = [];
  const folders = [
    { name: "Klantgesprekken", color: "#3b82f6" },
    { name: "Interne Standups", color: "#10b981" },
    { name: "Strategiesessies", color: "#f59e0b" },
  ];
  for (const f of folders) {
    const existing = await q(
      `SELECT id FROM "Folder" WHERE "userId"=$1 AND name=$2 LIMIT 1`,
      [userId, f.name]
    );
    if (existing.length > 0) {
      folderIds.push(existing[0].id);
    } else {
      const id = cuid();
      await q(
        `INSERT INTO "Folder"(id, name, color, "userId", "createdAt", "updatedAt")
         VALUES($1,$2,$3,$4,NOW(),NOW())`,
        [id, f.name, f.color, userId]
      );
      folderIds.push(id);
    }
  }
  console.log(`   ✓ ${folders.length} folders`);

  // ── 2. Tags ────────────────────────────────────────────────────────────────
  const tagIds = [];
  const tags = [
    { name: "urgent", color: "#ef4444" },
    { name: "product", color: "#8b5cf6" },
    { name: "sales", color: "#f97316" },
    { name: "engineering", color: "#06b6d4" },
    { name: "design", color: "#ec4899" },
  ];
  for (const t of tags) {
    const existing = await q(
      `SELECT id FROM "Tag" WHERE name=$1 LIMIT 1`,
      [t.name]
    );
    if (existing.length > 0) {
      tagIds.push(existing[0].id);
    } else {
      const id = cuid();
      await q(
        `INSERT INTO "Tag"(id, name, color) VALUES($1,$2,$3)`,
        [id, t.name, t.color]
      );
      tagIds.push(id);
    }
  }
  console.log(`   ✓ ${tags.length} tags`);

  // ── 3. Templates ───────────────────────────────────────────────────────────
  const templateIds = [];
  const templates = [
    {
      name: "Standaard vergadernotitie",
      description: "Basistemplaat met agendapunten, besluiten en actiepunten.",
      content: `## {{titel}}\n**Datum:** {{datum}}\n**Aanwezigen:** {{aanwezigen}}\n\n### Agendapunten\n{{agendapunten}}\n\n### Besluiten\n{{besluiten}}\n\n### Actiepunten\n{{actiepunten}}`,
      isDefault: true,
    },
    {
      name: "Klantgesprek template",
      description: "Sjabloon specifiek voor klantgesprekken met feedback-sectie.",
      content: `## Klantgesprek – {{klant}}\n**Datum:** {{datum}}\n**Contactpersoon:** {{contactpersoon}}\n\n### Besproken onderwerpen\n{{onderwerpen}}\n\n### Klantfeedback\n{{feedback}}\n\n### Volgende stappen\n{{actiepunten}}`,
      isDefault: false,
    },
  ];
  for (const t of templates) {
    const existing = await q(
      `SELECT id FROM "Template" WHERE "userId"=$1 AND name=$2 LIMIT 1`,
      [userId, t.name]
    );
    if (existing.length > 0) {
      templateIds.push(existing[0].id);
    } else {
      const id = cuid();
      await q(
        `INSERT INTO "Template"(id, name, description, content, "isDefault", "isPublic", "userId", "createdAt", "updatedAt")
         VALUES($1,$2,$3,$4,$5,false,$6,NOW(),NOW())`,
        [id, t.name, t.description, t.content, t.isDefault, userId]
      );
      templateIds.push(id);
    }
  }
  console.log(`   ✓ ${templates.length} templates`);

  // ── 4. Projects ────────────────────────────────────────────────────────────
  const projectIds = [];
  const projects = [
    { name: "Website Redesign 2026", color: "#8b5cf6" },
    { name: "Q2 Sales Campagne", color: "#f97316" },
    { name: "Platform Migratie", color: "#06b6d4" },
  ];
  for (const p of projects) {
    const existing = await q(
      `SELECT id FROM "Project" WHERE "userId"=$1 AND name=$2 LIMIT 1`,
      [userId, p.name]
    );
    if (existing.length > 0) {
      projectIds.push(existing[0].id);
    } else {
      const id = cuid();
      await q(
        `INSERT INTO "Project"(id, name, color, "userId", "createdAt", "updatedAt")
         VALUES($1,$2,$3,$4,NOW(),NOW())`,
        [id, p.name, p.color, userId]
      );
      projectIds.push(id);
    }
  }
  console.log(`   ✓ ${projects.length} projects`);

  // Project deelnemers
  const projectParticipantData = [
    { projectId: projectIds[0], name: "Sophie de Vries", email: "sophie@example.com", role: "Product Owner" },
    { projectId: projectIds[0], name: "Lars Bakker", email: "lars@example.com", role: "Lead Developer" },
    { projectId: projectIds[0], name: "Emma Jansen", email: "emma@example.com", role: "UX Designer" },
    { projectId: projectIds[1], name: "Tom Willems", email: "tom@example.com", role: "Sales Manager" },
    { projectId: projectIds[1], name: "Nina van Dam", email: "nina@example.com", role: "Account Executive" },
    { projectId: projectIds[2], name: "David Smit", email: "david@example.com", role: "Tech Lead" },
    { projectId: projectIds[2], name: "Anna Peters", email: "anna@example.com", role: "DevOps Engineer" },
  ];
  for (const pp of projectParticipantData) {
    const existing = await q(
      `SELECT id FROM "ProjectParticipant" WHERE "projectId"=$1 AND name=$2 LIMIT 1`,
      [pp.projectId, pp.name]
    );
    if (existing.length === 0) {
      await q(
        `INSERT INTO "ProjectParticipant"(id, "projectId", name, email, role, "createdAt", "updatedAt")
         VALUES($1,$2,$3,$4,$5,NOW(),NOW())`,
        [cuid(), pp.projectId, pp.name, pp.email, pp.role]
      );
    }
  }
  console.log(`   ✓ ${projectParticipantData.length} project-deelnemers`);

  // Project action items
  const projectActionItems = [
    { projectId: projectIds[0], title: "Wireframes goedkeuren door stakeholders", assignee: "Emma Jansen", dueDate: daysAgo(-7), completed: false },
    { projectId: projectIds[0], title: "Design system documenteren", assignee: "Emma Jansen", dueDate: daysAgo(-14), completed: true },
    { projectId: projectIds[0], title: "Nieuwe homepage live zetten op staging", assignee: "Lars Bakker", dueDate: daysAgo(-3), completed: false },
    { projectId: projectIds[1], title: "E-mailcampagne inhoud finaliseren", assignee: "Nina van Dam", dueDate: daysAgo(-5), completed: false },
    { projectId: projectIds[1], title: "CRM-leads segmenteren voor Q2", assignee: "Tom Willems", dueDate: daysAgo(-10), completed: true },
    { projectId: projectIds[2], title: "Database-migratiescript schrijven", assignee: "David Smit", dueDate: daysAgo(-2), completed: false },
    { projectId: projectIds[2], title: "Load-test uitvoeren op nieuwe infra", assignee: "Anna Peters", dueDate: daysAgo(-8), completed: false },
  ];
  for (const ai of projectActionItems) {
    const existing = await q(
      `SELECT id FROM "ActionItem" WHERE "projectId"=$1 AND title=$2 AND "meetingId" IS NULL LIMIT 1`,
      [ai.projectId, ai.title]
    );
    if (existing.length === 0) {
      await q(
        `INSERT INTO "ActionItem"(id, "projectId", title, assignee, "dueDate", completed, "createdAt", "updatedAt")
         VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
        [cuid(), ai.projectId, ai.title, ai.assignee, ai.dueDate, ai.completed]
      );
    }
  }
  console.log(`   ✓ ${projectActionItems.length} project-actiepunten`);

  // ── 5. Meetings ────────────────────────────────────────────────────────────
  const meetingDefs = [
    {
      title: "Kick-off Website Redesign",
      status: "completed",
      platform: "Teams",
      daysAgo: 85,
      duration: 3600,
      folderId: folderIds[2],
      projectId: projectIds[0],
      templateId: templateIds[0],
      tagIdxs: [1, 4],
      participants: [
        { name: "Sophie de Vries", email: "sophie@example.com", role: "Voorzitter" },
        { name: "Lars Bakker", email: "lars@example.com", role: "Developer" },
        { name: "Emma Jansen", email: "emma@example.com", role: "Designer" },
      ],
      transcript: `Sophie: Welkom iedereen bij de kick-off van het website redesign project. Ik wil graag beginnen met de doelstellingen.
Lars: Dank je wel Sophie. Ik heb al wat technische analyses gedaan en denk dat we React kunnen behouden voor het frontend.
Emma: Ik heb al een aantal mood boards gemaakt. Die deel ik na de meeting. De richting is modern, clean en toegankelijk.
Sophie: Perfect. Dan hebben we ook nog het tijdplan. We mikken op Q3 voor de livegang.
Lars: Dat is ambitieus maar haalbaar als we de sprints goed plannen.
Emma: Ik heb ook feedback gevraagd aan de marketing afdeling. Zij willen meer nadruk op conversie.
Sophie: Goed punt. Lars, kun jij de technische requirements documenteren voor volgende week?
Lars: Absoluut, ik heb dat vrijdag klaar.
Emma: En ik zorg voor de wireframes van de homepage en over-ons pagina.
Sophie: Geweldig. Dan sluit ik de meeting. Volgende week dinsdag zelfde tijd.`,
      summary: "Kick-off vergadering voor het website redesign project. Doelstellingen vastgesteld, tijdlijn Q3 besproken, taken verdeeld.",
      notes: `## Kick-off Website Redesign\n\n**Aanwezigen:** Sophie de Vries, Lars Bakker, Emma Jansen\n\n### Doelstellingen\n- Modern en toegankelijk design\n- Focus op conversie (feedback marketing)\n- Livegang Q3 2026\n\n### Technisch\n- Frontend: React blijft behouden\n- Lars maakt technische requirements (deadline vrijdag)\n\n### Design\n- Emma heeft mood boards gemaakt\n- Wireframes homepage + over-ons pagina volgende week\n\n### Beslissingen\n- Tijdlijn: Q3 livegang\n- Wekelijkse check-ins elke dinsdag`,
      actionItems: [
        { title: "Technische requirements documenteren", assignee: "Lars Bakker", daysUntilDue: -78, completed: true },
        { title: "Wireframes homepage en over-ons pagina maken", assignee: "Emma Jansen", daysUntilDue: -78, completed: true },
        { title: "Mood boards delen via Slack", assignee: "Emma Jansen", daysUntilDue: -84, completed: true },
      ],
      chatMessages: [
        { role: "user", content: "Wat waren de belangrijkste beslissingen in deze meeting?" },
        { role: "assistant", content: "De drie belangrijkste beslissingen waren: (1) livegang gericht op Q3 2026, (2) het React-framework wordt behouden voor de frontend, en (3) er wordt wekelijks een check-in gepland op dinsdagochtend." },
      ],
    },
    {
      title: "Sprint Review – Website Redesign Sprint 3",
      status: "completed",
      platform: "Zoom",
      daysAgo: 60,
      duration: 2700,
      folderId: folderIds[2],
      projectId: projectIds[0],
      templateId: templateIds[0],
      tagIdxs: [1, 3],
      participants: [
        { name: "Sophie de Vries", email: "sophie@example.com", role: "Product Owner" },
        { name: "Lars Bakker", email: "lars@example.com", role: "Developer" },
        { name: "Emma Jansen", email: "emma@example.com", role: "Designer" },
      ],
      transcript: `Sophie: Laten we beginnen met de demo van sprint 3.
Lars: Ik heb de nieuwe navigatiecomponent klaar. Laat me even delen.
Emma: De animaties zien er goed uit Lars, maar ik denk dat de overgangssnelheid iets hoger kan.
Lars: Dat pas ik aan. Ik heb ook de performance verbeterd, laadtijd is 40% sneller.
Sophie: Geweldig! En hoe zit het met de mobiele versie?
Lars: Die is nog niet af. Ik heb iets meer tijd nodig.
Emma: Ik kan helpen met de CSS als dat nodig is.
Sophie: Goed. Laten we de mobiele versie prioriteren voor sprint 4.`,
      summary: "Sprint 3 review: navigatiecomponent klaar, 40% snellere laadtijd. Mobiele versie nog niet af, geprioriteerd voor sprint 4.",
      notes: `## Sprint Review – Sprint 3\n\n**Velociteit:** 34 story points\n\n### Opgeleverd\n- Nieuwe navigatiecomponent\n- 40% snellere laadtijd (performance optimalisatie)\n- Homepage design geïmplementeerd\n\n### Niet opgeleverd\n- Mobiele versie (carry-over naar sprint 4)\n\n### Sprint 4 prioriteiten\n1. Mobiele responsiveness\n2. Over-ons pagina\n3. Contact formulier`,
      actionItems: [
        { title: "Animatiesnelheid navigatie aanpassen", assignee: "Lars Bakker", daysUntilDue: -55, completed: true },
        { title: "Mobiele versie afronden", assignee: "Lars Bakker", daysUntilDue: -46, completed: false },
      ],
      chatMessages: [],
    },
    {
      title: "Q2 Sales Campagne Planning",
      status: "completed",
      platform: "Teams",
      daysAgo: 70,
      duration: 4200,
      folderId: folderIds[0],
      projectId: projectIds[1],
      templateId: templateIds[1],
      tagIdxs: [2, 0],
      participants: [
        { name: "Tom Willems", email: "tom@example.com", role: "Manager" },
        { name: "Nina van Dam", email: "nina@example.com", role: "Account Executive" },
        { name: "Mark van den Berg", email: "mark@example.com", role: "Marketing" },
      ],
      transcript: `Tom: Laten we de Q2 campagne plannen. We hebben een doel van €500k extra omzet.
Nina: Ik heb al contact gehad met 15 warme leads. Als we die goed opvolgen halen we €150k.
Mark: De email campagne die ik heb opgezet heeft een open rate van 28%, dat is boven gemiddeld.
Tom: Goed. We moeten ook de LinkedIn advertenties uitbreiden.
Nina: Ik stel voor om een serie van 3 webinars te organiseren. Dat genereert altijd goede leads.
Tom: Uitstekend idee. Mark, kun jij de promotie verzorgen?
Mark: Ja, ik plan dat in voor week 15, 17 en 19.
Tom: Dan moeten we ook de onboarding verbeteren. Klanten haken nu te vroeg af.
Nina: Ik heb data waaruit blijkt dat de eerste 30 dagen kritiek zijn. We moeten een betere begeleiding bieden.
Tom: Akkoord. Laten we een onboarding checklist maken.`,
      summary: "Q2 sales campagne planning: doel €500k extra omzet. 3 webinars gepland, LinkedIn advertenties uitbreiden, onboarding verbeteren.",
      notes: `## Q2 Sales Campagne Planning\n\n**Doel:** €500.000 extra omzet in Q2\n\n### Pipeline\n- 15 warme leads in pipeline (Nina) → verwachte waarde €150k\n- Email campagne: 28% open rate (boven gemiddeld)\n\n### Acties\n1. **Webinars** (week 15, 17, 19) – Mark verzorgt promotie\n2. **LinkedIn advertenties** uitbreiden\n3. **Onboarding verbeteren** – checklist maken voor eerste 30 dagen\n\n### KPI's\n- Open rate email: >25%\n- Webinar aanmeldingen: >50 per event\n- Churn eerste maand: <10%`,
      actionItems: [
        { title: "Webinar serie plannen en promoten (week 15, 17, 19)", assignee: "Mark van den Berg", daysUntilDue: -50, completed: true },
        { title: "LinkedIn advertentiebudget verhogen", assignee: "Tom Willems", daysUntilDue: -65, completed: true },
        { title: "Onboarding checklist schrijven", assignee: "Nina van Dam", daysUntilDue: -60, completed: false },
      ],
      chatMessages: [
        { role: "user", content: "Wat is het totale budget dat besproken is?" },
        { role: "assistant", content: "Er is geen specifiek budget besproken in de meeting. Wel is het omzetdoel vastgesteld op €500.000 extra omzet in Q2." },
      ],
    },
    {
      title: "Platform Migratie – Technische Kickoff",
      status: "completed",
      platform: "Zoom",
      daysAgo: 55,
      duration: 5400,
      folderId: folderIds[2],
      projectId: projectIds[2],
      templateId: templateIds[0],
      tagIdxs: [3, 0],
      participants: [
        { name: "David Smit", email: "david@example.com", role: "Tech Lead" },
        { name: "Anna Peters", email: "anna@example.com", role: "DevOps" },
        { name: "Joris Hendriks", email: "joris@example.com", role: "Backend Developer" },
      ],
      transcript: `David: Dank voor jullie aanwezigheid. We gaan vandaag de technische aanpak voor de platform migratie bepalen.
Anna: Ik heb al de huidige infrastructuur gedocumenteerd. We draaien op AWS maar gaan naar Azure.
Joris: De grootste uitdaging is de database migratie. We hebben 50GB aan productiedata.
David: We moeten een zero-downtime strategie gebruiken. Blauw-groen deployment?
Anna: Dat is haalbaar. Ik stel voor om eerst de staging-omgeving te migreren.
Joris: Goed idee. We kunnen dan ook de performance vergelijken.
David: Oké. Anna, kun jij het migratiescript schrijven voor de database?
Anna: Ja, ik heb dat in 2 weken klaar.
Joris: Ik ga ondertussen de API endpoints refactoren die Azure-specifiek zijn.
David: Perfect. Laten we wekelijks een technisch overleg plannen.`,
      summary: "Technische kickoff platform migratie van AWS naar Azure. Zero-downtime strategie via blauw-groen deployment. Migratiescript en API refactor als eerste stappen.",
      notes: `## Platform Migratie – Technische Kickoff\n\n**Scope:** AWS → Azure migratie\n**Data:** 50GB productiedata\n\n### Strategie\n- **Deployment:** Blauw-groen voor zero downtime\n- **Volgorde:** Eerst staging, dan productie\n- **Monitoring:** Performance vergelijking staging vs. productie\n\n### Technische taken\n1. Database migratiescript (Anna, 2 weken)\n2. API endpoints refactoren voor Azure (Joris)\n3. Staging-omgeving opzetten (Anna)\n\n### Risico's\n- Data-integriteit tijdens migratie\n- Downtime-risco bij cutover\n- Azure-specifieke services (bijv. storage, queues)`,
      actionItems: [
        { title: "Database migratiescript schrijven", assignee: "Anna Peters", daysUntilDue: -41, completed: false },
        { title: "Azure-specifieke API endpoints refactoren", assignee: "Joris Hendriks", daysUntilDue: -35, completed: false },
        { title: "Staging-omgeving opzetten op Azure", assignee: "Anna Peters", daysUntilDue: -45, completed: true },
        { title: "Wekelijks technisch overleg inplannen", assignee: "David Smit", daysUntilDue: -54, completed: true },
      ],
      chatMessages: [
        { role: "user", content: "Wanneer is de migratie gepland?" },
        { role: "assistant", content: "Er is geen harde datum voor de volledige migratie besproken. Wel is afgesproken dat het migratiescript binnen 2 weken klaar is, en dat eerst de staging-omgeving gemigreerd wordt voordat productie aangepakt wordt." },
        { role: "user", content: "Wat zijn de grootste risico's?" },
        { role: "assistant", content: "De drie voornaamste risico's zijn: (1) data-integriteit tijdens de database-migratie van 50GB productiedata, (2) mogelijke downtime bij de cutover van productie, en (3) Azure-specifieke services die anders werken dan AWS-equivalenten." },
      ],
    },
    {
      title: "Standup – Engineering Week 12",
      status: "completed",
      platform: "Slack Huddle",
      daysAgo: 20,
      duration: 900,
      folderId: folderIds[1],
      projectId: null,
      templateId: null,
      tagIdxs: [3],
      participants: [
        { name: "Lars Bakker", email: "lars@example.com", role: "Developer" },
        { name: "David Smit", email: "david@example.com", role: "Tech Lead" },
        { name: "Joris Hendriks", email: "joris@example.com", role: "Developer" },
      ],
      transcript: `Lars: Goedemorgen. Ik ben gisteren verder gegaan met de mobiele versie. Verwacht dat ik vandaag klaar ben.
David: Goed. Ik ben bezig met de Azure connectie. Loopt iets vertraging op door een authenticatie-issue.
Joris: Ik heb de eerste drie API endpoints klaar. Werk vandaag aan de volgende batch.
Lars: Joris, heb je al de nieuwe authenticatie library getest?
Joris: Nog niet, staat op de lijst voor vanmiddag.
David: Ik kan jullie na de standup helpen met de auth, ik heb er gisteren ook in gedoken.
Lars: Prima, kort afstemmen na de call.`,
      summary: "Korte standup: mobiele versie bijna klaar (Lars), Azure auth-issue (David), API endpoints in progress (Joris).",
      notes: `## Standup Week 12\n\n| Persoon | Gisteren | Vandaag | Blocker |\n|---------|----------|---------|--------|\n| Lars | Mobiele versie | Afronden mobiel | - |\n| David | Azure connectie | Auth-issue oplossen | Auth-probleem Azure |\n| Joris | API endpoints (3/8) | Volgende batch | - |\n\n**Follow-up:** David helpt met auth na standup`,
      actionItems: [
        { title: "Azure authenticatie-issue oplossen", assignee: "David Smit", daysUntilDue: -19, completed: true },
        { title: "Nieuwe auth library testen", assignee: "Joris Hendriks", daysUntilDue: -19, completed: true },
      ],
      chatMessages: [],
    },
    {
      title: "Klantgesprek – Acme Corp Feedback",
      status: "completed",
      platform: "Zoom",
      daysAgo: 30,
      duration: 3000,
      folderId: folderIds[0],
      projectId: null,
      templateId: templateIds[1],
      tagIdxs: [2, 0],
      participants: [
        { name: "Nina van Dam", email: "nina@example.com", role: "Account Executive" },
        { name: "Karel Acme", email: "karel@acme.com", role: "Klant – CTO" },
        { name: "Lisa Acme", email: "lisa@acme.com", role: "Klant – Product Manager" },
      ],
      transcript: `Nina: Dank voor jullie tijd. We willen graag jullie ervaringen van de afgelopen maand bespreken.
Karel: We zijn over het algemeen tevreden. De integratie met ons ERP-systeem werkt goed.
Lisa: Wat ons opvalt is dat de rapportage-module wat traag is. Grote exports duren soms 5 minuten.
Nina: Dat nemen we serieus. Ik zal dit doorspelen aan ons engineering team.
Karel: We hadden ook gevraagd om een white-label optie. Is dat al in de planning?
Nina: We hebben dat besproken intern en het staat gepland voor Q4. Ik mail jullie de details.
Lisa: Verder zijn we erg blij met de support. Response tijd is altijd snel.
Karel: Klopt. Dat is echt een pluspunt.
Nina: Fijn om te horen. Nog andere punten?
Lisa: Nee, dat was het. Oh, wachten – kunnen we een API voor data-export krijgen?
Nina: Dat is een goed idee. Ik zet het als feature request door.`,
      summary: "Acme Corp is tevreden. Rapportage-module traag bij grote exports. White-label gepland Q4. Feature request: data-export API.",
      notes: `## Klantgesprek Acme Corp\n\n**Klant:** Acme Corp (Karel, Lisa)\n**Account Executive:** Nina van Dam\n\n### Positieve punten\n- ERP-integratie werkt goed\n- Support response tijd uitstekend\n\n### Aandachtspunten\n- Rapportage-module traag bij grote exports (>5 min)\n- White-label gewenst\n\n### Feature requests\n1. White-label optie (gepland Q4)\n2. Data-export API (nieuw verzoek)\n\n### Opvolging\n- Nina stuurt details white-label planning\n- Engineering informeren over performance rapportage`,
      actionItems: [
        { title: "Performance rapportage-module doorgeven aan engineering", assignee: "Nina van Dam", daysUntilDue: -28, completed: true },
        { title: "White-label planning details sturen naar Acme", assignee: "Nina van Dam", daysUntilDue: -27, completed: true },
        { title: "Data-export API als feature request aanmaken", assignee: "Nina van Dam", daysUntilDue: -25, completed: false },
      ],
      chatMessages: [
        { role: "user", content: "Wat zijn de klachten van Acme?" },
        { role: "assistant", content: "Acme heeft twee punten van zorg geuit: (1) de rapportage-module is traag bij grote exports – soms meer dan 5 minuten wachttijd, en (2) ze wensen een white-label optie die nog niet beschikbaar is (wel gepland voor Q4)." },
      ],
    },
    {
      title: "Design Review – Nieuwe Component Library",
      status: "completed",
      platform: "Figma + Google Meet",
      daysAgo: 45,
      duration: 2400,
      folderId: folderIds[2],
      projectId: projectIds[0],
      templateId: templateIds[0],
      tagIdxs: [4, 1],
      participants: [
        { name: "Emma Jansen", email: "emma@example.com", role: "Lead Designer" },
        { name: "Sophie de Vries", email: "sophie@example.com", role: "Product Owner" },
        { name: "Lars Bakker", email: "lars@example.com", role: "Frontend Developer" },
      ],
      transcript: `Emma: Ik wil jullie vandaag de nieuwe component library laten zien. Ik heb zo'n 40 componenten ontworpen.
Sophie: Wauw, dat is indrukwekkend Emma. Kunnen we beginnen met de meest gebruikte?
Emma: Zeker. Hier zijn de buttons. Ik heb primair, secundair en destructief. Elke variant heeft hover, focus en disabled states.
Lars: Ziet er schoon uit. Hoe zit het met de dark mode?
Emma: Die is ook ingebouwd. Kijk, hier is de toggle.
Sophie: Fantastisch. En de typografie?
Emma: Ik gebruik Inter als basis font. Ik heb H1 tot H6 en body tekst in S, M en L.
Lars: Is er ook een storybook?
Emma: Ja, die bouw ik volgende week. Dan kunnen jullie alle componenten interactief testen.
Sophie: Perfect. Ik keur de library goed. Lars, wanneer kun je beginnen met implementeren?
Lars: Na de storybook, dus over 2 weken.`,
      summary: "Design review component library: 40 componenten goedgekeurd, dark mode ingebouwd, Inter font, storybook volgende week beschikbaar.",
      notes: `## Design Review – Component Library\n\n### Componenten (40 totaal)\n- Buttons (primary, secondary, destructive)\n- Forms (input, select, checkbox, radio)\n- Navigation (menu, breadcrumb, tabs)\n- Feedback (alert, toast, modal)\n- Layout (card, grid, divider)\n\n### Design beslissingen\n- **Font:** Inter (400, 500, 600, 700)\n- **Dark mode:** Volledig ondersteund via CSS variables\n- **Spacing:** 4px grid systeem\n\n### Volgende stappen\n1. Storybook bouwen (Emma, volgende week)\n2. Implementatie starten (Lars, over 2 weken)\n\n**Status:** ✅ Goedgekeurd door Sophie`,
      actionItems: [
        { title: "Storybook bouwen voor component library", assignee: "Emma Jansen", daysUntilDue: -38, completed: true },
        { title: "Component library implementeren in codebase", assignee: "Lars Bakker", daysUntilDue: -24, completed: false },
      ],
      chatMessages: [],
    },
    {
      title: "Sales Team Standup – Maandag",
      status: "completed",
      platform: "Teams",
      daysAgo: 7,
      duration: 1200,
      folderId: folderIds[1],
      projectId: projectIds[1],
      templateId: null,
      tagIdxs: [2],
      participants: [
        { name: "Tom Willems", email: "tom@example.com", role: "Manager" },
        { name: "Nina van Dam", email: "nina@example.com", role: "Account Executive" },
        { name: "Sander Koops", email: "sander@example.com", role: "SDR" },
      ],
      transcript: `Tom: Goedemorgen team. Hoe staan we er voor?
Nina: Ik heb vorige week 3 deals gesloten voor €45k totaal. Pipeline ziet er goed uit.
Sander: Ik heb 12 nieuwe leads gegenereerd via LinkedIn. 4 hebben een discovery call ingepland.
Tom: Uitstekend werk. Hoe staat de webinar aanmelding er voor?
Nina: We zitten op 67 aanmeldingen voor de eerste webinar. Doel was 50, dus we zitten er boven.
Tom: Geweldig! Sander, hoe gaat het met het cold outreach programma?
Sander: Open rate is 31%, click rate 8%. Dat is boven benchmark.
Tom: Goed werk allemaal. Doelen voor deze week?
Nina: Ik ga de 3 warme leads opvolgen en probeer nog 2 deals te sluiten.
Sander: Ik ga door met outreach en probeer 15 nieuwe leads te genereren.`,
      summary: "Sales standup: €45k gesloten deals, 67 webinar aanmeldingen (doel: 50). Cold outreach presteert boven benchmark.",
      notes: `## Sales Standup – Maandag\n\n### Resultaten vorige week\n- **Gesloten deals:** €45k (3 deals) – Nina\n- **Nieuwe leads:** 12 via LinkedIn – Sander\n- **Webinar aanmeldingen:** 67 (doel: 50) ✅\n- **Cold outreach:** 31% open, 8% click\n\n### Doelen deze week\n- Nina: 2 deals sluiten\n- Sander: 15 nieuwe leads genereren\n\n### Pipeline status\n- Discovery calls ingepland: 4`,
      actionItems: [
        { title: "Warme leads opvolgen (3 stuks)", assignee: "Nina van Dam", daysUntilDue: -4, completed: false },
        { title: "15 nieuwe LinkedIn leads genereren", assignee: "Sander Koops", daysUntilDue: 0, completed: false },
      ],
      chatMessages: [],
    },
    {
      title: "1:1 – Sophie & Lars",
      status: "completed",
      platform: "In Person",
      daysAgo: 14,
      duration: 1800,
      folderId: null,
      projectId: projectIds[0],
      templateId: null,
      tagIdxs: [],
      participants: [
        { name: "Sophie de Vries", email: "sophie@example.com", role: "Product Owner" },
        { name: "Lars Bakker", email: "lars@example.com", role: "Developer" },
      ],
      transcript: `Sophie: Lars, hoe gaat het met je? Niet alleen werk, ook persoonlijk.
Lars: Eerlijk gezegd een beetje druk. De combinatie van het redesign en de migratie is veel.
Sophie: Dat begrijp ik. Wat kunnen we doen om dat te verlichten?
Lars: Ik denk dat het helpt als ik wat minder meetings heb. Ik verlies veel flow-tijd.
Sophie: Terecht. Ik ga kijken welke meetings je kunt skipppen. Wat is je focus voor komende sprint?
Lars: Ik wil de mobiele versie echt afkrijgen. Die slepen al 2 sprints mee.
Sophie: Akkoord. Ik maak er de hoogste prioriteit van. Nog andere blokkades?
Lars: De API van de nieuwe CMS is slecht gedocumenteerd. Ik verlies daar veel tijd aan.
Sophie: Ik stuur een mail naar de leverancier voor betere documentatie.`,
      summary: "1:1 Lars en Sophie: Lars ervaart hoge werkdruk door combinatie projecten. Focus op mobiele versie sprint, minder meetings, CMS API documentatie probleem.",
      notes: `## 1:1 Sophie & Lars\n\n### Wellbeing\n- Lars ervaart hoge werkdruk (redesign + migratie parallel)\n- Actie: Sophie kijkt naar meetings die Lars kan overslaan\n\n### Focus komende sprint\n- Mobiele versie (hoogste prioriteit)\n- Technische schuld CMS integratie\n\n### Blokkades\n- CMS API slecht gedocumenteerd\n- Te veel meetings, weinig flow-tijd\n\n### Opvolging\n- Sophie mailt leverancier voor API documentatie\n- Meeting-last Lars reduceren`,
      actionItems: [
        { title: "CMS leverancier mailen voor API documentatie", assignee: "Sophie de Vries", daysUntilDue: -12, completed: false },
        { title: "Lars zijn meeting-agenda bekijken en reduceren", assignee: "Sophie de Vries", daysUntilDue: -13, completed: true },
      ],
      chatMessages: [],
    },
    {
      title: "Retrospective – Q1 2026",
      status: "completed",
      platform: "Miro + Teams",
      daysAgo: 5,
      duration: 5400,
      folderId: folderIds[2],
      projectId: null,
      templateId: templateIds[0],
      tagIdxs: [3, 1, 2],
      participants: [
        { name: "Sophie de Vries", email: "sophie@example.com", role: "Facilitator" },
        { name: "Lars Bakker", email: "lars@example.com", role: "Developer" },
        { name: "Emma Jansen", email: "emma@example.com", role: "Designer" },
        { name: "David Smit", email: "david@example.com", role: "Tech Lead" },
        { name: "Tom Willems", email: "tom@example.com", role: "Sales" },
        { name: "Nina van Dam", email: "nina@example.com", role: "Sales" },
      ],
      transcript: `Sophie: Welkom bij de Q1 retrospective. We gaan terugkijken met de methode Keep, Stop, Start.
Lars: Keep: de wekelijkse standups. Stop: te veel ad-hoc requests buiten de sprint. Start: meer pair programming sessies.
Emma: Keep: de design reviews. Stop: onduidelijke briefings. Start: een gezamenlijk design systeem.
David: Keep: de technische documentatie cultuur. Stop: hotfixes direct naar productie. Start: feature flags voor releases.
Tom: Keep: de wekelijkse sales standup. Stop: te lange rapportages schrijven. Start: korte dagelijkse updates via Slack.
Nina: Keep: klantfeedback sessies. Stop: handmatige CRM updates. Start: geautomatiseerde follow-ups.
Sophie: Dank jullie. Laten we de prioriteiten bepalen. Wat nemen we mee naar Q2?
Lars: Stop met ad-hoc requests is cruciaal. Dat kost ons minstens een dag per week.
David: Feature flags is technisch ook erg belangrijk.
Sophie: Akkoord, dat zijn de twee prioriteiten voor Q2: geen ad-hoc buiten sprint + feature flags.`,
      summary: "Q1 retrospective: hoge betrokkenheid heel team. Twee Q2-prioriteiten: geen ad-hoc requests buiten sprint, en feature flags invoeren voor releases.",
      notes: `## Retrospective Q1 2026\n\n### Keep\n- Wekelijkse standups\n- Design reviews\n- Technische documentatie cultuur\n- Klantfeedback sessies\n\n### Stop\n- Ad-hoc requests buiten sprint (kost ~1 dag/week)\n- Onduidelijke design briefings\n- Hotfixes direct naar productie\n- Handmatige CRM updates\n- Lange rapportages\n\n### Start\n- Pair programming sessies\n- Gezamenlijk design systeem\n- Feature flags voor releases ← **Q2 prioriteit**\n- Geautomatiseerde CRM follow-ups\n- Dagelijkse Slack updates (Sales)\n\n### Q2 Prioriteiten\n1. 🚫 Geen ad-hoc requests buiten sprint\n2. 🚩 Feature flags invoeren voor alle releases`,
      actionItems: [
        { title: "Feature flags systeem opzetten", assignee: "David Smit", daysUntilDue: 7, completed: false },
        { title: "Sprint-beleid communiceren naar stakeholders (geen ad-hoc)", assignee: "Sophie de Vries", daysUntilDue: 3, completed: false },
        { title: "CRM automatisering onderzoeken", assignee: "Nina van Dam", daysUntilDue: 14, completed: false },
        { title: "Design briefing template maken", assignee: "Emma Jansen", daysUntilDue: 10, completed: false },
      ],
      chatMessages: [
        { role: "user", content: "Wat zijn de actiepunten uit de retro?" },
        { role: "assistant", content: "Er zijn vier actiepunten: (1) Feature flags systeem opzetten door David Smit, (2) Sprint-beleid communiceren naar stakeholders door Sophie de Vries, (3) CRM automatisering onderzoeken door Nina van Dam, en (4) Design briefing template maken door Emma Jansen." },
      ],
    },
    {
      title: "Budget Review Q2 – Finance",
      status: "completed",
      platform: "Teams",
      daysAgo: 3,
      duration: 3600,
      folderId: folderIds[2],
      projectId: null,
      templateId: templateIds[0],
      tagIdxs: [0],
      participants: [
        { name: "Sophie de Vries", email: "sophie@example.com", role: "Product Owner" },
        { name: "Peter Finance", email: "peter@example.com", role: "CFO" },
        { name: "Tom Willems", email: "tom@example.com", role: "Sales Manager" },
      ],
      transcript: `Peter: Laten we het Q2 budget doornemen. We hebben €180k beschikbaar voor product en sales.
Sophie: Voor product hebben we €120k aangevraagd. De grootste post is de Azure migratie.
Peter: Hoeveel kost de migratie precies?
Sophie: We hebben een offerte van €65k voor de Azure services. Plus intern werk van zo'n 3 weken.
Peter: Dat is meer dan verwacht. Kunnen we de migratie faseren?
Sophie: Ja, we kunnen in Q2 de staging-omgeving doen en productie naar Q3 verschuiven.
Tom: Voor sales vraag ik €60k. €40k voor de webinar serie en €20k voor LinkedIn advertenties.
Peter: De webinars zijn effectief gebleken. Dat goedkeur ik. LinkedIn advertenties wil ik terugbrengen naar €15k.
Tom: Akkoord, €15k is ook haalbaar.
Peter: Dan kom ik op €120k voor product (gefaseerde migratie) en €55k voor sales. Totaal €175k, binnen budget.`,
      summary: "Q2 budget vastgesteld op €175k. Product €120k (gefaseerde Azure migratie), Sales €55k (webinars + LinkedIn). Migratie productie naar Q3 verschoven.",
      notes: `## Budget Review Q2 2026\n\n**Totaal beschikbaar:** €180.000\n**Totaal goedgekeurd:** €175.000\n\n### Product (€120k)\n| Post | Bedrag |\n|------|--------|\n| Azure migratie (staging) | €65.000 |\n| Development intern | ~€35.000 |\n| Overig product | €20.000 |\n\n*Productie-migratie verschoven naar Q3*\n\n### Sales (€55k)\n| Post | Bedrag |\n|------|--------|\n| Webinar serie (3x) | €40.000 |\n| LinkedIn advertenties | €15.000 |\n\n### Beslissingen\n- Azure migratie gefaseerd: staging Q2, productie Q3\n- LinkedIn budget verlaagd van €20k → €15k`,
      actionItems: [
        { title: "Azure staging budget reserveren bij finance", assignee: "Sophie de Vries", daysUntilDue: 1, completed: false },
        { title: "Q3 migratieplanning opstellen", assignee: "David Smit", daysUntilDue: 21, completed: false },
        { title: "LinkedIn advertentie campagne opstarten met €15k budget", assignee: "Tom Willems", daysUntilDue: 5, completed: false },
      ],
      chatMessages: [],
    },
    {
      title: "Nieuwe Feature Brainstorm – AI Assistent",
      status: "draft",
      platform: "Zoom",
      daysAgo: 1,
      duration: null,
      folderId: folderIds[2],
      projectId: projectIds[0],
      templateId: null,
      tagIdxs: [1, 3],
      participants: [
        { name: "Sophie de Vries", email: "sophie@example.com", role: "Product Owner" },
        { name: "Lars Bakker", email: "lars@example.com", role: "Developer" },
      ],
      transcript: `Sophie: We willen een AI assistent toevoegen aan het platform. Ideeën?
Lars: We zouden een chat interface kunnen bouwen die context heeft over de gebruiker.
Sophie: Goed idee. Welke Claude modellen kunnen we gebruiken?
Lars: Claude Sonnet 4.6 is goed voor de meeste taken. Voor complexe redenering opus.
Sophie: Interessant. Laten we dit verder uitwerken.`,
      summary: null,
      notes: null,
      actionItems: [],
      chatMessages: [],
    },
  ];

  let meetingCount = 0;
  for (const def of meetingDefs) {
    const existing = await q(
      `SELECT id FROM "Meeting" WHERE "userId"=$1 AND title=$2 LIMIT 1`,
      [userId, def.title]
    );
    if (existing.length > 0) {
      console.log(`   ⏭  Meeting bestaat al: "${def.title}"`);
      continue;
    }

    const meetingId = cuid();
    const startedAt = daysAgo(def.daysAgo);
    const endedAt = def.duration
      ? new Date(new Date(startedAt).getTime() + def.duration * 1000).toISOString()
      : null;

    await q(
      `INSERT INTO "Meeting"(id, title, status, platform, "startedAt", "endedAt", duration, "userId", "folderId", "projectId", "templateId", "createdAt", "updatedAt")
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
      [meetingId, def.title, def.status, def.platform, startedAt, endedAt, def.duration, userId, def.folderId, def.projectId, def.templateId]
    );

    // Tags
    for (const idx of def.tagIdxs) {
      await q(
        `INSERT INTO "MeetingTag"("meetingId", "tagId") VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [meetingId, tagIds[idx]]
      );
    }

    // Participants
    for (const p of def.participants) {
      await q(
        `INSERT INTO "Participant"(id, "meetingId", name, email, role) VALUES($1,$2,$3,$4,$5)`,
        [cuid(), meetingId, p.name, p.email, p.role]
      );
    }

    // Transcript
    if (def.transcript) {
      const segments = def.transcript
        .split("\n")
        .filter(Boolean)
        .map((line, i) => ({
          id: i,
          start: i * 15,
          end: (i + 1) * 15,
          text: line,
          speaker: line.split(":")[0] || "Spreker",
        }));
      await q(
        `INSERT INTO "Transcript"(id, "meetingId", content, segments, "isProvisional", language, "createdAt", "updatedAt")
         VALUES($1,$2,$3,$4,false,'nl',NOW(),NOW())`,
        [cuid(), meetingId, def.transcript, JSON.stringify(segments)]
      );
    }

    // Notes
    if (def.notes) {
      await q(
        `INSERT INTO "Notes"(id, "meetingId", content, summary, "createdAt", "updatedAt")
         VALUES($1,$2,$3,$4,NOW(),NOW())`,
        [cuid(), meetingId, def.notes, def.summary]
      );
    }

    // ActionItems
    for (const ai of def.actionItems) {
      const dueDate = daysAgo(-(ai.daysUntilDue));
      await q(
        `INSERT INTO "ActionItem"(id, "meetingId", "projectId", title, assignee, "dueDate", completed, "createdAt", "updatedAt")
         VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
        [cuid(), meetingId, def.projectId, ai.title, ai.assignee, dueDate, ai.completed]
      );
    }

    // ChatMessages
    for (const msg of def.chatMessages) {
      await q(
        `INSERT INTO "ChatMessage"(id, "meetingId", role, content, "createdAt") VALUES($1,$2,$3,$4,NOW())`,
        [cuid(), meetingId, msg.role, msg.content]
      );
    }

    meetingCount++;
    console.log(`   ✓ Meeting: "${def.title}"`);
  }

  console.log(`\n✅  Seed voltooid!`);
  console.log(`   Meetings aangemaakt: ${meetingCount}`);
  await pool.end();
}

main().catch((e) => {
  console.error("❌  Seed mislukt:", e);
  process.exit(1);
});
