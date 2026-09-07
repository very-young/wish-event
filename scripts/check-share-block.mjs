/**
 * 공유 티켓 발급이 거부되는 원인을 찾는다.
 *
 * issue_share_ticket은 참여 상태가 exhausted일 때만 티켓을 준다.
 * 상태가 다르면 null을 돌려주고 화면에는 "지금은 재도전 공유를 할 수 없어요"가 뜬다.
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

console.log("\n===== 참여자 상태 =====");
const { data: parts } = await admin
  .from("participants")
  .select("id, nickname, state, state_date, has_won")
  .order("state_date", { ascending: false });

for (const p of parts ?? []) {
  console.log(
    `  ${p.nickname} | state=${p.state} | date=${p.state_date} | has_won=${p.has_won}`,
  );
}

console.log("\n===== 최근 회차 =====");
const { data: atts } = await admin
  .from("attempts")
  .select("id, participant_id, status, reached_round, started_at, ended_at")
  .order("started_at", { ascending: false })
  .limit(8);

const nameById = new Map((parts ?? []).map((p) => [p.id, p.nickname]));
for (const a of atts ?? []) {
  console.log(
    `  ${nameById.get(a.participant_id) ?? "?"} | ${a.status} | round=${a.reached_round} | ended=${a.ended_at ? "O" : "X"}`,
  );
}

console.log("\n===== 공유 티켓 =====");
const { data: tickets } = await admin
  .from("share_tickets")
  .select("id, participant_id, status, issued_at, expires_at")
  .order("issued_at", { ascending: false })
  .limit(8);
if (!tickets?.length) console.log("  없음");
for (const t of tickets ?? []) {
  const expired = new Date(t.expires_at) < new Date();
  console.log(
    `  ${nameById.get(t.participant_id) ?? "?"} | ${t.status} | 만료=${expired ? "지남" : "유효"}`,
  );
}

console.log("\n===== 사용한 톡방 =====");
const { data: rooms } = await admin
  .from("used_chatrooms")
  .select("participant_id, chat_type, first_used_at");
if (!rooms?.length) console.log("  없음");
for (const r of rooms ?? []) {
  console.log(`  ${nameById.get(r.participant_id) ?? "?"} | ${r.chat_type}`);
}

console.log("\n===== 티켓 발급 조건 시험 =====");
/*
 * exhausted 상태가 아닌 참여자에게는 티켓이 나가지 않는다.
 * 각 참여자로 시험해 어떤 이유로 막히는지 본다.
 */
for (const p of parts ?? []) {
  // 마지막 회차를 찾아 그것으로 시험한다
  const last = (atts ?? []).find((a) => a.participant_id === p.id);
  if (!last) {
    console.log(`  ${p.nickname}: 회차가 없어 시험 불가`);
    continue;
  }
  const { data, error } = await admin.rpc("issue_share_ticket", {
    p_participant: p.id,
    p_attempt: last.id,
    p_ttl_seconds: 300,
  });
  if (error) {
    console.log(`  ${p.nickname}: 오류 ${error.message}`);
  } else if (!data) {
    console.log(`  ${p.nickname}: 거부됨 (state=${p.state}, has_won=${p.has_won})`);
  } else {
    console.log(`  ${p.nickname}: 발급됨 → 되돌립니다`);
    // 시험으로 만든 티켓과 상태 변화를 되돌린다
    await admin.from("share_tickets").delete().eq("id", data);
    await admin
      .from("participants")
      .update({ state: p.state })
      .eq("id", p.id);
  }
}

console.log("");
