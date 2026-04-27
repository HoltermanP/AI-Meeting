import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listMyPlannerPlans, listPlannerBuckets } from "@/lib/planner";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planId = searchParams.get("planId");

  if (planId) {
    const buckets = await listPlannerBuckets(session.user.id, planId);
    return NextResponse.json(buckets);
  }

  const plans = await listMyPlannerPlans(session.user.id);
  return NextResponse.json(plans);
}
