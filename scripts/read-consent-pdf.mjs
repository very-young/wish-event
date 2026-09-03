/**
 * 동의서 PDF의 내용을 읽는다.
 * 화면 문구를 실제 동의서와 일치시키기 위해 원문을 확인한다.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const path =
  "../한국관광공사 개인정보 수집·이용 동의서 표준안_추석이벤트.pdf";

const parser = new PDFParse({ data: readFileSync(path) });
const result = await parser.getText();
console.log("=".repeat(60));
console.log(result.text);
await parser.destroy();
