/**
 * 서버용 Supabase 클라이언트.
 *
 * ⚠️ 이 파일은 절대 클라이언트 컴포넌트에서 import하지 말 것.
 *    서비스 역할 키가 브라우저 번들에 들어가면 누구나 DB를 조작할 수 있다.
 *
 * 두 종류를 제공한다.
 *  - createServerClient: 로그인한 사용자 세션으로 동작 (RLS 적용)
 *  - createAdminClient:  서비스 역할 키로 동작 (RLS 우회, 쓰기 가능)
 */

import "server-only";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** 로그인 세션을 반영한 클라이언트. RLS가 적용된다. */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // 서버 컴포넌트에서는 쿠키를 쓸 수 없다.
            // 미들웨어가 세션을 갱신하므로 무시해도 된다.
          }
        },
      },
    },
  );
}

/**
 * 서비스 역할 키 클라이언트. RLS를 우회한다.
 *
 * 참여 상태·경품 재고·당첨 기록을 변경하는 유일한 경로다.
 * 반드시 서버 액션이나 라우트 핸들러 안에서만 호출한다.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. 서버 환경 변수를 확인하세요.",
    );
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
