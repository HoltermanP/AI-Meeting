import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrisma() {
  // Op Vercel/serverless is een lokaal file:-pad niet bruikbaar; zet DATABASE_URL (bv. Turso libsql://…).
  const envUrl =
    process.env.DATABASE_URL?.trim() || process.env.TURSO_DATABASE_URL?.trim();

  const isVercelLike =
    process.env.VERCEL === "1" ||
    process.env.VERCEL === "true" ||
    Boolean(process.env.VERCEL_ENV);

  if (isVercelLike && !envUrl) {
    throw new Error(
      "DATABASE_URL (of TURSO_DATABASE_URL) ontbreekt. Voeg in Vercel Project Settings een libsql-URL toe (bv. Turso) en voer migraties uit tegen die database.",
    );
  }

  if (envUrl) {
    const u = envUrl.toLowerCase();
    if (u.startsWith("postgres://") || u.startsWith("postgresql://")) {
      throw new Error(
        "DATABASE_URL is een PostgreSQL-URL, maar deze app gebruikt Prisma met SQLite via libsql (Turso). Zet je Turso/libsql connection string in DATABASE_URL (of TURSO_DATABASE_URL), niet Neon/Supabase Postgres.",
      );
    }
  }

  const rawUrl = envUrl || "file:./prisma/dev.db";
  let url = rawUrl;

  // Sommige connectionstrings bevatten query-params (zoals sslmode/channel_binding)
  // die de libsql-adapter niet ondersteunt. Daarom strippen we alle query-params
  // voor elke niet-file URL.
  try {
    const parsed = new URL(rawUrl);
    const isFile = /^file:/i.test(parsed.protocol);
    if (!isFile && parsed.search) {
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
  if (isVercelLike && needsLibsqlAuth && !authToken?.trim()) {
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
