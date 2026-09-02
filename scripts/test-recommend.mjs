/**
 * 추천 엔진 직접 호출 시험.
 *
 * Gemini 키가 있으면 실제로 추천을 받아본다.
 * 화면·DB를 거치지 않고 엔진만 확인하므로 문제 원인을 좁히기 쉽다.
 *
 * 사용법: node scripts/test-recommend.mjs
 */

import { readFileSync } from "node:fs";

// .env.local에서 Gemini 키를 읽어 넣는다
for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 1) continue;
  const k = line.slice(0, eq).trim();
  if (!process.env[k]) process.env[k] = line.slice(eq + 1).trim();
}

const engine = await import("../src/lib/recommend/engine.mjs");

console.log(`명소 데이터: ${engine.getSpotCount()}곳`);

if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
  console.log("\nGEMINI_API_KEY가 없어 실제 추천은 건너뜁니다.");
  console.log(".env.local에 GEMINI_API_KEY=... 를 추가하면 시험할 수 있습니다.\n");
  process.exit(0);
}

// 추천 횟수 기록이 잘 전달되는지도 함께 확인한다
engine.setCounts({});
engine.setCountsSink((names) => {
  console.log("  → 추천 횟수 반영 대상:", names.join(", "));
});
engine.setUsageSink((row) => {
  console.log(`  → 사용량: total ${row.total_tokens ?? "?"} 토큰`);
});

const cases = [
  ["건강·무탈", "올해는 아프지 않고 무탈하게 지내고 싶어요"],
  ["이직·취업", "원하는 회사에 취업하고 싶어요"],
];

for (const [category, wish] of cases) {
  console.log(`\n[${category}] ${wish}`);
  const started = Date.now();
  try {
    const r = await engine.recommendWithRetryMemory(category, wish);
    console.log(`  소요: ${Date.now() - started}ms`);
    console.log(`  달님 답장: ${r.letter}`);
    for (const p of r.picks) {
      console.log(`  - ${p["명소명"]} (${p["지역"]}) : ${p.catch}`);
    }
  } catch (e) {
    console.log(`  실패 (${Date.now() - started}ms): ${e.message}`);
  }
}
console.log("");
