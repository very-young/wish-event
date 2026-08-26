/**
 * DB 상태 직접 조회.
 *
 * Supabase REST API는 스키마 캐시를 쓰기 때문에 테이블을 만든 직후에는
 * "없다"고 답할 수 있다. 여기서는 캐시와 무관한 경로로 확인한다.
 */

import { readFileSync } from "node:fs";

const env = {};
for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 1) continue;
  env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`\n프로젝트: ${url}\n`);

// 1) REST 루트에서 노출된 테이블 목록 확인
const res = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});

console.log(`REST 응답 코드: ${res.status}`);

if (res.ok) {
  const spec = await res.json();
  const paths = Object.keys(spec.paths ?? {})
    .filter((p) => p !== "/")
    .map((p) => p.replace("/", ""));

  if (paths.length === 0) {
    console.log("노출된 테이블: 없음");
  } else {
    console.log(`노출된 테이블 (${paths.length}개):`);
    paths.forEach((p) => console.log(`  - ${p}`));
  }
} else {
  console.log(await res.text());
}

// 2) 키가 가리키는 프로젝트 확인 (JWT 페이로드의 ref)
try {
  const payload = JSON.parse(
    Buffer.from(key.split(".")[1], "base64").toString("utf8"),
  );
  console.log(`\n서비스 키의 프로젝트 ref: ${payload.ref}`);
  console.log(`서비스 키의 role: ${payload.role}`);
} catch {
  console.log("\n키 형식을 해석할 수 없습니다.");
}

console.log("");
