-- AI 추천 결과 보관과 추천 횟수 기록.
--
-- 원본 추천 엔진은 두 가지를 파일에 저장했다.
--   recommend_counts.json  명소별 추천 횟수 (추천 점수 감점에 사용)
--   gemini_usage.jsonl     Gemini 사용량 기록
--
-- Vercel은 파일 쓰기가 막혀 있고 요청마다 새로 실행되므로 파일이 유지되지 않는다.
-- 같은 기능을 DB로 옮긴다. 파일보다 안전하다 — 동시 요청에도 숫자가 어긋나지 않는다.

-- ============================================================
-- 명소별 추천 횟수
-- ============================================================

create table if not exists spot_recommend_counts (
  spot_name text primary key,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table spot_recommend_counts is
  '명소가 추천된 누적 횟수. 추천 엔진이 이 값으로 점수를 깎아 같은 명소가 쏠리는 것을 막는다.';

alter table spot_recommend_counts enable row level security;
-- 브라우저는 접근할 수 없다. 서버(service_role)만 읽고 쓴다.

/*
 * 추천된 명소들의 횟수를 한 번에 올린다.
 *
 * 여러 참여자가 동시에 추천받아도 각자의 증가가 모두 반영된다.
 * 파일 방식은 나중에 쓴 쪽이 앞의 기록을 덮어써 숫자가 틀어졌다.
 */
create or replace function bump_spot_counts(p_names text[])
returns void
language sql
security definer
set search_path = public
as $$
  insert into spot_recommend_counts (spot_name, count, updated_at)
  select unnest(p_names), 1, now()
  on conflict (spot_name) do update
    set count = spot_recommend_counts.count + 1,
        updated_at = now();
$$;

-- ============================================================
-- Gemini 사용량 기록
-- ============================================================

create table if not exists gemini_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  model text,
  category text,
  wish_chars integer,
  candidate_count integer,
  prompt_tokens integer,
  candidates_tokens integer,
  thoughts_tokens integer,
  total_tokens integer
);

comment on table gemini_usage is
  'Gemini 호출별 토큰 사용량. 비용 확인용. 원본의 gemini_usage.jsonl을 대체한다.';

create index if not exists gemini_usage_created_idx
  on gemini_usage (created_at desc);

alter table gemini_usage enable row level security;

-- ============================================================
-- 회차별 AI 추천 결과
-- ============================================================

/*
 * 추천 결과를 회차에 저장한다.
 *
 * 종이접기 시점에 미리 요청해 두고, 게임이 끝난 뒤 결과 화면에서 읽는다.
 * 저장해 두므로 재접속해서 결과를 다시 봐도 같은 내용이 나온다.
 */
alter table attempts
  add column if not exists ai_letter text,
  add column if not exists ai_picks jsonb,
  add column if not exists ai_status text,
  add column if not exists ai_updated_at timestamptz;

comment on column attempts.ai_letter is
  'Gemini가 소원을 읽고 쓴 달님의 답장. 없으면 아직 생성 중이거나 실패한 것이다.';
comment on column attempts.ai_picks is
  'Gemini가 고른 명소 3곳. [{명소명, 지역, catch}] 형태.';
comment on column attempts.ai_status is
  'pending(생성 중) | ready(완료) | failed(재시도까지 실패)';

/*
 * 추천 결과를 저장한다. 진행 중인 회차가 아니어도 저장한다 —
 * 게임이 이미 끝난 뒤에 결과가 도착할 수 있기 때문이다.
 */
create or replace function save_ai_result(
  p_participant uuid,
  p_attempt uuid,
  p_status text,
  p_letter text default null,
  p_picks jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update attempts
     set ai_status = p_status,
         ai_letter = coalesce(p_letter, ai_letter),
         ai_picks = coalesce(p_picks, ai_picks),
         ai_updated_at = now()
   where id = p_attempt
     and participant_id = p_participant;
$$;

-- ============================================================
-- 운영자용: 명소별 추천 현황
-- ============================================================

create or replace function spot_count_status()
returns table (명소명 text, 추천횟수 integer, 최근시각 timestamptz)
language sql
security definer
set search_path = public
as $$
  select spot_name, count, updated_at
  from spot_recommend_counts
  order by count desc, spot_name;
$$;
