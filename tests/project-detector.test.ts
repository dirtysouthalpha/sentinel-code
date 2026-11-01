import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProject, getProjectIcon } from "../src/core/project-detector.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sentinel-detect-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("detectProject", () => {
  it("returns null when no known project file exists", () => {
    expect(detectProject(root)).toBeNull();
  });

  it("detects a Node project and reads the package name", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@scope/my-app" }));
    const info = detectProject(root);
    expect(info).toMatchObject({ type: "node", name: "@scope/my-app", language: "TypeScript/JavaScript" });
  });

  it("falls back to the directory name when package.json is unparsable", () => {
    const dir = join(root, "fallback-name");
    mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), "{ not json");
    expect(detectProject(dir)?.name).toBe("fallback-name");
  });

  it("detects Rust, Python and Go projects with their names", () => {
    const rust = join(root, "rs");
    mkdirSync(rust);
    writeFileSync(join(rust, "Cargo.toml"), '[package]\nname = "crabby"\nversion = "0.1.0"\n');
    expect(detectProject(rust)).toMatchObject({ type: "rust", name: "crabby", language: "Rust" });

    const py = join(root, "py");
    mkdirSync(py);
    writeFileSync(join(py, "pyproject.toml"), '[project]\nname = "snek"\n');
    expect(detectProject(py)).toMatchObject({ type: "python", name: "snek", language: "Python" });

    const go = join(root, "go");
    mkdirSync(go);
    writeFileSync(join(go, "go.mod"), "module example.com/gopher\n\ngo 1.22\n");
    expect(detectProject(go)).toMatchObject({ type: "go", name: "example.com/gopher", language: "Go" });
  });

  it("prefers package.json when several project files are present", () => {
    writeFileSync(join(root, "Cargo.toml"), 'name = "crabby"\n');
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "node-wins" }));
    expect(detectProject(root)?.type).toBe("node");
  });
});

describe("getProjectIcon", () => {
  it("returns the folder icon for unknown projects and the project icon otherwise", () => {
    expect(getProjectIcon(root)).toBe("\u{1F4C1}");
    writeFileSync(join(root, "go.mod"), "module x\n");
    expect(getProjectIcon(root)).toBe("\u{1F408}");
  });
});
