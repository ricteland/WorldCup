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

  // the house never goes broke: the admin's bankroll refills itself $100 at
  // a time, so bankruptcy (and its leaderboard badge) is for players only
  let bankroll = player.gambleBalance;
  if (player.isAdmin && bankroll <= 0) {
    await prisma.player.update({
      where: { id: player.id },
      data: { gambleBalance: { increment: 100 } },
    });
    bankroll += 100;
  }

  if (bankroll <= 0) {
    return NextResponse.json(
      { error: "You're bankrupt. No crying in the casino." },
      { status: 400 }
    );
  }
  if ((amount as number) > bankroll) {
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
  let balance = fresh?.gambleBalance ?? 0;
  let refilled = false;
  if (player.isAdmin && balance <= 0) {
    await prisma.player.update({
      where: { id: player.id },
      data: { gambleBalance: { increment: 100 } },
    });
    balance += 100;
    refilled = true;
  }

  return NextResponse.json({
    roll,
    color: rollColor(roll),
    win,
    payout,
    balance,
    refilled,
  });
}
