/**
 * 0011 마이그레이션(추천 결과 보관)이 적용됐는지 확인한다.
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

let bad = 0;
const ok = (m) => console.log(`  OK   ${m}`);
const fail = (m, d) => {
  console.log(`  FAIL ${m}`);
  if (d) console.log(`       ${d}`);
  bad++;
};

console.log("\n[추천 횟수 표]");
{
  const { error } = await admin
    .from("spot_recommend_counts")
    .select("spot_name")
    .limit(1);
  if (error) fail("spot_recommend_counts 없음", error.message);
  else ok("spot_recommend_counts 존재");
}

console.log("\n[사용량 표]");
{
  const { error } = await admin.from("gemini_usage").select("id").limit(1);
  if (error) fail("gemini_usage 없음", error.message);
  else ok("gemini_usage 존재");
}

console.log("\n[회차 AI 칸]");
{
  const { error } = await admin
    .from("attempts")
    .select("ai_status, ai_letter, ai_picks")
    .limit(1);
  if (error) fail("attempts에 ai_* 칸 없음", error.message);
  else ok("attempts.ai_status / ai_letter / ai_picks 존재");
}

console.log("\n[함수]");
{
  const { error } = await admin.rpc("bump_spot_counts", {
    p_names: ["__점검용__"],
  });
  if (error) fail("bump_spot_counts 없음", error.message);
  else {
    ok("bump_spot_counts 동작");
    // 점검용으로 넣은 값을 지운다
    await admin
      .from("spot_recommend_counts")
      .delete()
      .eq("spot_name", "__점검용__");
  }
}
{
  const { error } = await admin.rpc("spot_count_status");
  if (error) fail("spot_count_status 없음", error.message);
  else ok("spot_count_status 동작");
}

console.log(bad === 0 ? "\n결과: 0011 적용 완료\n" : `\n결과: ${bad}건 문제\n`);
