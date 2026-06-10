// Compact shadcn-style primitives tuned for the dark "stadium night" theme.

import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-2xl", className)} {...props} />;
}

type ButtonVariant = "primary" | "ghost" | "danger" | "gold";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-pitch-500 text-night-950 font-semibold hover:bg-pitch-400 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
  ghost:
    "bg-white/5 text-slate-200 hover:bg-white/10 ring-1 ring-white/10 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
  danger:
    "bg-red-500/15 text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/25 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
  gold: "bg-gold-400 text-night-950 font-semibold hover:bg-gold-300 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-all",
        BUTTON_STYLES[variant],
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl bg-white/5 px-4 py-3 text-base text-slate-100 ring-1 ring-white/10",
        "placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pitch-500/60",
        className
      )}
      {...props}
    />
  );
}

export function Chip({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        className
      )}
      {...props}
    />
  );
}
