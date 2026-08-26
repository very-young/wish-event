"use server";

/**
 * 서버 액션. 참여 권리·경품·재도전에 관한 모든 판정이 여기서 일어난다.
 *
 * 원칙: 브라우저가 보낸 값은 검증 없이 신뢰하지 않는다.
 *   - 게임 성공 주장 → 서버가 seed로 재현해 확인 (설계 결정 D1)
 *   - 소원 문구 → 서버가 다시 모더레이션 검사
 *   - 참여 가능 여부·경품 재고 → DB 함수가 원자적으로 판정
 */

import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { createRoundSeeds } from "@/game/rng";
import { TOTAL_ROUNDS } from "@/game/config";
import { verifyResult, type InputLog } from "@/game/replay";
import { checkWishText } from "@/lib/moderation";
import { getCategory, isValidCategoryId } from "@/content/categories";
import {
  PLACES_PER_RESULT,
  SHARE_TICKET_TTL_MS,
} from "@/content/settings";
import { randomInt } from "node:crypto";

/** 로그인한 사용자 ID를 얻는다. 없으면 null. */
async function currentUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ============================================================
// 참여 상태 조회
// ============================================================

export type PlayStateResult =
  | { ok: true; state: string; hasWon: boolean; eventStatus: string }
  | { ok: false; reason: "unauthenticated" | "error" };

