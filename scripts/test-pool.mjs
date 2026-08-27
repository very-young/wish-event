/**
 * 일련번호 풀 지급 경로 시험.
 *
 * 실제로 당첨 처리를 한 번 돌려 풀에서 번호가 나오는지 확인하고,
 * 초기화 함수로 되돌려 번호가 복구되는지까지 본다.
 * 시험이 끝나면 데이터는 원래 상태로 돌아간다.
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

const show = async (label) => {
  const { data } = await admin.rpc("serial_summary").maybeSingle();
  console.log(`  ${label}: ${JSON.stringify(data)}`);
};

// 시험할 참여자 하나를 고른다
const { data: parts } = await admin
  .from("participants")
  .select("id, nickname, state, has_won")
  .limit(1);

if (!parts?.length) {
  console.log("참여자가 없어 시험할 수 없습니다.");
  process.exit(0);
}
const p = parts[0];
console.log(`\n시험 대상: ${p.nickname} (state=${p.state}, has_won=${p.has_won})`);

// 기존 당첨 기록이 있으면 먼저 되돌려 깨끗한 상태에서 시험한다
await admin.rpc("test_reset_winner", { p_nickname: p.nickname });

console.log("\n[1] 시험 전 현황");
await show("현황");

// 시험용 회차 생성
const { data: att, error: attErr } = await admin
  .from("attempts")
  .insert({
    participant_id: p.id,
    round_seeds: [1, 2, 3],
    category: "wealth",
    wish_text: "풀 지급 시험",
    status: "in_progress",
  })
  .select("id")
  .single();

if (attErr) {
  console.log("회차 생성 실패:", attErr.message);
  process.exit(1);
}

console.log("\n[2] 당첨 처리 호출");
const { data: res, error } = await admin
  .rpc("finish_attempt_success", {
    p_participant: p.id,
    p_attempt: att.id,
    p_places: [{ name: "시험 명소", description: "설명", emoji: "🌙" }],
  })
  .maybeSingle();

if (error) {
  console.log("  실패:", error.message);
} else {
  console.log(`  반환값: ${JSON.stringify(res)}`);
  const expected = "34CX-2KRW";
  console.log(
    `  첫 번째 번호(${expected})가 나왔는가: ${res?.serial === expected ? "예" : "아니오 → " + res?.serial}`,
  );
  await show("지급 후");

  // 번호가 그 사람에게 귀속됐는지 확인
  const { data: row } = await admin
    .from("serial_pool")
    .select("seq, serial, assigned_to, assigned_at")
    .eq("serial", res?.serial)
    .maybeSingle();
  console.log(
    `  귀속 확인: seq=${row?.seq} assigned=${row?.assigned_to === p.id ? "일치" : "불일치"} 시각=${row?.assigned_at ? "기록됨" : "없음"}`,
  );
}

console.log("\n[3] 초기화로 되돌리기");
const { data: reset, error: rErr } = await admin.rpc("test_reset_winner", {
  p_nickname: p.nickname,
});
if (rErr) console.log("  실패:", rErr.message);
else {
  console.log(`  ${JSON.stringify(reset)}`);
  await show("복구 후");
}

// 참여자 상태도 원래대로인지
const { data: after } = await admin
  .from("participants")
  .select("state, has_won")
  .eq("id", p.id)
  .maybeSingle();
console.log(`\n참여자 상태: state=${after?.state}, has_won=${after?.has_won}`);
console.log("");
