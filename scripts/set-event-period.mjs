/**
 * 이벤트 기간을 DB에 반영한다.
 *
 * 실제 참여 차단은 DB(event_config)가 판정한다. 화면 문구
 * (src/content/settings.ts)와 반드시 같아야 한다.
 *
 * 사용법:
 *   node scripts/set-event-period.mjs             현재 설정 확인
 *   node scripts/set-event-period.mjs --apply     settings.ts 값으로 맞추기
 *   node scripts/set-event-period.mjs --test      테스트용으로 넓게 열기
 *   node scripts/set-event-period.mjs --end-only  종료일만 맞추기
 *
 * --end-only는 오픈 전에 쓴다. 종료일은 실제 값으로 두면서 시작일은
 * 넓게 열어두어, 오픈 전에도 테스트할 수 있게 한다.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 1) continue;
  env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/** settings.ts에서 화면에 쓰는 기간을 읽는다 */
const settings = readFileSync("src/content/settings.ts", "utf8");
const startMatch = settings.match(/startDate:\s*"([\d-]+)"/);
const endMatch = settings.match(/endDate:\s*"([\d-]+)"/);
if (!startMatch || !endMatch) {
  console.log("settings.ts에서 기간을 읽지 못했습니다.");
  process.exit(1);
}
const uiStart = startMatch[1];
const uiEnd = endMatch[1];

const mode = process.argv[2];

const show = async (label) => {
  const { data } = await admin.from("event_config").select("*").eq("id", "main");
  const row = data?.[0];
  console.log(`  ${label}: ${row?.start_date} ~ ${row?.end_date}`);
  return row;
};

console.log(`\n화면 문구 (settings.ts): ${uiStart} ~ ${uiEnd}`);
console.log("\n[DB 현재 설정]");
const before = await show("현재");

if (mode === "--apply") {
  console.log("\n[적용]");
  const { error } = await admin
    .from("event_config")
    .update({ start_date: uiStart, end_date: uiEnd })
    .eq("id", "main");
  if (error) {
    console.log("  실패:", error.message);
    process.exit(1);
  }
  await show("변경 후");
  console.log("\n화면 문구와 DB가 일치합니다.\n");
} else if (mode === "--end-only") {
  /*
   * 종료일만 실제 값으로 맞춘다. 시작일은 건드리지 않는다.
   *
   * 오픈 전에 쓰는 설정이다. 종료일을 미리 정확히 넣어두면 이벤트가
   * 끝난 뒤 참여가 자동으로 닫힌다. 시작일은 넓게 열려 있어 지금도
   * 테스트할 수 있다.
   *
   * ⚠️ 오픈 시점에는 --apply로 시작일까지 맞춰야 한다. 그때까지는
   *    기간 밖에서도 참여가 가능한 상태다.
   */
  console.log("\n[종료일만 적용]");
  const { error } = await admin
    .from("event_config")
    .update({ end_date: uiEnd })
    .eq("id", "main");
  if (error) {
    console.log("  실패:", error.message);
    process.exit(1);
  }
  const after = await show("변경 후");
  console.log(`\n종료일: ${after?.end_date} (화면 문구와 일치)`);
  console.log(
    `시작일: ${after?.start_date} (테스트용으로 열려 있음 — 오픈 시 --apply 필요)\n`,
  );
} else if (mode === "--test") {
  console.log("\n[테스트용으로 넓게 열기]");
  const { error } = await admin
    .from("event_config")
    .update({ start_date: "2026-08-01", end_date: "2026-12-31" })
    .eq("id", "main");
  if (error) {
    console.log("  실패:", error.message);
    process.exit(1);
  }
  await show("변경 후");
  console.log("\n⚠️ 오픈 전에 --apply로 실제 기간을 되돌려야 합니다.\n");
} else {
  const matches = before?.start_date === uiStart && before?.end_date === uiEnd;
  console.log(
    matches
      ? "\n화면 문구와 DB가 일치합니다.\n"
      : "\n⚠️ 화면 문구와 DB가 다릅니다. --apply로 맞추세요.\n",
  );
}
