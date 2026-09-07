-- 일련번호 요약 조회.
--
-- serial_status()는 0007에서 이미 만들었다. 그것은 200개를 전부 보여준다.
-- 몇 개가 나갔는지만 빨리 보고 싶을 때가 많아 요약을 따로 둔다.
--
--   select * from serial_summary();   -- 전체 / 지급 / 남음 / 다음 번호
--   select * from serial_status();    -- 200개 전부 (0007에서 만든 것)
--
-- ⚠️ serial_status()를 여기서 다시 만들지 않는다.
--    이미 있는 함수를 다른 형태로 create or replace 하면
--    "cannot change return type of existing function" 오류가 난다.

create or replace function serial_summary()
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
     * 지급 순서가 seq로 정해져 있어, 번호를 사전순으로 고르면
     * 실제로 나갈 번호와 어긋난다.
     */
    (select s.serial from serial_pool s
      where s.assigned_to is null
      order by s.seq
      limit 1)
  from serial_pool;
$$;
