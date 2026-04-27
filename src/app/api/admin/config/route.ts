import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllConfig, setConfig } from "@/lib/app-config";

const EDITABLE_KEYS = [
  "ms_tenant_id",
  "ms_client_id",
  "ms_client_secret",
  "app_name",
  "cron_secret",
] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getAllConfig();

  // Maskeer het secret in de response
  const masked: Record<string, string> = {};
  for (const key of EDITABLE_KEYS) {
    if (key === "ms_client_secret" && config[key]) {
      masked[key] = "••••••••";
    } else {
      masked[key] = config[key] ?? "";
    }
  }

  // Stuur ook de env-fallbacks mee zodat de UI kan tonen wat nu actief is
  return NextResponse.json({
    config: masked,
    envFallbacks: {
      ms_tenant_id: process.env.MICROSOFT_TENANT_ID ?? "",
      ms_client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      ms_client_secret: process.env.MICROSOFT_CLIENT_SECRET ? "••••••••" : "",
      app_name: "",
      cron_secret: process.env.CRON_SECRET ? "••••••••" : "",
    },
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Record<string, string>;

  for (const key of EDITABLE_KEYS) {
    const val = body[key];
    if (val === undefined) continue;

    // Lege waarde of placeholder = verwijder DB-waarde (dan geldt env-fallback)
    if (!val.trim() || val === "••••••••") continue;

    await setConfig(key, val.trim());
  }

  return NextResponse.json({ success: true });
}
