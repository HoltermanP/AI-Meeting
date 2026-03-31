import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrisma() {
  // Op Vercel/serverless is een lokaal file:-pad niet bruikbaar; zet DATABASE_URL (bv. Turso libsql://…).
  const envUrl =
    process.env.DATABASE_URL?.trim() || process.env.TURSO_DATABASE_URL?.trim();

  if (process.env.VERCEL && !envUrl) {
    throw new Error(
      "DATABASE_URL (of TURSO_DATABASE_URL) ontbreekt. Voeg in Vercel Project Settings een libsql-URL toe (bv. Turso) en voer migraties uit tegen die database.",
    );
  }

  const rawUrl = envUrl || "file:./prisma/dev.db";
  let url = rawUrl;

  // Sommige Postgres-georiënteerde connectionstrings bevatten query-params
  // (zoals sslmode/channel_binding) die libsql/Turso niet ondersteunt.
  // Daarom strippen we voor libsql-achtige URL's alle query-params.
  try {
    const parsed = new URL(rawUrl);
    const isLibsqlLike =
      /^libsql:/i.test(parsed.protocol) ||
      /^https:/i.test(parsed.protocol) ||
      /^wss?:/i.test(parsed.protocol) ||
      /\.turso\.io$/i.test(parsed.hostname);

    if (isLibsqlLike && parsed.search) {
      parsed.search = "";
      url = parsed.toString();
    }
  } catch {
    // file:-URL's of niet-standaard URL's laten we ongewijzigd.
  }
  const authToken =
    process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

  const needsLibsqlAuth =
    /^libsql:\/\//i.test(url) || /\.turso\.io/i.test(url);
  if (process.env.VERCEL && needsLibsqlAuth && !authToken?.trim()) {
    throw new Error(
      "DATABASE_AUTH_TOKEN of TURSO_AUTH_TOKEN ontbreekt. Voeg het Turso-token toe in Vercel (zelfde als bij `turso db tokens create`).",
    );
  }

  const adapter = new PrismaLibSql({
    url,
    ...(authToken ? { authToken } : {}),
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
