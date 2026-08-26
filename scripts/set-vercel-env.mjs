/**
 * Vercel 환경 변수 등록.
 *
 * .env.local을 읽어 Vercel의 production/preview/development에 등록한다.
 *
 * 두 가지 주의사항이 있다.
 *
 * 1) NEXT_PUBLIC_ 로 시작하는 변수는 브라우저에 노출되는 값이라
 *    Vercel이 "비밀"로 취급하지 않는다. 기본값이 비밀이므로
 *    `--visibility config --no-sensitive`를 붙여야 등록된다.
 *
 * 2) preview 환경은 브랜치를 물어본다. `--git-branch`로 지정하거나
 *    모든 브랜치에 적용하려면 별도 처리가 필요하다.
 *    이벤트 페이지는 preview를 쓰지 않으므로 production/development만 등록한다.
 *
 * 사용법: node scripts/set-vercel-env.mjs
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const env = {};
for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 1) continue;
  env[line.slice(0, eq).trim()] = line
    .slice(eq + 1)
    .trim()
    .replace(/^"|"$/g, "");
}

/** 배포 환경에서 사용할 사이트 주소 */
const SITE_URL = "https://wish-event-flax.vercel.app";

const targets = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_KAKAO_JS_KEY",
  "KAKAO_ADMIN_KEY",
];

/** preview는 브랜치 지정이 필요하고 이 프로젝트에서 쓰지 않으므로 제외 */
const environments = ["production", "development"];

function vercel(args, input) {
  return spawnSync("vercel", args, {
    input,
    encoding: "utf8",
    shell: true,
  });
}

let failures = 0;

for (const name of targets) {
  let baseValue = env[name];
  if (name === "NEXT_PUBLIC_SITE_URL") baseValue = SITE_URL;

  if (!baseValue) {
    console.log(`SKIP  ${name} (.env.local에 값 없음)`);
    failures++;
    continue;
  }

  // 브라우저에 노출되는 변수는 비밀로 등록할 수 없다
  const isPublic = name.startsWith("NEXT_PUBLIC_");

  for (const e of environments) {
    const value =
      name === "NEXT_PUBLIC_SITE_URL" && e === "development"
        ? "http://localhost:3000"
        : baseValue;

    vercel(["env", "rm", name, e, "--yes"]);

    const args = ["env", "add", name, e];
    if (isPublic) args.push("--visibility", "config", "--no-sensitive");

    const res = vercel(args, value);
    const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;

    // Vercel CLI는 성공 시 "✓ Added <이름>"을 출력한다
    const added = res.status === 0 && /Added\s+\S/.test(out);
    if (!added) {
      console.log(`FAIL  ${name} [${e}]`);
      const err = out.match(/Error: ([^\n]+)/);
      if (err) console.log(`      → ${err[1]}`);
      failures++;
    }
  }
}

// 최종 확인: 각 변수가 두 환경에 모두 있는지 검사
console.log("\n등록 상태 확인:");
const ls = vercel(["env", "ls"]);
const lsOut = `${ls.stdout ?? ""}${ls.stderr ?? ""}`;

for (const name of targets) {
  const rows = lsOut
    .split("\n")
    .filter((l) => new RegExp(`\\b${name}\\b`).test(l));

  const found = new Set();
  for (const row of rows) {
    if (/Production/i.test(row)) found.add("production");
    if (/Development/i.test(row)) found.add("development");
  }

  const missing = environments.filter((e) => !found.has(e));
  if (missing.length === 0) {
    console.log(`  OK   ${name}`);
  } else {
    console.log(`  FAIL ${name} (누락: ${missing.join(", ")})`);
    failures++;
  }
}

console.log(
  failures === 0
    ? "\n모든 환경 변수가 정상 등록됐습니다.\n"
    : `\n${failures}건 문제가 있습니다.\n`,
);

process.exit(failures === 0 ? 0 : 1);
