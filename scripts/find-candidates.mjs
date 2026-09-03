/**
 * 링크를 못 찾은 91곳에 대해 엑셀에서 비슷한 명소를 찾아본다.
 *
 * 목적은 "만끽지도에 없는 것"과 "이름 표기가 다른 것"을 구분하는 것이다.
 * 후보를 뽑아 사람이 눈으로 확인할 수 있게 표로 만든다.
 */

import { readFileSync, writeFileSync } from "node:fs";
import XLSX from "xlsx";

const wb = XLSX.read(readFileSync("만끽지도_명소_핀번호.xlsx"), {
  type: "buffer",
});
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  defval: null,
});

const spots = JSON.parse(
  readFileSync("추석이벤트_명소추천로직_260901/spots_top100.json", "utf8"),
).spots;

const PIN = "#p= 번호";
const NAME = "명소명";
const REGION = "지역";
const ADDR = "주소";

const norm = (s) =>
  String(s ?? "")
    .replace(/\s+/g, "")
    .replace(/[()[\]·・.,'"’”\-–—]/g, "")
    .toLowerCase();

const REGIONS = [
  "서울","부산","대구","인천","광주","대전","울산","세종",
  "경기","강원","충북","충남","전북","전남","경북","경남","제주",
  "전남광주",
];
const stripRegion = (s) => {
  let t = String(s ?? "").trim();
  for (const r of REGIONS) {
    if (t.startsWith(r + " ")) return t.slice(r.length + 1).trim();
  }
  return t;
};

// 엑셀 색인 3종
const exact = new Map();
const loose = new Map();
const noRegion = new Map();
for (const r of rows) {
  const n = String(r[NAME] ?? "").trim();
  const p = r[PIN];
  if (!n || p == null || p === "") continue;
  exact.set(n, r);
  const lk = norm(n);
  if (!loose.has(lk)) loose.set(lk, r);
  const nk = norm(stripRegion(n));
  if (!noRegion.has(nk)) noRegion.set(nk, r);
}

// 못 찾은 명소 추리기
const missing = [];
for (const s of spots) {
  if (exact.has(s.name)) continue;
  if (loose.has(norm(s.name))) continue;
  if (noRegion.has(norm(stripRegion(s.name)))) continue;
  missing.push(s);
}

console.log(`못 찾은 명소: ${missing.length}곳\n`);

/** 두 글자열의 유사도 (0~1). 공통 2글자 조각 비율로 센다. */
function similarity(a, b) {
  const A = norm(stripRegion(a));
  const B = norm(stripRegion(b));
  if (!A || !B) return 0;
  if (A === B) return 1;
  const grams = (s) => {
    const g = new Set();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    if (s.length === 1) g.add(s);
    return g;
  };
  const ga = grams(A);
  const gb = grams(B);
  let hit = 0;
  for (const x of ga) if (gb.has(x)) hit++;
  return (2 * hit) / (ga.size + gb.size);
}

const excelRows = [...exact.values()];

const lines = [
  "우리 명소명\t우리 지역\t후보1 명소명\t후보1 핀번호\t후보1 주소\t유사도\t후보2 명소명\t후보2 핀번호\t유사도2",
];

let strongCount = 0;
const report = [];

for (const s of missing) {
  // 같은 지역 안에서 먼저 찾는다. 지역이 같으면 동일 장소일 확률이 높다.
  const sameRegion = excelRows.filter((r) => {
    const er = String(r[REGION] ?? "");
    return (
      er === s.region ||
      s.region.includes(er) ||
      er.includes(s.region.slice(0, 2))
    );
  });
  const pool = sameRegion.length >= 5 ? sameRegion : excelRows;

  const scored = pool
    .map((r) => ({ r, score: similarity(s.name, r[NAME]) }))
    .filter((x) => x.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const c1 = scored[0];
  const c2 = scored[1];
  if (c1 && c1.score >= 0.6) strongCount++;

  report.push({ spot: s, c1, c2 });

  lines.push(
    [
      s.name,
      s.region,
      c1 ? c1.r[NAME] : "(없음)",
      c1 ? c1.r[PIN] : "",
      c1 ? (c1.r[ADDR] ?? "") : "",
      c1 ? c1.score.toFixed(2) : "",
      c2 ? c2.r[NAME] : "",
      c2 ? c2.r[PIN] : "",
      c2 ? c2.score.toFixed(2) : "",
    ].join("\t"),
  );
}

writeFileSync("링크없는_명소_후보.tsv", lines.join("\n"), "utf8");

console.log(`유사도 0.6 이상 후보가 있는 명소: ${strongCount}곳`);
console.log(`후보를 못 찾은 명소: ${report.filter((x) => !x.c1).length}곳`);
console.log("\n===== 후보 목록 (유사도 높은 순) =====\n");

const sorted = report
  .filter((x) => x.c1)
  .sort((a, b) => b.c1.score - a.c1.score);

for (const x of sorted) {
  console.log(`[${x.c1.score.toFixed(2)}] ${x.spot.name} (${x.spot.region})`);
  console.log(`      → ${x.c1.r[NAME]}  #p=${x.c1.r[PIN]}`);
  if (x.c1.r[ADDR]) console.log(`        ${x.c1.r[ADDR]}`);
  if (x.c2) {
    console.log(`      또는 ${x.c2.r[NAME]}  #p=${x.c2.r[PIN]} (${x.c2.score.toFixed(2)})`);
  }
  console.log("");
}

const none = report.filter((x) => !x.c1);
if (none.length) {
  console.log("===== 후보를 전혀 못 찾은 명소 =====");
  for (const x of none) {
    console.log(`  - ${x.spot.name} (${x.spot.region})`);
  }
}

console.log(`\n표 파일 생성: 링크없는_명소_후보.tsv`);
