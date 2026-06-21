/**
 * Voert prisma migrate deploy uit met retries.
 * Neon/Vercel: advisory locks falen soms bij korte timeouts of pooler-URL's.
 * Zet DIRECT_URL in Vercel (Neon direct connection, zonder "-pooler").
 */
import { execSync } from "node:child_process";

const MAX_ATTEMPTS = 5;
const DELAY_MS = 6000;

const migrateUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || "";

if (migrateUrl.includes("-pooler")) {
  console.warn(
    "[migrate] Waarschuwing: DATABASE_URL gebruikt de Neon pooler. " +
      "Zet DIRECT_URL in Vercel voor betrouwbare migraties (Neon → Connect → Direct connection).",
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    process.exit(0);
  } catch {
    if (attempt === MAX_ATTEMPTS) {
      console.error(`[migrate] mislukt na ${MAX_ATTEMPTS} pogingen.`);
      process.exit(1);
    }
    console.warn(
      `[migrate] poging ${attempt}/${MAX_ATTEMPTS} mislukt — opnieuw over ${DELAY_MS / 1000}s…`,
    );
    await sleep(DELAY_MS);
  }
}
