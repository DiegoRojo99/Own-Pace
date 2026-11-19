import "server-only";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Strava from "next-auth/providers/strava";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  pages: { signIn: "/", error: "/" },
  providers: [
    Strava({
      authorization: { params: { scope: "read,activity:read_all" } },
      profile(profile) {
        return {
          id: String(profile.id),
          stravaAthleteId: profile.id,
          name: `${profile.firstname} ${profile.lastname}`.trim(),
          email: null,
          image: profile.profile,
        };
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      return {
        expires: session.expires,
        user: { id: user.id, name: user.name, image: user.image },
      };
    },
  },
  events: {
    async signIn({ user, account }) {
      if (!user.id || account?.provider !== "strava" || !account.access_token) return;

      // Auth.js links tokens on first sign-in only. Reconnecting updates the same user's account.
      await db.account.updateMany({
        where: {
          userId: user.id,
          provider: "strava",
          providerAccountId: account.providerAccountId,
        },
        data: {
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expires_at: account.expires_at,
          scope: account.scope,
        },
      });
    },
  },
  logger: {
    error(error) {
      // OAuth error details can contain credentials. Log only the error category.
      console.error("Auth.js:", error.name);
    },
  },
});
