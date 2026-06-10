"use client";

// Windows ships no flag emoji glyphs (Chrome/Edge render "MX" letter pairs
// instead). This registers a self-hosted Twemoji-based font that contains
// ONLY flag codepoints, and only on platforms that actually lack them —
// everyone else keeps their native emoji.

import { useEffect } from "react";
import { polyfillCountryFlagEmojis } from "country-flag-emoji-polyfill";

export function FlagPolyfill() {
  useEffect(() => {
    polyfillCountryFlagEmojis("Twemoji Country Flags", "/assets/TwemojiCountryFlags.woff2");
  }, []);
  return null;
}
