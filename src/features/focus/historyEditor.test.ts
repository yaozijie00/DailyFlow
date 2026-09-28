import { afterEach, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../../db/test-helpers";
import { historyTiming, localInput, findFocusOverlaps } from "./historyEditor";
let close: (() => void) | undefined;
afterEach(() => close?.());

it("omits unchanged timing so note edits preserve exact milliseconds and timer provenance", () => {
  const row = { startedAt: new Date(2026, 8, 20, 9, 12, 37, 125).getTime(), actualSeconds: 91.875 };
  expect(historyTiming(row, localInput(row.startedAt), String(row.actualSeconds / 60))).toEqual({});
  expect(historyTiming(row, localInput(row.startedAt), "2")).toEqual({ durationSeconds: 120 });
  expect(historyTiming(row, localInput(row.startedAt + 60000), String(row.actualSeconds / 60))).toEqual({ startedAt: new Date(localInput(row.startedAt + 60000)).getTime() });
});

it("checks effective segments without flagging pauses, touching endpoints or the edited record", async () => {
  const fixture = await createTestDb(); close = fixture.close; const db = fixture.db;
  await db.run(sql`INSERT INTO focus_sessions(id,planned_duration,actual_duration,started_at,ended_at,created_at,completed) VALUES(1,60,20,100000,160000,100000,0)`);
  await db.run(sql`INSERT INTO focus_segments(session_id,started_at,ended_at,effective_ms) VALUES(1,100000,110000,10000),(1,150000,160000,10000),(1,120000,130000,0)`);
  expect(await findFocusOverlaps(db, 110000, 150000)).toEqual([]);
  expect(await findFocusOverlaps(db, 105000, 106000)).toHaveLength(1);
  expect(await findFocusOverlaps(db, 105000, 106000, 1)).toEqual([]);
});

it("checks legacy bounds when no segment evidence exists and includes live running time", async () => {
  const fixture = await createTestDb(); close = fixture.close; const db = fixture.db;
  await db.run(sql`INSERT INTO focus_sessions(id,planned_duration,actual_duration,started_at,ended_at,created_at,completed) VALUES(1,60,20,100000,160000,100000,0),(2,60,0,200000,NULL,200000,0)`);
  await db.run(sql`INSERT INTO focus_details(session_id,task_title,status,source,running_since,checkpoint_at) VALUES(2,'正在推进','running','timer',200000,200000)`);
  expect(await findFocusOverlaps(db, 140000, 150000)).toHaveLength(1);
  expect(await findFocusOverlaps(db, 210000, 220000, undefined, 230000)).toHaveLength(1);
});
