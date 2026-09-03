/**
 * 실제로 저장되는 개인정보 항목을 확인한다.
 *
 * 개인정보 안내 문구는 실제 저장 내용과 일치해야 한다.
 * 추측이 아니라 DB에 있는 값을 직접 확인한다.
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

/** 값을 그대로 찍지 않고 형태만 보여준다 */
const mask = (v) => {
  if (v === null || v === undefined) return "(없음)";
  const s = String(v);
  if (s.length <= 4) return `${s[0]}***`;
  return `${s.slice(0, 3)}***${s.slice(-2)} (${s.length}자)`;
};

console.log("\n========== 우리 DB (participants) ==========");
{
  const { data } = await admin.from("participants").select("*").limit(3);
  if (!data?.length) {
    console.log("  참여자 없음");
  } else {
    console.log(`  칸 목록: ${Object.keys(data[0]).join(", ")}`);
    console.log("");
    for (const p of data) {
      console.log(`  - id(계정식별자): ${mask(p.id)}`);
      console.log(`    nickname: ${mask(p.nickname)}`);
      console.log(`    state: ${p.state} / has_won: ${p.has_won}`);
    }
  }
}

console.log("\n========== 우리 DB (attempts) ==========");
{
  const { data } = await admin.from("attempts").select("*").limit(2);
  if (!data?.length) console.log("  회차 없음");
  else {
    console.log(`  칸 목록: ${Object.keys(data[0]).join(", ")}`);
    console.log("");
    for (const a of data) {
      console.log(`  - wish_text(소원): ${mask(a.wish_text)}`);
      console.log(`    category: ${a.category}`);
    }
  }
}

console.log("\n========== 카카오 로그인이 남기는 것 (auth.users) ==========");
{
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 3 });
  if (error) {
    console.log("  조회 실패:", error.message);
  } else if (!data.users.length) {
    console.log("  사용자 없음");
  } else {
    for (const u of data.users) {
      console.log(`\n  [사용자]`);
      console.log(`    id: ${mask(u.id)}`);
      console.log(`    email: ${mask(u.email)}`);
      console.log(`    phone: ${mask(u.phone)}`);
      console.log(`    created_at: ${u.created_at}`);
      console.log(`    last_sign_in_at: ${u.last_sign_in_at}`);
      const meta = u.user_metadata ?? {};
      console.log(`    user_metadata 칸: ${Object.keys(meta).join(", ") || "(없음)"}`);
      for (const [k, v] of Object.entries(meta)) {
        console.log(`      ${k}: ${mask(v)}`);
      }
      const ident = u.identities ?? [];
      for (const i of ident) {
        console.log(`    identity(${i.provider}) 칸: ${Object.keys(i.identity_data ?? {}).join(", ")}`);
      }
    }
  }
}

console.log("\n========== 공유 관련 ==========");
{
  const { data } = await admin.from("used_chatrooms").select("*").limit(2);
  if (!data?.length) console.log("  톡방 이력 없음");
  else {
    console.log(`  칸 목록: ${Object.keys(data[0]).join(", ")}`);
    for (const r of data) {
      console.log(`  - chat_hash: ${mask(r.chat_hash)} / chat_type: ${r.chat_type}`);
    }
  }
}

console.log("\n========== 당첨자 ==========");
{
  const { data } = await admin.from("winners").select("*").limit(2);
  if (!data?.length) console.log("  당첨자 없음");
  else {
    console.log(`  칸 목록: ${Object.keys(data[0]).join(", ")}`);
  }
}

console.log("");
