import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMsClientConfig } from "@/lib/app-config";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { tenantId, clientId } = await getMsClientConfig();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!clientId) {
    return NextResponse.json(
      { error: "Microsoft Client ID niet geconfigureerd. Stel dit in via Configuratie → Microsoft 365." },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/calendar/callback`;
  const scopes = [
    "Calendars.ReadWrite",
    "OnlineMeetings.ReadWrite",
    "User.Read",
    "Tasks.ReadWrite",
    "Files.ReadWrite",
    "offline_access",
  ].join(" ");

  const nonce = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes,
    state: nonce,
    response_mode: "query",
    prompt: "select_account",
  });

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("ms_oauth_uid", session.user.id, {
    httpOnly: true,
    secure: appUrl.startsWith("https"),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return res;
}