export async function getPlayState(): Promise<PlayStateResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .rpc("get_play_state", { p_participant: userId })
      .maybeSingle();

    if (error || !data) return { ok: false, reason: "error" };

    const row = data as {
      state: string;
      has_won: boolean;
      event_status: string;
      needs_reset: boolean;
    };

    // 날짜가 지났으면 화면에는 참여 가능으로 보여준다.
    // 실제 리셋은 start_attempt에서 원자적으로 처리된다.
    const state = row.needs_reset ? "available" : row.state;

    return {
      ok: true,
      state,
      hasWon: row.has_won,
      eventStatus: row.event_status,
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// ============================================================
// 참여 시작
// ============================================================

export type StartResult =
  | { ok: true; attemptId: string; roundSeeds: number[]; isRetry: boolean }
  | {
      ok: false;
      reason: "unauthenticated" | "blocked" | "error";
      state?: string;
    };

export async function startAttempt(): Promise<StartResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };

  try {
    const admin = createAdminClient();

    /*
     * seed는 예측 불가능해야 한다. 참여자가 미리 알면 궤적을 계산해
     * 정확히 맞출 수 있기 때문이다. 그래서 암호학적 난수를 쓴다.
     */
    const seeds = createRoundSeeds(
      () => randomInt(0, 0x100000000) / 0x100000000,
      TOTAL_ROUNDS,
    );

    const { data, error } = await admin
      .rpc("start_attempt", {
        p_participant: userId,
        p_seeds: seeds,
      })
      .maybeSingle();

    if (error) return { ok: false, reason: "error" };

    // 반환값이 없으면 참여할 수 없는 상태다
    if (!data) {
      const state = await getPlayState();
      return {
        ok: false,
        reason: "blocked",
        state: state.ok ? state.state : undefined,
      };
    }

    const row = data as { attempt_id: string; was_retry: boolean };
    return {
      ok: true,
      attemptId: row.attempt_id,
      roundSeeds: seeds,
      isRetry: row.was_retry,
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// ============================================================
// 소원 제출
// ============================================================

export type SubmitWishResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unauthenticated" | "invalidCategory" | "rejected" | "error";
      detail?: string;
    };

export async function submitWish(
  attemptId: string,
  category: string,
  wishText: string,
): Promise<SubmitWishResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };

  if (!isValidCategoryId(category)) {
    return { ok: false, reason: "invalidCategory" };
  }

  // 서버에서 다시 검사한다. 클라이언트 검사는 우회할 수 있다 (요구사항 5.1).
  const check = checkWishText(wishText);
  if (!check.ok) {
    return { ok: false, reason: "rejected", detail: check.reason };
  }

  try {
    const admin = createAdminClient();

    // 추천 명소를 서버에서 확정한다. 결과 재열람 시 같은 명소가 나오게 하려면
    // 선택 결과를 저장해야 한다 (요구사항 11.7).
    const cat = getCategory(category);
    const pool = [...(cat?.places ?? [])];
    const picked: typeof pool = [];
    while (picked.length < PLACES_PER_RESULT && pool.length > 0) {
      picked.push(pool.splice(randomInt(0, pool.length), 1)[0]);
    }

    const { error } = await admin
      .from("attempts")
      .update({
        category,
        wish_text: wishText.trim(),
        places_shown: picked,
      })
      .eq("id", attemptId)
      .eq("participant_id", userId)
      .eq("status", "in_progress");

    if (error) return { ok: false, reason: "error" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// ============================================================
// 결과 제출 (재현 검증)
// ============================================================

export type SubmitResultOutcome =
  | { ok: true; outcome: "won"; serial: string }
  | { ok: true; outcome: "soldOut" }
  | { ok: true; outcome: "failed"; reachedRound: number }
  | { ok: false; reason: "unauthenticated" | "error" };

export async function submitResult(
  attemptId: string,
  log: InputLog,
): Promise<SubmitResultOutcome> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };

  try {
    const admin = createAdminClient();

    // 서버가 보관한 seed를 가져온다. 클라이언트가 보낸 seed는 신뢰하지 않는다.
    const { data: attempt, error: fetchError } = await admin
      .from("attempts")
      .select("id, round_seeds, status, places_shown")
      .eq("id", attemptId)
      .eq("participant_id", userId)
      .maybeSingle();

    if (fetchError || !attempt) return { ok: false, reason: "error" };

    // 같은 회차를 두 번 제출하는 것을 막는다
    if (attempt.status !== "in_progress") {
      return { ok: false, reason: "error" };
    }

    const seeds = attempt.round_seeds as number[];

    /*
     * 핵심: 클라이언트의 "성공했다"는 주장을 그대로 믿지 않고,
     * 같은 seed로 같은 시뮬레이션을 돌려 직접 확인한다 (설계 결정 D1).
     */
    const verified = verifyResult(seeds, log);

    if (!verified.success) {
      await admin.rpc("finish_attempt_failed", {
        p_participant: userId,
        p_attempt: attemptId,
        p_reached_round: verified.reachedRound,
        // 규칙에 맞지 않는 로그는 조작 시도로 기록해둔다
        p_invalid: verified.invalidReason != null,
      });
      return {
        ok: true,
        outcome: "failed",
        reachedRound: verified.reachedRound,
      };
    }

    // 재고를 원자적으로 차감하고 당첨을 확정한다
    const { data: result, error: finishError } = await admin
      .rpc("finish_attempt_success", {
        p_participant: userId,
        p_attempt: attemptId,
        p_places: attempt.places_shown,
      })
      .maybeSingle();

    if (finishError || !result) return { ok: false, reason: "error" };

    const row = result as { outcome: string; serial: string | null };

    if (row.outcome === "won" && row.serial) {
      return { ok: true, outcome: "won", serial: row.serial };
    }
    if (row.outcome === "sold_out") {
      return { ok: true, outcome: "soldOut" };
    }
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// ============================================================
// 공유 티켓 발급
// ============================================================

export type IssueTicketResult =
  | { ok: true; ticketId: string }
  | { ok: false; reason: "unauthenticated" | "notAllowed" | "error" };

export async function issueShareTicket(
  attemptId: string,
): Promise<IssueTicketResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, reason: "unauthenticated" };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("issue_share_ticket", {
      p_participant: userId,
      p_attempt: attemptId,
      p_ttl_seconds: Math.floor(SHARE_TICKET_TTL_MS / 1000),
    });

    if (error) return { ok: false, reason: "error" };
    // null이면 exhausted 상태가 아니다 (성공자·당첨자·이미 대기 중)
    if (!data) return { ok: false, reason: "notAllowed" };

    return { ok: true, ticketId: data as string };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// ============================================================
// 공유 대기 타임아웃
// ============================================================

export async function expireShareWait(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  try {
    const admin = createAdminClient();
    await admin.rpc("expire_share_wait", { p_participant: userId });
  } catch {
    // 타임아웃 정리는 실패해도 치명적이지 않다.
    // 티켓 만료 시각이 있으므로 다음 웹훅에서 거부된다.
  }
}
