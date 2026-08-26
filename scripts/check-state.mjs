/**
 * 참여자 상태와 회차 기록 확인.
 * 결과 화면이 안 나오는 원인을 찾기 위한 진단 스크립트.
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

console.log("\n=== 이벤트 설정 ===");
const { data: cfg } = await admin
  .from("event_config")
  .select("*")
  .eq("id", "main")
  .maybeSingle();
console.log(cfg ? `${cfg.start_date} ~ ${cfg.end_date}` : "설정 없음");

const { data: win } = await admin.rpc("event_window_status");
console.log(`현재 상태: ${win}`);

const { data: today } = await admin.rpc("today_kst");
console.log(`오늘(KST): ${today}`);

console.log("\n=== 경품 재고 ===");
const { data: stock } = await admin
  .from("prize_stock")
  .select("*")
  .eq("id", "main")
  .maybeSingle();
console.log(stock ? `total=${stock.total} remaining=${stock.remaining}` : "없음");

console.log("\n=== 참여자 ===");
const { data: parts } = await admin
  .from("participants")
  .select("id, nickname, state, state_date, has_won");

if (!parts || parts.length === 0) {
  console.log("참여자 없음");
} else {
  for (const p of parts) {
    console.log(
      `${p.id.slice(0, 8)}... state=${p.state} state_date=${p.state_date} has_won=${p.has_won}`,
    );

    // 이 참여자의 회차 기록
    const { data: attempts } = await admin
      .from("attempts")
      .select("id, status, category, reached_round, is_retry, started_at, ended_at")
      .eq("participant_id", p.id)
      .order("started_at", { ascending: false });

    if (!attempts || attempts.length === 0) {
      console.log("  회차 기록 없음  ← 결과 화면을 보여줄 수 없는 원인");
    } else {
      for (const a of attempts) {
        console.log(
          `  회차 ${a.id.slice(0, 8)}... status=${a.status} category=${a.category ?? "(없음)"} round=${a.reached_round} retry=${a.is_retry} ended=${a.ended_at ? "O" : "X"}`,
        );
      }
      const finished = attempts.filter((a) => a.status !== "in_progress");
      console.log(
        `  → 끝난 회차 ${finished.length}개 (결과 재열람 가능 여부: ${finished.length > 0 ? "가능" : "불가"})`,
      );
    }

    // 공유 티켓
    const { data: tickets } = await admin
      .from("share_tickets")
      .select("id, status, issued_at, expires_at")
      .eq("participant_id", p.id)
      .order("issued_at", { ascending: false })
      .limit(3);
    if (tickets && tickets.length > 0) {
      console.log("  공유 티켓:");
      for (const t of tickets) {
        console.log(`    ${t.id.slice(0, 8)}... status=${t.status}`);
      }
    }

    // 사용한 톡방
    const { data: rooms } = await admin
      .from("used_chatrooms")
      .select("chat_hash, chat_type")
      .eq("participant_id", p.id);
    console.log(`  사용한 톡방: ${rooms?.length ?? 0}개`);

    // 재도전 해제 기록
    const { data: grants } = await admin
      .from("share_grants")
      .select("id, granted_at")
      .eq("participant_id", p.id);
    console.log(`  재도전 해제 기록: ${grants?.length ?? 0}건`);
  }
}

console.log("");
