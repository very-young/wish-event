import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
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
