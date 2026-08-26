import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (e) {
    // 미들웨어 실패로 사이트 전체가 죽는 것을 막는다
    console.error("[middleware] 처리 실패", e);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    /*
     * 정적 파일과 이미지는 제외한다.
     * 웹훅 경로는 카카오가 호출하며 세션이 없으므로 제외한다.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/kakao|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
