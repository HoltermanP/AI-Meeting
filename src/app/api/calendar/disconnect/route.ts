import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteSubscription } from "@/lib/microsoft-graph";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  // Verwijder Graph-subscription (best-effort)
  await deleteSubscription(session.user.id).catch(() => {});

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      msAccessToken: null,
      msRefreshToken: null,
      msTokenExpiresAt: null,
      msSubscriptionId: null,
      msSubscriptionExpiry: null,
    },
  });

  return NextResponse.json({ ok: true });
}
