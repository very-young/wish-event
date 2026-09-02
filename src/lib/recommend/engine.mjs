/*
 * ⚠️ 이 파일은 동료가 만든 추천 엔진(추석이벤트_명소추천로직_260901/server.mjs)의
 *    사본이다. 추천 로직과 프롬프트는 튜닝이 끝난 상태이므로 손대지 않는다.
 *
 * 원본과 다른 부분은 "실행 환경"에 관한 것뿐이다. Vercel은 요청마다 함수를 실행하는
 * 방식이라 아래 세 가지가 원본 그대로는 동작하지 않는다.
 *
 *   1) 파일 쓰기 금지        → 추천 횟수는 DB에, 사용량은 콘솔·DB에 남긴다
 *   2) 프로그램 종료 금지     → process.exit 대신 예외를 던진다
 *   3) 직접 서버를 띄우지 않음 → http 서버 생성부를 제거하고 recommend만 내보낸다
 *
 * 원본이 갱신되면 이 파일도 다시 만들어야 한다.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const KEY=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
const MODEL='gemini-3.6-flash';
const EMBED_MODEL='gemini-embedding-2';
const DIM=768;
if(!KEY) console.warn('GEMINI_API_KEY가 아직 설정되지 않았습니다.');

/*
 * 데이터 파일 위치.
 *
 * 원본은 자기 폴더에서 읽었지만, 여기서는 프로젝트 루트의 data/spots에 둔다.
 * 소스 폴더에 21MB 파일을 두면 빌드가 매번 그걸 훑어 느려진다.
 */
const DATA_DIR=process.env.SPOTS_DATA_DIR
  ? path.resolve(process.env.SPOTS_DATA_DIR)
  : path.join(process.cwd(),'data','spots');

const db=JSON.parse(fs.readFileSync(path.join(DATA_DIR,'spots_top100.json'),'utf8'));
const spots=db.spots;
const vecPath=path.join(DATA_DIR,'spot_vectors.f32');
// 원본은 여기서 process.exit(1)로 종료했다. 서버 전체를 죽이면 안 되므로 예외로 바꾼다.
if(!fs.existsSync(vecPath)){
  throw new Error(`추천용 벡터 파일이 없습니다: ${vecPath}`);
}
const raw=fs.readFileSync(vecPath);
if(raw.length!==spots.length*DIM*4){
  throw new Error(`벡터 파일 크기가 명소 데이터와 맞지 않습니다. 명소 ${spots.length}곳 x ${DIM}차원을 기대했습니다.`);
}
const vectors=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
// 첫 수동 요청이 실패한 동일 소원은 잠시 기억해 두었다가, 두 번째 수동 요청에 더 긴 Gemini 대기시간을 준다.
const recentManualFailures=new Map();
const MANUAL_RETRY_WINDOW_MS=2*60*1000;
function requestKey(category,wish){return `${String(category||'').trim()}\n${String(wish||'').trim()}`;}

/*
 * 명소별 추천 횟수. 같은 명소가 반복 추천되는 것을 억제하는 데 쓴다(점수 감점).
 *
 * 원본은 recommend_counts.json 파일에 보관했다. Vercel은 파일 쓰기가 막혀 있고
 * 함수가 매번 새로 뜨므로, 바깥(DB)에서 불러와 채우고 바깥으로 내보낸다.
 * 아래 두 함수는 api 라우트가 주입한다.
 */
let counts={};
/** DB에서 불러온 추천 횟수를 채운다. */
export function setCounts(next){counts=next&&typeof next==='object'?next:{};}
/** 이번 추천에서 늘어난 명소 이름을 받아 DB에 반영할 수 있게 알린다. */
let onCountsChanged=null;
export function setCountsSink(fn){onCountsChanged=typeof fn==='function'?fn:null;}
/** Gemini 사용량 기록을 받을 곳. 원본의 gemini_usage.jsonl을 대체한다. */
let onUsage=null;
export function setUsageSink(fn){onUsage=typeof fn==='function'?fn:null;}

const SYSTEM=`너는 한국관광공사 100X100 추석 소원 이벤트의 명소 큐레이터다.

역할은 하나다. 사용자의 소원을 제대로 이해하고, 제공된 후보 명소 안에서만 정확히 3곳을 골라 '왜 이 소원에 이곳인지' 납득되고 재미있게 설명한다.

추천 원칙:
- 장소의 실제 특징과 실제 경험을 먼저 본다.
- 직접 도움이 되는 연결은 가장 우선한다.
- 재물·주식·로또처럼 여행지가 직접 해결할 수 없는 소원은, 실제 장소 특징을 이용한 자연스럽고 재치 있는 비유를 허용한다.
- 좋은 기운, 새로운 자극, 막연한 자신감처럼 아무 장소에나 붙는 말만으로 연결되는 후보는 고르지 않는다.
- 세 곳은 가능하면 서로 다른 경험과 다른 추천 이유를 가진다.
- 사찰이나 기도처를 만능 답으로 사용하지 않는다. 장소의 구체적 경험이 맞거나 사용자가 기도 자체를 원하는 경우에만 선택한다.
- 임신·회복 등 명백히 충돌하는 경험은 피한다.
- 후보 밖 장소를 만들지 않는다.

추천 카피는 관광 안내문이 아니다. 장소의 진짜 특징을 소재로 공감, 위트, 비유, 행동, 상상을 섞어 짧고 사람답게 쓴다. 읽는 사람이 '아 그래서 여기구나' 또는 '그럴듯한데?'라고 느끼면 성공이다. 세 문장은 문장 구조와 말맛까지 서로 다르게 쓴다.

달의 답장은 사용자의 구체적인 소원에 직접 반응하는 2~3문장이다. 소원 원문을 기계적으로 복사하지 않는다.

JSON만 반환한다.`

