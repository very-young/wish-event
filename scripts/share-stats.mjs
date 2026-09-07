/**
 * 사람별 공유 현황.
 *
 * 공유하기를 몇 번 눌렀고 그중 몇 번이 실제 전송까지 갔는지 본다.
 * 시도는 많은데 성공이 적으면 공유 과정에서 이탈하고 있다는 뜻이다.
 *
 * ⚠️ 누구에게 보냈는지는 알 수 없다. 카카오가 톡방을 알아볼 수 없는
 *    문자열로 바꿔서 주기 때문이다.
 *
 * 사용법: node scripts/share-stats.mjs
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

const { data: parts } = await admin
  .from("participants")
  .select("id, nickname");

const count = async (table) => {
  const { data } = await admin.from(table).select("participant_id");
  const map = new Map();
  for (const row of data ?? []) {
    map.set(row.participant_id, (map.get(row.participant_id) ?? 0) + 1);
  }
  return map;
};

const tries = await count("share_tickets");
const grants = await count("share_grants");
const rooms = await count("used_chatrooms");

const rows = (parts ?? [])
  .map((p) => ({
    name: p.nickname,
    tried: tries.get(p.id) ?? 0,
    ok: grants.get(p.id) ?? 0,
    rooms: rooms.get(p.id) ?? 0,
  }))
  .sort((a, b) => b.tried - a.tried || a.name.localeCompare(b.name, "ko"));

console.log("\n닉네임          시도  성공  톡방");
console.log("-".repeat(34));
for (const r of rows) {
  if (r.tried === 0 && r.ok === 0) continue;
  console.log(
    `${r.name.padEnd(14)}${String(r.tried).padStart(4)}${String(r.ok).padStart(6)}${String(r.rooms).padStart(6)}`,
  );
}

const totalTried = rows.reduce((s, r) => s + r.tried, 0);
const totalOk = rows.reduce((s, r) => s + r.ok, 0);
const rate = totalTried
  ? ((100 * totalOk) / totalTried).toFixed(1)
  : "0.0";
console.log("-".repeat(34));
console.log(`합계          ${String(totalTried).padStart(4)}${String(totalOk).padStart(6)}`);
console.log(`\n공유 시도 중 실제 전송까지 간 비율: ${rate}%`);

const { data: types } = await admin
  .from("used_chatrooms")
  .select("chat_type");
if (types?.length) {
  const byType = new Map();
  for (const t of types) {
    const k = t.chat_type ?? "(모름)";
    byType.set(k, (byType.get(k) ?? 0) + 1);
  }
  console.log("\n[톡방 종류]");
  for (const [k, v] of byType) {
    const label =
      k === "DirectChat"
        ? "1:1 대화"
        : k === "MultiChat"
          ? "단체방"
          : k === "Memo"
            ? "나와의 채팅"
            : k;
    console.log(`  ${label}: ${v}건`);
  }
}
console.log("");
