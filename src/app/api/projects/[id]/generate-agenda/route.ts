import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chatCompletion } from "@/lib/llm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Haal het meest recente afgeronde verslag op
  const lastMeeting = await prisma.meeting.findFirst({
    where: { projectId, userId: session.user.id, status: "completed" },
    orderBy: { createdAt: "desc" },
    include: { notes: { select: { summary: true, content: true } } },
  });

  // Haal openstaande actiepunten op
  const openItems = await prisma.actionItem.findMany({
    where: { projectId, completed: false },
    orderBy: { createdAt: "asc" },
    select: { title: true, assignee: true, dueDate: true },
  });

  const lastMeetingSummary = lastMeeting?.notes?.summary || lastMeeting?.notes?.content?.slice(0, 800) || "Geen vorig verslag beschikbaar.";
  const actielijst = openItems.length > 0
    ? openItems.map((a, i) =>
        `${i + 1}. ${a.title}${a.assignee ? ` (${a.assignee})` : ""}${a.dueDate ? ` – voor ${new Date(a.dueDate).toLocaleDateString("nl-NL")}` : ""}`
      ).join("\n")
    : "Geen openstaande actiepunten.";

  const userPrompt = `Project: "${project.name}"

Samenvatting vorige vergadering:
${lastMeetingSummary}

Openstaande actiepunten:
${actielijst}

Maak een agenda voor de volgende vergadering. Geef een JSON-array terug (geen andere tekst), elke item heeft:
- "id": uniek getal als string
- "title": agendapunt (bondig, max 8 woorden)
- "notes": uitgebreide toelichting (2-4 zinnen): beschrijf de context, welke beslissing er genomen moet worden of welk resultaat verwacht wordt, en welke relevante actiepunten of informatie uit de vorige vergadering hierop betrekking hebben. Wees concreet en actionable.
- "duration": geschatte tijd in minuten (getal)

Verplicht eerste punt: opening/check-in (5 min) – noteer aanwezigen en doel van de vergadering.
Verplicht tweede punt: review actiepunten vorige vergadering (10 min) – loop alle openstaande punten door en noteer welke concreet besproken moeten worden.
Verplicht laatste punt: rondvraag en afsluiting (5 min) – samenvatting besluiten, nieuwe actiepunten vastleggen.
Tussenin: relevante onderwerpen op basis van het vorige verslag, concreet uitgewerkt.
Maximaal 6-7 punten totaal. Realistisch, concreet en actionable.`;

  const raw = await chatCompletion(
    "chat",
    "Je bent een ervaren vergaderfacilitator. Schrijf alles in het Nederlands. Geef alleen de JSON-array terug, geen extra tekst.",
    userPrompt,
    1200
  );

  let items: { id: string; title: string; notes: string; duration: number }[];
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    items = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "Kon agenda niet parsen" }, { status: 500 });
  }

  return NextResponse.json({ items, lastMeetingTitle: lastMeeting?.title });
}