function send(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(body):body);
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchWithTimeout(url,options={},timeoutMs=7000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal});}
  finally{clearTimeout(timer)}
}
function repairKorean(s){
  return String(s||'')
    .replace(/합약/g,'합격').replace(/입삽/g,'입사').replace(/취엽/g,'취업')
    .replace(/성공하길를/g,'성공하길').replace(/건강하길를/g,'건강하길');
}
function extractJson(t){const c=t.trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();return JSON.parse(c.slice(c.indexOf('{'),c.lastIndexOf('}')+1));}
async function embedQuery(text,attempt=0){
  const r=await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`,{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':KEY},
    body:JSON.stringify({content:{parts:[{text}]},output_dimensionality:DIM,task_type:'RETRIEVAL_QUERY'})
  },4500);
  const d=await r.json();
  if(!r.ok){if((r.status===429||r.status>=500)&&attempt<1){await sleep(250);return embedQuery(text,attempt+1)}throw new Error(d.error?.message||'Embedding 오류')}
  return d.embedding.values;
}
function dotAt(q,idx){let s=0,off=idx*DIM;for(let j=0;j<DIM;j++)s+=q[j]*vectors[off+j];return s;}

function norm(s){return String(s||'').toLowerCase().replace(/\s+/g,'');}
function spotText(sp){return `${sp.name} ${(sp.sheets||[]).join(' ')} ${(sp.descriptions||[]).join(' ')}`;}
function explicitPrayer(wish){return /기도|기원|빌어|빌고|소원|절에|사찰|부처|보살|제발/.test(wish);}
function isRomanceWish(wish,category){
  return category==='사랑·인연' || /연애|남친|여친|남자친구|여자친구|애인|짝사랑|고백|썸|소개팅|맞선|결혼|인연|사랑/.test(wish);
}
function isHistoricalMemorial(sp){
  const t=spotText(sp);
  return /이순신|충무공|독립|의병|전쟁|전투|전적|현충|충렬|기념관|기념공원|기념광장|사당|묘역|왕릉|고분|생가|유적지|역사박물관/.test(t);
}
function schoolScenario(wish){
  const w=norm(wish);
  const youth=/(초등|중등|고등|학생|반에서|학교|학급|반장|회장|선거|내신|시험|대회|상받|수상)/.test(w);
  if(!youth) return null;
  if(/반장|회장|선거/.test(w)) return 'election';
  if(/상받|수상|대회.*(일등|1등|우승)|작품.*(일등|1등)/.test(w)) return 'award';
  if(/시험|내신|수능|성적|점수|일등|1등/.test(w)) return 'exam';
  return 'school';
}
function targetCompany(wish){
  const w=String(wish||'');
  const names=['삼성','네이버','NAVER','카카오','현대','현대차','LG','엘지','SK','에스케이','쿠팡','토스','배민','우아한형제들','포스코','한화','롯데','CJ','씨제이','KT','케이티'];
  return names.find(n=>w.toLowerCase().includes(n.toLowerCase()))||null;
}
function employmentTargetScenario(wish,category){
  return !!targetCompany(wish) && (category==='이직·취업' || /가고싶|입사|취업|합격|지원|이직|들어가/.test(norm(wish)));
}
function wishSpecificEnough(text,wish,category){
  const x=String(text||'');
  const company=targetCompany(wish), sc=schoolScenario(wish);
  if(employmentTargetScenario(wish,category)) return x.includes(company) || /입사|취업|합격|지원|커리어|채용|회사/.test(x);
  if(familyHarmonyScenario(wish)) return /(가족|함께|나란히|이야기|대화|웃|다정|서운)/.test(x);
  if(blindDateScenario(wish)) return /(소개팅|첫 만남|첫만남|대화|어색|설렘)/.test(x);
  if(sc==='award') return /(글|문장|생각|시선|이야기|표현|논술|작품|수상|대회|노력|축하|긴장|스트레스|성취)/.test(x);
  if(sc==='election') return /(반장|회장|친구|용기|자신감|이끌|리더|앞에 서)/.test(x);
  if(sc==='exam') return /(시험|성적|집중|배움|공부|문제|생각|리프레시)/.test(x);
  if(savingsScenario(wish)) return /(억|목돈|저축|모으|차곡|돈|통장|재산|쌓)/.test(x);
  if(stockScenario(wish)) return /(주식|차트|우상향|상승|수익|계좌|상한가)/.test(x);
  if(lotteryScenario(wish)) return /(로또|복권|당첨|대박|행운|한방|터져)/.test(x);
  if(childHealthScenario(wish)) return /(아이|아기|자라|성장|건강|튼튼|잘 먹|뛰놀|활력)/.test(x);
  return x.trim().length>=12;
}
function hasBadKorean(text){
  return /합약|입삽|취엽|성공하길를|건강하길를/.test(String(text||''));
}
function blindDateScenario(wish){return /소개팅|맞선|첫만남|첫 만남/.test(String(wish||''));}
function familyHarmonyScenario(wish){
  const w=norm(wish);
  return /(가족|부모님|엄마|아빠|형제|자매|우리집)/.test(w) && /(화목|사이좋|행복|싸우지|다정|친하게|잘지내|평화)/.test(w);
}
function childHealthScenario(wish){
  const w=norm(wish);
  return /(아이|아기|아들|딸|자녀|어린이)/.test(w) && /(건강|무럭|튼튼|성장|자라|잘크|키크)/.test(w);
}
function lotteryScenario(wish){return /로또|복권|당첨|대박/.test(wish);}
function stockScenario(wish){return /주식|차트|상한가|우상향|증시|코인|투자/.test(wish);}
function savingsScenario(wish){return /(억|천만|백만|돈|목돈|저축|모으|재산|부자)/.test(wish) && !lotteryScenario(wish) && !stockScenario(wish);}
function parentChildMarriageScenario(wish){const w=norm(wish);return /(아들|딸|자식|자녀).*(장가|시집|결혼|좋은사람|인연)/.test(w);}
function healthyFoodLike(sp){const t=spotText(sp);return /건강식|로컬푸드|로컬 식재료|유기농|친환경|채소|과일|약초|산나물|두부|발효|농장|목장|식재료|영양/.test(t) && !/빵집|베이커리|디저트|케이크|도넛|단팥빵/.test(t);}
function experienceBucket(sp){
  const t=spotText(sp);
  if(/먹|음식|식당|맛집|두부|약초|시장|농장|과일|채소|로컬푸드|건강식/.test(t)) return 'food';
  if(/스파|온천|웰니스|치유|족욕|명상|요가/.test(t)) return 'wellness';
  if(/체험|공예|박물관|전시|축제|만들기/.test(t)) return 'experience';
  if(/스포츠|클라이밍|집라인|래프팅|패러|코스터|레저|자전거|트레킹|걷기/.test(t)) return 'activity';
  if(/숲|정원|산책|공원|바다|해변|계곡|수목원|생태/.test(t)) return 'nature';
  if(/등대|전망|타워|스카이|정상/.test(t)) return 'view';
  if((sp.tags||[]).includes('prayer')||/사찰|절|암자|부처|보살/.test(t)) return 'prayer';
  return 'other';
}
function contextualGuide(category,wish){
  const sc=schoolScenario(wish);
  if(sc==='election') return '반장/회장 선거 소원: 기도 장소보다 용기, 자신감, 리더십, 도전, 사람들 앞에 서는 힘을 느낄 수 있는 장소를 우선. 등대는 사람처럼 응원한다고 쓰지 말고 등대의 빛을 리더십에 비유.';
  if(sc==='award') return '학생 수상/대회 소원: 먼저 대회 종류를 읽는다. 논술·글쓰기라면 문학·책·작가·도서관·박물관·전시처럼 생각·관찰·표현의 재료를 얻는 장소를 우선하고, 한 곳 정도는 노력 후 신나게 긴장을 풀고 스스로를 축하할 장소도 가능하다. 단순 풍경·놀이공원·스파를 목표 선명/힘/새로운 자극 같은 말로 논술과 연결하지 않는다. 사찰·기도처는 제외한다.';
  if(sc==='exam') return '학생 시험 소원: 기도 명소만 반복하지 말고 집중, 배움, 리프레시, 성취감이 연결되는 장소를 섞을 것.';
  if(familyHarmonyScenario(wish)) return '가족 화목 소원: 사찰이나 기도처보다 가족이 실제로 함께 걷고, 이야기하고, 웃고, 체험하고, 한 상에 둘러앉을 수 있는 장소를 우선. 장소에서 가족이 함께 할 행동이 바로 떠올라야 한다. 사찰은 사용자가 직접 기도를 원한 경우가 아니면 제외. 세 곳은 산책/체험/먹거리 등 서로 다른 결로 구성.';
  if(blindDateScenario(wish)) return '소개팅/첫 만남 소원: 어색함을 풀 대화, 함께 걷기, 야경, 가벼운 체험, 카페·거리처럼 두 사람이 실제로 시간을 보내기 좋은 장소를 우선. 역사기념형·기도처는 제외. catch에는 첫 만남/대화/어색함/설렘 중 하나와 장소의 실제 특징이 함께 드러나야 한다.';
  if(childHealthScenario(wish)) return '아이 건강·성장 소원: 일반 사찰/기도처는 제외. 아이가 직접 잘 먹고, 신나게 움직이고, 자연을 경험하고, 가족과 즐길 수 있는 건강식·농장·생태·숲·가벼운 활동·체험을 우선. 같은 경험 유형을 2곳 이상 고르지 말 것.';
  if(employmentTargetScenario(wish,category)){const c=targetCompany(wish);return `${c} 입사/취업 목표: 기업과 직접 연결되는 실제 명소가 있으면 우선하되, 단순히 기업명이나 지역이 같다는 이유만으로 고르지 않는다. 그 장소의 기술·창업·도전·혁신·커리어 경험을 '${c}에 가고 싶다'는 목표와 연결한다. letter에는 반드시 ${c}라는 목표를 정확히 언급하고, catch는 관광지 설명이 아니라 입사 목표를 응원하는 이유가 보여야 한다.`;}
  if(stockScenario(wish)) return '주식/투자 상승 소원: 높은 전망, 위로 오르는 경험, 금·광산·보석·상승 이미지를 재치 있게 활용. 장소 소개로 끝내지 말고 우상향·상승과 바로 연결. 단순 기도 장소 반복 금지.';
  if(savingsScenario(wish)) return '목돈/저축 소원: 계단·오르막은 한 걸음씩 차곡차곡 모으는 과정, 정상은 목표 고지, 금·광산은 재물처럼 장소의 실제 특징을 돈을 모으는 과정과 재치 있게 연결. 풍경 소개만 하고 끝내지 말 것.';
  if(parentChildMarriageScenario(wish)) return '부모가 자녀의 결혼을 바라는 소원: 현재 연인이 없다고 기본 해석. 커플 데이트 장소보다 축제·클래스·체험·취미·문화공간처럼 새로운 사람과 자연스럽게 섞일 수 있는 장소를 우선.';
  if(isRomanceWish(wish,category)) return '연애/인연 소원: 역사 인물 기념형 명소는 제외. 현재의 설렘, 데이트, 대화, 산책, 야경, 체험이 살아 있는 장소를 우선.';
  if(/할아버지|할머니|부모님|엄마|아빠/.test(wish) && /건강|기력|회복|피로|아프/.test(wish)) return '가족 건강 소원: 온천·스파·웰니스는 대신 빌어주는 곳이 아니라 당사자를 모시고 가서 직접 쉬고 몸을 풀 수 있는 경험으로 표현.';
  return '장소의 실제 경험을 살리면서 사용자가 바로 납득할 수 있는 연결을 우선.';
}
function queryExpansion(category,wish){
  const extras=[];
  const sc=schoolScenario(wish);
  if(sc==='election') extras.push('용기 자신감 리더십 도전 발표 체험 모험 사람들 앞에 서기 활기');
  if(sc==='award') extras.push(/논술|글쓰기|작문|백일장/.test(wish)
    ? '문학 문학관 작가 책 도서관 서점 한글 기록 박물관 미술관 전시 관찰 표현 글쓰기 창작 생각 시선 성취 축하'
    : '성취 축하 보상 즐거운 체험 스트레스 해소 몰입 창작 배움');
  if(sc==='exam') extras.push('집중 배움 책 서원 도서관 리프레시 산책 성취 목표');
  if(familyHarmonyScenario(wish)) extras.push('가족 화목 함께 걷기 산책 대화 체험 추억 가족 식사 정원 공원 여행 웃음');
  if(blindDateScenario(wish)) extras.push('소개팅 첫 만남 대화 어색함 설렘 산책 야경 카페 거리 드라이브 가벼운 체험');
  if(childHealthScenario(wish)) extras.push('아이 건강 성장 튼튼 건강식 로컬푸드 농장 과일 채소 숲 생태 수목원 산책 가족 체험 가벼운 활동 놀이 웰니스');
  if(/근육|근력|몸짱|체력|잔병|건강|튼튼|운동|살빼|다이어트/.test(wish) && !childHealthScenario(wish)) extras.push('근력 체력 운동 수련 트레킹 걷기 스포츠 요가 선무도 액티비티 건강관리 웰니스 회복 치유 컨디션');
  if(employmentTargetScenario(wish,category)){const c=targetCompany(wish);extras.push(`${c} 입사 취업 채용 커리어 기술 혁신 창업 도전 미래 산업 기업 역사 연구 개발`);}
  if(stockScenario(wish)) extras.push('우상향 상승 높은 전망대 타워 스카이워크 정상 오름 금광 금 보석 광산 동굴 재물');
  if(lotteryScenario(wish)) extras.push('로또 복권 대박 행운 금 황금 보물 광산 숫자 한방 터짐 정상 높은 곳');
  if(savingsScenario(wish)) extras.push('목돈 저축 차곡차곡 계단 오르막 정상 목표 고지 금 광산 재물 꾸준함 장거리 트레킹 성취');
  if(parentChildMarriageScenario(wish)) extras.push('새 인연 사람 만남 축제 클래스 공방 체험 취미 문화공간 액티비티 커뮤니티');
  if(isRomanceWish(wish,category)) extras.push('데이트 설렘 야경 산책 대화 체험 로맨틱 바다 카페');
  return extras.join(' ');
}
function contextScoreAdjust(sp,wish,category){
  const t=spotText(sp);
  let delta=0;
  const prayer=(sp.tags||[]).includes('prayer') || experienceBucket(sp)==='prayer';
  const sc=schoolScenario(wish);

  if(isRomanceWish(wish,category)){
    if(isHistoricalMemorial(sp)) delta-=0.45;
    if(prayer && !explicitPrayer(wish)) delta-=0.25;
    if(/데이트|고백|야경|산책|바다|카페|거리|드라이브|정원|설렘/.test(t)) delta+=0.12;
  }

  if(sc==='election'){
    if(prayer && !explicitPrayer(wish)) delta-=0.45;
    if(/체험|모험|도전|스포츠|클라이밍|집라인|활기|공원|발표|무대/.test(t)) delta+=0.12;
    if(/등대|전망|타워/.test(t)) delta+=0.04;
  } else if(sc==='award'){
    if(prayer && !explicitPrayer(wish)) delta-=0.55;
    if(/논술|글쓰기|작문|백일장/.test(wish)){
      if(/문학|작가|책|도서|서점|한글|기록|문장|출판|활판|인쇄/.test(t)) delta+=0.42;
      if(/박물관|미술관|전시|역사관|과학관/.test(t)) delta+=0.24;
      if(/공방|창작|만들기|작업실/.test(t)) delta+=0.18;
      if(/스파|온천|사찰|절\b|놀이공원|테마파크/.test(t)) delta-=0.30;
    }else{
      if(/창작|공예|체험|박물관|전시|축제|성취/.test(t)) delta+=0.10;
    }
  } else if(sc==='exam'){
    if(prayer && !explicitPrayer(wish)) delta-=0.18;
    if(/도서관|책|서원|학문|배움|산책|숲|집중/.test(t)) delta+=0.10;
  }

  if(familyHarmonyScenario(wish)){
    const b=experienceBucket(sp);
    if(b==='prayer'&&!explicitPrayer(wish)) delta-=0.75;
    if(b==='nature') delta+=0.20;
    if(b==='experience') delta+=0.16;
    if(b==='activity') delta+=0.10;
    if(b==='food') delta+=0.09;
    if(/가족|함께|산책|정원|공원|체험|피크닉|소풍|놀이|대화/.test(t)) delta+=0.10;
  }
  if(blindDateScenario(wish)){
    const b=experienceBucket(sp);
    if(b==='prayer') delta-=0.70;
    if(isHistoricalMemorial(sp)) delta-=0.55;
    if(/야경|산책|카페|거리|드라이브|바다|공원|정원|체험/.test(t)) delta+=0.18;
    if(b==='nature'||b==='experience'||b==='view') delta+=0.06;
  }
  if(childHealthScenario(wish)){
    const b=experienceBucket(sp);
    if(b==='prayer') delta-=0.75;
    if(b==='food') delta+=healthyFoodLike(sp)?0.25:-0.35;
    if(b==='nature') delta+=0.20;
    if(b==='activity') delta+=0.15;
    if(b==='experience') delta+=0.11;
    if(b==='wellness') delta+=0.06;
  }
  if(/근육|근력|몸짱|체력|잔병|건강|튼튼|운동|살빼|다이어트/.test(wish) && !childHealthScenario(wish)){
    const b=experienceBucket(sp);
    if(b==='prayer'&&!explicitPrayer(wish)) delta-=0.35;
    if(b==='activity') delta+=0.30;
    if(b==='wellness') delta+=0.20;
    if(/선무도|요가|수련|트레킹|걷기|스포츠|클라이밍|자전거|운동|체력|근력/.test(t)) delta+=0.22;
    if(/치유|회복|건강관리|웰니스/.test(t)) delta+=0.12;
  }
  if(stockScenario(wish)){
    if(prayer && !explicitPrayer(wish)) delta-=0.18;
    if(/전망대|타워|스카이|정상|오름|높은|금광|광산|금|보석|동굴/.test(t)) delta+=0.16;
  }
  if(lotteryScenario(wish)){
    if(prayer && !explicitPrayer(wish)) delta-=0.12;
    if(/금광|광산|황금|금\b|보석|폭포|분수|정상|전망대|타워/.test(t)) delta+=0.14;
  }
  if(savingsScenario(wish)){
    if(prayer && !explicitPrayer(wish)) delta-=0.18;
    if(/계단|오르막|정상|전망|타워|스카이|금광|광산|금|보석|트레킹|종주/.test(t)) delta+=0.16;
  }
  if(parentChildMarriageScenario(wish)){
    if(isHistoricalMemorial(sp)) delta-=0.35;
    if(/축제|클래스|공방|체험|문화|마켓|시장|스포츠|액티비티|커뮤니티/.test(t)) delta+=0.14;
    if(/커플|연인과|데이트코스|프로포즈/.test(t)) delta-=0.16;
  }
  return delta;
}
function hardAvoidTags(wish){
  const w=wish.replace(/\s+/g,'');const avoid=new Set();
  if(/임신|임산부|출산|순산|태아|아기.*태어나|아이.*태어나/.test(w)){avoid.add('high_intensity');avoid.add('alcohol')}
  if(/수술|회복|완쾌|치료|재활|몸이아프|아픈/.test(w)){avoid.add('high_intensity');avoid.add('alcohol')}
  if(/금주|술끊|술을끊/.test(w)) avoid.add('alcohol');
  if(/아이|아들|딸|학생|초등|중등|고등/.test(w)&&!/성인|대학생/.test(w)) avoid.add('alcohol');
  return avoid;
}
function lexicalScore(sp,wish,category){
  const t=norm(spotText(sp));
  const raw=`${category} ${wish} ${queryExpansion(category,wish)}`;
  const toks=String(raw).toLowerCase().match(/[가-힣a-z0-9]{2,}/g)||[];
  let score=0;
  for(const tok of new Set(toks)){ if(t.includes(norm(tok))) score+=0.018; }
  return score;
}
function allowedForScenario(sp,wish,category,strict=true){
  const avoid=hardAvoidTags(wish);
  if((sp.tags||[]).some(t=>avoid.has(t))) return false;
  const sc=schoolScenario(wish), b=experienceBucket(sp), t=spotText(sp);
  if(isRomanceWish(wish,category)&&isHistoricalMemorial(sp)) return false;
  if((sc==='election'||sc==='award')&&b==='prayer'&&!explicitPrayer(wish)) return false;
  if(sc==='award' && /논술|글쓰기|작문|백일장/.test(wish) && strict){
    const core=/문학|작가|책|도서|서점|기록|한글|문장|출판|활판|인쇄|박물관|미술관|전시|과학관|창작|공방|만들기/.test(t);
    const clearlyOff=/스파|온천|사찰|절\b|암자|테마파크|놀이공원/.test(t);
    if(clearlyOff || !core) return false;
  }
  if(familyHarmonyScenario(wish)){
    if(b==='prayer'&&!explicitPrayer(wish)) return false;
    if(strict && !['nature','experience','activity','food','wellness','view'].includes(b)) return false;
  }
  if(blindDateScenario(wish)){
    if(b==='prayer'||isHistoricalMemorial(sp)) return false;
    if(strict && !['nature','experience','view','food','activity'].includes(b)) return false;
  }
  if(childHealthScenario(wish)){
    if(b==='prayer') return false;
    if(b==='food'&&!healthyFoodLike(sp)) return false;
    if(strict && !['food','nature','activity','experience','wellness'].includes(b)) return false;
  }
  if(parentChildMarriageScenario(wish)&&/커플|프로포즈|연인과/.test(t)) return false;
  return true;
}
function retrieve(q,wish,category){
  const avoid=hardAvoidTags(wish);const scored=[];
  const sc=schoolScenario(wish);
  for(let i=0;i<spots.length;i++){
    const sp=spots[i];
    if(sp.tags.some(t=>avoid.has(t)))continue;
    if(isRomanceWish(wish,category) && isHistoricalMemorial(sp)) continue;
    if((sc==='election'||sc==='award') && sp.tags.includes('prayer') && !explicitPrayer(wish)) continue;
    if(childHealthScenario(wish) && experienceBucket(sp)==='prayer') continue;
    if(childHealthScenario(wish) && experienceBucket(sp)==='food' && !healthyFoodLike(sp)) continue;
    let score=(q?dotAt(q,i):0)+lexicalScore(sp,wish,category);
    score+=contextScoreAdjust(sp,wish,category);
    const n=counts[sp.name]||0;
    score-=Math.min(n,10)*0.012;
    scored.push({i,score});
  }
  scored.sort((a,b)=>b.score-a.score);
  const top=scored.slice(0,42).map(x=>({...spots[x.i],similarity:x.score,recent_count:counts[spots[x.i].name]||0}));

  const supplement=[];
  if(explicitPrayer(wish)){
    for(const sp of spots){
      if(top.some(x=>x.name===sp.name)||sp.tags.some(t=>avoid.has(t)))continue;
      if(sp.tags.includes('prayer') && (counts[sp.name]||0)<3){
        supplement.push({...sp,similarity:null,recent_count:counts[sp.name]||0});
      }
      if(supplement.length>=4)break;
    }
  }
  return [...top,...supplement];
}
async function shortlistCandidates(category,wish,cands){
  const pool=cands.filter(c=>allowedForScenario(c,wish,category,true)).slice(0,24);
  if(pool.length<3) return cands.slice(0,Math.min(12,cands.length));
  const compact=pool.map(c=>({
    명소명:c.name,지역:c.region,
    특징:(c.descriptions||[]).slice(0,2).map(x=>String(x).slice(0,170)),
    선정주제:(c.sheets||[]).slice(0,2),태그:c.tags
  }));
  const prompt=`사용자 소원: ${wish}\n카테고리: ${category}\n\n아래 후보들을 먼저 '장소 자체의 적합성'만 평가해라. 카피를 예쁘게 쓰는 단계가 아니다.\n판단 기준:\n1) 장소 설명을 꾸미지 않아도 이 소원과 연결 이유가 납득되는가\n2) 사용자가 실제 그곳에서 할 수 있는 경험이 소원과 이어지는가\n3) 억지 비유나 단순 기도 장소로 도망가지 않는가\n4) 서로 다른 경험 결을 만들 수 있는가\n\n부적합 예: 아이 건강에 일반 빵집/디저트, 가족 화목에 이유 없는 사찰, 연애에 역사 기념지.\n적합 예: 가족 화목에 함께 걷고 대화할 정원/산책/체험, 아이 건강에 자연·농장·건강식·가벼운 활동.\n\n가장 설득력 있는 후보 6개를 순서대로 고르고 각 후보에 reason을 1문장으로 쓴다. 반드시 아래 후보 이름만 사용한다.\n후보:${JSON.stringify(compact)}`;
  try{
    const r=await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':KEY},
      body:JSON.stringify({
        system_instruction:{parts:[{text:'너는 여행 추천 품질 심사관이다. 그럴듯한 문장보다 장소 자체의 적합성을 엄격하게 본다.'}]},
        contents:[{role:'user',parts:[{text:prompt}]}],
        generationConfig:{maxOutputTokens:360,temperature:.12,thinkingConfig:{thinkingBudget:64},responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{shortlist:{type:'ARRAY',minItems:3,maxItems:6,items:{type:'OBJECT',properties:{'명소명':{type:'STRING'},reason:{type:'STRING'}},required:['명소명','reason']}}},required:['shortlist']}}
      })
    },4800);
    if(!r.ok) return pool.slice(0,12);
    const d=await r.json();
    const t=d.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'{}';
    const obj=extractJson(t);
    const byName=new Map(pool.map(c=>[c.name,c]));
    const out=[];
    for(const x of obj.shortlist||[]){const c=byName.get(x['명소명']);if(c&&!out.some(y=>y.name===c.name))out.push(c);}
    return out.length>=3?out:pool.slice(0,12);
  }catch(e){console.warn('후보 품질 심사 생략:',e.message);return pool.slice(0,12);}
}

async function rewriteFinal(category,wish,selected,letter){
  const compact=selected.map(c=>({명소명:c.name,지역:c.region,특징:(c.descriptions||[]).slice(0,2),선정주제:(c.sheets||[]).slice(0,2)}));
  const prompt=`사용자 소원: ${wish}\n카테고리: ${category}\n선택된 명소: ${JSON.stringify(compact)}\n기존 달의 답장(참고만): ${letter||''}\n\n이 3곳은 바꾸지 말고 최종 사용자 문구만 다시 써라.\n각 catch는 반드시 ① 그 명소의 구체적 특징/행동 ② 이 소원의 구체적 상황/바람 ③ 둘의 자연스러운 연결이 모두 보여야 한다.\n관광지 설명만 쓰고 응원 문장을 뒤에 붙이지 마라. 딱딱한 효능 설명 대신 장소의 실제 특징을 재료로 공감·위트·비유·상상·행동을 섞은 짧은 추천 카피로 써라. 다른 명소에도 붙일 수 있는 범용문장은 금지한다. 18~36자 정도의 힘있는 완결문장으로 쓰되 필요하면 조금 길어도 된다.\nletter는 사용자의 소원에 직접 반응하는 2~3문장이다.\n정확히 3개만 반환한다.`;
  try{
    const r=await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':KEY},
      body:JSON.stringify({system_instruction:{parts:[{text:SYSTEM}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:390,temperature:.18,thinkingConfig:{thinkingBudget:48},responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{letter:{type:'STRING'},picks:{type:'ARRAY',minItems:3,maxItems:3,items:{type:'OBJECT',properties:{'명소명':{type:'STRING'},place_feature:{type:'STRING'},wish_link:{type:'STRING'},catch:{type:'STRING'}},required:['명소명','place_feature','wish_link','catch']}}},required:['letter','picks']}}})
    },4200);
    if(!r.ok)return null;
    const d=await r.json(); const t=d.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'{}';
    const obj=extractJson(t); obj._usage=d.usageMetadata||{}; return obj;
  }catch(e){console.warn('최종 문구 재작성 생략:',e.message);return null;}
}

async function generate(category,wish,cands,attempt=0,timeoutMs=8500){
  const compact=cands.map((c,i)=>({
    id:i,
    명소명:c.name,
    지역:c.region,
    선정주제:(c.sheets||[]).slice(0,3),
    특징:(c.descriptions||[]).slice(0,3).map(x=>String(x).slice(0,180)),
    태그:c.tags
  }));
  const user=`카테고리: ${category}\n사용자 소원: ${wish}\n\n후보 명소(JSON):\n${JSON.stringify(compact)}\n\n한 번의 판단으로 최종 결과를 만들어라.\n\n[판단 순서]\n1) 소원에서 실제로 바라는 변화와 상황을 짧게 이해한다.\n2) 후보마다 '이 장소에서 실제로 무엇을 보고/하고/느끼는지'를 후보 설명에서만 확인한다.\n3) 그 실제 특징이 소원과 연결되는 방식을 판단한다.\n   - A 직접 연결형: 장소의 실제 경험이 소원에 현실적으로 도움이나 긍정적 변화를 줄 수 있음.\n   - B 크리에이티브 연결형: 재물·주식·로또처럼 직접 해결이 어려운 소원에서, 장소의 실제 특징을 이용한 재치 있는 비유가 자연스럽게 성립함.\n   - C 억지 연결형: 좋은 기운, 새로운 자극, 자신감, 마음의 변화 같은 만능말이 있어야만 연결됨. C는 고르지 않는다.\n4) A를 우선하고, A가 자연스럽지 않은 소원에는 좋은 B를 쓴다. 서로 다른 이유의 정확히 3곳을 고른다.\n5) 세 곳을 한 세트로 보고 카피를 쓴다. 각 catch는 장소마다 다른 특징·다른 논리·다른 문장 구조를 사용한다. 같은 구절이나 같은 어미를 반복하지 않는다.\n\n[catch 톤]\n- 관광 안내문이나 교과서식 효능 설명이 아니다.\n- 읽는 사람이 '아 그래서 여길 추천했구나', '그 연결은 재밌는데?'라고 느끼는 짧은 추천 카피다.\n- 장소의 실제 특징이 살아 있어야 하고, 소원과의 연결 이유가 자연스럽게 느껴져야 한다.\n- 공감, 위트, 비유, 행동 제안, 상상을 자유롭게 섞어도 된다.\n- 소원 원문을 따옴표로 복사하지 않는다.\n- 다른 장소 이름으로 바꿔도 그대로 성립하는 범용 문장은 쓰지 않는다.\n- 보통 22~48자 정도. 필요하면 두 줄 분량까지 괜찮지만 장황하지 않게 완결한다.\n\n[letter]\n- 2~3개의 짧은 문장. 실제 소원의 마음과 목표에 직접 반응한다.\n- 형식적인 '소원을 잘 읽었어' 같은 문구보다 사람이 듣고 공감받는 느낌으로 쓴다.\n\n중요: pick의 id는 반드시 후보 JSON의 id를 그대로 사용하고 서로 다른 id 3개를 골라라.`;
  const diagStarted=Date.now();
  try{
    console.log(`[Gemini 진단] 생성 시작 | 내부 attempt ${attempt+1}/2 | timeout ${timeoutMs}ms`);
    const r=await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':KEY},
      body:JSON.stringify({
        system_instruction:{parts:[{text:SYSTEM}]},
        contents:[{role:'user',parts:[{text:user}]}],
        generationConfig:{
          maxOutputTokens:520,
          temperature:.42,
          thinkingConfig:{thinkingBudget:192},
          responseMimeType:'application/json',
          responseSchema:{type:'OBJECT',properties:{
            letter:{type:'STRING'},
            picks:{type:'ARRAY',minItems:3,maxItems:3,items:{type:'OBJECT',properties:{
              id:{type:'INTEGER'},
              catch:{type:'STRING'}
            },required:['id','catch']}}
          },required:['letter','picks']}
        }
      })
    },timeoutMs);
    const responseText=await r.text();
    let d={};
    try{d=JSON.parse(responseText||'{}')}catch(httpJsonError){
      console.warn(`[Gemini 진단] HTTP body JSON 파싱 실패 | ${Date.now()-diagStarted}ms | HTTP ${r.status} | body ${responseText.length}자 | ${httpJsonError.message}`);
    }
    const candidate=d.candidates?.[0];
    const finishReason=candidate?.finishReason||'없음';
    const usage=d.usageMetadata||{};
    console.log(`[Gemini 진단] 응답 수신 | ${Date.now()-diagStarted}ms | HTTP ${r.status} | finishReason ${finishReason} | prompt ${usage.promptTokenCount??'?'} | output ${usage.candidatesTokenCount??'?'} | total ${usage.totalTokenCount??'?'}`);
    if(!r.ok){
      if((r.status===429||r.status>=500)&&attempt<1){console.warn(`[Gemini 진단] 내부 재시도 | attempt ${attempt+1}/2 실패 | 원인 HTTP_${r.status} | ${Date.now()-diagStarted}ms`);await sleep(220);return generate(category,wish,cands,attempt+1,timeoutMs)}
      throw new Error(d.error?.message||'Gemini 응답 지연');
    }
    const t=d.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');
    console.log(`[Gemini 진단] 모델 출력 | ${String(t||'').length}자 | 끝부분: ${JSON.stringify(String(t||'').slice(-100))}`);
    try{
      const result=extractJson(t||'{}');
      console.log(`[Gemini 진단] JSON 파싱 성공 | 내부 attempt ${attempt+1}/2`);
      result._usage=d.usageMetadata||{};
      return result;
    }catch(parseError){
      console.warn(`[Gemini 진단] JSON 파싱 실패 | 내부 attempt ${attempt+1}/2 | finishReason ${finishReason} | ${parseError.message}`);
      // Gemini가 드물게 JSON을 중간에서 끊어 보내는 경우에만 같은 조건으로 1회 재요청한다.
      // 정상 응답에는 추가 호출이 없고, 추천 프롬프트/후보/선정 로직은 그대로 유지한다.
      if(attempt<1 && /Unexpected end|unterminated|JSON/i.test(String(parseError.message))){
        console.warn(`[Gemini 진단] 내부 재시도 | attempt ${attempt+1}/2 실패 | 원인 JSON_PARSE | finishReason ${finishReason} | ${Date.now()-diagStarted}ms | ${parseError.message}`);
        await sleep(120);
        return generate(category,wish,cands,attempt+1,timeoutMs);
      }
      throw parseError;
    }
  }catch(e){
    if(attempt<1 && /fetch|network|socket|timeout|abort/i.test(String(e.message))){const elapsed=Date.now()-diagStarted;const reason=(e?.name==='AbortError'||/abort|timeout/i.test(String(e.message)))?'TIMEOUT_OR_ABORT':'NETWORK';console.warn(`[Gemini 진단] 내부 재시도 | attempt ${attempt+1}/2 실패 | 원인 ${reason} | ${elapsed}ms | ${e.name||'Error'}: ${e.message}`);await sleep(220);return generate(category,wish,cands,attempt+1,timeoutMs)}
    throw e;
  }
}
function cleanKoText(s,maxLen=999){
  let x=String(s||'').replace(/[\u3400-\u4DBF\u4E00-\u9FFF]/g,'').replace(/\s+/g,' ').trim();
  if(x.length>maxLen){
    let y=x.slice(0,maxLen);
    const cut=y.lastIndexOf(' ');
    if(cut>Math.floor(maxLen*0.58)) y=y.slice(0,cut);
    x=y.replace(/[,.!?~…]+$/,'').trim();
  }
  return x;
}
function genericLetter(s){
  const x=String(s||'');
  return !x.trim() || /소원을 잘 읽어봤어|네 마음과 닿는 장면|달이 고른 세 곳|색다른 한 장면|소원을 향한|새로운 기분을 채워|에너지 가득한 곳|좋은 기운 가득/.test(x);
}
function genericCatch(s){
  const x=String(s||'');
  return !x.trim() || /소원과 닿는|색다른 한 장면|이곳만의 경험|매력을 직접 느끼|네 소원에 어울리는|한 걸음을 내디뎌|새로운 경험|새로운 자극|좋은 기운|목표를 더 선명|예상 못 한 힌트|생각보다 큰 자신감|마음을 조금 다른 쪽으로|직접 보고 해보는 경험|직접 부딪쳐보는 경험|에서만 만날 수 있는 장면/.test(x);
}
function copiesWishVerbatim(text,wish){
  const x=norm(text), w=norm(wish);
  if(!x||!w) return false;
  if(x.includes(w)) return true;
  const chunks=String(wish||'').replace(/["“”'‘’?!.,]/g,' ').split(/\s+/).filter(s=>s.length>=4);
  return chunks.length>=2 && chunks.filter(c=>x.includes(norm(c))).length>=Math.min(2,chunks.length);
}
function rationaleLooksReal(p,c,wish,category){
  const pf=String(p.place_feature||'').trim(), wl=String(p.wish_link||'').trim(), ct=String(p.catch||'').trim();
  if(!pf||!wl||!ct) return false;
  if(genericCatch(ct)) return false;
  if(copiesWishVerbatim(ct,wish)||copiesWishVerbatim(wl,wish)) return false;
  if(/[“”"]/.test(ct) && String(wish||'').split(/\s+/).some(x=>x.length>=4&&ct.includes(x))) return false;
  return true;
}
function validate(result,cands,wish,category){
  const byName=new Map(cands.map(c=>[c.name,c]));
  const avoid=hardAvoidTags(wish);
  const picks=[];
  const sc=schoolScenario(wish);
  let prayerCount=0;
  const selectedBuckets=new Set();
  for(const p of (result.picks||[]).slice(0,3)){
    const c=byName.get(p['명소명']);
    if(!c)continue;
    if(c.tags.some(t=>avoid.has(t)))continue;
    if(isRomanceWish(wish,category)&&isHistoricalMemorial(c))continue;
    if((sc==='election'||sc==='award')&&c.tags.includes('prayer')&&!explicitPrayer(wish))continue;
    if(familyHarmonyScenario(wish)&&experienceBucket(c)==='prayer'&&!explicitPrayer(wish))continue;
    if(blindDateScenario(wish)&&(experienceBucket(c)==='prayer'||isHistoricalMemorial(c)))continue;
    if(childHealthScenario(wish)&&experienceBucket(c)==='prayer')continue;
    if(childHealthScenario(wish)&&experienceBucket(c)==='food'&&!healthyFoodLike(c))continue;
    if(childHealthScenario(wish)&&selectedBuckets.has(experienceBucket(c))&&experienceBucket(c)!=='other')continue;
    if(c.tags.includes('prayer')&&!explicitPrayer(wish)){
      if(prayerCount>=1)continue;
      prayerCount++;
    }
    if(!picks.some(x=>x['명소명']===c.name)){
      const ct=repairKorean(cleanKoText(p.catch,999));
      if(hasBadKorean(ct) || ct.length>64) continue;
      if(!rationaleLooksReal(p,c,wish,category)) continue;
      picks.push({'명소명':c.name,'지역':c.region,'catch':ct});
      selectedBuckets.add(experienceBucket(c));
    }
  }
  return picks.slice(0,3);
}
function featureHint(sp){
  const t=spotText(sp);
  if(/계단/.test(t)) return '계단';
  if(/금광|광산|황금|금\b|보석/.test(t)) return '금빛';
  if(/전망대|타워|스카이|정상|봉우리|오름/.test(t)) return '높은 곳';
  if(/케이블카|스카이캡슐|해변열차|모노레일|레일바이크/.test(t)) return 'experience';
  if(/바다|해변|해양공원|해안/.test(t)) return '바다';
  if(/야경|드라이브/.test(t)) return '야경';
  if(/연꽃|세미원|숲|수목원|자연휴양림|정원|생태/.test(t)) return '자연';
  if(/농장|목장|동물/.test(t)) return '농장';
  if(/자전거|트레킹|걷기|레저|클라이밍|래프팅|패러|코스터/.test(t)) return '활동';
  if(/기술|과학|로봇|AI|혁신|스마트/.test(t)) return '기술';
  if(/창업지|창업|제일모직/.test(t)) return '시작';
  if(/축제|마켓|시장|거리|공방|클래스|체험/.test(t)) return '만남';
  if(/두부|약초|산나물|로컬푸드|유기농|친환경|건강식/.test(t)) return '건강식';
  return experienceBucket(sp);
}
function smartCatch(sp,wish,category){
  const name=sp.name, t=spotText(sp), f=featureHint(sp), company=targetCompany(wish), sc=schoolScenario(wish);
  if(/근육|근력|몸짱|체력|잔병|튼튼|운동|다이어트|살빼/.test(wish) && !childHealthScenario(wish)){
    if(/선무도|수련|요가|클라이밍|스포츠|트레킹|자전거|걷기|운동/.test(t)) return '몸을 제대로 써보는 시간부터. 근육도 체력도 한 단계 단단하게!';
    if(/치유|회복|웰니스|해양치유|스파|온천/.test(t)) return '단련만큼 회복도 중요하니까, 지친 몸의 컨디션까지 제대로 챙겨가자.';
    if(/건강|한방|동의보감|약초|체질/.test(t)) return '튼튼한 몸도 내 몸을 아는 것부터. 건강관리 감각부터 제대로 챙겨보자.';
    if(f==='자연'||f==='활동') return '걷고 움직이는 시간을 늘리다 보면, 체력부터 먼저 달라지는 게 느껴질 거야.';
  }
  if(familyHarmonyScenario(wish)){
    if(f==='자연') return '나란히 걷다 보면 평소 못 한 이야기도 슬쩍 나오지 않을까?';
    if(f==='바다') return '바닷바람 맞으며 같이 걷다 보면 서운함도 조금은 가벼워질 거야.';
    if(f==='활동'||f==='experience'||f==='만남') return '같이 웃을 일이 하나 더 생기면, 가족 사이도 자연스레 가까워질 거야!';
    if(f==='food'||f==='건강식') return '한 상에 둘러앉아 맛있는 얘기부터 나누면 분위기도 한결 부드러워질걸!';
    if(f==='야경'||f==='높은 곳') return '탁 트인 풍경을 같이 보다 보면 묵은 서운함도 잠깐 내려놓게 될 거야.';
  }
  if(blindDateScenario(wish)){
    if(f==='바다') return '바다 따라 천천히 걷다 보면 어색한 첫 대화도 자연스럽게 풀릴 거야.';
    if(f==='야경'||f==='높은 곳') return '반짝이는 풍경 하나면 첫 만남의 긴장도 설렘 쪽으로 기울지 않을까?';
    if(f==='자연') return '정원을 나란히 걷다 보면 눈 마주칠 핑계도, 대화할 거리도 많아질 거야.';
    if(f==='만남'||f==='experience'||f==='활동') return '같이 뭔가 해보는 동안 어색함은 줄고, 자연스럽게 웃을 타이밍은 많아질 거야!';
    if(f==='food') return '뭘 먹을지 같이 고르는 순간부터 대화는 이미 시작된 셈이지!';
  }
  if(employmentTargetScenario(wish,category)){
    if(company && name.includes(company) && f==='시작') return `${company}의 첫 도전이 시작된 곳에서, 네 커리어의 첫 장면도 그려보자!`;
    if(company && name.includes(company) && f==='기술') return `${company}의 기술을 가까이 보며, 그 안에서 일할 네 모습도 미리 상상해보자!`;
    if(f==='기술') return `미래 기술 한가운데서, ${company||'꿈의 회사'}로 갈 준비를 한 칸 더 채워보자!`;
  }
  if(childHealthScenario(wish)){
    if(f==='건강식') return '건강한 한 끼를 맛있게 먹는 습관부터, 튼튼한 성장의 시작!';
    if(f==='농장') return '초원과 동물 사이를 신나게 누비며 씩씩한 하루를 만들어보자!';
    if(f==='자연') return '숲길을 마음껏 걷고 뛰며, 튼튼하게 자랄 하루를 하나 더 쌓아보자!';
    if(f==='활동') return '신나게 몸을 움직인 만큼 건강한 에너지도 제대로 채워질 거야!';
  }
  if(sc==='award' && /논술|글쓰기|작문|백일장/.test(wish)){
    if(/문학|작가|책|도서|서점|한글|기록|문장|출판|활판|인쇄/.test(t)) return '좋은 문장을 잔뜩 보고 나면, 내 글에도 번뜩이는 한 줄이 생길지 몰라!';
    if(/박물관|미술관|전시|과학관/.test(t)) return '눈여겨본 장면 하나가 글을 살릴 새로운 시선이 되어줄지도!';
    if(/공방|창작|만들기/.test(t)) return '직접 보고 만든 경험은, 글에 넣을 생생한 재료가 되어줄 거야!';
  }
  if(savingsScenario(wish)){
    if(f==='계단') return '한 계단씩 오르듯 목표 금액도 차곡차곡, 결국 정상까지!';
    if(f==='높은 곳') return '여기까지 올라온 기세라면, 통장 숫자도 목표 고지까지 가보자!';
    if(f==='금빛') return '금빛 이야기를 따라온 김에, 통장도 조금씩 묵직해져 보자!';
    if(f==='활동') return '긴 길도 한 걸음씩이듯, 목돈도 꾸준함이 결국 이긴다!';
  }
  if(stockScenario(wish)){
    if(f==='높은 곳') return '여기까지 쭉 올라왔으니, 이제 내 차트 차례다. 우상향 가보자!';
    if(f==='금빛') return '금빛이 번쩍이는 곳까지 왔는데, 계좌에도 반가운 상승 한번 와줘야지!';
    if(f==='계단') return '한 칸씩 오르는 계단처럼 차트도 급하지 않게 꾸준히 위로!';
  }
  if(lotteryScenario(wish)){
    if(f==='금빛') return '진짜 금 이야기가 있는 곳에서, 이번엔 내 행운도 번쩍 터져보자!';
    if(f==='높은 곳') return '꼭대기까지 오른 기세 그대로, 당첨 운도 한 번 크게 터져라!';
    if(/폭포|분수|물줄기/.test(t)) return '쏟아지는 물줄기처럼 이번 행운도 시원하게 한 번 터져보자!';
  }
  if(sc==='election'){
    if(/등대/.test(t)) return '멀리 비추는 등대처럼, 친구들이 믿고 따라올 반장이 되어보자!';
    if(f==='활동') return '직접 부딪쳐보는 경험 하나면 사람들 앞에 설 용기도 조금 더 커질 거야!';
    if(f==='높은 곳') return '시야를 넓혀보고 나면, 친구들 앞에서 말할 자신감도 조금 달라질걸!';
  }
  if(parentChildMarriageScenario(wish)){
    if(f==='만남') return '새로운 취향과 사람 사이에 섞이다 보면, 반가운 인연도 뜻밖에 찾아올지 몰라!';
  }
  if(/담배|금연|흡연|술끊|금주/.test(norm(wish))){
    if(f==='활동'||f==='자연') return '몸을 움직여 숨이 시원해지는 맛을 알면, 익숙한 습관도 조금씩 멀어질 거야!';
  }
  // 비상 복구용 일반 문장: 소원 원문을 복사하지 않고 장소 특징에서만 출발한다.
  if(f==='자연') return '천천히 걷다 보면 복잡했던 마음도 정리되고, 다음 한 걸음이 조금 가벼워질 거야.';
  if(f==='바다') return '탁 트인 바다 앞에서는 답답했던 마음도 조금은 시원하게 풀릴 거야.';
  if(f==='야경'||f==='높은 곳') return '높이 올라 시야를 바꿔보면, 막막했던 목표도 조금 다르게 보일지 몰라.';
  if(f==='활동') return '직접 부딪쳐보는 경험 하나가 생각보다 큰 자신감을 남겨줄 거야!';
  if(f==='만남'||f==='experience') return '직접 보고 해보는 경험 속에서 예상 못 한 힌트 하나를 건질지도 몰라!';
  return `${name}에서만 만날 수 있는 장면 하나가, 지금의 마음을 조금 다른 쪽으로 움직여줄지도 몰라.`;
}
function smartLetter(category,wish){
  const company=targetCompany(wish), sc=schoolScenario(wish);
  if(/근육|근력|몸짱|체력|잔병|튼튼|운동|다이어트|살빼/.test(wish) && !childHealthScenario(wish)) return `몸을 더 단단하게 만들고 잔병치레도 줄이고 싶은 마음이구나. 무작정 기운을 비는 곳보다 실제로 몸을 쓰고, 관리하고, 회복하는 데 연결되는 경험들로 골라봤어. 꾸준히 쌓인 체력이 오래 가는 건강으로 이어지길!`;
  if(familyHarmonyScenario(wish)) return `가족끼리 더 다정하고 편안하게 지내고 싶은 마음이구나. 함께 걷고 웃고 이야기할 시간이 쌓이면 서운했던 마음도 조금씩 풀릴 거야. 가족 모두에게 좋은 기억이 될 곳들로 골라봤어!`;
  if(blindDateScenario(wish)) return `소개팅이 잘되길 바라는 마음엔 설렘만큼 긴장도 섞여 있겠지. 억지로 분위기를 만들기보다 함께 걷고 보고 이야기하며 자연스럽게 가까워질 만한 곳들을 골라봤어. 첫 만남이 편안한 웃음으로 이어지길!`;
  if(employmentTargetScenario(wish,category)) return `${company}에 가고 싶다는 목표가 분명하구나. 막연히 바라기보다 그곳의 기술과 도전이 시작된 분위기를 가까이 느껴보면 준비할 힘도 더 선명해질 거야. 원하는 입사 소식까지 힘껏 응원할게!`;
  if(childHealthScenario(wish)) return `아이가 잘 먹고 잘 뛰놀며 건강하게 자라는 모습만큼 든든한 바람도 없지. 몸을 움직이고 자연을 느끼며 튼튼한 하루를 쌓을 수 있는 곳들로 골라봤어. 씩씩하게 크는 날들이 오래 이어지길 바라!`;
  if(savingsScenario(wish)) return `목표 금액이 클수록 한 번에 가기보다 꾸준히 쌓는 힘이 중요하잖아. 오르고, 걷고, 차곡차곡 쌓는 이미지가 있는 곳들로 골라봤어. 통장 숫자도 네 페이스대로 착실히 커지길!`;
  if(stockScenario(wish)) return `차트 볼 때마다 마음까지 오르락내리락했겠네. 이번엔 높은 곳과 상승의 이미지를 빌려, 네 계좌가 오래 우상향하길 응원해볼게!`;
  if(lotteryScenario(wish)) return `한 번쯤은 정말 시원한 행운이 터졌으면 하는 마음이지. 금빛, 높은 곳, 뜻밖의 재미처럼 대박을 재치 있게 떠올릴 수 있는 곳들로 골라봤어. 이번엔 운도 네 편이길!`;
  if(sc==='election') return `반장이 되고 싶다는 건 친구들 앞에 한 걸음 먼저 서보고 싶다는 뜻이기도 하겠지. 용기와 자신감을 직접 채울 수 있는 서로 다른 경험들로 골라봤어. 당당하게 네 목소리를 보여줘!`;
  if(sc==='award') return `상을 받고 싶을 만큼 열심히 준비해왔다는 마음부터 멋지다. 결과만 기다리기보다 네 노력을 축하하고 기분 좋게 에너지를 채울 곳들로 골라봤어. 어떤 결과든 이번 도전은 분명 네 것이야!`;
  if(parentChildMarriageScenario(wish)) return `자녀가 좋은 사람을 만나 든든한 인연을 이어가길 바라는 마음이구나. 이미 연인이 있다고 가정하지 않고, 새로운 사람과 자연스럽게 섞이고 취향을 넓힐 만한 곳들로 골라봤어. 반가운 인연이 찾아오길 바라!`;
  if(/담배|금연|흡연/.test(norm(wish))) return `담배를 끊겠다고 마음먹은 것부터 이미 큰 시작이야. 익숙한 습관 대신 몸을 움직이고 숨을 돌릴 수 있는 경험들로 골라봤어. 이번 결심이 오래 가는 건강한 습관이 되길!`;
  return `바라는 일이 잘 풀렸으면 하는 마음이 꽤 간절해 보여. 말로만 그럴듯한 곳보다 실제로 보고, 걷고, 해보면서 좋은 방향으로 한 걸음 옮길 수 있는 곳들을 골라봤어. 다녀오는 길엔 마음도 조금 가벼워지길 바라!`;
}
function pickRecovery(cands,wish,category,existing=[]){
  const sc=schoolScenario(wish);
  let pool=cands;
  if(sc==='award' && /논술|글쓰기|작문|백일장/.test(wish)){
    const strong=cands.filter(c=>/문학|작가|책|도서|서점|한글|기록|문장|출판|활판|인쇄|박물관|미술관|전시|과학관|창작|공방|만들기/.test(spotText(c)) && !/스파|온천|사찰|절\b|암자|테마파크|놀이공원/.test(spotText(c)));
    if(strong.length) pool=strong;
  }
  const picks=[...existing], used=new Set(picks.map(p=>p['명소명'])), buckets=new Set(), usedCatch=new Set(picks.map(p=>p.catch));
  for(const p of picks){const c=pool.find(x=>x.name===p['명소명']); if(c)buckets.add(experienceBucket(c));}
  for(const strict of [true,false]){
    for(const c of pool){
      if(picks.length>=3) break;
      if(used.has(c.name)||!allowedForScenario(c,wish,category,strict)) continue;
      const b=experienceBucket(c);
      if(strict && b!=='other' && buckets.has(b)) continue;
      const catchText=smartCatch(c,wish,category);
      if(usedCatch.has(catchText)) continue;
      picks.push({'명소명':c.name,'지역':c.region,'catch':catchText});
      used.add(c.name);buckets.add(b);usedCatch.add(catchText);
    }
  }
  return picks.slice(0,3);
}
async function repairMissing(category,wish,cands,goodPicks,needed){
  if(needed<=0) return [];
  const used=new Set(goodPicks.map(p=>p['명소명']));
  const pool=cands.filter(c=>!used.has(c.name)&&allowedForScenario(c,wish,category,true)).slice(0,18);
  if(!pool.length) return [];
  const compact=pool.map(c=>({명소명:c.name,지역:c.region,특징:(c.descriptions||[]).slice(0,2),주제:(c.sheets||[]).slice(0,2)}));
  const prompt=`사용자 소원: ${wish}\n카테고리: ${category}\n이미 통과한 추천: ${JSON.stringify(goodPicks)}\n부족한 추천 수: ${needed}\n\n아래 후보에서 부족한 자리만 새로 골라라. 이미 통과한 추천과 다른 경험 결을 우선한다. 관광지 소개문은 금지하고, 각 항목마다 place_feature(장소의 구체적 특징), wish_link(그 특징이 소원과 연결되는 이유), catch(짧고 완결된 추천문장)를 쓴다. '매력을 직접 느끼며', '소원에 어울리는', '한 걸음을 내디뎌' 같은 범용문장은 금지한다. 정확히 ${needed}개만 반환한다.\n후보:${JSON.stringify(compact)}`;
  try{
    const r=await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':KEY},
      body:JSON.stringify({system_instruction:{parts:[{text:SYSTEM}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:320,temperature:.2,thinkingConfig:{thinkingBudget:48},responseMimeType:'application/json'}})
    },3200);
    if(!r.ok) return [];
    const d=await r.json();
    const t=d.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
    const obj=extractJson(t);
    const rawPicks=Array.isArray(obj.picks)?obj.picks:(Array.isArray(obj)?obj:[]);
    return validate({picks:rawPicks},pool,wish,category).slice(0,needed);
  }catch(e){console.warn('부분 품질 복구 생략:',e.message);return [];}
}

function logUsage(category,wish,usage,candidateCount){
  const row={ts:new Date().toISOString(),model:MODEL,category,wish_chars:wish.length,candidate_count:candidateCount,prompt_tokens:usage.promptTokenCount??null,candidates_tokens:usage.candidatesTokenCount??null,thoughts_tokens:usage.thoughtsTokenCount??null,total_tokens:usage.totalTokenCount??null};
  // 원본은 gemini_usage.jsonl 파일에 붙여 썼다. Vercel은 파일 쓰기가 막혀 있어
  // 콘솔에 남기고, 주입된 저장소(DB)가 있으면 거기에도 보낸다.
  console.log('[Gemini 사용량]',JSON.stringify(row));
  if(onUsage){try{onUsage(row);}catch(e){console.warn('사용량 기록 실패:',e.message);}}
}
export async function recommend(category,wish,{manualRetry=false}={}){
  const expansion=queryExpansion(category,wish);
  let q=null;
  try{q=await embedQuery(`${category}. 사용자의 소원: ${wish}. ${expansion}. 이 소원과 자연스럽게 연결되는 실제 여행 경험과 장소.`);}
  catch(e){console.warn('Embedding 실패, 키워드 검색으로 복구:',e.message);}

  const cands=retrieve(q,wish,category);
  const safePool=cands.filter(c=>allowedForScenario(c,wish,category,false));
  const finalPool=(safePool.length>=18?safePool:cands).slice(0,26);
  if(finalPool.length<3) throw new Error('추천 후보가 부족합니다.');

  let result=null;
  try{result=await generate(category,wish,finalPool,0,12000);}
  catch(e){console.warn('Gemini 생성 실패:',e.message);throw e;}

  const picks=[];
  const used=new Set();
  if(result && Array.isArray(result.picks)){
    for(const p of result.picks){
      const idx=Number(p.id);
      if(!Number.isInteger(idx)||idx<0||idx>=finalPool.length||used.has(idx)) continue;
      const c=finalPool[idx];
      if(!allowedForScenario(c,wish,category,false)) continue;
      const ct=repairKorean(cleanKoText(p.catch,96));
      if(!ct) continue;
      picks.push({'명소명':c.name,'지역':c.region,'catch':ct});
      used.add(idx);
      if(picks.length===3) break;
    }
  }

  // 사용자에게 저품질 로컬 fallback을 노출하지 않는다.
  // Gemini가 유효한 추천 3곳을 완성하지 못하면 정상 결과로 위장하지 않고 503 재시도로 보낸다.
  if(picks.length<3) throw new Error('Gemini 추천 3곳을 완성하지 못했습니다.');

  const letter=result?.letter?repairKorean(cleanKoText(result.letter,260)):'';
  if(!letter||hasBadKorean(letter)||genericLetter(letter)) throw new Error('Gemini 답장 품질 검증에 실패했습니다.');

  // 동일 카피가 반복돼도 로컬 smartCatch로 교체하지 않고 재시도 처리한다.
  const seenCatch=new Set();
  for(let i=0;i<picks.length;i++){
    const ct=repairKorean(cleanKoText(picks[i].catch,96));
    if(!ct||seenCatch.has(ct)) throw new Error('Gemini 추천 문구 품질 검증에 실패했습니다.');
    picks[i].catch=ct;
    seenCatch.add(ct);
    counts[picks[i]['명소명']]=(counts[picks[i]['명소명']]||0)+1;
  }

  /*
   * 원본은 여기서 recommend_counts.json에 파일로 저장했다.
   * Vercel은 파일 쓰기가 막혀 있으므로 이번에 추천된 명소 이름만 알려주고,
   * 실제 저장은 api 라우트가 DB에 맡긴다.
   */
  if(onCountsChanged){
    try{onCountsChanged(picks.slice(0,3).map(p=>p['명소명']));}
    catch(e){console.warn('추천 횟수 반영 실패:',e.message);}
  }
  logUsage(category,wish,result?._usage||{},finalPool.length);
  return {analysis:result?.analysis||{},letter,picks:picks.slice(0,3)};
}

function startupSelfCheck(){
  // Pure helper smoke tests: catch accidental ReferenceError/return-type regressions before serving users.
  const probes=[
    ['성장·학업','논술대회에서 수상하고 싶어요'],
    ['효도·가족','가족끼리 화목하게 지내게 해주세요'],
    ['사랑·인연','소개팅 잘되게 해주세요'],
    ['재물·자산','1억 모으자'],
    ['효도·가족','아이가 건강하게 자랐으면']
  ];
  for(const [cat,w] of probes){
    const qx=queryExpansion(cat,w);
    if(typeof qx!=='string') throw new Error('queryExpansion self-check 실패');
  }
  const sample=spots[0];
  if(sample && typeof contextScoreAdjust(sample,'무탈하게 지내고 싶어요','건강·무탈')!=='number') throw new Error('contextScoreAdjust self-check 실패');
}
startupSelfCheck();

/*
 * 원본은 여기서 http 서버를 8787 포트로 띄우고 테스트 HTML을 서빙했다.
 * Vercel에서는 요청이 올 때 함수가 실행되므로 서버를 직접 띄우지 않는다.
 * 대신 recommend를 내보내고, 요청 처리는 src/app/api/recommend/route.ts가 맡는다.
 *
 * 아래는 원본의 요청 처리에서 "수동 재시도 기억" 부분만 옮긴 것이다.
 * 같은 소원이 2분 안에 다시 오면 Gemini 대기시간을 늘려준다.
 */

/**
 * 수동 재시도 여부를 판단해 추천을 실행한다.
 * 원본 라우트가 하던 recentManualFailures 관리를 그대로 옮겼다.
 */
export async function recommendWithRetryMemory(category,wish){
  const key=requestKey(category,wish);
  const failedAt=recentManualFailures.get(key)||0;
  const manualRetry=failedAt>0 && (Date.now()-failedAt)<=MANUAL_RETRY_WINDOW_MS;
  if(failedAt && !manualRetry) recentManualFailures.delete(key);
  try{
    const result=await recommend(category,wish,{manualRetry});
    recentManualFailures.delete(key);
    return result;
  }catch(e){
    recentManualFailures.set(key,Date.now());
    if(manualRetry) console.warn('두 번째 수동 시도도 실패:',e.message);
    throw e;
  }
}

/** 명소 데이터가 정상 적재됐는지 확인용 */
export function getSpotCount(){return spots.length;}