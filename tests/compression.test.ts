import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point Headroom at an empty config dir so isHeadroomAvailable() is false and
// every call takes the deterministic local fallback path (no network).
process.env.HEADROOM_CONFIG_DIR = join(mkdtempSync(join(tmpdir(), "sentinel-headroom-")), "missing");

import { state } from "../src/core/state.js";
import {
  compressToolOutput,
  compressMessages,
  clearCompressionCache,
  getCompressionStats,
} from "../src/ai/compression.js";

describe("compression (local fallback)", () => {
  beforeAll(() => {
    state.reset();
  });

  beforeEach(() => {
    state.reset();
    clearCompressionCache();
  });

  it("returns input unchanged for an empty message list", async () => {
    const result = await compressMessages([]);
    expect(result).toEqual([]);
    expect(getCompressionStats().originalTokens).toBe(0);
  });

  it("merges consecutive same-role messages and truncates content", async () => {
    const a = "a".repeat(100);
    const b = "b".repeat(100);
    const c = "c".repeat(100);
    const result = await compressMessages([
      { role: "user", content: a },
      { role: "user", content: b },
      { role: "assistant", content: c },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("assistant");
    // first message of a run keeps 70%, subsequent same-role messages keep 60%
    expect(result[0].content).toBe("a".repeat(70) + " " + "b".repeat(60));
    expect(result[1].content).toBe("c".repeat(70));
  });

  it("never grows the content and records savings in state", async () => {
    const input = [{ role: "system", content: "x".repeat(350) }];
    const result = await compressMessages(input);

    expect(result[0].content.length).toBeLessThanOrEqual(input[0].content.length);

    const stats = getCompressionStats();
    expect(stats.originalTokens).toBeGreaterThan(0);
    expect(stats.compressedTokens).toBeLessThan(stats.originalTokens);
    expect(stats.savingsPercent).toBeGreaterThan(0);
    expect(stats.savingsPercent).toBeLessThanOrEqual(100);
    expect(stats.lastCompressed).toBeGreaterThan(0);
  });

  it("compressToolOutput prefixes the tool name and caches by content", async () => {
    const output = "line\n".repeat(50);
    const first = await compressToolOutput(output, "bash");
    expect(first.startsWith("[bash output]")).toBe(true);

    const statsAfterFirst = getCompressionStats();

    // Same content -> cache hit -> stats must not change.
    const second = await compressToolOutput(output, "bash");
    expect(second).toBe(first);
    expect(getCompressionStats()).toEqual(statsAfterFirst);

    // Clearing the cache makes the next call recompute (and re-count).
    clearCompressionCache();
    await compressToolOutput(output, "bash");
    expect(getCompressionStats().originalTokens).toBeGreaterThan(statsAfterFirst.originalTokens);
  });

  it("accumulates stats across multiple compressions", async () => {
    await compressMessages([{ role: "user", content: "y".repeat(70) }]);
    const once = getCompressionStats().originalTokens;
    await compressMessages([{ role: "user", content: "z".repeat(70) }]);
    expect(getCompressionStats().originalTokens).toBe(once * 2);
  });
});
