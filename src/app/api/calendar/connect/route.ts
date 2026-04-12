import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? "common";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!clientId) {
    return NextResponse.json(
      { error: "MICROSOFT_CLIENT_ID niet geconfigureerd" },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/calendar/callback`;
  const scopes = [
    "Calendars.ReadWrite",
    "OnlineMeetings.ReadWrite",
    "User.Read",
    "offline_access",
  ].join(" ");

  // Gebruik een willekeurige nonce als state (veiligheid), sla userId op in cookie
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

  // Sla userId op in een HttpOnly-cookie (10 min geldig)
  // Clerk onderschept de callback zodat state niet betrouwbaar is
  res.cookies.set("ms_oauth_uid", session.user.id, {
    httpOnly: true,
    secure: appUrl.startsWith("https"),
    sameSite: "lax",
    maxAge: 600, // 10 minuten
    path: "/",
  });

  return res;
}
