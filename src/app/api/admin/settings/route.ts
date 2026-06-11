import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// POST /api/admin/settings — update [CONFIG] values live (league code, lock
// window, scoring weights). Stored as Setting rows, which take precedence over
// env vars.
const EDITABLE = new Set(["leagueCode", "lockMinutes", "scoring"]);

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
    if (key === "lockMinutes" && (!/^\d+$/.test(value) || Number(value) < 0)) {
      return NextResponse.json(
        { error: "lockMinutes must be a whole number of minutes" },
        { status: 400 }
      );
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
