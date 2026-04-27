/**
 * Microsoft Graph API helpers voor Outlook/Teams kalenderintegratie.
 *
 * Gebruikt puur fetch (geen SDK) tegen https://graph.microsoft.com/v1.0/
 * Tokens worden per gebruiker opgeslagen in de User-tabel (msAccessToken,
 * msRefreshToken, msTokenExpiresAt).
 */

import { prisma } from "@/lib/prisma";
import { getMsClientConfig } from "@/lib/app-config";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function getTokenUrl(): Promise<string> {
  const { tenantId } = await getMsClientConfig();
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutlookEventInput = {
  title: string;
  scheduledAt: Date;
  durationMinutes?: number;
  participants?: { name: string; email?: string | null }[];
  agenda?: string | null;
  platform?: string | null;
};

export type OutlookEventResult = {
  id: string;
  joinUrl?: string | null;
};

type MsTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

async function getMsTokens(userId: string): Promise<MsTokens | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { msAccessToken: true, msRefreshToken: true, msTokenExpiresAt: true },
  });
  if (!user?.msRefreshToken || !user?.msAccessToken || !user?.msTokenExpiresAt) {
    return null;
  }
  return {
    accessToken: user.msAccessToken,
    refreshToken: user.msRefreshToken,
    expiresAt: user.msTokenExpiresAt,
  };
}

async function refreshTokens(userId: string, refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = await getMsClientConfig();
  const tokenUrl = await getTokenUrl();

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read Tasks.ReadWrite Files.ReadWrite offline_access",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MS token refresh mislukt: ${err}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await prisma.user.update({
    where: { id: userId },
    data: {
      msAccessToken: data.access_token,
      msRefreshToken: data.refresh_token ?? refreshToken,
      msTokenExpiresAt: expiresAt,
    },
  });

  return data.access_token;
}

/** Geeft een geldig access-token terug; refresht automatisch als bijna verlopen. */
async function getValidAccessToken(userId: string): Promise<string> {
  const tokens = await getMsTokens(userId);
  if (!tokens) throw new Error("Geen Microsoft-account gekoppeld");

  // Refresh als minder dan 5 minuten geldig
  const needsRefresh = tokens.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (needsRefresh) {
    return refreshTokens(userId, tokens.refreshToken);
  }
  return tokens.accessToken;
}

// ---------------------------------------------------------------------------
// Generic Graph fetch
// ---------------------------------------------------------------------------

