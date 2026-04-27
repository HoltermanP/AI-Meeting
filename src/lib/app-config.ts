/**
 * Deployment-level configuratie: leest uit AppConfig-tabel, valt terug op .env.
 * Gebruik dit voor instellingen die per klantimplementatie anders zijn
 * (Microsoft 365 tenant, client ID/secret, app-naam).
 */

import { prisma } from "@/lib/prisma";

export async function getConfig(key: string): Promise<string | null> {
  try {
    const row = await prisma.appConfig.findUnique({ where: { key } });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function deleteConfig(key: string): Promise<void> {
  await prisma.appConfig.deleteMany({ where: { key } });
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const rows = await prisma.appConfig.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Microsoft 365 App Registration credentials — DB first, dan .env. */
export async function getMsClientConfig(): Promise<{
  tenantId: string;
  clientId: string;
  clientSecret: string;
}> {
  const [tenantId, clientId, clientSecret] = await Promise.all([
    getConfig("ms_tenant_id"),
    getConfig("ms_client_id"),
    getConfig("ms_client_secret"),
  ]);

  return {
    tenantId: tenantId ?? process.env.MICROSOFT_TENANT_ID ?? "common",
    clientId: clientId ?? process.env.MICROSOFT_CLIENT_ID ?? "",
    clientSecret: clientSecret ?? process.env.MICROSOFT_CLIENT_SECRET ?? "",
  };
}

export async function getAppName(): Promise<string> {
  return (await getConfig("app_name")) ?? "MeetingAI";
}
