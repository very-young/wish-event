/**
 * 운영조회.sql의 쿼리가 실제로 동작하는지 확인한다.
 *
 * 표 이름이나 열 이름을 잘못 적어두면 정작 필요할 때 오류가 난다.
 * 그래서 파일을 만든 자리에서 전부 한 번 돌려본다. 읽기만 한다.
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

let failed = 0;
const ok = (m) => console.log(`  OK   ${m}`);
const bad = (m, d) => {
  console.log(`  FAIL ${m}`);
  if (d) console.log(`       ${d}`);
  failed++;
};

// 함수 호출 확인
const fns = [
  "serial_status",
  "serial_summary",
  "event_stats",
  "event_stats_by_category",
  "event_stats_daily",
  "event_window_status",
  "spot_count_status",
];
console.log("\n[functions]");
for (const fn of fns) {
  const { error } = await admin.rpc(fn);
  if (error) bad(fn, error.message);
  else ok(fn);
}

// 표와 열 확인
const tables = [
  ["winners", "serial, won_at, participant_id"],
  ["prize_stock", "id, total, remaining"],
  ["event_config", "id, start_date, end_date"],
  ["participants", "nickname, state, has_won, state_date"],
  ["attempts", "status, reached_round, started_at, category, wish_text"],
  ["share_tickets", "status, issued_at, expires_at, participant_id"],
  ["spot_recommend_counts", "spot_name, count"],
  [
    "gemini_usage",
    "created_at, total_tokens, model, category",
  ],
];
console.log("\n[tables / columns]");
for (const [table, cols] of tables) {
  const { error } = await admin.from(table).select(cols).limit(1);
  if (error) bad(`${table} (${cols})`, error.message);
  else ok(table);
}

/*
 * 테스트 정리 함수 확인.
 *
 * ⚠️ test_reset_all은 절대 호출하지 않는다. 부르면 데이터가 지워진다.
 *    test_reset_winner는 없는 닉네임을 넣어 부른다. 찾을 대상이 없으므로
 *    아무것도 바뀌지 않으면서 함수가 있는지는 확인된다.
 */
console.log("\n[reset functions]");
{
  const { error } = await admin.rpc("test_reset_winner", {
    p_nickname: "__존재하지않는닉네임__",
  });
  if (error && /Could not find the function/i.test(error.message)) {
    bad("test_reset_winner 없음 → 0009_test_reset.sql 미실행");
  } else if (error) {
    bad("test_reset_winner", error.message);
  } else {
    ok("test_reset_winner (대상 없어 아무것도 바뀌지 않음)");
  }
  console.log("  SKIP test_reset_all (부르면 데이터가 지워져 확인하지 않음)");
}

console.log(failed === 0 ? "\n결과: 모두 정상\n" : `\n결과: ${failed}건 문제\n`);
