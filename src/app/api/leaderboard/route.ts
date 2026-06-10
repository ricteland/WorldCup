import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/session";
import { getLeaderboard } from "@/lib/data";

// GET /api/leaderboard — ranked players (total / match pts / bracket pts).
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rows = await getLeaderboard();
  return NextResponse.json({ rows, you: player.id });
}
