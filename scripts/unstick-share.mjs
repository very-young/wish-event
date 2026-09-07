/**
 * 공유 대기에 갇힌 참여자를 풀어준다.
 *
 * 공유 버튼을 눌러 티켓을 받은 뒤 카카오톡 전송을 하지 않고 이탈하면
 * 상태가 retry_pending에 머물러 다시 공유할 수 없다.
 *
 * 이 스크립트는 만료된 티켓을 정리하고 상태를 되돌린다.
 * 진행 중인 유효한 공유는 건드리지 않는다.
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

const now = new Date().toISOString();

console.log("\n[1] 만료된 대기 티켓 정리");
{
  const { data, error } = await admin
    .from("share_tickets")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", now)
    .select("id");
  if (error) console.log("  실패:", error.message);
  else console.log(`  ${data?.length ?? 0}건 정리`);
}

console.log("\n[2] 갇힌 참여자 확인");
const { data: stuck } = await admin
  .from("participants")
  .select("id, nickname, state")
  .eq("state", "retry_pending")
  .eq("has_won", false);

if (!stuck?.length) {
  console.log("  갇힌 참여자 없음");
} else {
  for (const p of stuck) {
    // 아직 유효한 티켓이 있으면 건드리지 않는다
    const { data: live } = await admin
      .from("share_tickets")
      .select("id")
      .eq("participant_id", p.id)
      .eq("status", "pending")
      .gte("expires_at", now);

    if (live?.length) {
      console.log(`  ${p.nickname}: 진행 중인 공유가 있어 유지`);
      continue;
    }

    const { error } = await admin
      .from("participants")
      .update({ state: "exhausted" })
      .eq("id", p.id);

    console.log(
      error
        ? `  ${p.nickname}: 실패 ${error.message}`
        : `  ${p.nickname}: 되돌림 (retry_pending → exhausted)`,
    );
  }
}

console.log("\n[3] 최종 상태");
const { data: parts } = await admin
  .from("participants")
  .select("nickname, state, has_won")
  .order("state_date", { ascending: false });
for (const p of parts ?? []) {
  console.log(`  ${p.nickname} | ${p.state} | has_won=${p.has_won}`);
}
console.log("");
