import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MainLayout from "@/components/layout/MainLayout";
import MeetingCard from "@/components/meeting/MeetingCard";
import DashboardClient from "./dashboard-client";
import { attachActionItemsToMeetings } from "@/lib/meeting-action-items";
import { Mic, FileText, CheckSquare } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const userId = session.user.id;

  const [recentMeetingsRaw, scheduledMeetings, projects, stats] = await Promise.all([
    prisma.meeting.findMany({
      where: { userId, status: { not: "scheduled" } },
      include: {
        notes: { select: { summary: true } },
        participants: { select: { id: true, name: true } },
        folder: true,
        project: true,
        transcript: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.meeting.findMany({
      where: { userId, status: "scheduled" },
      select: { id: true, title: true, scheduledAt: true, project: { select: { id: true, name: true, color: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.project.findMany({
      where: { userId },
      select: { id: true, name: true, color: true },
      orderBy: { createdAt: "desc" },
    }),
    Promise.all([
      prisma.meeting.count({ where: { userId } }),
      prisma.meeting.count({ where: { userId, status: "completed" } }),
      prisma.actionItem.count({
        where: {
          completed: false,
          OR: [{ meeting: { userId } }, { project: { userId } }],
        },
      }),
    ]),
  ]);

  const recentMeetings = await attachActionItemsToMeetings(recentMeetingsRaw);

  const [total, completed, pendingActions] = stats;

  return (
    <MainLayout title="Dashboard">
      <div className="mx-auto max-w-6xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <StatCard icon={<FileText className="h-5 w-5 text-indigo-600" />} label="Totaal meetings" value={total} bg="bg-indigo-50" />
          <StatCard icon={<Mic className="h-5 w-5 text-green-600" />} label="Afgerond" value={completed} bg="bg-green-50" />
          <StatCard icon={<CheckSquare className="h-5 w-5 text-orange-600" />} label="Open acties" value={pendingActions} bg="bg-orange-50" />
        </div>

        <DashboardClient
          scheduledMeetings={scheduledMeetings as any}
          recentMeetings={recentMeetings as any}
          projects={projects}
        />
      </div>
    </MainLayout>
  );
}

function StatCard({
  icon, label, value, bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  bg: string;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-3 sm:p-4`}>
      <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg sm:mb-3 sm:h-10 sm:w-10 ${bg}`}>
        {icon}
      </div>
      <p className="text-xl font-bold text-gray-900 sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">{label}</p>
    </div>
  );
}
