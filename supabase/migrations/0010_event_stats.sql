-- 운영자용 참여 통계 조회.
--
-- Supabase SQL Editor에서 select * from event_stats(); 로 확인한다.

create or replace function event_stats()
returns table (
  참여자수 bigint,
  총회차수 bigint,
  라운드1도달 bigint,
  라운드2도달 bigint,
  라운드3도달 bigint,
  성공회차 bigint,
  당첨자수 bigint,
  당첨률 numeric,
  재도전으로시작한회차 bigint,
  오늘참여자수 bigint
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from participants),
    (select count(*) from attempts),
    (select count(*) from attempts where reached_round >= 1),
    (select count(*) from attempts where reached_round >= 2),
    (select count(*) from attempts where reached_round >= 3),
    (select count(*) from attempts where status = 'success'),
    (select count(*) from winners),
    -- 회차 대비 당첨 비율. 참여자 수 대비가 아니라 시도 대비다.
    (select round(
      100.0 * (select count(*) from winners) /
      greatest((select count(*) from attempts), 1), 2)),
    (select count(*) from attempts where is_retry),
    (select count(*) from participants
      where state_date = today_kst());
$$;

-- 소원 유형별 참여 분포. 어떤 유형이 인기 있는지 본다.
create or replace function event_stats_by_category()
returns table (
  소원유형 text,
  회차수 bigint,
  성공수 bigint
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(category, '(미선택)'),
    count(*),
    count(*) filter (where status = 'success')
  from attempts
  group by category
  order by count(*) desc;
$$;

-- 날짜별 참여 추이. 하루 단위로 몇 명이 도전했는지 본다 (한국 시간 기준).
create or replace function event_stats_daily()
returns table (
  날짜 date,
  회차수 bigint,
  성공수 bigint,
  당첨수 bigint
)
language sql
security definer
set search_path = public
as $$
  select
    (a.started_at at time zone 'Asia/Seoul')::date,
    count(*),
    count(*) filter (where a.status = 'success'),
    count(distinct w.id)
  from attempts a
  left join winners w
    on w.attempt_id = a.id
  group by 1
  order by 1;
$$;
