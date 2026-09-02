/**
 * AI 명소 추천 API.
 *
 * 브라우저가 Gemini를 직접 부르지 않고 이 경로를 부른다. 그래야 Gemini 키가
 * 노출되지 않는다.
 *
 * 호출 시점은 종이접기 단계다. 참여자가 종이를 접고 게임을 하는 동안
 * 뒤에서 생성해 두고, 게임이 끝나 편지를 열 때 결과를 보여준다.
 *
 * 추천 로직은 동료가 만든 엔진(src/lib/recommend/engine.mjs)을 그대로 쓴다.
 * 이 파일은 엔진을 부르고 결과를 DB에 저장하는 역할만 한다.
 */

import { NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { getCategory } from "@/content/categories";
import { WISH_TEXT_LIMIT } from "@/content/settings";

/*
 * 벡터 파일(21MB)을 읽으므로 Node 런타임이 필요하다.
 * Gemini 재시도까지 고려해 실행 시간을 넉넉히 준다.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** 자동 재요청 전 대기 시간. 곧바로 다시 부르면 같은 이유로 또 실패한다. */
const AUTO_RETRY_DELAY_MS = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Engine = typeof import("@/lib/recommend/engine.mjs");

/**
 * 엔진을 불러온다.
 *
 * 최초 호출에서 데이터 파일(약 25MB)을 읽는다. 모듈은 한 번 불러오면
 * 재사용되므로 이후 요청은 이 비용을 다시 치르지 않는다.
 */
let enginePromise: Promise<Engine> | null = null;
function loadEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = import("@/lib/recommend/engine.mjs").catch((e) => {
      // 실패한 약속을 남겨두면 다음 요청도 영구히 실패한다
      enginePromise = null;
      throw e;
    });
  }
  return enginePromise;
}

export async function POST(request: Request) {
  // 로그인한 참여자만 호출할 수 있다. 외부에서 무단 호출되면 Gemini 비용이 샌다.
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { attemptId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const attemptId = body.attemptId;
  if (!attemptId) {
    return NextResponse.json({ error: "attemptId 필요" }, { status: 400 });
  }

  const admin = createAdminClient();

  /*
   * 소원 문구는 브라우저가 보낸 값을 쓰지 않고 DB에서 읽는다.
   * 그러지 않으면 남의 회차에 아무 문구나 넣어 호출할 수 있다.
   */
  const { data: attempt, error: fetchError } = await admin
    .from("attempts")
    .select("id, category, wish_text, ai_status, ai_letter, ai_picks")
    .eq("id", attemptId)
    .eq("participant_id", userId)
    .maybeSingle();

  if (fetchError || !attempt) {
    return NextResponse.json({ error: "회차를 찾을 수 없습니다" }, { status: 404 });
  }

  // 이미 만들어 두었으면 다시 부르지 않는다. Gemini 비용과 시간을 아낀다.
  if (attempt.ai_status === "ready" && attempt.ai_letter) {
    return NextResponse.json({
      status: "ready",
      letter: attempt.ai_letter,
      picks: attempt.ai_picks ?? [],
    });
  }

  const categoryId = attempt.category as string | null;
  const wish = (attempt.wish_text as string | null) ?? "";
  const category = categoryId ? getCategory(categoryId) : undefined;

  if (!category || !wish.trim()) {
    return NextResponse.json(
      { error: "소원이 아직 저장되지 않았습니다" },
      { status: 400 },
    );
  }

  /*
   * 소원이 길면 Gemini 해석이 느려진다. 작성 화면에서 이미 제한하지만
   * 여기서도 잘라 안전하게 만든다 (요구사항 4.4).
   */
  const trimmedWish = wish.trim().slice(0, WISH_TEXT_LIMIT.max);

  // 엔진은 화면에 보이는 한글 유형 이름을 받는다 ('건강·무탈' 등)
  const categoryLabel = category.label;

  try {
    const engine = await loadEngine();

    // 추천 횟수를 DB에서 불러와 엔진에 넣어준다.
    // 이 값으로 이미 많이 나간 명소의 점수를 깎아 쏠림을 막는다.
    const { data: countRows } = await admin
      .from("spot_recommend_counts")
      .select("spot_name, count");
    const counts: Record<string, number> = {};
    for (const row of countRows ?? []) {
      counts[row.spot_name as string] = row.count as number;
    }
    engine.setCounts(counts);

    // 엔진이 추천을 마치면 늘어난 명소를 DB에 반영한다
    engine.setCountsSink((names: string[]) => {
      void admin.rpc("bump_spot_counts", { p_names: names });
    });

    // 사용량 기록 (원본의 gemini_usage.jsonl 대체)
    engine.setUsageSink((row: Record<string, unknown>) => {
      void admin.from("gemini_usage").insert({
        model: row.model,
        category: row.category,
        wish_chars: row.wish_chars,
        candidate_count: row.candidate_count,
        prompt_tokens: row.prompt_tokens,
        candidates_tokens: row.candidates_tokens,
        thoughts_tokens: row.thoughts_tokens,
        total_tokens: row.total_tokens,
      });
    });

    /*
     * 1차 시도. 엔진 안에 Gemini 내부 재시도 1회가 이미 들어 있다.
     * 그것까지 실패하면 아래에서 자동으로 한 번 더 요청한다 (팀 요청사항).
     */
    let result;
    try {
      result = await engine.recommendWithRetryMemory(categoryLabel, trimmedWish);
    } catch (first) {
      console.warn(
        "[추천] 1차 요청 실패, 자동 재요청합니다:",
        first instanceof Error ? first.message : first,
      );
      // 곧바로 다시 부르면 같은 이유로 또 실패하므로 잠깐 기다린다
      await sleep(AUTO_RETRY_DELAY_MS);
      result = await engine.recommendWithRetryMemory(
        categoryLabel,
        trimmedWish,
      );
    }

    await admin.rpc("save_ai_result", {
      p_participant: userId,
      p_attempt: attemptId,
      p_status: "ready",
      p_letter: result.letter,
      p_picks: result.picks,
    });

    return NextResponse.json({
      status: "ready",
      letter: result.letter,
      picks: result.picks,
    });
  } catch (e) {
    console.error("[추천] 자동 재요청까지 실패:", e);

    await admin.rpc("save_ai_result", {
      p_participant: userId,
      p_attempt: attemptId,
      p_status: "failed",
      p_letter: null,
      p_picks: null,
    });

    /*
     * 여기까지 오면 Gemini가 품질 검증을 통과하는 결과를 못 만든 것이다.
     * 엔진이 저품질 결과를 내보내지 않는 방향으로 설계됐으므로,
     * 억지로 대체 명소를 만들어 보여주지 않고 실패를 알린다.
     */
    return NextResponse.json({ status: "failed" }, { status: 503 });
  }
}
