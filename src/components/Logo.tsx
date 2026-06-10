// PLACEHOLDER LOGO — swap for the real artwork.
// Drop the official/your-own logo at public/assets/logo.svg (and matching
// icon-192.png / icon-512.png) and replace this component's contents with
// an <Image>. Kept as inline SVG so the app ships without binary assets.

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-label="World Cup 2026 logo placeholder"
      role="img"
    >
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="55%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#f5c842" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" stroke="url(#lg)" strokeWidth="3.5" />
      {/* stylized football pentagon */}
      <path
        d="M32 18l11 8-4.2 13H25.2L21 26l11-8z"
        fill="url(#lg)"
        opacity="0.9"
      />
      <path
        d="M32 18v-7M43 26l7-3M38.8 39l4 6M25.2 39l-4 6M21 26l-7-3"
        stroke="url(#lg)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="font-display text-lg font-bold tracking-tight">
      <span className="text-slate-100">WC</span>
      <span className="bg-gradient-to-r from-pitch-400 to-gold-400 bg-clip-text text-transparent">
        26
      </span>
      <span className="ml-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
        Predictor
      </span>
    </span>
  );
}
