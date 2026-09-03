/**
 * 만끽지도 핀번호 엑셀을 읽어 구조를 확인한다.
 *
 * 우리 명소 목록과 이름이 얼마나 일치하는지가 관건이다.
 * 일치하지 않으면 그 명소는 링크를 걸 수 없다.
 */

import { readFileSync } from "node:fs";
import XLSX from "xlsx";

// 파일을 직접 읽어 넘긴다. 한글 파일명에서 readFile이 실패하는 경우가 있다.
const wb = XLSX.read(readFileSync("만끽지도_명소_핀번호.xlsx"), {
  type: "buffer",
});
console.log("시트 목록:", wb.SheetNames.join(", "));

const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

console.log(`\n행 수: ${rows.length}`);
console.log(`열 이름: ${Object.keys(rows[0] ?? {}).join(" | ")}`);

console.log("\n처음 5행:");
for (const r of rows.slice(0, 5)) {
  console.log("  " + JSON.stringify(r));
}

console.log("\n마지막 3행:");
for (const r of rows.slice(-3)) {
  console.log("  " + JSON.stringify(r));
}

// 우리 명소 목록과 대조한다
const spotsPath =
  "추석이벤트_명소추천로직_260901/spots_top100.json";
const spots = JSON.parse(readFileSync(spotsPath, "utf8")).spots;
console.log(`\n우리 명소 수: ${spots.length}`);

// 엑셀에서 이름 열과 핀번호 열을 추측한다
const cols = Object.keys(rows[0] ?? {});
const nameCol = cols.find((c) => /명소|이름|name|spot/i.test(c)) ?? cols[0];
const pinCol =
  cols.find((c) => /핀|pin|번호|no|id|p=/i.test(c) && c !== nameCol) ??
  cols[1];

console.log(`\n이름 열 추정: "${nameCol}"`);
console.log(`핀번호 열 추정: "${pinCol}"`);

// 이름 일치율을 센다
const pinByName = new Map();
for (const r of rows) {
  const n = String(r[nameCol] ?? "").trim();
  const p = r[pinCol];
  if (n && p !== null && p !== undefined && p !== "") {
    pinByName.set(n, p);
  }
}
console.log(`엑셀에서 읽은 유효 항목: ${pinByName.size}개`);

let exact = 0;
const missing = [];
for (const s of spots) {
  if (pinByName.has(s.name)) exact++;
  else missing.push(s.name);
}

console.log(`\n===== 이름 일치 결과 =====`);
console.log(`정확히 일치: ${exact} / ${spots.length} (${((exact / spots.length) * 100).toFixed(1)}%)`);
console.log(`못 찾음: ${missing.length}개`);

if (missing.length) {
  console.log(`\n못 찾은 명소 예시 20개:`);
  for (const m of missing.slice(0, 20)) console.log("  - " + m);
}

// 공백·괄호를 무시하면 몇 개 더 찾는지 본다
const loose = new Map();
const norm = (s) =>
  String(s)
    .replace(/\s+/g, "")
    .replace(/[()[\]]/g, "")
    .toLowerCase();
for (const [n, p] of pinByName) loose.set(norm(n), p);

let looseHit = 0;
for (const m of missing) {
  if (loose.has(norm(m))) looseHit++;
}
console.log(`\n공백·괄호 무시하면 추가로 찾는 수: ${looseHit}개`);
console.log(
  `합계 예상 일치율: ${(((exact + looseHit) / spots.length) * 100).toFixed(1)}%`,
);
