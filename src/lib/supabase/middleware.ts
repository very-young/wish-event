/**
 * 세션 갱신 미들웨어 도우미.
 *
 * 서버 컴포넌트는 쿠키를 쓸 수 없어서 세션이 만료되면 로그아웃된 것처럼
 * 보인다. 미들웨어에서 토큰을 갱신해 이를 막는다 (요구사항 2.5).
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // 이 호출이 필요한 토큰 갱신을 일으킨다
  await supabase.auth.getUser();

  return response;
}
