import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../test-helpers";
import type { Db } from "../db";
import { SettingsRepository } from "./settingsRepository";

describe("SettingsRepository", () => {
  let db: Db;
  let close: () => void;
  let settings: SettingsRepository;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    settings = new SettingsRepository(db);
  });

  afterEach(() => close());

  it("sets and gets a value", async () => {
    await settings.set("pomodoro_duration", "1500");
    expect(await settings.get("pomodoro_duration")).toBe("1500");
  });

  it("returns null for a missing key", async () => {
    expect(await settings.get("missing")).toBeNull();
  });

  it("overwrites an existing key (upsert)", async () => {
    await settings.set("theme", "light");
    await settings.set("theme", "dark");
    expect(await settings.get("theme")).toBe("dark");
    const all = await settings.getAll();
    expect(Object.keys(all)).toEqual(["theme"]);
  });

  it("gets all settings as a map", async () => {
    await settings.set("a", "1");
    await settings.set("b", "2");
    expect(await settings.getAll()).toEqual({ a: "1", b: "2" });
  });

  it("deletes a key", async () => {
    await settings.set("a", "1");
    expect(await settings.delete("a")).toBe(true);
    expect(await settings.get("a")).toBeNull();
  });
});
