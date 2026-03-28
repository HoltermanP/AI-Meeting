import { auth as clerkAuth, currentUser } from "@clerk/nextjs/server";
import type { User } from "@prisma/client";
import { prisma } from "./prisma";

/** Prisma-user gekoppeld aan de huidige Clerk-sessie (aanmaken of mergen op e-mail). */
export async function getSessionUser(): Promise<User | null> {
  const { userId } = await clerkAuth();
  if (!userId) return null;

  let user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (user) return user;

  const cu = await currentUser();
  if (!cu) return null;

  const primaryEmail =
    cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ??
    cu.emailAddresses[0]?.emailAddress;
  if (!primaryEmail) return null;

  const existingByEmail = await prisma.user.findUnique({
    where: { email: primaryEmail },
  });
  if (existingByEmail) {
    return prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        clerkId: userId,
        image: cu.imageUrl ?? existingByEmail.image,
        name:
          [cu.firstName, cu.lastName].filter(Boolean).join(" ") ||
          existingByEmail.name ||
          cu.username ||
          null,
      },
    });
  }

  const name =
    [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.username || null;

  return prisma.user.create({
    data: {
      clerkId: userId,
      email: primaryEmail,
      name,
      image: cu.imageUrl ?? null,
    },
  });
}

export type AppSession = {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  };
};

/** Zelfde vorm als voorheen (NextAuth), zodat API-routes minimaal wijzigen. */
export async function auth(): Promise<AppSession | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
  };
}
