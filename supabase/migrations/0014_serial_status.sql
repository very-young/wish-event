-- 운영자용 일련번호 현황 조회.
--
-- 터미널 없이 Supabase SQL Editor에서 바로 확인할 수 있게 한다.
-- (같은 내용을 터미널에서 보려면 node scripts/serial-status.mjs)
--
--   select * from serial_status();      -- 요약 (몇 개 나갔나)
--   select * from serial_assigned();    -- 누가 어떤 번호를 받았나

-- ============================================================
-- 요약: 전체 / 지급 / 남음 / 다음에 나갈 번호
-- ============================================================

create or replace function serial_status()
returns table (
  전체 bigint,
  지급 bigint,
  남음 bigint,
  다음번호 text
)
language sql
security definer
set search_path = public
as $$
  select
    count(*),
    count(assigned_to),
    count(*) - count(assigned_to),
    /*
     * 다음에 나갈 번호는 seq가 가장 작은 미지급 번호다.
     * 지급 순서가 seq로 정해져 있어 min(serial)이 아니라
     * seq 순서로 골라야 실제로 나갈 번호와 일치한다.
     */
    (select s.serial from serial_pool s
      where s.assigned_to is null
      order by s.seq
      limit 1)
  from serial_pool;
$$;

-- ============================================================
-- 지급 내역: 누가 어떤 번호를 언제 받았나
-- ============================================================

create or replace function serial_assigned()
returns table (
  순서 integer,
  일련번호 text,
  닉네임 text,
  지급시각 timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    s.seq,
    s.serial,
    p.nickname,
    s.assigned_at
  from serial_pool s
  join participants p on p.id = s.assigned_to
  order by s.seq;
$$;
