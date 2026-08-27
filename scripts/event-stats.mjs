/**
 * 이벤트 참여 현황 확인.
 * 사용법: node scripts/event-stats.mjs
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

const { data: overall, error } = await admin.rpc("event_stats").maybeSingle();

if (error) {
  if (/Could not find the function/i.test(error.message)) {
    console.log("\n통계 함수가 아직 없습니다.");
    console.log("Supabase SQL Editor에서 0010_event_stats.sql을 실행하세요.\n");
  } else {
    console.log("조회 실패:", error.message);
  }
  process.exit(1);
}

console.log("\n===== 전체 현황 =====");
console.log(`참여자 수         : ${overall.참여자수}명`);
console.log(`총 회차 수         : ${overall.총회차수}회`);
console.log(`라운드 1 도달      : ${overall.라운드1도달}회`);
console.log(`라운드 2 도달      : ${overall.라운드2도달}회`);
console.log(`라운드 3 도달      : ${overall.라운드3도달}회`);
console.log(`성공 회차          : ${overall.성공회차}회`);
console.log(`당첨자 수          : ${overall.당첨자수}명`);
console.log(`당첨률 (회차 대비) : ${overall.당첨률}%`);
console.log(`재도전으로 시작    : ${overall.재도전으로시작한회차}회`);
console.log(`오늘 참여자 수     : ${overall.오늘참여자수}명`);

const { data: byCategory } = await admin.rpc("event_stats_by_category");
if (byCategory?.length) {
  console.log("\n===== 소원 유형별 =====");
  for (const row of byCategory) {
    console.log(
      `  ${row.소원유형.padEnd(10)} 회차 ${row.회차수}  성공 ${row.성공수}`,
    );
  }
}

const { data: daily } = await admin.rpc("event_stats_daily");
if (daily?.length) {
  console.log("\n===== 날짜별 =====");
  for (const row of daily) {
    console.log(
      `  ${row.날짜}  회차 ${row.회차수}  성공 ${row.성공수}  당첨 ${row.당첨수}`,
    );
  }
}
console.log("");
