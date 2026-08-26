/**
 * 카카오톡 공유 웹훅. (요구사항 12.5~12.15)
 *
 * 사용자가 카카오톡에서 친구를 골라 실제로 전송을 완료하면
 * 카카오가 이 주소로 신호를 보낸다. 공유 성공을 확인할 수 있는
 * 유일한 수단이다.
 *
 * 규칙:
 *  - 어드민 키로 발신자를 검증한다 (요구사항 12.6)
 *  - 3초 내에 2XX로 응답해야 한다 (요구사항 12.7)
 *  - 어떤 예외가 나도 2XX를 돌려준다. 4XX/5XX면 카카오가 재시도해
 *    상황이 더 나빠진다.
 *
 * 카카오는 GET과 POST 양쪽으로 보낼 수 있어 둘 다 받는다.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/** 웹훅 페이로드에서 뽑아 쓰는 값 */
interface WebhookPayload {
  ticket?: string;
  CHAT_TYPE?: string;
  HASH_CHAT_ID?: string;
  IS_SINGLE_CHATROOM?: boolean | string;
}

/** 항상 2XX로 응답한다. 이유는 파일 상단 주석 참고. */
function ok(detail: string) {
  return NextResponse.json({ result: detail }, { status: 200 });
}

/**
 * 카카오가 보낸 요청인지 검증한다.
 * Authorization 헤더에 대표 어드민 키가 담겨 온다.
 */
function isFromKakao(request: NextRequest): boolean {
  const adminKey = process.env.KAKAO_ADMIN_KEY;
  if (!adminKey) {
    // 키가 설정되지 않았으면 검증할 수 없다. 안전하게 거부한다.
    return false;
  }
  const auth = request.headers.get("authorization") ?? "";
  return auth === `KakaoAK ${adminKey}`;
}

/**
 * 발신자 본인만 있는 채팅방인지 판별한다.
 *
 * MemoChat은 "나와의 채팅방"이다. 이걸 허용하면 자기 자신에게
 * 반복 전송해 재도전을 계속 얻을 수 있다 (요구사항 12.14).
 *
 * IS_SINGLE_CHATROOM은 그룹방이지만 혼자 있는 경우도 잡아준다.
 */
function isSelfChat(payload: WebhookPayload): boolean {
  if (payload.CHAT_TYPE === "MemoChat") return true;
  const single = payload.IS_SINGLE_CHATROOM;
  return single === true || single === "true";
}

async function handle(payload: WebhookPayload) {
  const ticket = payload.ticket;
  const chatHash = payload.HASH_CHAT_ID;

  if (!ticket || !chatHash) {
    return ok("missing-params");
  }

  if (isSelfChat(payload)) {
    // 전송은 성공했지만 재도전은 주지 않는다.
    // 톡방 이력에도 남기지 않는다 (통계 왜곡 방지).
    return ok("self-chat");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("grant_retry_from_webhook", {
    p_ticket: ticket,
    p_chat_hash: chatHash,
    p_chat_type: payload.CHAT_TYPE ?? null,
  });

  if (error) {
    console.error("[kakao-webhook] grant 실패", error.message);
    return ok("error");
  }

  // 'granted' | 'duplicate' | 'already' | 'rejected'
  return ok(String(data));
}

export async function GET(request: NextRequest) {
  try {
    if (!isFromKakao(request)) {
      // 위조 요청은 거부한다 (요구사항 12.6)
      return NextResponse.json({ result: "unauthorized" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    return await handle({
      ticket: params.get("ticket") ?? undefined,
      CHAT_TYPE: params.get("CHAT_TYPE") ?? undefined,
      HASH_CHAT_ID: params.get("HASH_CHAT_ID") ?? undefined,
      IS_SINGLE_CHATROOM:
        params.get("IS_SINGLE_CHATROOM") ?? undefined,
    });
  } catch (e) {
    console.error("[kakao-webhook] GET 처리 중 예외", e);
    return ok("exception");
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isFromKakao(request)) {
      return NextResponse.json({ result: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as WebhookPayload;
    return await handle(body);
  } catch (e) {
    console.error("[kakao-webhook] POST 처리 중 예외", e);
    return ok("exception");
  }
}
