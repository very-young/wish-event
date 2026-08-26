/**
 * 배포 검증 스크립트.
 *
 * 로그인·공유 웹훅이 제대로 붙었는지 확인한다.
 * 데이터를 바꾸지 않으므로 반복 실행해도 안전하다.
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

const SITE = "https://wish-event-flax.vercel.app";
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ADMIN_KEY = env.KAKAO_ADMIN_KEY;

let failed = 0;
const ok = (m) => console.log(`  OK   ${m}`);
const bad = (m, d) => {
  console.log(`  FAIL ${m}`);
  if (d) console.log(`       -> ${d}`);
  failed++;
};

console.log("\n[1] 사이트 접근");
{
  const r = await fetch(SITE);
  if (r.status === 200) ok(`메인 페이지 ${r.status}`);
  else bad(`메인 페이지 ${r.status}`, (await r.text()).slice(0, 200));
}

console.log("\n[2] 카카오 SDK 키 노출 확인");
{
  // JS 키는 브라우저에 노출되어야 정상이다(공유 SDK 초기화용)
  const r = await fetch(SITE);
  const html = await r.text();
  const jsKey = env.NEXT_PUBLIC_KAKAO_JS_KEY;
  // Next.js는 클라이언트 번들에 심으므로 HTML에는 없을 수 있다.
  // 여기서는 페이지가 정상 렌더되는지만 본다.
  if (/소원/.test(html)) ok("페이지 렌더 정상");
  else bad("페이지 콘텐츠 이상");

  if (jsKey && jsKey.length === 32) ok("JS 키 형식 정상 (32자)");
  else bad("JS 키 형식 확인 필요");
}

console.log("\n[3] 서비스 역할 키가 브라우저에 노출되지 않는지");
{
  const r = await fetch(SITE);
  const html = await r.text();
  const svc = env.SUPABASE_SERVICE_ROLE_KEY;
  if (svc && html.includes(svc)) {
    bad("서비스 역할 키가 HTML에 노출됨 — 심각한 문제");
  } else {
    ok("서비스 역할 키 노출 없음");
  }
  if (html.includes(ADMIN_KEY)) {
    bad("카카오 Admin 키가 HTML에 노출됨 — 심각한 문제");
  } else {
    ok("카카오 Admin 키 노출 없음");
  }
}

console.log("\n[4] 공유 웹훅 인증");
{
  // 인증 없이 → 거부되어야 한다
  const noAuth = await fetch(`${SITE}/api/kakao/share-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (noAuth.status === 401) ok("인증 없는 요청 거부 (401)");
  else bad(`인증 없는 요청이 ${noAuth.status}로 응답`);

  // 잘못된 키 → 거부되어야 한다
  const wrongKey = await fetch(`${SITE}/api/kakao/share-webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "KakaoAK wrong-key-value",
    },
    body: "{}",
  });
  if (wrongKey.status === 401) ok("잘못된 키 거부 (401)");
  else bad(`잘못된 키가 ${wrongKey.status}로 응답`);

  // 올바른 키 → 통과되어야 한다 (파라미터가 없으니 missing-params)
  const rightKey = await fetch(`${SITE}/api/kakao/share-webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `KakaoAK ${ADMIN_KEY}`,
    },
    body: "{}",
  });
  const body = await rightKey.json().catch(() => ({}));
  if (rightKey.status === 200 && body.result === "missing-params") {
    ok(`올바른 키 통과 (200, ${body.result})`);
  } else {
    bad(`올바른 키 응답 이상: ${rightKey.status} ${JSON.stringify(body)}`);
  }

  // 나와의 채팅방 → 재도전 지급 안 됨
  const memo = await fetch(`${SITE}/api/kakao/share-webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `KakaoAK ${ADMIN_KEY}`,
    },
    body: JSON.stringify({
      ticket: "00000000-0000-0000-0000-000000000000",
      CHAT_TYPE: "MemoChat",
      HASH_CHAT_ID: "test-hash",
    }),
  });
  const memoBody = await memo.json().catch(() => ({}));
  if (memoBody.result === "self-chat") {
    ok("나와의 채팅방 필터 동작 (self-chat)");
  } else {
    bad(`나와의 채팅방 필터 이상: ${JSON.stringify(memoBody)}`);
  }

  // 존재하지 않는 티켓 → 거부
  const badTicket = await fetch(`${SITE}/api/kakao/share-webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `KakaoAK ${ADMIN_KEY}`,
    },
    body: JSON.stringify({
      ticket: "00000000-0000-0000-0000-000000000000",
      CHAT_TYPE: "DirectChat",
      HASH_CHAT_ID: "test-hash-2",
    }),
  });
  const btBody = await badTicket.json().catch(() => ({}));
  if (btBody.result === "rejected") {
    ok("위조 티켓 거부 (rejected)");
  } else {
    bad(`위조 티켓 응답 이상: ${JSON.stringify(btBody)}`);
  }
}

console.log("\n[5] Supabase 카카오 제공자 활성화 확인");
{
  // 카카오 로그인이 켜져 있으면 authorize가 카카오로 리다이렉트한다
  const r = await fetch(
    `${SUPABASE}/auth/v1/authorize?provider=kakao&redirect_to=${encodeURIComponent(SITE + "/auth/callback")}`,
    { redirect: "manual" },
  );
  const loc = r.headers.get("location") ?? "";
  if (r.status >= 300 && r.status < 400 && loc.includes("kauth.kakao.com")) {
    ok("카카오 제공자 활성화됨 (카카오 인증 페이지로 리다이렉트)");
    // client_id가 실려 있는지 확인
    const m = loc.match(/client_id=([^&]+)/);
    if (m) ok(`client_id 전달됨 (${m[1].slice(0, 8)}...)`);
    else bad("client_id가 리다이렉트에 없음");
  } else if (loc.includes("error")) {
    bad("카카오 제공자 설정 오류", decodeURIComponent(loc));
  } else {
    bad(`예상과 다른 응답: ${r.status}`, loc.slice(0, 200));
  }
}

console.log(
  failed === 0 ? "\n결과: 모두 정상\n" : `\n결과: ${failed}건 실패\n`,
);
process.exit(failed === 0 ? 0 : 1);
