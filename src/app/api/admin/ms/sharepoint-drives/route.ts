import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listSharePointDrives } from "@/lib/sharepoint";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const drives = await listSharePointDrives(session.user.id);
  return NextResponse.json(drives);
}
