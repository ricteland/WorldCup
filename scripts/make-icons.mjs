// Renders the VAMOS2026 trophy (src/components/Logo.tsx artwork) into the PWA
// icons at public/assets/. Full-bleed night background with the trophy inside
// the maskable safe zone (center ~80%), so the same files serve both purposes.
//   node scripts/make-icons.mjs

import sharp from "sharp";
import { writeFile } from "node:fs/promises";

// keep in sync with the inline SVG in src/components/Logo.tsx
const art = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ef4444" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#f5c842" />
    </linearGradient>
  </defs>
  <!-- cup handles -->
  <path d="M15 26c-7 0-7 10 1 11M49 26c7 0 7 10-1 11" stroke="url(#g)" stroke-width="3"
    stroke-linecap="round" fill="none" />
  <!-- filled bowl, stem, base -->
  <path d="M15 24h34c0 12-7.5 20-17 20s-17-8-17-20z" fill="url(#g)" />
  <rect x="29.5" y="43" width="5" height="7" rx="1.5" fill="url(#g)" />
  <rect x="21" y="50.5" width="22" height="6" rx="2.5" fill="url(#g)" />
  <!-- football resting in the cup's mouth -->
  <circle cx="32" cy="17" r="10" fill="#060a13" stroke="url(#g)" stroke-width="3" />
  <path d="M32 11l5.5 4-2.1 6.5h-6.8L26.5 15l5.5-4z" fill="url(#g)" opacity="0.9" />
  <!-- confetti sparkles -->
  <path d="M53 7l1.4 3.6L58 12l-3.6 1.4L53 17l-1.4-3.6L48 12l3.6-1.4L53 7z" fill="#f5c842" />
  <path d="M9 12l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6L5.4 16.6l2.6-1 1-2.6z" fill="#ef4444" opacity="0.85" />
`;

// 64-unit artwork scaled to 360px and centered on a 512px night canvas
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#060a13" />
  <circle cx="256" cy="256" r="230" fill="#10b981" opacity="0.07" />
  <g transform="translate(76 76) scale(5.625)">${art}</g>
</svg>`;

for (const size of [512, 192]) {
  const out = `public/assets/icon-${size}.png`;
  await writeFile(out, await sharp(Buffer.from(icon)).resize(size, size).png().toBuffer());
  console.log(`wrote ${out}`);
}
