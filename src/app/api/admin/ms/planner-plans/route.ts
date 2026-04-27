import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listMyPlannerPlans, listPlannerBuckets } from "@/lib/planner";
import { MsAuthRequiredError } from "@/lib/microsoft-graph";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planId = searchParams.get("planId");

  try {
    if (planId) {
      const buckets = await listPlannerBuckets(session.user.id, planId);
      return NextResponse.json(buckets);
    }

    const plans = await listMyPlannerPlans(session.user.id);
    return NextResponse.json(plans);
  } catch (err) {
    if (err instanceof MsAuthRequiredError) {
      return NextResponse.json({ error: err.message, code: "ms_auth_required" }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : "Onbekende fout";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
