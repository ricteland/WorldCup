import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { setSessionCookie } from "@/lib/session";

// POST /api/join { code, displayName } → sets cookie, returns recovery link.
// Existing names cannot be claimed by re-typing them (impersonation guard,
// PLAN.MD §4) — returning players must use their recovery link.
export async function POST(req: Request) {
  let body: { code?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const code = (body.code ?? "").trim();
  const displayName = (body.displayName ?? "").trim();
  const cfg = await getConfig();

  if (code.toUpperCase() !== cfg.leagueCode.toUpperCase()) {
    return NextResponse.json({ error: "Wrong join code" }, { status: 403 });
  }
  if (displayName.length < 2 || displayName.length > 24) {
    return NextResponse.json({ error: "Name must be 2–24 characters" }, { status: 400 });
  }

  const existing = await prisma.player.findFirst({
    where: { displayName: { equals: displayName } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "That name is taken. If it's you, open your private recovery link instead." },
      { status: 409 }
    );
  }

  const isFirst = (await prisma.player.count()) === 0;
  const player = await prisma.player.create({
    data: {
      displayName,
      recoveryToken: randomBytes(18).toString("base64url"),
      isAdmin: isFirst, // first joiner becomes admin when no seeded admin exists
    },
  });

  await setSessionCookie(player.id);
  return NextResponse.json({
    playerId: player.id,
    displayName: player.displayName,
    recoveryUrl: `${cfg.appUrl}/me/${player.recoveryToken}`,
  });
}
