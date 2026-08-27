/**
 * 당첨자 일련번호 CSV를 검사한다.
 *
 * 중복이 있으면 두 사람이 같은 번호를 받아 경품 지급 때 분쟁이 생긴다.
 * 형식이 어긋나면 참여자가 폼에 옮겨 적을 때 혼란이 생긴다.
 */

import { readFileSync } from "node:fs";

const raw = readFileSync("당첨자_일련번호_100.csv", "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.trim());
const [header, ...rows] = lines;

console.log(`헤더: ${header}`);
console.log(`데이터 행: ${rows.length}`);

const codes = [];
const badFormat = [];
const badState = [];

for (const line of rows) {
  const [no, code, state] = line.split(",").map((s) => s.trim());
  codes.push(code);
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) badFormat.push(`${no}: ${code}`);
  if (state !== "미사용") badState.push(`${no}: ${state}`);
}

const unique = new Set(codes);
const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);

// 혼동되는 글자가 섞이면 참여자가 옮겨 적다 틀린다
const confusing = codes.filter((c) => /[OIL01]/.test(c));

const charset = [...new Set(codes.join("").replace(/-/g, ""))]
  .sort()
  .join("");

console.log(`\n고유 개수      : ${unique.size} / ${codes.length}`);
console.log(`중복           : ${dupes.length ? dupes.join(", ") : "없음"}`);
console.log(`형식 이탈      : ${badFormat.length ? badFormat.join(", ") : "없음"}`);
console.log(`사용여부 이상  : ${badState.length ? badState.join(", ") : "없음"}`);
console.log(`혼동문자 포함  : ${confusing.length ? confusing.join(", ") : "없음"}`);
console.log(`사용된 글자    : ${charset}`);

const ok =
  unique.size === codes.length &&
  badFormat.length === 0 &&
  badState.length === 0 &&
  confusing.length === 0;

console.log(`\n판정: ${ok ? "정상" : "확인 필요"}`);
