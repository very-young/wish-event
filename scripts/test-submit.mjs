/**
 * 결과 제출 경로를 서버 쪽에서 직접 시험한다.
 *
 * 브라우저에서 실패하는 원인이 서버 로직인지, 브라우저-서버 통신인지
 * 구분하기 위한 진단 스크립트.
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

// 진행 중인 회차 하나를 골라 실패 처리를 시험한다
const { data: attempts } = await admin
  .from("attempts")
  .select("id, participant_id, status")
  .eq("status", "in_progress")
  .limit(1);

if (!attempts || attempts.length === 0) {
  console.log("진행 중 회차가 없습니다.");
  process.exit(0);
}

const a = attempts[0];
console.log(`\n대상 회차: ${a.id.slice(0, 8)}...`);

console.log("\nfinish_attempt_failed 호출:");
const { error: failErr } = await admin.rpc("finish_attempt_failed", {
  p_participant: a.participant_id,
  p_attempt: a.id,
  p_reached_round: 2,
  p_invalid: false,
});

if (failErr) {
  console.log("  오류:", failErr.message);
  console.log("  code:", failErr.code);
  console.log("  details:", failErr.details);
  console.log("  hint:", failErr.hint);
} else {
  console.log("  성공");

  const { data: after } = await admin
    .from("attempts")
    .select("status, reached_round, ended_at")
    .eq("id", a.id)
    .maybeSingle();
  console.log("  회차 상태:", JSON.stringify(after));

  const { data: p } = await admin
    .from("participants")
    .select("state")
    .eq("id", a.participant_id)
    .maybeSingle();
  console.log("  참여자 상태:", p?.state);
}

console.log("");
