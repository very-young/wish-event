/**
 * 테스트용 추천 API. (내부 검수용)
 *
 * /test 페이지는 로그인이 없으므로 실제 경로(/api/recommend)를 쓸 수 없다.
 * 이 경로는 회차 없이 소원만 받아 추천을 돌려준다.
 *
 * ⚠️ 참여 기록·경품 재고·일련번호를 건드리지 않는다.
 *    다만 Gemini를 실제로 부르므로 호출 비용이 발생한다.
 *    그래서 테스트 페이지에서 기본은 꺼두고, 필요할 때만 켜서 쓴다.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/content/categories";
import { WISH_TEXT_LIMIT } from "@/content/settings";
import { checkWishText } from "@/lib/moderation";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 허용된 유형 이름만 받는다. 임의 문자열로 프롬프트를 흔들 수 없게 한다. */
const ALLOWED_LABELS = new Set(CATEGORIES.map((c) => c.label));

type Engine = typeof import("@/lib/recommend/engine.mjs");

let enginePromise: Promise<Engine> | null = null;
function loadEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = import("@/lib/recommend/engine.mjs").catch((e) => {
      enginePromise = null;
      throw e;
    });
  }
  return enginePromise;
}

export async function POST(request: Request) {
  let body: { category?: string; wish?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const category = (body.category ?? "").trim();
  const wish = (body.wish ?? "").trim().slice(0, WISH_TEXT_LIMIT.max);

  if (!ALLOWED_LABELS.has(category)) {
    return NextResponse.json({ error: "알 수 없는 유형" }, { status: 400 });
  }

  // 실제 화면과 같은 검사를 거친다
  const check = checkWishText(wish);
  if (!check.ok) {
    return NextResponse.json(
      { error: "소원 형식 오류", reason: check.reason },
      { status: 400 },
    );
  }

  try {
    const engine = await loadEngine();
    const admin = createAdminClient();

    /*
     * 추천 횟수는 읽기만 한다.
     * 테스트 호출이 실제 쏠림 방지 통계를 흔들면 안 된다.
     */
    const { data: countRows } = await admin
      .from("spot_recommend_counts")
      .select("spot_name, count");
    const counts: Record<string, number> = {};
    for (const row of countRows ?? []) {
      counts[row.spot_name as string] = row.count as number;
    }
    engine.setCounts(counts);
    engine.setCountsSink(() => {
      // 테스트 호출은 횟수를 늘리지 않는다
    });
    engine.setUsageSink((row: Record<string, unknown>) => {
      // 비용 추적을 위해 사용량은 남긴다
      console.log("[테스트 추천 사용량]", JSON.stringify(row));
    });

    const result = await engine.recommendWithRetryMemory(category, wish);
    return NextResponse.json({
      letter: result.letter,
      picks: result.picks,
    });
  } catch (e) {
    console.error("[테스트 추천] 실패:", e);
    return NextResponse.json({ error: "추천 실패" }, { status: 503 });
  }
}
