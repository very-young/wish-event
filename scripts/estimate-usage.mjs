/**
 * 이벤트 규모에서 DB 용량과 사용자 수가 무료 한도에 걸리는지 계산한다.
 *
 * 무료 플랜 한도(2026 기준):
 *   DB 용량 500MB / 월 활성 사용자 5만 / 전송량 5GB / 1주 미사용 시 정지
 *
 * 지금 저장된 실제 데이터로 1인당 크기를 재고, 2만 명 기준으로 늘려본다.
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

/*
 * 회차 1건의 실제 크기를 잰다.
 *
 * round_seeds와 ai_picks 같은 값이 들어 있어 참여자 정보보다 훨씬 크다.
 * 저장된 것을 그대로 재는 편이 추측보다 정확하다.
 */
const { data: atts } = await admin.from("attempts").select("*");
const { data: parts } = await admin.from("participants").select("*");

const avgBytes = (rows) => {
  if (!rows?.length) return 0;
  const total = rows.reduce(
    (s, r) => s + Buffer.byteLength(JSON.stringify(r), "utf8"),
    0,
  );
  return Math.round(total / rows.length);
};

const attBytes = avgBytes(atts);
const partBytes = avgBytes(parts);

console.log("\n===== 실제 저장 크기 (1건당) =====");
console.log(`  참여자 1명: 약 ${partBytes} 바이트`);
console.log(`  회차 1건:   약 ${attBytes} 바이트  (표본 ${atts?.length ?? 0}건)`);

/*
 * 한 사람이 남기는 회차 수.
 *   기본 1회 + 공유 재도전 + AI 재시도를 감안해 넉넉히 3회로 본다.
 */
const ATTEMPTS_PER_PERSON = 3;
const PEOPLE = 20_000;

const perPerson = partBytes + attBytes * ATTEMPTS_PER_PERSON;
const totalMB = (perPerson * PEOPLE) / 1024 / 1024;

console.log("\n===== 2만 명 기준 추정 =====");
console.log(`  1인당: 약 ${(perPerson / 1024).toFixed(1)} KB (회차 ${ATTEMPTS_PER_PERSON}건 포함)`);
console.log(`  전체:  약 ${totalMB.toFixed(1)} MB`);
console.log(`  무료 한도 500MB 대비: ${((totalMB / 500) * 100).toFixed(1)}%`);
console.log(
  totalMB > 500
    ? "  ⇒ 한도 초과. Pro 필요."
    : "  ⇒ 용량은 무료 한도 안에 들어간다.",
);

console.log("\n===== 월 활성 사용자 =====");
console.log(`  예상 ${PEOPLE.toLocaleString()}명 / 무료 한도 50,000명`);
console.log(
  PEOPLE > 50_000
    ? "  ⇒ 한도 초과."
    : "  ⇒ 사용자 수도 무료 한도 안에 들어간다.",
);

console.log("\n※ 인증 계정(auth.users)은 위 계산에 포함되지 않는다.");
console.log("  실제 사용량은 대시보드 Settings → Usage에서 확인한다.\n");
