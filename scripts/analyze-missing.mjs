/**
 * 링크를 못 찾는 명소의 원인을 분류한다.
 *
 * 원인이 "이름 표기 차이"인지 "엑셀에 아예 없음"인지에 따라
 * 대응이 완전히 달라진다.
 */

import { readFileSync } from "node:fs";
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

// 실제 주소에 쓰이는 값은 '#p= 번호'다 (핀ID와 다르다)
const PIN_COL = "#p= 번호";
const NAME_COL = "명소명";

const byExact = new Map();
for (const r of rows) {
  const n = String(r[NAME_COL] ?? "").trim();
  const p = r[PIN_COL];
  if (n && p != null && p !== "") byExact.set(n, p);
}

/** 공백·괄호·기호를 뺀 형태 */
const norm = (s) =>
  String(s)
    .replace(/\s+/g, "")
    .replace(/[()[\]·・.,'"’”]/g, "")
    .toLowerCase();

const byLoose = new Map();
for (const [n, p] of byExact) {
  const k = norm(n);
  if (!byLoose.has(k)) byLoose.set(k, p);
}

/**
 * 지역명을 뗀 형태.
 * 우리 이름은 "서울 진주회관"인데 엑셀은 "진주회관"인 경우가 있다.
 */
const REGIONS = [
  "서울","부산","대구","인천","광주","대전","울산","세종",
  "경기","강원","충북","충남","전북","전남","경북","경남","제주",
  "전남광주","충청","경상","전라",
];
const stripRegion = (s) => {
  let t = String(s).trim();
  for (const r of REGIONS) {
    if (t.startsWith(r + " ")) return t.slice(r.length + 1).trim();
  }
  return t;
};

const byNoRegion = new Map();
for (const [n, p] of byExact) {
  const k = norm(stripRegion(n));
  if (!byNoRegion.has(k)) byNoRegion.set(k, p);
}

// ---------- 분류 ----------

let exact = 0;
let loose = 0;
let noRegion = 0;
const stillMissing = [];

for (const s of spots) {
  if (byExact.has(s.name)) {
    exact++;
  } else if (byLoose.has(norm(s.name))) {
    loose++;
  } else if (byNoRegion.has(norm(stripRegion(s.name)))) {
    noRegion++;
  } else {
    stillMissing.push(s);
  }
}

const total = spots.length;
const matched = exact + loose + noRegion;

console.log("\n===== 링크 연결 가능성 =====");
console.log(`우리 명소:        ${total}곳`);
console.log(`엑셀 핀번호:      ${byExact.size}곳`);
console.log("");
console.log(`이름 그대로 일치:      ${exact}곳`);
console.log(`공백·기호만 다름:      ${loose}곳`);
console.log(`지역명만 다름:         ${noRegion}곳`);
console.log(`--------------------------------`);
console.log(`연결 가능 합계:        ${matched}곳 (${((matched / total) * 100).toFixed(1)}%)`);
console.log(`연결 불가:             ${stillMissing.length}곳 (${((stillMissing.length / total) * 100).toFixed(1)}%)`);

// ---------- 연결 불가 원인 살펴보기 ----------

console.log("\n===== 연결 불가 명소 분석 =====");

/** 엑셀에 비슷한 이름이 있는지 찾아본다 (앞 3글자 기준) */
const excelNorms = [...byExact.keys()];
let similarFound = 0;
const examples = [];

for (const s of stillMissing) {
  const key = norm(stripRegion(s.name));
  const head = key.slice(0, 3);
  const cands = excelNorms.filter((n) => norm(stripRegion(n)).startsWith(head));
  if (cands.length && examples.length < 15) {
    similarFound++;
    examples.push({ ours: s.name, excel: cands.slice(0, 2) });
  }
}

console.log(`\n엑셀에 비슷한 이름이 있는 경우: ${similarFound}곳`);
console.log(`(이름 표기 차이로 보이는 사례)`);
for (const e of examples) {
  console.log(`  우리: ${e.ours}`);
  console.log(`  엑셀: ${e.excel.join(" / ")}`);
  console.log("");
}

console.log(`엑셀에 흔적조차 없는 경우: 약 ${stillMissing.length - similarFound}곳`);
console.log(`(만끽지도에 등록되지 않은 명소로 보임)`);

console.log("\n연결 불가 명소 30개:");
for (const s of stillMissing.slice(0, 30)) {
  console.log(`  - ${s.name} (${s.region})`);
}
console.log("");
