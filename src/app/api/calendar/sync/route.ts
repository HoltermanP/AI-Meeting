import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listUpcomingOutlookEvents, type OutlookEvent } from "@/lib/microsoft-graph";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const userId = session.user.id;

  let events: OutlookEvent[];
  try {
    events = await listUpcomingOutlookEvents(userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let created = 0;
  let skipped = 0;

  for (const event of events) {
    const scheduledAt = new Date(event.start.dateTime);
    const isTeams =
      event.isOnlineMeeting &&
      (event.onlineMeetingProvider ?? "").toLowerCase().includes("teams");

    // Deelnemers uit het Outlook-event (max 20)
    const participants = (event.attendees ?? []).slice(0, 20).map((a) => ({
      name: a.emailAddress.name || a.emailAddress.address,
      email: a.emailAddress.address,
    }));

    // upsert op (userId, outlookEventId) — idempotent bij gelijktijdige aanroepen
    const result = await prisma.meeting.upsert({
      where: { userId_outlookEventId: { userId, outlookEventId: event.id } },
      update: {
        title: event.subject || undefined,
        scheduledAt,
        platform: isTeams ? "teams" : undefined,
        teamsJoinUrl: event.onlineMeeting?.joinUrl ?? null,
      },
      create: {
        userId,
        title: event.subject || "Outlook-meeting",
        status: "scheduled",
        platform: isTeams ? "teams" : "other",
        scheduledAt,
        outlookEventId: event.id,
        teamsJoinUrl: event.onlineMeeting?.joinUrl ?? null,
        participants: { create: participants },
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });

    // created als createdAt ≈ updatedAt (net aangemaakt)
    if (Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000) {
      created++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({ created, skipped });
}
