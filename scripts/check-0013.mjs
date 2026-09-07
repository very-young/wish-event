/**
 * 0013 마이그레이션 확인.
 *
 * 확인할 것: 공유 대기(retry_pending)에 갇힌 상태에서도
 *            공유 버튼을 다시 누르면 새 티켓이 나오는가?
 *
 *   나온다  → 적용됨 (갇히지 않는다)
 *   거부된다 → 미적용 (그날 하루 재도전을 할 수 없다)
 *
 * 시험용으로 만든 티켓과 바꾼 상태는 끝에서 모두 되돌린다.
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

const { data: parts } = await admin
  .from("participants")
  .select("id, nickname, state, has_won");

// 회차 기록이 있는 비당첨자를 찾는다. 티켓은 회차에 묶이기 때문이다.
let target = null;
let att = null;
for (const p of (parts ?? []).filter((x) => !x.has_won)) {
  const { data } = await admin
    .from("attempts")
    .select("id")
    .eq("participant_id", p.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) {
    target = p;
    att = data;
    break;
  }
}

if (!target) {
  console.log("\ncannot check: no participant with an attempt record\n");
  process.exit(0);
}

const originalState = target.state;
const cleanup = async (extraTicket) => {
  if (extraTicket) {
    await admin.from("share_tickets").delete().eq("id", extraTicket);
  }
  await admin
    .from("participants")
    .update({ state: originalState })
    .eq("id", target.id);
};

// 갇힌 상황을 만든다: 유효한 티켓 + retry_pending 상태
const { data: stuckTicket, error: insErr } = await admin
  .from("share_tickets")
  .insert({
    participant_id: target.id,
    attempt_id: att.id,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  })
  .select("id")
  .single();

if (insErr) {
  console.log(`\ncannot check: ticket insert failed (${insErr.message})\n`);
  process.exit(1);
}

await admin
  .from("participants")
  .update({ state: "retry_pending" })
  .eq("id", target.id);

// 공유 버튼을 다시 누른 상황
const { data: newTicket, error: rpcErr } = await admin.rpc(
  "issue_share_ticket",
  {
    p_participant: target.id,
    p_attempt: att.id,
    p_ttl_seconds: 300,
  },
);

console.log("\n===== 0013 check =====");
if (rpcErr) {
  console.log(`  ERROR ${rpcErr.message}`);
} else if (newTicket) {
  console.log("  APPLIED - new ticket issued while stuck (not blocked)");
} else {
  console.log("  NOT APPLIED - rejected while stuck (blocked for the day)");
  console.log("  -> run supabase/migrations/0013_fix_stuck_retry_pending.sql");
}

await admin.from("share_tickets").delete().eq("id", stuckTicket.id);
if (newTicket) await admin.from("share_tickets").delete().eq("id", newTicket);
await cleanup();
console.log("  (test traces reverted)\n");
