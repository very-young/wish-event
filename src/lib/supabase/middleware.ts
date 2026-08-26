/**
 * 세션 갱신 미들웨어 도우미.
 *
 * 서버 컴포넌트는 쿠키를 쓸 수 없어서 세션이 만료되면 로그아웃된 것처럼
 * 보인다. 미들웨어에서 토큰을 갱신해 이를 막는다 (요구사항 2.5).
 *
 * ⚠️ 미들웨어는 모든 요청을 거친다. 여기서 예외가 나면 사이트 전체가
 *    500 오류가 되므로, 어떤 실패에도 요청을 그냥 통과시켜야 한다.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 환경 변수가 없으면 세션 갱신을 건너뛴다.
  // 로그인은 안 되지만 사이트는 정상 동작해야 한다.
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  try {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(url, key, {
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
    });

    // 이 호출이 필요한 토큰 갱신을 일으킨다
    await supabase.auth.getUser();

    return response;
  } catch (e) {
    // 세션 갱신 실패가 사이트를 죽여서는 안 된다
    console.error("[middleware] 세션 갱신 실패", e);
    return NextResponse.next({ request });
  }
}
