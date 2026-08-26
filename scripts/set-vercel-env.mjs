/**
 * Vercel 환경 변수 등록.
 *
 * .env.local을 읽어 Vercel의 production/preview/development에 등록한다.
 * PowerShell 스크립트가 한글 주석이 섞인 파일을 읽을 때 인코딩 문제가
 * 있어서 Node로 다시 작성했다.
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
  env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^"|"$/g, "");
}

// 배포 환경별 사이트 주소. production/preview는 배포 주소를 쓴다.
const SITE_URL = "https://wish-event-flax.vercel.app";

const targets = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_KAKAO_JS_KEY",
  "KAKAO_ADMIN_KEY",
];

const environments = ["production", "preview", "development"];

const run = (args, input) =>
  spawnSync("vercel", args, {
    input,
    encoding: "utf8",
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

for (const name of targets) {
  let value = env[name];

  // 배포 환경에서는 localhost가 아니라 실제 주소를 써야 한다
  if (name === "NEXT_PUBLIC_SITE_URL") value = SITE_URL;

  if (!value) {
    console.log(`SKIP  ${name} (값 없음)`);
    continue;
  }

  for (const e of environments) {
    // development 환경의 SITE_URL은 로컬 주소를 유지한다
    const v =
      name === "NEXT_PUBLIC_SITE_URL" && e === "development"
        ? "http://localhost:3000"
        : value;

    run(["env", "rm", name, e, "--yes"]);
    run(["env", "add", name, e], v);
  }

  const masked =
    value.length > 16 ? `${value.slice(0, 10)}...(${value.length}자)` : value;
  console.log(`OK    ${name} = ${masked}`);
}

console.log("\n등록 확인:");
const ls = run(["env", "ls"]);
const lines = (ls.stdout || "")
  .split("\n")
  .filter((l) => targets.some((t) => l.includes(t)));
const seen = new Set();
for (const l of lines) {
  const name = targets.find((t) => l.includes(t));
  const envName = ["Production", "Preview", "Development"].find((e) =>
    l.includes(e),
  );
  const key = `${name}|${envName}`;
  if (seen.has(key)) continue;
  seen.add(key);
}
for (const t of targets) {
  const found = ["Production", "Preview", "Development"].filter((e) =>
    seen.has(`${t}|${e}`),
  );
  console.log(`  ${t}: ${found.length > 0 ? found.join(", ") : "미등록"}`);
}
