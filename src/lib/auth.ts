import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            role: true,
            branchId: true,
          },
        });

        if (!user) return null;

        const valid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );
        if (!valid) return null;

        // A technician account is a shared team device — surface the team name as its identity.
        let teamName: string | null = null;
        if (user.role === "TECHNICIAN") {
          const teams = await prisma.team.findMany({
            where: { members: { some: { id: user.id } } },
            select: { name: true },
            orderBy: { name: "asc" },
          });
          teamName = teams.map((t) => t.name).join(", ") || null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          branchId: user.branchId,
          teamName,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 90 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
        token.branchId = (user as { branchId: string | null }).branchId;
        token.teamName = (user as { teamName?: string | null }).teamName ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.branchId = token.branchId;
      let teamName = token.teamName ?? null;
      if (token.role === "TECHNICIAN") {
        const teams = await prisma.team.findMany({
          where: { members: { some: { id: token.id } } },
          select: { name: true },
          orderBy: { name: "asc" },
        });
        teamName = teams.map((t) => t.name).join(", ") || null;
      }
      session.user.teamName = teamName;
      return session;
    },
  },
  pages: {
    signIn: "/app/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
