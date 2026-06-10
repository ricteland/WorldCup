import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/session";
import { getCore, derivePlayer, persistBracketPicks, getRealProgress } from "@/lib/data";
import { gradeBracketSlot } from "@/lib/scoring";

// GET /api/bracket — own derived bracket + correctness overlay once known.
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const core = await getCore();
  const [derived, progress] = await Promise.all([
    derivePlayer(player.id, core),
    getRealProgress(core),
  ]);

  const slots = Object.fromEntries(
    Object.entries(derived.slots).map(([slot, teamId]) => [
      slot,
      { teamId, grade: gradeBracketSlot(slot, teamId, progress) },
    ])
  );

  return NextResponse.json({
    slots,
    openMatchNums: derived.openMatchNums,
    staleMatchNums: derived.staleMatchNums,
    qualifiedThirdGroups: derived.qualifiedThirdGroups,
  });
}

// POST /api/bracket — recompute + persist the derived picks (idempotent; the
// cascade is the single source of truth, so there is nothing to submit).
export async function POST() {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const derived = await derivePlayer(player.id);
  await persistBracketPicks(player.id, derived);
  return NextResponse.json({ ok: true, slots: derived.slots });
}
