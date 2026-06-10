import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSourceFile, parseKickoffUtc, isPlaceholder, type SourceFile } from "../openfootball";
import { R32_SEEDS, KO_SOURCES, type SeedRef } from "../bracket";
import { TEAMS_META } from "../teams-meta";

const src: SourceFile = JSON.parse(
  readFileSync(path.join(__dirname, "../../data/worldcup-2026.json"), "utf8")
);
const parsed = parseSourceFile(src);

describe("parseKickoffUtc", () => {
  it("converts source-local times to UTC", () => {
    expect(parseKickoffUtc("2026-06-11", "13:00 UTC-6").toISOString()).toBe("2026-06-11T19:00:00.000Z");
    expect(parseKickoffUtc("2026-07-19", "15:00 UTC-4").toISOString()).toBe("2026-07-19T19:00:00.000Z");
    expect(parseKickoffUtc("2026-06-12", "12:00 UTC").toISOString()).toBe("2026-06-12T12:00:00.000Z");
  });
});

describe("bundled 2026 schedule", () => {
  it("contains all 104 matches numbered 1..104", () => {
    expect(parsed).toHaveLength(104);
    expect(parsed.map((m) => m.num)).toEqual(Array.from({ length: 104 }, (_, i) => i + 1));
  });

  it("has 72 group matches (6 per group) and 32 knockout matches", () => {
    const group = parsed.filter((m) => m.stage === "GROUP");
    expect(group).toHaveLength(72);
    for (const g of "ABCDEFGHIJKL") {
      expect(group.filter((m) => m.groupName === g)).toHaveLength(6);
    }
    expect(parsed.filter((m) => m.stage === "R32")).toHaveLength(16);
    expect(parsed.filter((m) => m.stage === "R16")).toHaveLength(8);
    expect(parsed.filter((m) => m.stage === "QF")).toHaveLength(4);
    expect(parsed.filter((m) => m.stage === "SF")).toHaveLength(2);
    expect(parsed.filter((m) => m.stage === "THIRD")).toHaveLength(1);
    expect(parsed.filter((m) => m.stage === "FINAL")).toHaveLength(1);
  });

  it("the tournament opens June 11 and the final is July 19", () => {
    expect(parsed[0].kickoffUtc.toISOString()).toBe("2026-06-11T19:00:00.000Z");
    expect(parsed[103].kickoffUtc.toISOString().slice(0, 10)).toBe("2026-07-19");
  });

  it("every group team has FIFA code + flag metadata", () => {
    const names = new Set(
      parsed.filter((m) => m.stage === "GROUP").flatMap((m) => [m.homeName!, m.awayName!])
    );
    expect(names.size).toBe(48);
    for (const n of names) {
      expect(TEAMS_META[n], `missing meta for ${n}`).toBeDefined();
    }
  });

  it("R32_SEEDS matches the official schedule's placeholder labels", () => {
    const labelOf = (ref: SeedRef): string =>
      ref.kind === "pos" ? `${ref.pos}${ref.group}` : `3${ref.groups.join("/")}`;
    for (const m of parsed.filter((p) => p.stage === "R32")) {
      const seed = R32_SEEDS[m.num];
      expect(seed, `no seed map for match ${m.num}`).toBeDefined();
      expect(labelOf(seed.home)).toBe(m.homeSlot);
      expect(labelOf(seed.away)).toBe(m.awaySlot);
    }
  });

  it("KO_SOURCES matches the official schedule's W/L wiring", () => {
    for (const m of parsed.filter((p) => p.num >= 89)) {
      const src = KO_SOURCES[m.num];
      const label = (r: { win: number } | { lose: number }) =>
        "win" in r ? `W${r.win}` : `L${r.lose}`;
      expect(label(src.home)).toBe(m.homeSlot);
      expect(label(src.away)).toBe(m.awaySlot);
    }
  });

  it("recognises placeholder labels", () => {
    expect(isPlaceholder("1E")).toBe(true);
    expect(isPlaceholder("3A/B/C/D/F")).toBe(true);
    expect(isPlaceholder("W104")).toBe(true);
    expect(isPlaceholder("L101")).toBe(true);
    expect(isPlaceholder("Brazil")).toBe(false);
    expect(isPlaceholder("USA")).toBe(false);
  });
});
