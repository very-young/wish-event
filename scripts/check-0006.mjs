/**
 * 0006 마이그레이션(enum 캐스팅 수정)이 DB에 실제로 적용됐는지 확인한다.
 *
 * 확인 방법: 존재하지 않는 회차 id로 finish_attempt_failed를 호출한다.
 * 수정 전 함수라면 캐스팅 오류가 즉시 발생한다(대상 행이 없어도 발생).
 * 수정 후라면 아무 일도 하지 않고 정상 종료한다.
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

const NIL = "00000000-0000-0000-0000-000000000000";

console.log("\n[0006 적용 여부] finish_attempt_failed 캐스팅 확인");
const { error } = await admin.rpc("finish_attempt_failed", {
  p_participant: NIL,
  p_attempt: NIL,
  p_reached_round: 2,
  p_invalid: false,
});

let applied = false;
if (!error) {
  console.log("  OK   캐스팅 오류 없음 → 0006 적용됨");
  applied = true;
} else if (/attempt_status|is of type/i.test(error.message)) {
  console.log("  FAIL 캐스팅 오류 그대로 발생 → 0006 미적용");
  console.log(`       -> ${error.message}`);
} else {
  console.log(`  ?    예상 못한 오류: ${error.message}`);
}

console.log("\n[갇힌 회차]");
const { data: stuck } = await admin
  .from("attempts")
  .select("id")
  .eq("status", "in_progress");
console.log(
  stuck?.length ? `  진행 중 회차 ${stuck.length}개 남음` : "  없음 (정상)",
);

const { data: parts } = await admin
  .from("participants")
  .select("id")
  .eq("state", "in_progress");
console.log(
  parts?.length ? `  in_progress 참여자 ${parts.length}명 남음` : "  없음 (정상)",
);

console.log(
  applied
    ? "\n결과: 0006 적용 완료\n"
    : "\n결과: Supabase SQL Editor에서 0006_fix_enum_cast.sql 실행 필요\n",
);
