import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { runSync } from "@/lib/results";

// POST /api/admin/sync — trigger a results poll right now.
export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  const report = await runSync();
  return NextResponse.json(report, { status: report.ok ? 200 : 502 });
}
