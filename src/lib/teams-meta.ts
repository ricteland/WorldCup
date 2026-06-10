// FIFA 3-letter codes + flag emojis for the 48 qualified teams (2026 final draw).
// Names must match the openfootball/worldcup.json team names exactly — the seed
// and sync jobs key on them.

export interface TeamMeta {
  code: string;
  flag: string;
}

export const TEAMS_META: Record<string, TeamMeta> = {
  // Group A
  Mexico: { code: "MEX", flag: "🇲🇽" },
  "South Africa": { code: "RSA", flag: "🇿🇦" },
  "South Korea": { code: "KOR", flag: "🇰🇷" },
  "Czech Republic": { code: "CZE", flag: "🇨🇿" },
  // Group B
  Canada: { code: "CAN", flag: "🇨🇦" },
  Switzerland: { code: "SUI", flag: "🇨🇭" },
  Qatar: { code: "QAT", flag: "🇶🇦" },
  "Bosnia & Herzegovina": { code: "BIH", flag: "🇧🇦" },
  // Group C
  Brazil: { code: "BRA", flag: "🇧🇷" },
  Morocco: { code: "MAR", flag: "🇲🇦" },
  Scotland: { code: "SCO", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  Haiti: { code: "HAI", flag: "🇭🇹" },
  // Group D
  USA: { code: "USA", flag: "🇺🇸" },
  Australia: { code: "AUS", flag: "🇦🇺" },
  Paraguay: { code: "PAR", flag: "🇵🇾" },
  Turkey: { code: "TUR", flag: "🇹🇷" },
  // Group E
  Germany: { code: "GER", flag: "🇩🇪" },
  Ecuador: { code: "ECU", flag: "🇪🇨" },
  "Ivory Coast": { code: "CIV", flag: "🇨🇮" },
  "Curaçao": { code: "CUW", flag: "🇨🇼" },
  // Group F
  Netherlands: { code: "NED", flag: "🇳🇱" },
  Japan: { code: "JPN", flag: "🇯🇵" },
  Sweden: { code: "SWE", flag: "🇸🇪" },
  Tunisia: { code: "TUN", flag: "🇹🇳" },
  // Group G
  Belgium: { code: "BEL", flag: "🇧🇪" },
  Iran: { code: "IRN", flag: "🇮🇷" },
  Egypt: { code: "EGY", flag: "🇪🇬" },
  "New Zealand": { code: "NZL", flag: "🇳🇿" },
  // Group H
  Spain: { code: "ESP", flag: "🇪🇸" },
  Uruguay: { code: "URU", flag: "🇺🇾" },
  "Saudi Arabia": { code: "KSA", flag: "🇸🇦" },
  "Cape Verde": { code: "CPV", flag: "🇨🇻" },
  // Group I
  France: { code: "FRA", flag: "🇫🇷" },
  Senegal: { code: "SEN", flag: "🇸🇳" },
  Norway: { code: "NOR", flag: "🇳🇴" },
  Iraq: { code: "IRQ", flag: "🇮🇶" },
  // Group J
  Argentina: { code: "ARG", flag: "🇦🇷" },
  Austria: { code: "AUT", flag: "🇦🇹" },
  Algeria: { code: "ALG", flag: "🇩🇿" },
  Jordan: { code: "JOR", flag: "🇯🇴" },
  // Group K
  Portugal: { code: "POR", flag: "🇵🇹" },
  Colombia: { code: "COL", flag: "🇨🇴" },
  Uzbekistan: { code: "UZB", flag: "🇺🇿" },
  "DR Congo": { code: "COD", flag: "🇨🇩" },
  // Group L
  England: { code: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁬󠁿" },
  Croatia: { code: "CRO", flag: "🇭🇷" },
  Panama: { code: "PAN", flag: "🇵🇦" },
  Ghana: { code: "GHA", flag: "🇬🇭" },
};
