import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTeamsNotification, buildDeadlineCard } from "@/lib/teams-notify";
import { getConfig } from "@/lib/app-config";

export async function GET(req: Request) {
  // Beschermd met CRON_SECRET (vercel cron stuurt dit als Authorization-header)
  const authHeader = req.headers.get("authorization");
  const cronSecret = (await getConfig("cron_secret")) ?? process.env.CRON_SECRET ?? "";

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  // Alle openstaande actiepunten met deadline <= morgen, gegroepeerd per project
  const overdue = await prisma.actionItem.findMany({
    where: {
      completed: false,
      dueDate: { lte: tomorrow },
      projectId: { not: null },
    },
    include: {
      project: {
        select: { id: true, name: true, teamsWebhookUrl: true },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  // Groepeer per project
  const byProject = new Map<
    string,
    {
      name: string;
      webhook: string;
      items: typeof overdue;
    }
  >();

  for (const item of overdue) {
    if (!item.project?.teamsWebhookUrl) continue;
    const key = item.projectId!;
    if (!byProject.has(key)) {
      byProject.set(key, {
        name: item.project.name,
        webhook: item.project.teamsWebhookUrl,
        items: [],
      });
    }
    byProject.get(key)!.items.push(item);
  }

  const results: { projectId: string; sent: boolean }[] = [];

  for (const [projectId, { name, webhook, items }] of byProject) {
    const card = buildDeadlineCard(
      appUrl,
      name,
      items.map((i) => ({
        title: i.title,
        assignee: i.assignee,
        dueDate: i.dueDate!,
        meetingId: i.meetingId,
      }))
    );
    const sent = await sendTeamsNotification(webhook, card);
    results.push({ projectId, sent });
  }

  return NextResponse.json({ checked: overdue.length, notified: results.length, results });
}
