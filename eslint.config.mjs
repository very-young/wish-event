import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
     * 추천 엔진은 동료가 만든 코드를 그대로 쓴다.
     * 우리 규칙으로 고치면 원본과 대조하기 어려워지므로 검사에서 제외한다.
     */
    "src/lib/recommend/engine.mjs",
    "추석이벤트_명소추천로직*/**",
  ]),
]);

export default eslintConfig;
