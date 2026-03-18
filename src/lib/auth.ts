import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Mật khẩu", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                const instructor = await prisma.instructor.findUnique({
                    where: { email: credentials.email },
                    include: { organization: true },
                });
                if (!instructor) return null;

                const ok = await bcrypt.compare(credentials.password, instructor.password);
                if (!ok) return null;

                return {
                    id: instructor.id,
                    name: instructor.name,
                    email: instructor.email,
                    role: instructor.role,
                    organizationId: instructor.organizationId,
                    organizationName: instructor.organization?.name ?? null,
                };
            },
        }),
    ],

    session: { strategy: "jwt" },
    secret: process.env.NEXTAUTH_SECRET,

    pages: {
        signIn: "/login",
    },

    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.name = user.name;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const u = user as any;
                token.role = u.role as string;
                token.organizationId = u.organizationId as string | null;
                token.organizationName = u.organizationName as string | null;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                const u = session.user as Record<string, unknown>;
                u.id = token.id as string;
                u.name = token.name as string;
                u.role = token.role as string;
                u.organizationId = token.organizationId as string | null;
                u.organizationName = token.organizationName as string | null;
            }
            return session;
        },
    },
};

export const getAuth = () => getServerSession(authOptions);
