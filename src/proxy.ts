import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/auth/login(.*)",
  "/auth/register(.*)",
  // Microsoft OAuth callback moet buiten Clerk-sessiebeheer vallen
  "/api/calendar/callback(.*)",
  "/api/calendar/webhook(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  if (req.nextUrl.pathname.startsWith("/api")) return;
  await auth.protect();
});

export const config = {
  matcher: [
    // Alles behalve statische bestanden én de MS OAuth-routes die Clerk niet mag aanraken
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)|api/calendar/callback|api/calendar/webhook).*)",
    "/(api|trpc)((?!/calendar/callback|/calendar/webhook).*)",
  ],
};
