// Passwordless sessions (PLAN.MD §4): a signed httpOnly cookie holding the
// player id. HMAC-SHA256 with SESSION_SECRET — no passwords, no expiry pressure.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import type { Player } from "@prisma/client";

const COOKIE_NAME = "wc_session";
const MAX_AGE = 60 * 60 * 24 * 400; // ~13 months — outlives the tournament

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function sign(playerId: string): string {
  const mac = createHmac("sha256", secret()).update(playerId).digest("base64url");
  return `${playerId}.${mac}`;
}

function verify(value: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const playerId = value.slice(0, dot);
  const mac = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(
    createHmac("sha256", secret()).update(playerId).digest("base64url")
  );
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  return playerId;
}

export async function setSessionCookie(playerId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, sign(playerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSessionPlayerId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  return raw ? verify(raw) : null;
}

export async function getCurrentPlayer(): Promise<Player | null> {
  const id = await getSessionPlayerId();
  if (!id) return null;
  return prisma.player.findUnique({ where: { id } });
}

export async function requireAdmin(): Promise<Player> {
  const p = await getCurrentPlayer();
  if (!p?.isAdmin) throw new Error("FORBIDDEN");
  return p;
}
