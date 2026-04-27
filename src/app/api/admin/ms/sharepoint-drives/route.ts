import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listSharePointDrives } from "@/lib/sharepoint";
import { MsAuthRequiredError } from "@/lib/microsoft-graph";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const drives = await listSharePointDrives(session.user.id);
    return NextResponse.json(drives);
  } catch (err) {
    if (err instanceof MsAuthRequiredError) {
      return NextResponse.json({ error: err.message, code: "ms_auth_required" }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : "Onbekende fout";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
