import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const adminEmail = process.env.ENTYSA_ADMIN_EMAIL ?? "";
const adminPassword = process.env.ENTYSA_ADMIN_PASSWORD ?? "";

export const { auth, handlers, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/login"
  },
  providers: [
    Credentials({
      name: "Entysa Admin",
      credentials: {
        email: {
          label: "E-posta",
          type: "email"
        },
        password: {
          label: "Şifre",
          type: "password"
        }
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");

        if (!adminEmail || !adminPassword) {
          return null;
        }

        if (email !== adminEmail.toLowerCase() || password !== adminPassword) {
          return null;
        }

        return {
          id: "entysa-admin",
          name: "Entysa Admin",
          email: adminEmail
        };
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  secret: process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? "entysa-commerce-audit-dev-secret" : undefined),
  trustHost: true
});
