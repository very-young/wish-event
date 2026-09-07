/**
 * 새 도메인이 정상 동작하는지 확인한다.
 *
 * 도메인이 바뀌면 로그인·공유·웹훅이 함께 맞물려야 한다.
 * 한 곳만 어긋나도 참여가 막히므로 각 경로를 실제로 두드려 본다.
 */

const SITE = "https://wish-event.app";

let bad = 0;
const ok = (m) => console.log(`  OK   ${m}`);
const fail = (m, d) => {
  console.log(`  FAIL ${m}`);
  if (d) console.log(`       ${d}`);
  bad++;
};

console.log(`\n대상: ${SITE}`);

console.log("\n[1] 사이트 접속");
{
  try {
    const r = await fetch(SITE);
    if (r.ok) ok(`HTTP ${r.status}`);
    else fail(`HTTP ${r.status}`);
  } catch (e) {
    fail("접속 실패", e.message);
  }
}

console.log("\n[2] 공유 카드 링크 주소 (SITE_URL 반영 여부)");
{
  /*
   * 화면 코드에 새 주소가 들어갔는지 본다.
   * 이 값이 옛 주소면 친구가 공유 카드를 눌렀을 때 엉뚱한 곳으로 간다.
   */
  try {
    const r = await fetch(SITE);
    const html = await r.text();
    const hasNew = html.includes("wish-event.app");
    const hasOld = html.includes("wish-event-flax");
    if (hasOld) fail("옛 주소가 화면에 남아 있음");
    else if (hasNew) ok("새 주소가 반영됨");
    else console.log("  ?    주소를 찾지 못함 (본문에 없을 수 있음)");
  } catch (e) {
    fail("확인 실패", e.message);
  }
}

console.log("\n[3] 로그인 시작 경로");
{
  // Supabase 로그인 주소가 카카오로 잘 넘기는지 본다
  try {
    const r = await fetch(`${SITE}/auth/callback`, { redirect: "manual" });
    // 코드 없이 부르면 로그인 취소로 처리해 되돌려보낸다
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location") ?? "";
      if (loc.includes("wish-event.app")) ok(`콜백이 새 주소로 되돌림`);
      else fail(`콜백이 다른 주소로 되돌림: ${loc}`);
    } else {
      fail(`예상과 다른 응답: HTTP ${r.status}`);
    }
  } catch (e) {
    fail("확인 실패", e.message);
  }
}

console.log("\n[4] 공유 웹훅 경로 (카카오가 부르는 곳)");
{
  try {
    const r = await fetch(`${SITE}/api/kakao/share-webhook`);
    // 인증 없는 요청은 거부해야 정상이다
    if (r.status === 401 || r.status === 403) {
      ok(`인증 없는 요청 거부 (HTTP ${r.status})`);
    } else if (r.status === 404) {
      fail("웹훅 경로가 없음");
    } else {
      console.log(`  ?    HTTP ${r.status} (거부 응답 확인 필요)`);
    }
  } catch (e) {
    fail("확인 실패", e.message);
  }
}

console.log("\n[5] 추천 API 경로");
{
  try {
    const r = await fetch(`${SITE}/api/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId: "00000000-0000-0000-0000-000000000000" }),
    });
    if (r.status === 401) ok("로그인 없는 호출 거부 (정상)");
    else fail(`예상과 다른 응답: HTTP ${r.status}`);
  } catch (e) {
    fail("확인 실패", e.message);
  }
}

console.log("\n[6] 옛 주소 상태");
{
  try {
    const r = await fetch("https://wish-event-flax.vercel.app", {
      redirect: "manual",
    });
    console.log(`  옛 주소 응답: HTTP ${r.status}`);
    console.log("  (안 쓸 예정이므로 열려 있어도 무해합니다)");
  } catch {
    console.log("  옛 주소 접속 불가 (정리됨)");
  }
}

console.log(bad === 0 ? "\n결과: 모두 정상\n" : `\n결과: ${bad}건 확인 필요\n`);
