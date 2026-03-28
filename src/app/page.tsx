import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MainLayout from "@/components/layout/MainLayout";
import MeetingCard from "@/components/meeting/MeetingCard";
import DashboardClient from "./dashboard-client";
import { formatDuration } from "@/lib/utils";
import { Mic, FileText, CheckSquare, Clock } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const userId = session.user.id;

  const [recentMeetings, stats] = await Promise.all([
    prisma.meeting.findMany({
      where: { userId },
      include: {
        notes: { select: { summary: true } },
        actionItems: { select: { id: true, completed: true } },
        participants: { select: { id: true, name: true } },
        folder: true,
        transcript: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    Promise.all([
      prisma.meeting.count({ where: { userId } }),
      prisma.meeting.count({ where: { userId, status: "completed" } }),
      prisma.actionItem.count({ where: { meeting: { userId }, completed: false } }),
      prisma.meeting.aggregate({ where: { userId, duration: { not: null } }, _sum: { duration: true } }),
    ]),
  ]);

  const [total, completed, pendingActions, durationAgg] = stats;
  const totalSeconds = durationAgg._sum.duration || 0;

  return (
    <MainLayout title="Dashboard">
      <div className="p-6 max-w-6xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={<FileText className="h-5 w-5 text-indigo-600" />} label="Total Meetings" value={total} bg="bg-indigo-50" />
          <StatCard icon={<Mic className="h-5 w-5 text-green-600" />} label="Completed" value={completed} bg="bg-green-50" />
          <StatCard icon={<CheckSquare className="h-5 w-5 text-orange-600" />} label="Pending Tasks" value={pendingActions} bg="bg-orange-50" />
          <StatCard icon={<Clock className="h-5 w-5 text-purple-600" />} label="Total Time" value={formatDuration(totalSeconds)} bg="bg-purple-50" />
        </div>

        {/* Recent meetings */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Recent Meetings</h2>
          <DashboardClient />
        </div>

        {recentMeetings.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
              <Mic className="h-8 w-8 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-700">No meetings yet</h3>
              <p className="text-sm text-gray-400 mt-1">Start recording your first meeting to get AI-powered notes</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentMeetings.map((m) => (
              <MeetingCard key={m.id} meeting={m as any} />
            ))}
          </div>
        )}
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
    <div className={`rounded-xl border border-gray-200 bg-white p-4`}>
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
