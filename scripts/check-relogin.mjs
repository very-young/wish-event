/**
 * 참여자별 현재 상태를 있는 그대로 출력한다.
 *
 * 재로그인 시 어떤 화면으로 가는지는 get_play_state의 반환값이 결정한다.
 * 성공 회차가 있는데 당첨 화면이 안 뜨는 원인을 찾기 위한 조회다.
 * 데이터는 바꾸지 않는다.
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

console.log("\n===== participants =====");
const { data: parts, error: pErr } = await admin
  .from("participants")
  .select("*");
if (pErr) console.log("오류:", pErr.message);
for (const p of parts ?? []) {
  console.log(JSON.stringify(p));
}
console.log(`총 ${parts?.length ?? 0}명`);

console.log("\n===== attempts =====");
const { data: atts } = await admin
  .from("attempts")
  .select("id, participant_id, status, reached_round, category, started_at, ended_at")
  .order("started_at", { ascending: false });
for (const a of atts ?? []) {
  console.log(
    `${a.id.slice(0, 8)} p=${a.participant_id.slice(0, 8)} status=${a.status} round=${a.reached_round} started=${a.started_at}`,
  );
}
console.log(`총 ${atts?.length ?? 0}건`);

console.log("\n===== winners =====");
const { data: wins } = await admin.from("winners").select("*");
for (const w of wins ?? []) console.log(JSON.stringify(w));
console.log(`총 ${wins?.length ?? 0}명`);

console.log("\n===== prize_stock / event_config =====");
const { data: stock } = await admin.from("prize_stock").select("*");
console.log(JSON.stringify(stock));
const { data: cfg } = await admin.from("event_config").select("*");
console.log(JSON.stringify(cfg));

console.log("\n===== get_play_state (참여자별) =====");
for (const p of parts ?? []) {
  const { data: st, error } = await admin
    .rpc("get_play_state", { p_participant: p.id })
    .maybeSingle();
  console.log(
    `${p.id.slice(0, 8)} → ${error ? "오류: " + error.message : JSON.stringify(st)}`,
  );
}
console.log("");
