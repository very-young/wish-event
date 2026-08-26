/**
 * 카카오 로그인 콜백. (요구사항 2.2)
 *
 * Supabase가 인증 코드를 넘겨주면 세션으로 교환하고,
 * 참여자 행이 없으면 만든다.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // 사용자가 로그인을 취소한 경우 (요구사항 2.3)
  if (error || !code) {
    return NextResponse.redirect(`${origin}/?login=cancelled`);
  }

  const supabase = await createServerClient();
  const { data, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !data.user) {
    return NextResponse.redirect(`${origin}/?login=failed`);
  }

  // 참여자 행을 준비한다. 이미 있으면 닉네임만 갱신한다.
  try {
    const admin = createAdminClient();
    const meta = data.user.user_metadata ?? {};
    const nickname =
      (meta.name as string | undefined) ??
      (meta.nickname as string | undefined) ??
      (meta.preferred_username as string | undefined) ??
      "달빛 손님";

    const { data: existing } = await admin
      .from("participants")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();

    if (existing) {
      await admin
        .from("participants")
        .update({ nickname })
        .eq("id", data.user.id);
    } else {
      await admin
        .from("participants")
        .insert({ id: data.user.id, nickname });
    }
  } catch {
    /*
     * 참여자 행 준비에 실패해도 로그인 자체는 성공시킨다.
     * 참여 시작 시점에 다시 시도할 수 있고, 여기서 막으면
     * 사용자는 이유를 알 수 없는 로그인 실패를 겪는다.
     */
  }

  return NextResponse.redirect(`${origin}/?login=ok`);
}
