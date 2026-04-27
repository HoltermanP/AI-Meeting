/**
 * Teams notificaties via Incoming Webhook (geen extra OAuth-scopes nodig).
 * De gebruiker maakt een Incoming Webhook connector aan in een Teams-kanaal
 * en plakt de URL in de projectinstellingen.
 */

export type TeamsCard = {
  title: string;
  text: string;
  facts?: Array<{ name: string; value: string }>;
  actions?: Array<{ name: string; url: string }>;
  themeColor?: string;
};

/** Stuurt een MessageCard naar een Teams Incoming Webhook URL. */
export async function sendTeamsNotification(
  webhookUrl: string,
  card: TeamsCard
): Promise<boolean> {
  try {
    const body = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor: card.themeColor ?? "0078D4",
      summary: card.title,
      sections: [
        {
          activityTitle: card.title,
          activityText: card.text,
          facts: card.facts ?? [],
        },
      ],
      potentialAction: (card.actions ?? []).map((a) => ({
        "@type": "OpenUri",
        name: a.name,
        targets: [{ os: "default", uri: a.url }],
      })),
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return res.ok;
  } catch (e) {
    console.error("[teams-notify] webhook fout:", e);
    return false;
  }
}

/** Bericht: actie bijna verlopen. */
export function buildDeadlineCard(
  appUrl: string,
  projectName: string,
  actions: Array<{ title: string; assignee?: string | null; dueDate: Date; meetingId?: string | null }>
): TeamsCard {
  const facts = actions.map((a) => ({
    name: a.title,
    value: `${a.assignee ?? "Onbekend"} — voor ${a.dueDate.toLocaleDateString("nl-NL")}`,
  }));

  return {
    title: `Actiepunten naderen deadline — ${projectName}`,
    text: `Er zijn ${actions.length} actiepunt(en) die morgen of eerder afgerond moeten zijn.`,
    facts,
    themeColor: "FF8C00",
    actions: [{ name: "Bekijk acties", url: `${appUrl}/acties` }],
  };
}

/** Bericht: conceptagenda voor aankomende meeting. */
export function buildAgendaCard(
  appUrl: string,
  meetingTitle: string,
  meetingId: string,
  scheduledAt: Date,
  agendaItems: Array<{ title: string; duration?: number }>
): TeamsCard {
  const facts = agendaItems.map((item, i) => ({
    name: `${i + 1}. ${item.title}`,
    value: item.duration ? `${item.duration} min` : "",
  }));

  return {
    title: `Conceptagenda: ${meetingTitle}`,
    text: `Aankomende vergadering op ${scheduledAt.toLocaleString("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`,
    facts,
    themeColor: "0078D4",
    actions: [{ name: "Bekijk vergadering", url: `${appUrl}/meetings/${meetingId}` }],
  };
}
