/**
 * 계정을 지웠을 때 관련 기록이 어떻게 되는지 시험한다.
 *
 * 궁금한 점:
 *   1) Authentication에서 계정을 지우면 참여 기록도 같이 지워지나?
 *   2) 일련번호를 받은 사람의 계정은 지워지나? (serial_pool에 cascade가 없다)
 *
 * ⚠️ 실제 참여자를 건드리지 않는다. 시험용 계정을 새로 만들어 쓰고
 *    끝에서 지운다.
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

const email = `probe-${Date.now()}@example.invalid`;

// 1) 시험용 계정 생성
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email,
  password: `p${Date.now()}Aa!`,
  email_confirm: true,
});
if (cErr) {
  console.log("계정 생성 실패:", cErr.message);
  process.exit(1);
}
const uid = created.user.id;
console.log(`\n시험용 계정 만듦: ${uid.slice(0, 8)}...`);

// 2) 참여 기록 만들기
await admin
  .from("participants")
  .insert({ id: uid, nickname: "__시험용__" });

const { data: att } = await admin
  .from("attempts")
  .insert({
    participant_id: uid,
    round_seeds: [1, 2, 3],
    category: "test",
    wish_text: "시험",
  })
  .select("id")
  .single();

await admin.from("share_tickets").insert({
  participant_id: uid,
  attempt_id: att.id,
  expires_at: new Date(Date.now() + 60_000).toISOString(),
});
await admin.from("used_chatrooms").insert({
  participant_id: uid,
  chat_hash: `probe-${uid}`,
  chat_type: "DirectChat",
});
console.log("참여 기록 만듦: participants, attempts, share_tickets, used_chatrooms");

// ============================================================
// 시험 A: 일련번호가 없을 때 계정 삭제
// ============================================================
console.log("\n[시험 A] 일련번호 없는 계정 삭제");
{
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) {
    console.log("  삭제 실패:", error.message);
  } else {
    console.log("  삭제 성공");
    for (const t of [
      "participants",
      "attempts",
      "share_tickets",
      "used_chatrooms",
    ]) {
      const { data } = await admin
        .from(t)
        .select("*")
        .eq(t === "participants" ? "id" : "participant_id", uid);
      console.log(`    ${t}: ${data?.length ?? 0}건 남음`);
    }
  }
}

// ============================================================
// 시험 B: 일련번호를 받은 계정 삭제
// ============================================================
console.log("\n[시험 B] 일련번호를 받은 계정 삭제");
const email2 = `probe2-${Date.now()}@example.invalid`;
const { data: c2, error: c2Err } = await admin.auth.admin.createUser({
  email: email2,
  password: `p${Date.now()}Bb!`,
  email_confirm: true,
});
if (c2Err) {
  console.log("  계정 생성 실패:", c2Err.message);
} else {
  const uid2 = c2.user.id;
  await admin
    .from("participants")
    .insert({ id: uid2, nickname: "__시험용2__", has_won: true });

  // 미사용 번호 하나를 이 사람에게 붙인다
  const { data: free } = await admin
    .from("serial_pool")
    .select("seq, serial")
    .is("assigned_to", null)
    .order("seq", { ascending: false })
    .limit(1)
    .single();

  await admin
    .from("serial_pool")
    .update({ assigned_to: uid2, assigned_at: new Date().toISOString() })
    .eq("seq", free.seq);
  console.log(`  번호 ${free.serial}(seq ${free.seq})를 붙였다`);

  const { error: dErr } = await admin.auth.admin.deleteUser(uid2);
  if (dErr) {
    console.log(`  삭제 실패 → ${dErr.message}`);
    console.log("  ⇒ 일련번호를 받은 계정은 그냥 지울 수 없다");
  } else {
    const { data: after } = await admin
      .from("serial_pool")
      .select("assigned_to")
      .eq("seq", free.seq)
      .single();
    console.log(
      `  삭제 성공. 번호의 주인 = ${after?.assigned_to ?? "null(비워짐)"}`,
    );
  }

  // 정리: 번호를 미사용으로 되돌리고 계정도 지운다
  await admin
    .from("serial_pool")
    .update({ assigned_to: null, assigned_at: null })
    .eq("seq", free.seq);
  await admin.from("participants").delete().eq("id", uid2);
  await admin.auth.admin.deleteUser(uid2).catch(() => {});
  console.log("  (시험 흔적 되돌림)");
}

console.log("");
