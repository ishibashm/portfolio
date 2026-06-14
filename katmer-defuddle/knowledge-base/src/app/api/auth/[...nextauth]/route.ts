import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  useSecureCookies: process.env.NEXTAUTH_URL?.startsWith("https://") ?? true,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET || "fallback-secret-for-dev",
  session: {
    strategy: "jwt", // Use JWT for cross-domain proxy compatibility
  },
  callbacks: {
    async signIn({ user }) {
      const allowedEmails =
        process.env.ADMIN_EMAIL?.split(",").map((e) =>
          e.trim().toLowerCase(),
        ) || [];
      if (allowedEmails.length > 0) {
        if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) {
          console.warn(`Unauthorized login attempt by: ${user.email}`);
          return false; // Deny login
        }
      }
      return true; // Allow login
    },
    session: async ({ session, token, user }) => {
      if (session?.user) {
        session.user.id = (token.sub as string) || user?.id;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      try {
        const baseUrlObj = new URL(baseUrl);

        // basePath環境で NEXTAUTH_URL に /api/auth が含まれている場合の対策
        // アプリケーションのルートURLを算出する
        let appRoot = baseUrl;
        if (appRoot.endsWith("/api/auth")) {
          appRoot = appRoot.replace(/\/api\/auth$/, "");
        } else if (appRoot.endsWith("/api/auth/")) {
          appRoot = appRoot.replace(/\/api\/auth\/$/, "");
        }

        // url が相対パスの場合
        if (url.startsWith("/")) {
          const appRootObj = new URL(appRoot);
          // もし url がすでに basePath (例: /kb) を含んでいる場合は、origin と結合する
          if (
            appRootObj.pathname !== "/" &&
            url.startsWith(appRootObj.pathname)
          ) {
            return `${appRootObj.origin}${url}`;
          }
          // 含んでいない場合は、appRoot に追加する ("/" の場合は appRoot そのまま)
          const cleanUrl = url === "/" ? "" : url;
          return `${appRoot}${cleanUrl}`;
        }

        // url が絶対パスの場合
        const urlObj = new URL(url);
        // 同一ドメインからのリクエストなら許可する
        if (urlObj.origin === baseUrlObj.origin) {
          return url;
        }

        return appRoot;
      } catch (e) {
        // URLのパースエラーなどのフォールバック
        return baseUrl;
      }
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
