/**
 * Supabase가 카카오 로그인 요청에 어떤 동의항목을 붙이는지 확인한다.
 *
 * 로그인 시작 주소를 따라가면 카카오로 보내는 scope 값이 보인다.
 * 실제로 무엇이 요청되는지 알아야 원인을 정확히 잡을 수 있다.
 */

import { readFileSync } from "node:fs";

const env = {};
for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 1) continue;
  env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}

const base = env.NEXT_PUBLIC_SUPABASE_URL;

/** scopes를 다르게 넣어보고 카카오로 전달되는 값을 비교한다 */
const cases = [
  { label: "scopes 없음", scopes: null },
  { label: "profile_nickname", scopes: "profile_nickname" },
  { label: "profile_nickname,account_email", scopes: "profile_nickname,account_email" },
];

for (const c of cases) {
  const url = new URL(`${base}/auth/v1/authorize`);
  url.searchParams.set("provider", "kakao");
  url.searchParams.set("redirect_to", "https://wish-event-flax.vercel.app/auth/callback");
  if (c.scopes) url.searchParams.set("scopes", c.scopes);

  try {
    // 리다이렉트를 따라가지 않고 Location 헤더만 본다
    const res = await fetch(url, { redirect: "manual" });
    const loc = res.headers.get("location");
    if (!loc) {
      console.log(`\n[${c.label}]\n  리다이렉트 없음 (HTTP ${res.status})`);
      continue;
    }
    const kakao = new URL(loc);
    const scope = kakao.searchParams.get("scope");
    console.log(`\n[${c.label}]`);
    console.log(`  카카오로 보내는 scope: ${scope ?? "(없음)"}`);
  } catch (e) {
    console.log(`\n[${c.label}]\n  실패: ${e.message}`);
  }
}

console.log("");
