/**
 * 일련번호 현황 확인.
 *
 * 어떤 번호가 누구에게 나갔는지, 다음에 나갈 번호가 무엇인지 본다.
 * 사용법: node scripts/serial-status.mjs
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

const { data: rows, error } = await admin
  .from("serial_pool")
  .select("seq, serial, assigned_to, assigned_at")
  .order("seq");

if (error) {
  if (/does not exist|schema cache/i.test(error.message)) {
    console.log("\nserial_pool 표가 아직 없습니다.");
    console.log("Supabase SQL Editor에서 아래 두 파일을 순서대로 실행하세요.");
    console.log("  1) supabase/migrations/0007_serial_pool.sql");
    console.log("  2) supabase/migrations/0008_serial_data.sql\n");
  } else {
    console.log("조회 실패:", error.message);
  }
  process.exit(1);
}

const assigned = rows.filter((r) => r.assigned_to);
const free = rows.filter((r) => !r.assigned_to);

console.log(`\n전체 ${rows.length}개 / 지급 ${assigned.length}개 / 남음 ${free.length}개`);
console.log(`다음에 나갈 번호: ${free[0]?.serial ?? "(없음 — 모두 지급)"}`);

if (assigned.length) {
  // 지급된 번호는 누가 받았는지 함께 보여준다
  const ids = [...new Set(assigned.map((r) => r.assigned_to))];
  const { data: people } = await admin
    .from("participants")
    .select("id, nickname")
    .in("id", ids);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.nickname]));

  console.log("\n[지급된 번호]");
  for (const r of assigned) {
    const when = r.assigned_at
      ? new Date(r.assigned_at).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        })
      : "-";
    console.log(
      `  ${String(r.seq).padStart(3)}  ${r.serial}  ${nameOf.get(r.assigned_to) ?? "?"}  ${when}`,
    );
  }
} else {
  console.log("\n아직 지급된 번호가 없습니다.");
}
console.log("");
