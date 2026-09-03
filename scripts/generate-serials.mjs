/**
 * 일련번호를 추가로 만든다.
 *
 * 당첨자가 100명에서 200명으로 늘어 번호가 더 필요하다.
 * 기존 번호와 절대 겹치지 않아야 한다 — 같은 번호가 두 사람에게 나가면
 * 경품 지급 때 분쟁이 생긴다.
 *
 * 사용법: node scripts/generate-serials.mjs 100
 */

import { readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";

const count = Number(process.argv[2] ?? 100);
if (!Number.isInteger(count) || count < 1) {
  console.log("만들 개수를 숫자로 넣어주세요. 예: node scripts/generate-serials.mjs 100");
  process.exit(1);
}

/*
 * 혼동되는 글자를 뺀 집합. 기존 번호와 같은 규칙을 쓴다.
 * O/0, I/1, L 을 제외해 참여자가 옮겨 적을 때 틀리지 않게 한다.
 */
const CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** 기존 번호를 읽어 중복을 막는다 */
const existing = new Set();
const csv = readFileSync("당첨자_일련번호_100.csv", "utf8").split(/\r?\n/);
const header = csv[0];
let maxNo = 0;
for (const line of csv.slice(1)) {
  const t = line.trim();
  if (!t) continue;
  const [no, serial] = t.split(",").map((s) => s.trim());
  if (serial) existing.add(serial);
  const n = Number(no);
  if (Number.isInteger(n) && n > maxNo) maxNo = n;
}

console.log(`기존 번호: ${existing.size}개 (마지막 순번 ${maxNo})`);

/** XXXX-XXXX 형식으로 한 개 만든다 */
const makeOne = () => {
  const pick = (n) =>
    Array.from({ length: n }, () => CHARS[randomInt(0, CHARS.length)]).join("");
  return `${pick(4)}-${pick(4)}`;
};

const fresh = [];
let tries = 0;
while (fresh.length < count) {
  tries++;
  if (tries > count * 1000) {
    console.log("중복을 피할 수 없습니다. 글자 조합을 늘려야 합니다.");
    process.exit(1);
  }
  const s = makeOne();
  if (existing.has(s)) continue;
  existing.add(s);
  fresh.push(s);
}

console.log(`새로 만든 번호: ${fresh.length}개 (시도 ${tries}회)`);

// 새 번호만 담은 CSV
const lines = [header];
fresh.forEach((s, i) => {
  lines.push(`${maxNo + i + 1},${s},미사용`);
});
const outName = `당첨자_일련번호_추가${count}.csv`;
writeFileSync(outName, lines.join("\n"), "utf8");
console.log(`파일 생성: ${outName}`);

// DB에 넣을 SQL
const values = fresh
  .map((s, i) => `  (${maxNo + i + 1}, '${s}')`)
  .join(",\n");

const sql = `-- 일련번호 ${count}개 추가 (당첨자 100명 → 200명 확대)
--
-- scripts/generate-serials.mjs 로 자동 생성했다.
-- 기존 번호와 겹치지 않는 것을 확인했다.
--
-- 여러 번 실행해도 안전하다(on conflict do nothing).

insert into serial_pool (seq, serial) values
${values}
on conflict (seq) do nothing;

-- 경품 재고를 실제 번호 개수와 맞춘다
update prize_stock
   set total = (select count(*) from serial_pool),
       remaining = (select count(*) from serial_pool where assigned_to is null)
 where id = 'main';

-- 확인
select * from serial_summary();
`;

writeFileSync("supabase/migrations/0012_serial_data_add.sql", sql, "utf8");
console.log("SQL 생성: supabase/migrations/0012_serial_data_add.sql");

console.log(`\n앞 5개: ${fresh.slice(0, 5).join(", ")}`);
console.log(`뒤 5개: ${fresh.slice(-5).join(", ")}`);
