/**
 * DB 설정 확인 스크립트.
 *
 * 테이블·함수·권한이 제대로 만들어졌는지 점검한다.
 * 배포 전 점검용이며 반복 실행해도 안전하다(데이터를 바꾸지 않는다).
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// .env.local 직접 파싱 (dotenv 의존성 없이)
const env = {};
for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 1) continue;
  env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("환경 변수가 비어 있습니다.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

let failed = 0;
const pass = (msg) => console.log(`  OK   ${msg}`);
const fail = (msg, detail) => {
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(`       → ${detail}`);
  failed++;
};

console.log("\n[1] 테이블 확인");
const tables = [
  "participants",
  "attempts",
  "share_tickets",
  "used_chatrooms",
  "share_grants",
  "winners",
  "prize_stock",
  "moderation_blocks",
  "event_config",
];
for (const t of tables) {
  const { error } = await admin.from(t).select("*").limit(1);
  if (error) fail(`${t} 테이블`, error.message);
  else pass(`${t} 테이블`);
}

console.log("\n[2] 함수 확인");
const { data: winStatus, error: winErr } = await admin.rpc(
  "event_window_status",
);
if (winErr) fail("event_window_status()", winErr.message);
else pass(`event_window_status() → "${winStatus}"`);

const { data: todayKst, error: todayErr } = await admin.rpc("today_kst");
if (todayErr) fail("today_kst()", todayErr.message);
else pass(`today_kst() → ${todayKst}`);

console.log("\n[3] 경품 재고 확인");
const { data: stock, error: stockErr } = await admin
  .from("prize_stock")
  .select("*")
  .eq("id", "main")
  .maybeSingle();
if (stockErr) fail("prize_stock 조회", stockErr.message);
else if (!stock) fail("prize_stock 초기 행 없음");
else pass(`재고 total=${stock.total}, remaining=${stock.remaining}`);

console.log("\n[4] 보안: 익명 키로 쓰기가 막히는지");
// 익명 키로 참여자 행을 만들 수 있으면 심각한 문제다
const { error: insertErr } = await anon
  .from("participants")
  .insert({ id: "00000000-0000-0000-0000-000000000001", nickname: "해커" });
if (insertErr) pass(`participants 쓰기 차단 (${insertErr.code ?? "거부"})`);
else fail("participants 쓰기가 허용됨 — RLS 정책을 확인하세요");

const { error: winnerErr } = await anon
  .from("winners")
  .insert({
    participant_id: "00000000-0000-0000-0000-000000000001",
    attempt_id: "00000000-0000-0000-0000-000000000002",
    serial: "CHU-HACKED",
  });
if (winnerErr) pass(`winners 쓰기 차단 (${winnerErr.code ?? "거부"})`);
else fail("winners 쓰기가 허용됨 — RLS 정책을 확인하세요");

// 경품 재고를 직접 읽을 수 있으면 남은 수량이 노출된다
const { data: stockLeak } = await anon.from("prize_stock").select("*");
if (!stockLeak || stockLeak.length === 0) pass("prize_stock 직접 읽기 차단");
else fail("prize_stock이 익명에게 노출됨");

console.log("\n[5] 이벤트 기간 설정");
const { data: cfg } = await admin
  .from("event_config")
  .select("*")
  .eq("id", "main")
  .maybeSingle();
if (cfg) pass(`${cfg.start_date} ~ ${cfg.end_date}`);
else fail("event_config 행 없음");

console.log(
  failed === 0
    ? "\n결과: 모두 정상\n"
    : `\n결과: ${failed}건 실패\n`,
);
process.exit(failed === 0 ? 0 : 1);
