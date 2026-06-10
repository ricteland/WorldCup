"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Table2, GitFork, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/matches", label: "Matches", icon: CalendarDays },
  { href: "/groups", label: "Groups", icon: Table2 },
  { href: "/bracket", label: "Bracket", icon: GitFork },
  { href: "/leaderboard", label: "Leaders", icon: Trophy },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 safe-bottom">
      <div className="mx-auto max-w-lg px-3 pb-2">
        <div className="glass flex rounded-2xl shadow-2xl shadow-black/60">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-pitch-400" : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                {label}
                <span
                  className={cn(
                    "h-1 w-1 rounded-full transition-all",
                    active ? "bg-pitch-400" : "bg-transparent"
                  )}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
