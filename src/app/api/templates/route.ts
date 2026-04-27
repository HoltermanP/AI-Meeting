import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TEMPLATES } from "@/lib/utils";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Na DB-reset bestaat de JWT nog maar de User niet → seed geeft FK-fout (500).
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        {
          error: "Sessie ongeldig",
          detail: "Log uit en opnieuw in (account bestaat niet meer in deze database).",
        },
        { status: 401 }
      );
    }

    const existing = await prisma.template.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    if (existing.length === 0) {
      await prisma.template.createMany({
        data: DEFAULT_TEMPLATES.map((t) => ({
          name: t.name,
          description: t.description ?? null,
          content: t.content,
          userId,
          isDefault: true,
        })),
      });
    }

    const templates = await prisma.template.findMany({
      where: {
        OR: [{ userId }, { isPublic: true }],
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(templates);
  } catch (e) {
    console.error("GET /api/templates", e);
    return NextResponse.json(
      {
        error: "Templates laden mislukt",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json(
      { error: "Sessie ongeldig — log opnieuw in." },
      { status: 401 }
    );
  }

  let body: {
    name?: string;
    description?: string | null;
    content?: string;
    actionItemsInstructions?: string | null;
    goal?: string | null;
    defaultAgenda?: string | null;
    aiContextInstructions?: string | null;
    outputFocus?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.content?.trim()) {
    return NextResponse.json(
      { error: "Naam en inhoud zijn verplicht" },
      { status: 400 }
    );
  }

  try {
    const template = await prisma.template.create({
      data: {
        name: body.name.trim(),
        description: body.description ?? null,
        content: body.content,
        actionItemsInstructions: body.actionItemsInstructions || null,
        goal: body.goal || null,
        defaultAgenda: body.defaultAgenda || null,
        aiContextInstructions: body.aiContextInstructions || null,
        outputFocus: body.outputFocus || null,
        userId: session.user.id,
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (e) {
    console.error("POST /api/templates", e);
    return NextResponse.json(
      { error: "Template opslaan mislukt" },
      { status: 500 }
    );
  }
}
