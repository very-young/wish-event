/**
 * 성공 처리 경로 시험.
 *
 * 3라운드 성공 시 당첨 확정과 일련번호 발급이 되는지 확인한다.
 * 실제 회차를 하나 만들어 테스트하고 끝나면 정리한다.
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

// 기존 참여자 하나를 빌려 시험한다
const { data: parts } = await admin
  .from("participants")
  .select("id, state, has_won")
  .limit(1);

if (!parts || parts.length === 0) {
  console.log("참여자가 없어 시험할 수 없습니다.");
  process.exit(0);
}

const pid = parts[0].id;
console.log(`\n참여자: ${pid.slice(0, 8)}... state=${parts[0].state} has_won=${parts[0].has_won}`);

// 시험용 회차 생성
const { data: created, error: createErr } = await admin
  .from("attempts")
  .insert({
    participant_id: pid,
    round_seeds: [1, 2, 3],
    category: "wealth",
    wish_text: "테스트 소원입니다",
    status: "in_progress",
  })
  .select("id")
  .single();

if (createErr) {
  console.log("회차 생성 실패:", createErr.message);
  process.exit(1);
}

console.log(`시험 회차 생성: ${created.id.slice(0, 8)}...`);

console.log("\nfinish_attempt_success 호출:");
const { data: result, error } = await admin
  .rpc("finish_attempt_success", {
    p_participant: pid,
    p_attempt: created.id,
    p_places: [{ name: "테스트 명소", description: "설명", emoji: "🌙" }],
  })
  .maybeSingle();

if (error) {
  console.log("  오류:", error.message);
  console.log("  code:", error.code);
  console.log("  hint:", error.hint);
} else {
  console.log("  반환값:", JSON.stringify(result));

  const { data: att } = await admin
    .from("attempts")
    .select("status, reached_round, places_shown, ended_at")
    .eq("id", created.id)
    .maybeSingle();
  console.log("  회차 상태:", att?.status, "round:", att?.reached_round);

  const { data: p } = await admin
    .from("participants")
    .select("state, has_won")
    .eq("id", pid)
    .maybeSingle();
  console.log("  참여자:", p?.state, "has_won:", p?.has_won);

  const { data: w } = await admin
    .from("winners")
    .select("serial")
    .eq("participant_id", pid)
    .maybeSingle();
  console.log("  일련번호:", w?.serial ?? "(없음)");

  const { data: stock } = await admin
    .from("prize_stock")
    .select("remaining")
    .eq("id", "main")
    .maybeSingle();
  console.log("  남은 재고:", stock?.remaining);
}

// 정리: 시험으로 만든 데이터를 되돌린다
console.log("\n정리 중...");
await admin.from("winners").delete().eq("attempt_id", created.id);
await admin.from("attempts").delete().eq("id", created.id);
await admin
  .from("participants")
  .update({ state: "exhausted", has_won: false })
  .eq("id", pid);
// 재고 복구
const { data: s2 } = await admin
  .from("prize_stock")
  .select("total, remaining")
  .eq("id", "main")
  .maybeSingle();
if (s2 && s2.remaining < s2.total) {
  await admin
    .from("prize_stock")
    .update({ remaining: s2.total })
    .eq("id", "main");
}
console.log("정리 완료\n");
