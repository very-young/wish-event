/**
 * 실제로 저장된 개인정보 확인.
 *
 * 개인정보 안내 문구가 사실과 일치하는지 검증한다.
 * 값 자체는 마스킹해서 출력한다.
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

const mask = (v) => {
  if (!v) return "(없음)";
  const s = String(v);
  if (s.length <= 4) return "*".repeat(s.length);
  return s.slice(0, 2) + "*".repeat(Math.min(s.length - 4, 8)) + s.slice(-2);
};

console.log("\n=== auth.users에 저장된 항목 ===");
const { data: list, error } = await admin.auth.admin.listUsers();

if (error) {
  console.log("조회 실패:", error.message);
} else if (list.users.length === 0) {
  console.log("가입된 사용자 없음");
} else {
  for (const u of list.users) {
    console.log(`\n사용자 ${u.id.slice(0, 8)}...`);
    console.log(`  email        : ${mask(u.email)}`);
    console.log(`  phone        : ${mask(u.phone)}`);
    console.log(`  provider     : ${u.app_metadata?.provider ?? "-"}`);
    console.log(`  created_at   : ${u.created_at}`);
    console.log("  user_metadata 키 목록:");
    for (const [k, v] of Object.entries(u.user_metadata ?? {})) {
      const kind = typeof v === "string" && v.startsWith("http") ? "(URL)" : "";
      console.log(`    - ${k}: ${mask(v)} ${kind}`);
    }
  }
}

console.log("\n=== participants 테이블에 저장된 항목 ===");
const { data: parts } = await admin
  .from("participants")
  .select("id, nickname, state, has_won, created_at");

if (!parts || parts.length === 0) {
  console.log("참여자 없음");
} else {
  for (const p of parts) {
    console.log(
      `  ${p.id.slice(0, 8)}... nickname=${mask(p.nickname)} state=${p.state} has_won=${p.has_won}`,
    );
  }
}

console.log("");
