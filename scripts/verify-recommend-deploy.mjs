/**
 * 배포된 추천 API가 살아 있는지 확인한다.
 *
 * 로그인 없이 부르면 401이 나와야 정상이다.
 * 401이 오면 함수가 뜨고 데이터 파일도 읽혔다는 뜻이다.
 * 500이 오면 데이터 파일을 못 찾았거나 적재에 실패한 것이다.
 */

const SITE = process.argv[2] || "https://wish-event.app";

console.log(`\n대상: ${SITE}`);

console.log("\n[1] 사이트가 살아 있는지");
{
  const r = await fetch(SITE);
  console.log(`  HTTP ${r.status} ${r.ok ? "OK" : "확인 필요"}`);
}

console.log("\n[2] 추천 API 인증 확인 (로그인 없이 호출)");
{
  const started = Date.now();
  const r = await fetch(`${SITE}/api/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attemptId: "00000000-0000-0000-0000-000000000000" }),
  });
  const text = await r.text();
  const ms = Date.now() - started;

  if (r.status === 401) {
    console.log(`  HTTP 401 (${ms}ms) — 로그인 없는 호출을 거부함. 정상`);
    console.log("  → 함수가 뜨고 명소 데이터도 정상 적재됐습니다.");
  } else if (r.status === 500) {
    console.log(`  HTTP 500 (${ms}ms) — 서버 오류`);
    console.log(`  응답: ${text.slice(0, 300)}`);
    console.log("  → 데이터 파일을 못 찾았을 가능성이 큽니다.");
  } else {
    console.log(`  HTTP ${r.status} (${ms}ms)`);
    console.log(`  응답: ${text.slice(0, 300)}`);
  }
}

console.log("");
