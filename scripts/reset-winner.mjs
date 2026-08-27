/**
 * 테스트용 당첨 취소.
 *
 * 사용법:
 *   node scripts/reset-winner.mjs 김수영     특정 사람만 초기화
 *   node scripts/reset-winner.mjs --all      전체 초기화
 *
 * 일련번호는 미사용으로 되돌아가 다음 당첨자에게 다시 나간다.
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

const arg = process.argv[2];

if (!arg) {
  console.log("\n사용법:");
  console.log("  node scripts/reset-winner.mjs <닉네임>   특정 사람만");
  console.log("  node scripts/reset-winner.mjs --all      전체\n");

  // 어떤 닉네임을 쓸 수 있는지 알려준다
  const { data: wins } = await admin.from("winners").select("participant_id, serial");
  if (wins?.length) {
    const ids = wins.map((w) => w.participant_id);
    const { data: people } = await admin
      .from("participants")
      .select("id, nickname")
      .in("id", ids);
    const nameOf = new Map((people ?? []).map((p) => [p.id, p.nickname]));
    console.log("현재 당첨자:");
    for (const w of wins) {
      console.log(`  ${nameOf.get(w.participant_id) ?? "?"}  ${w.serial}`);
    }
  } else {
    console.log("현재 당첨자가 없습니다.");
  }
  console.log("");
  process.exit(0);
}

const isAll = arg === "--all";
const { data, error } = isAll
  ? await admin.rpc("test_reset_all")
  : await admin.rpc("test_reset_winner", { p_nickname: arg });

if (error) {
  if (/Could not find the function/i.test(error.message)) {
    console.log("\n초기화 함수가 아직 없습니다.");
    console.log("Supabase SQL Editor에서 0009_test_reset.sql을 실행하세요.\n");
  } else {
    console.log("실패:", error.message);
  }
  process.exit(1);
}

console.log("\n" + JSON.stringify(data, null, 2));

// 초기화 후 현황을 함께 보여준다
const { data: pool } = await admin
  .from("serial_pool")
  .select("assigned_to");
if (pool) {
  const used = pool.filter((r) => r.assigned_to).length;
  console.log(
    `\n일련번호: 전체 ${pool.length}개 / 지급 ${used}개 / 남음 ${pool.length - used}개\n`,
  );
}
