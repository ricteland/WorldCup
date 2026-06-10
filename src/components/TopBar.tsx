"use client";

import Link from "next/link";
import { CircleUserRound, HelpCircle, ShieldHalf } from "lucide-react";
import { Logo, Wordmark } from "./Logo";
import { useWelcome } from "./WelcomeDialog";

export function TopBar({ isAdmin }: { isAdmin: boolean }) {
  const { open } = useWelcome();
  return (
    <header className="sticky top-0 z-40">
      <div className="mx-auto max-w-lg px-3 pt-2">
        <div className="glass flex items-center justify-between rounded-2xl px-3 py-2 shadow-lg shadow-black/40">
          <Link href="/matches" className="flex items-center gap-2">
            <Logo size={28} />
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={open}
              aria-label="How it works"
              className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
            >
              <HelpCircle size={20} />
            </button>
            {isAdmin && (
              <Link
                href="/admin"
                aria-label="Admin"
                className="rounded-xl p-2 text-gold-400 transition-colors hover:bg-white/5"
              >
                <ShieldHalf size={20} />
              </Link>
            )}
            <Link
              href="/profile"
              aria-label="Profile"
              className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
            >
              <CircleUserRound size={20} />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
