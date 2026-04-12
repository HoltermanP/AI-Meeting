import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createOrRenewSubscription } from "@/lib/microsoft-graph";

/** Verlengt de Graph change-notification subscription als die bijna verloopt. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  await createOrRenewSubscription(session.user.id).catch((err) => {
    console.error("Subscription verlengen mislukt:", err);
  });

  return NextResponse.json({ ok: true });
}
