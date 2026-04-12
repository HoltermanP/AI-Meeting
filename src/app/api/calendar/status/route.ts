import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMsUserEmail } from "@/lib/microsoft-graph";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { msRefreshToken: true },
  });

  const connected = Boolean(user?.msRefreshToken);

  if (!connected) {
    return NextResponse.json({ connected: false });
  }

  // Haal MS e-mailadres op (best-effort)
  const msEmail = await getMsUserEmail(session.user.id).catch(() => null);
  return NextResponse.json({ connected: true, msEmail });
}
