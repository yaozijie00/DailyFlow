import { afterEach, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./test-helpers";
import { readFocusSlices, splitFocusHours } from "./focusAnalytics";
let close: (() => void) | undefined;
afterEach(() => close?.());
it("splits genuine work over midnight and never fills a paused gap", async () => {
  const fixture = await createTestDb(); close = fixture.close; const db = fixture.db;
  const begin = new Date(2026, 8, 20, 23, 40).getTime(), midnight = new Date(2026, 8, 21).getTime();
  await db.run(sql`INSERT INTO focus_sessions(id,planned_duration,actual_duration,started_at,ended_at,created_at,completed) VALUES(1,3600,1800,${begin},${midnight + 30 * 60000},${begin},0)`);
  await db.run(sql`INSERT INTO focus_segments(session_id,started_at,ended_at,effective_ms) VALUES(1,${begin},${midnight},1200000),(1,${midnight + 20 * 60000},${midnight + 30 * 60000},600000)`);
  const before = await readFocusSlices(db, begin, midnight), after = await readFocusSlices(db, midnight, midnight + 3600000);
  expect(before.reduce((sum, row) => sum + row.seconds, 0)).toBe(1200);
  expect(after.reduce((sum, row) => sum + row.seconds, 0)).toBe(600);
  expect(splitFocusHours(await readFocusSlices(db, begin, midnight + 3600000)).map((row) => row.hour)).toEqual([23, 0]);
});
it("open and zero duration sessions do not become achievement contributions", async () => {
  const fixture = await createTestDb(); close = fixture.close;
  await fixture.db.run(sql`INSERT INTO focus_sessions(planned_duration,actual_duration,started_at,created_at,completed) VALUES(1500,0,1000,1000,0)`);
  expect(await readFocusSlices(fixture.db, 0, 10000)).toEqual([]);
});
it("legacy confirmed time stays on its original day after resuming with exact segments", async () => {
  const fixture = await createTestDb(); close = fixture.close; const db = fixture.db;
  const old = new Date(2026, 8, 19, 12).getTime(), today = new Date(2026, 8, 20).getTime();
  await db.run(sql`INSERT INTO focus_sessions(id,planned_duration,actual_duration,started_at,ended_at,created_at,completed) VALUES(1,3600,1800,${old},${today+600000},${old},0)`);
  await db.run(sql`INSERT INTO focus_segments(session_id,started_at,ended_at,effective_ms) VALUES(1,${today},${today+600000},600000)`);
  expect((await readFocusSlices(db, old, today)).reduce((s, r) => s+r.seconds, 0)).toBe(1200);
  expect((await readFocusSlices(db, today, today+86400000)).reduce((s, r) => s+r.seconds, 0)).toBe(600);
});
