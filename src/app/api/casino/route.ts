import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentPlayer } from "@/lib/session";
import { betWins, parseBet, payoutMultiplier, rollColor } from "@/lib/casino";

// POST /api/casino { bet: { type, number?, dozen? }, amount } — one roulette
// spin in the gambling-corner easter egg. The wheel is crypto-random, the
// balance update is guarded so a stale client can't bet money it no longer
// has, and $0 is the end of the road: no income, no credit, just the
// bankruptcy badge on the leaderboard.
export async function POST(req: Request) {
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { bet?: unknown; amount?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const bet = parseBet(body.bet);
  const amount = body.amount;
  if (!bet || !Number.isInteger(amount) || (amount as number) < 1) {
    return NextResponse.json({ error: "Place a valid bet first" }, { status: 400 });
  }

  if (player.gambleBalance <= 0) {
    return NextResponse.json(
      { error: "You're bankrupt. The house thanks you for your patronage." },
      { status: 400 }
    );
  }
  if ((amount as number) > player.gambleBalance) {
    return NextResponse.json({ error: "You can't bet more than you have" }, { status: 400 });
  }

  const roll = randomInt(0, 37);
  const win = betWins(bet, roll);
  const payout = win ? (amount as number) * payoutMultiplier(bet) : 0;
  const delta = payout - (amount as number);

  // guard against double-spends from parallel/stale requests
  const updated = await prisma.player.updateMany({
    where: { id: player.id, gambleBalance: { gte: amount as number } },
    data: { gambleBalance: { increment: delta } },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "You can't bet more than you have" }, { status: 400 });
  }

  const fresh = await prisma.player.findUnique({
    where: { id: player.id },
    select: { gambleBalance: true },
  });
  return NextResponse.json({
    roll,
    color: rollColor(roll),
    win,
    payout,
    balance: fresh?.gambleBalance ?? 0,
  });
}
