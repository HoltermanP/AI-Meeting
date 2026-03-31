import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createPrisma() {
  const isVercelLike =
    process.env.VERCEL === "1" ||
    process.env.VERCEL === "true" ||
    Boolean(process.env.VERCEL_ENV);

  const connectionString = process.env.DATABASE_URL?.trim();
  if (isVercelLike && !connectionString) {
    throw new Error(
      "DATABASE_URL ontbreekt. Voeg in Vercel de Neon PostgreSQL connection string toe (Project Settings → Environment Variables).",
    );
  }

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL ontbreekt. Zet in .env een Neon- of PostgreSQL-connection string (zie Neon-dashboard).",
    );
  }

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
      max: isVercelLike ? 1 : undefined,
    });
  globalForPrisma.pgPool = pool;

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrisma();
  return globalForPrisma.prisma;
}

/**
 * Lazy client: tijdens `next build` worden routes soms geladen zonder echte DB-aanroep.
 * Zo wordt geen pool geopend totdat er daadwerkelijk iets op de client wordt aangeroepen.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
}) as PrismaClient;