/** Authenticated fetch naar de Microsoft Graph API. Intern + exporteerbaar voor webhook-gebruik. */
export async function graphFetch(
  userId: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getValidAccessToken(userId);
  return fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

function agendaToHtml(agendaJson: string | null | undefined): string {
  if (!agendaJson) return "";
  try {
    const items = JSON.parse(agendaJson) as Array<{
      title?: string;
      notes?: string;
      duration?: number;
    }>;
    if (!Array.isArray(items) || items.length === 0) return "";

    const rows = items
      .map((item, i) => {
        const num = i + 1;
        const dur = item.duration ? ` <span style="color:#888;font-size:0.9em">(${item.duration} min)</span>` : "";
        const notes = item.notes
          ? `<div style="margin:4px 0 0 0;color:#444;font-size:0.95em">${item.notes}</div>`
          : "";
        return `<li style="margin-bottom:8px"><strong>${num}. ${item.title ?? ""}${dur}</strong>${notes}</li>`;
      })
      .join("");

    return `<h3 style="margin:0 0 8px 0">Agenda</h3><ol style="margin:0;padding-left:20px">${rows}</ol>`;
  } catch {
    // Geen geldige JSON: toon als platte tekst
    return `<pre style="font-family:inherit">${agendaJson}</pre>`;
  }
}

function buildEventBody(input: OutlookEventInput): object {
  const start = new Date(input.scheduledAt);
  const end = new Date(start.getTime() + (input.durationMinutes ?? 60) * 60 * 1000);
  const isTeams = input.platform === "teams";

  const attendees = (input.participants ?? [])
    .filter((p) => p.email)
    .map((p) => ({
      emailAddress: { address: p.email!, name: p.name },
      type: "required",
    }));

  return {
    subject: input.title,
    start: { dateTime: start.toISOString(), timeZone: "Europe/Amsterdam" },
    end: { dateTime: end.toISOString(), timeZone: "Europe/Amsterdam" },
    attendees,
    body: {
      contentType: "HTML",
      content: agendaToHtml(input.agenda),
    },
    isOnlineMeeting: isTeams,
    onlineMeetingProvider: isTeams ? "teamsForBusiness" : "unknown",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Geeft true terug als de gebruiker een MS-account heeft gekoppeld. */
export async function isMsConnected(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { msRefreshToken: true },
  });
  return Boolean(user?.msRefreshToken);
}

/** Maakt een Outlook-agenda-item aan en geeft het event-id (+ Teams-link) terug. */
export async function createOutlookEvent(
  userId: string,
  input: OutlookEventInput
): Promise<OutlookEventResult> {
  const body = buildEventBody(input);
  const res = await graphFetch(userId, "/me/calendar/events", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Outlook-event aanmaken mislukt: ${err}`);
  }

  const event = (await res.json()) as {
    id: string;
    onlineMeeting?: { joinUrl?: string } | null;
  };

  return {
    id: event.id,
    joinUrl: event.onlineMeeting?.joinUrl ?? null,
  };
}

/** Werkt een bestaand Outlook-agenda-item bij. */
export async function updateOutlookEvent(
  userId: string,
  outlookEventId: string,
  input: OutlookEventInput
): Promise<void> {
  const body = buildEventBody(input);
  const res = await graphFetch(userId, `/me/calendar/events/${outlookEventId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Outlook-event bijwerken mislukt: ${err}`);
  }
}

/** Verwijdert een Outlook-agenda-item. */
export async function deleteOutlookEvent(
  userId: string,
  outlookEventId: string
): Promise<void> {
  const res = await graphFetch(userId, `/me/calendar/events/${outlookEventId}`, {
    method: "DELETE",
  });

  // 404 = al verwijderd, geen fout
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Outlook-event verwijderen mislukt: ${err}`);
  }
}

/** Haalt aankomende Outlook-events op (komende 60 dagen) via calendarView. */
export async function listUpcomingOutlookEvents(userId: string): Promise<OutlookEvent[]> {
  // calendarView is betrouwbaarder dan $filter voor datumbereiken
  const startDateTime = new Date().toISOString();
  const endDateTime = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    startDateTime,
    endDateTime,
    $top: "100",
    $select:
      "id,subject,start,end,attendees,body,isOnlineMeeting,onlineMeetingProvider,onlineMeeting",
    $orderby: "start/dateTime",
  });

  const res = await graphFetch(userId, `/me/calendarView?${params.toString()}`);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Outlook-events ophalen mislukt: ${err}`);
  }

  const data = (await res.json()) as { value: OutlookEvent[] };
  return data.value ?? [];
}

/** Haalt het e-mailadres van de ingelogde MS-gebruiker op. */
export async function getMsUserEmail(userId: string): Promise<string | null> {
  try {
    const res = await graphFetch(userId, "/me?$select=mail,userPrincipalName");
    if (!res.ok) return null;
    const data = (await res.json()) as { mail?: string; userPrincipalName?: string };
    return data.mail ?? data.userPrincipalName ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Graph Change Notification subscription (real-time webhook)
// ---------------------------------------------------------------------------

/**
 * Maakt een nieuwe Graph-subscription aan of verlengt een bestaande.
 * Slaat subscriptionId + expirationDateTime op in de User-tabel.
 *
 * Vereist dat NEXT_PUBLIC_APP_URL een publiek bereikbare HTTPS-URL is.
 * Op localhost werkt dit niet zonder tunnel (bijv. ngrok).
 */
export async function createOrRenewSubscription(userId: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!appUrl.startsWith("https://")) {
    // Geen publieke HTTPS-URL: webhook niet mogelijk, stil overslaan
    return;
  }

  const notificationUrl = `${appUrl}/api/calendar/webhook`;
  // Graph-subscriptions verlopen na max 4230 min (≈ 3 dagen); we kiezen 2 dagen
  const expirationDateTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { msSubscriptionId: true, msSubscriptionExpiry: true },
  });

  try {
    if (user?.msSubscriptionId && user.msSubscriptionExpiry) {
      const expiresIn = user.msSubscriptionExpiry.getTime() - Date.now();

      if (expiresIn > 30 * 60 * 1000) {
        // Meer dan 30 min geldig: niet nodig om te vernieuwen
        return;
      }

      // Verlengen
      const res = await graphFetch(userId, `/subscriptions/${user.msSubscriptionId}`, {
        method: "PATCH",
        body: JSON.stringify({ expirationDateTime }),
      });

      if (res.ok) {
        const data = (await res.json()) as { id: string; expirationDateTime: string };
        await prisma.user.update({
          where: { id: userId },
          data: {
            msSubscriptionId: data.id,
            msSubscriptionExpiry: new Date(data.expirationDateTime),
          },
        });
        return;
      }
      // Bij fout (bijv. subscription verlopen): nieuwe aanmaken
    }

    // Nieuwe subscription aanmaken
    const res = await graphFetch(userId, "/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        changeType: "created,updated,deleted",
        notificationUrl,
        resource: "/me/events",
        expirationDateTime,
        clientState: userId, // sturen we terug als verificatie
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Graph subscription aanmaken mislukt:", err);
      return;
    }

    const data = (await res.json()) as { id: string; expirationDateTime: string };
    await prisma.user.update({
      where: { id: userId },
      data: {
        msSubscriptionId: data.id,
        msSubscriptionExpiry: new Date(data.expirationDateTime),
      },
    });
  } catch (err) {
    // Subscription-fouten mogen de rest van de app niet breken
    console.error("Graph subscription fout:", err);
  }
}

/** Verwijdert een bestaande Graph-subscription (bij disconnect). */
export async function deleteSubscription(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { msSubscriptionId: true },
  });
  if (!user?.msSubscriptionId) return;

  try {
    await graphFetch(userId, `/subscriptions/${user.msSubscriptionId}`, {
      method: "DELETE",
    });
  } catch {
    // Negeer fouten bij verwijderen
  }

  await prisma.user.update({
    where: { id: userId },
    data: { msSubscriptionId: null, msSubscriptionExpiry: null },
  });
}

// ---------------------------------------------------------------------------
// Graph event type (minimaal)
// ---------------------------------------------------------------------------

export type OutlookEvent = {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees: {
    emailAddress: { address: string; name: string };
    type: string;
  }[];
  isOnlineMeeting: boolean;
  onlineMeetingProvider?: string;
  onlineMeeting?: { joinUrl?: string } | null;
  body?: { content?: string };
};
