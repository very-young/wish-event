/**
 * 명소별 만끽지도 링크 표를 만든다.
 *
 * 엑셀의 핀번호를 우리 명소 이름에 맞춰 붙인다. 이름 표기가 달라
 * 바로 못 찾는 경우가 있어 아래 순서로 찾는다.
 *   1) 이름 그대로
 *   2) 공백·기호 무시
 *   3) 지역명 떼고 비교
 *   4) 글자 유사도 (사용자 확인 완료)
 *
 * 결과는 src/content/spot-links.json 으로 저장한다.
 * 화면에서는 이 표를 찾아 링크를 붙인다.
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
  const t = String(s ?? "").trim();
  for (const r of REGIONS) {
    if (t.startsWith(r + " ")) return t.slice(r.length + 1).trim();
  }
  return t;
};

/** 두 이름의 유사도 (0~1). 공통 2글자 조각 비율. */
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

// 색인 3종
const exact = new Map();
const loose = new Map();
const noRegion = new Map();
const excelRows = [];

for (const r of rows) {
  const n = String(r[NAME] ?? "").trim();
  const p = r[PIN];
  if (!n || p == null || p === "") continue;
  excelRows.push(r);
  if (!exact.has(n)) exact.set(n, p);
  const lk = norm(n);
  if (!loose.has(lk)) loose.set(lk, p);
  const nk = norm(stripRegion(n));
  if (!noRegion.has(nk)) noRegion.set(nk, p);
}

const links = {};
const stats = { exact: 0, loose: 0, noRegion: 0, similar: 0, none: 0 };
const unresolved = [];

for (const s of spots) {
  let pin = exact.get(s.name);
  if (pin != null) {
    links[s.name] = pin;
    stats.exact++;
    continue;
  }

  pin = loose.get(norm(s.name));
  if (pin != null) {
    links[s.name] = pin;
    stats.loose++;
    continue;
  }

  pin = noRegion.get(norm(stripRegion(s.name)));
  if (pin != null) {
    links[s.name] = pin;
    stats.noRegion++;
    continue;
  }

  /*
   * 이름 표기가 달라 위 방법으로 못 찾은 경우다.
   * 같은 지역에서 가장 비슷한 이름을 고른다.
   * 이 결과는 사용자가 표로 확인했다.
   */
  const sameRegion = excelRows.filter((r) => {
    const er = String(r[REGION] ?? "");
    return (
      er === s.region ||
      s.region.includes(er) ||
      er.includes(s.region.slice(0, 2))
    );
  });
  const pool = sameRegion.length >= 5 ? sameRegion : excelRows;

  let best = null;
  for (const r of pool) {
    const score = similarity(s.name, r[NAME]);
    if (!best || score > best.score) best = { r, score };
  }

  if (best && best.score >= 0.4) {
    links[s.name] = best.r[PIN];
    stats.similar++;
  } else {
    stats.none++;
    unresolved.push(s.name);
  }
}

writeFileSync(
  "src/content/spot-links.json",
  JSON.stringify(links, null, 0),
  "utf8",
);

const total = spots.length;
const matched = total - stats.none;

console.log("\n===== 명소 링크 생성 결과 =====");
console.log(`전체 명소:        ${total}곳`);
console.log(`이름 그대로:      ${stats.exact}곳`);
console.log(`공백·기호 차이:   ${stats.loose}곳`);
console.log(`지역명 차이:      ${stats.noRegion}곳`);
console.log(`유사 이름 연결:   ${stats.similar}곳`);
console.log(`연결 실패:        ${stats.none}곳`);
console.log(`-------------------------------`);
console.log(`연결 완료:        ${matched}곳 (${((matched / total) * 100).toFixed(1)}%)`);

if (unresolved.length) {
  console.log(`\n연결 못 한 명소:`);
  for (const n of unresolved) console.log(`  - ${n}`);
}

console.log(`\n파일 생성: src/content/spot-links.json (${Object.keys(links).length}개)`);
