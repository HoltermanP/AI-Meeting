import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrRenewSubscription } from "@/lib/microsoft-graph";
import { getMsClientConfig } from "@/lib/app-config";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const userId = req.cookies.get("ms_oauth_uid")?.value;

  if (error) {
    return NextResponse.redirect(`${appUrl}/settings?calendar=error&msg=${encodeURIComponent(error)}`);
  }

  if (!code || !userId) {
    const msg = !userId ? "Sessie-cookie ontbreekt — probeer opnieuw" : "Geen code ontvangen";
    return NextResponse.redirect(`${appUrl}/settings?calendar=error&msg=${encodeURIComponent(msg)}`);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return NextResponse.redirect(`${appUrl}/settings?calendar=error&msg=gebruiker_niet_gevonden`);
  }

  const { tenantId, clientId, clientSecret } = await getMsClientConfig();
  const redirectUri = `${appUrl}/api/calendar/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("MS token exchange mislukt:", err);
    return NextResponse.redirect(`${appUrl}/settings?calendar=error&msg=token_exchange_failed`);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!tokenData.refresh_token) {
    return NextResponse.redirect(`${appUrl}/settings?calendar=error&msg=no_refresh_token`);
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      msAccessToken: tokenData.access_token,
      msRefreshToken: tokenData.refresh_token,
      msTokenExpiresAt: expiresAt,
    },
  });

  await createOrRenewSubscription(userId).catch((err) => {
    console.error("Subscription aanmaken na connect mislukt:", err);
  });

  const redirectRes = NextResponse.redirect(`${appUrl}/settings?calendar=connected`);
  redirectRes.cookies.set("ms_oauth_uid", "", { maxAge: 0, path: "/" });
  return redirectRes;
}
