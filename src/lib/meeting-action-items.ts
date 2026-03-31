import type { ActionItem, Meeting } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type MeetingScope = Pick<Meeting, "id" | "projectId">;

export async function findActionItemsForMeeting(meeting: MeetingScope): Promise<ActionItem[]> {
  if (meeting.projectId) {
    return prisma.actionItem.findMany({
      where: { projectId: meeting.projectId },
      orderBy: { createdAt: "asc" },
    });
  }
  return prisma.actionItem.findMany({
    where: { meetingId: meeting.id, projectId: null },
    orderBy: { createdAt: "asc" },
  });
}

type MeetingListRow = { id: string; projectId: string | null };

/** Prisma meeting-lijsten hebben per rij andere actie-scope; batch-koppeling voor kaarten en home. */
export async function attachActionItemsToMeetings<T extends MeetingListRow>(
  meetings: T[]
): Promise<(T & { actionItems: { id: string; completed: boolean }[] })[]> {
  if (meetings.length === 0) return [];

  const projectIds = [...new Set(meetings.map((m) => m.projectId).filter(Boolean) as string[])];
  const standaloneIds = meetings.filter((m) => !m.projectId).map((m) => m.id);

  const [projectRows, standaloneRows] = await Promise.all([
    projectIds.length > 0
      ? prisma.actionItem.findMany({
          where: { projectId: { in: projectIds } },
          select: { id: true, completed: true, projectId: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    standaloneIds.length > 0
      ? prisma.actionItem.findMany({
          where: { meetingId: { in: standaloneIds }, projectId: null },
          select: { id: true, completed: true, meetingId: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const byProject = new Map<string, { id: string; completed: boolean }[]>();
  for (const row of projectRows) {
    if (!row.projectId) continue;
    const list = byProject.get(row.projectId) ?? [];
    list.push({ id: row.id, completed: row.completed });
    byProject.set(row.projectId, list);
  }

  const byMeeting = new Map<string, { id: string; completed: boolean }[]>();
  for (const row of standaloneRows) {
    if (!row.meetingId) continue;
    const list = byMeeting.get(row.meetingId) ?? [];
    list.push({ id: row.id, completed: row.completed });
    byMeeting.set(row.meetingId, list);
  }

  return meetings.map((m) => ({
    ...m,
    actionItems: m.projectId ? byProject.get(m.projectId) ?? [] : byMeeting.get(m.id) ?? [],
  }));
}
