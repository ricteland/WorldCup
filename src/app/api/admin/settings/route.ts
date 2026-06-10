import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// POST /api/admin/settings — update [CONFIG] values live (league code, lock
// time, scoring weights). Stored as Setting rows, which take precedence over
// env vars.
const EDITABLE = new Set(["leagueCode", "lockAt", "scoring"]);

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE.has(key)) {
      return NextResponse.json({ error: `Unknown setting: ${key}` }, { status: 400 });
    }
    if (key === "lockAt" && Number.isNaN(Date.parse(value))) {
      return NextResponse.json({ error: "lockAt must be an ISO date-time" }, { status: 400 });
    }
    if (key === "scoring") {
      try {
        JSON.parse(value);
      } catch {
        return NextResponse.json({ error: "scoring must be valid JSON" }, { status: 400 });
      }
    }
  }

  for (const [key, value] of Object.entries(body)) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return NextResponse.json({ ok: true });
}
