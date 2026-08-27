/**
 * CSV의 일련번호를 SQL INSERT 문으로 바꾼다.
 *
 * 손으로 100줄을 옮기면 오타가 생기므로 파일에서 직접 만든다.
 * 결과는 supabase/migrations/0008_serial_data.sql 로 저장된다.
 */

import { readFileSync, writeFileSync } from "node:fs";

const raw = readFileSync("당첨자_일련번호_100.csv", "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.trim());
lines.shift(); // 헤더 제거

const rows = [];
for (const line of lines) {
  const [seq, serial] = line.split(",").map((s) => s.trim());
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(serial)) {
    throw new Error(`형식이 잘못된 일련번호: ${line}`);
  }
  rows.push(`  (${Number(seq)}, '${serial}')`);
}

// 중복은 여기서 걸러 DB에 들어가지 않게 한다
const serials = lines.map((l) => l.split(",")[1].trim());
const dupes = serials.filter((s, i) => serials.indexOf(s) !== i);
if (dupes.length) throw new Error(`중복 일련번호: ${dupes.join(", ")}`);

const sql = `-- 당첨자 일련번호 데이터 (${rows.length}개)
--
-- 파일: 당첨자_일련번호_100.csv 에서 자동 생성했다.
-- 직접 수정하지 말고 scripts/build-serial-sql.mjs 를 다시 실행할 것.
--
-- 여러 번 실행해도 안전하다(on conflict do nothing).

insert into serial_pool (seq, serial) values
${rows.join(",\n")}
on conflict (seq) do nothing;

-- 경품 재고를 실제 남은 번호 개수와 맞춘다
update prize_stock
   set total = (select count(*) from serial_pool),
       remaining = (select count(*) from serial_pool where assigned_to is null)
 where id = 'main';
`;

writeFileSync("supabase/migrations/0008_serial_data.sql", sql, "utf8");
console.log(`0008_serial_data.sql 생성 완료 (${rows.length}개)`);
