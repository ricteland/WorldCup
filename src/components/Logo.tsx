// VAMOS2026 mark: a little World Cup trophy whose globe is a football, in
// fiesta red→gold (the league is Spanish, after all). Inline SVG so the app
// ships without binary assets — drop real artwork at public/assets/logo.svg
// and swap this for an <Image> if the league ever commissions one.

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-label="VAMOS2026 logo"
      role="img"
    >
      <defs>
        <linearGradient id="vamos-lg" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#f5c842" />
        </linearGradient>
      </defs>
      {/* cup handles */}
      <path
        d="M15 26c-7 0-7 10 1 11M49 26c7 0 7 10-1 11"
        stroke="url(#vamos-lg)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* filled bowl, stem, base */}
      <path d="M15 24h34c0 12-7.5 20-17 20s-17-8-17-20z" fill="url(#vamos-lg)" />
      <rect x="29.5" y="43" width="5" height="7" rx="1.5" fill="url(#vamos-lg)" />
      <rect x="21" y="50.5" width="22" height="6" rx="2.5" fill="url(#vamos-lg)" />
      {/* football resting in the cup's mouth */}
      <circle cx="32" cy="17" r="10" fill="#060a13" stroke="url(#vamos-lg)" strokeWidth="3" />
      <path d="M32 11l5.5 4-2.1 6.5h-6.8L26.5 15l5.5-4z" fill="url(#vamos-lg)" opacity="0.9" />
      {/* confetti sparkles */}
      <path d="M53 7l1.4 3.6L58 12l-3.6 1.4L53 17l-1.4-3.6L48 12l3.6-1.4L53 7z" fill="#f5c842" />
      <path d="M9 12l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6L5.4 16.6l2.6-1 1-2.6z" fill="#ef4444" opacity="0.85" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="font-display text-lg font-bold tracking-tight">
      <span className="text-slate-400">¡</span>
      <span className="bg-gradient-to-r from-red-500 via-gold-400 to-pitch-400 bg-clip-text text-transparent">
        VAMOS
      </span>
      <span className="text-slate-100">2026</span>
      <span className="text-slate-400">!</span>
    </span>
  );
}
