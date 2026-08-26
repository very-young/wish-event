/**
 * DB 함수가 최신 버전으로 적용됐는지 확인.
 *
 * 0004, 0005 마이그레이션이 실제로 반영됐는지 점검한다.
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
  if (d) console.log(`       -> ${d}`);
  failed++;
};

console.log("\n[0005 적용 여부] 복구 함수 존재 확인");
{
  // recover_stale_attempts가 있으면 0005가 적용된 것
  const { error } = await admin.rpc("recover_stale_attempts", {
    p_participant: "00000000-0000-0000-0000-000000000000",
  });
  if (error && /Could not find the function/i.test(error.message)) {
    bad("recover_stale_attempts 함수 없음 → 0005 미적용", error.message);
  } else if (error) {
    bad("recover_stale_attempts 호출 오류", error.message);
  } else {
    ok("recover_stale_attempts 함수 존재 (0005 적용됨)");
  }
}

console.log("\n[0005 적용 여부] 타임아웃 함수 확인");
{
  const { data, error } = await admin.rpc("stale_attempt_timeout");
  if (error) bad("stale_attempt_timeout 없음", error.message);
  else ok(`stale_attempt_timeout → ${JSON.stringify(data)}`);
}

console.log("\n[0004 적용 여부] 위조 티켓 거부 확인");
{
  const { data, error } = await admin.rpc("grant_retry_from_webhook", {
    p_ticket: "00000000-0000-0000-0000-000000000000",
    p_chat_hash: "probe",
    p_chat_type: "DirectChat",
  });
  if (error) bad("grant_retry_from_webhook 오류", error.message);
  else if (data === "rejected") ok("위조 티켓 거부 (0004 적용됨)");
  else bad(`예상과 다른 반환값: ${JSON.stringify(data)}`);
}

console.log("\n[갇힌 회차 정리 여부]");
{
  const { data: stuck } = await admin
    .from("attempts")
    .select("id, status, started_at")
    .eq("status", "in_progress");

  if (!stuck || stuck.length === 0) ok("진행 중 회차 없음 (정리 완료)");
  else bad(`진행 중 회차 ${stuck.length}개 남아 있음`);

  const { data: parts } = await admin
    .from("participants")
    .select("id, state")
    .eq("state", "in_progress");

  if (!parts || parts.length === 0) ok("in_progress 상태 참여자 없음");
  else bad(`in_progress 참여자 ${parts.length}명 남아 있음`);
}

console.log("\n[전체 회차 기록]");
{
  const { data: all } = await admin
    .from("attempts")
    .select("id, status, category, reached_round, is_retry, started_at, ended_at")
    .order("started_at", { ascending: false })
    .limit(10);

  if (!all || all.length === 0) {
    console.log("  회차 기록 없음");
  } else {
    for (const a of all) {
      console.log(
        `  ${a.id.slice(0, 8)}... status=${a.status} round=${a.reached_round} retry=${a.is_retry} ended=${a.ended_at ? "O" : "X"}`,
      );
    }
  }
}

console.log("\n[당첨 기록]");
{
  const { data: winners } = await admin
    .from("winners")
    .select("participant_id, serial, won_at");
  if (!winners || winners.length === 0) console.log("  당첨자 없음");
  else
    for (const w of winners)
      console.log(`  ${w.participant_id.slice(0, 8)}... serial=${w.serial}`);
}

console.log(
  failed === 0 ? "\n결과: 모두 정상\n" : `\n결과: ${failed}건 문제\n`,
);
