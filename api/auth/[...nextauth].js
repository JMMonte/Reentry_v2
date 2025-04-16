import NextAuth from "next-auth";
import ResendProvider from "next-auth/providers/resend";
import PostgresAdapter from "@auth/pg-adapter";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const authOptions = {
    adapter: PostgresAdapter(pool),
    providers: [
        ResendProvider({
            from: "Test <onboarding@resend.dev>",
        }),
    ],
    secret: process.env.AUTH_SECRET,
};

export default function handler(req, res) {
    return NextAuth(req, res, authOptions);
} 