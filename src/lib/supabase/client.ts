/**
 * 브라우저용 Supabase 클라이언트.
 *
 * 익명 키만 사용한다. 이 키로는 RLS 정책이 허용하는 읽기만 가능하고
 * 어떤 테이블에도 쓸 수 없다 (요구사항 13.12~13.14).
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
