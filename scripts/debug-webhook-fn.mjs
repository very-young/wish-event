/**
 * 웹훅 DB 함수 직접 호출 디버그.
 * 실제 오류 메시지를 확인하기 위한 임시 스크립트.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 1) continue;
  env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

console.log("\n존재하지 않는 티켓으로 호출:");
const { data, error } = await admin.rpc("grant_retry_from_webhook", {
  p_ticket: "00000000-0000-0000-0000-000000000000",
  p_chat_hash: "debug-hash",
  p_chat_type: "DirectChat",
});

if (error) {
  console.log("  오류 발생:");
  console.log("    message:", error.message);
  console.log("    code:", error.code);
  console.log("    details:", error.details);
  console.log("    hint:", error.hint);
} else {
  console.log("  반환값:", JSON.stringify(data));
}

console.log("");
