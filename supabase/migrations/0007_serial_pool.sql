-- 미리 준비한 일련번호를 순서대로 지급하는 방식으로 전환한다.
--
-- 기존: 당첨될 때 서버가 즉석에서 번호를 만들었다(CHU-XXXXXXXX).
--       운영자가 어떤 번호가 나갈지 미리 알 수 없었다.
--
-- 변경: 준비된 100개를 미리 넣어두고 당첨 시 하나씩 꺼내 쓴다.
--       번호별로 누구에게 언제 나갔는지 추적할 수 있다.

-- ============================================================
-- 일련번호 풀
-- ============================================================

create table if not exists serial_pool (
  -- 파일의 번호 열. 지급 순서를 정한다.
  seq integer primary key,
  serial text not null unique,
  -- 지급되면 채워진다. null이면 미사용.
  assigned_to uuid references participants(id),
  assigned_at timestamptz
);

-- 미사용 번호를 빨리 찾기 위한 인덱스
create index if not exists serial_pool_unassigned_idx
  on serial_pool (seq) where assigned_to is null;

alter table serial_pool enable row level security;

-- 브라우저는 이 표를 읽을 수 없다. 남의 번호가 보이면 안 된다.
-- 서버(service_role)만 접근한다.
drop policy if exists "serial_pool_no_public_access" on serial_pool;

-- ============================================================
-- 당첨 처리: 풀에서 번호를 꺼내 쓴다
-- ============================================================

create or replace function finish_attempt_success(
  p_participant uuid,
  p_attempt uuid,
  p_places jsonb
)
returns table (outcome text, serial text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serial text;
begin
  update attempts
     set status = 'success'::attempt_status,
         reached_round = 3,
         places_shown = p_places,
         ended_at = now()
   where id = p_attempt
     and participant_id = p_participant
     and status = 'in_progress'::attempt_status;

  if not found then
    return query select 'rejected'::text, null::text;
    return;
  end if;

  -- 이미 당첨된 계정이면 번호를 새로 꺼내지 않는다 (중복 당첨 방지)
  if exists (select 1 from winners where participant_id = p_participant) then
    update participants
       set state = 'won'::play_state, has_won = true
     where id = p_participant;
    return query select 'sold_out'::text, null::text;
    return;
  end if;

  /*
   * 미사용 번호 하나를 앞에서부터 잠그고 가져온다.
   *
   * skip locked를 쓰면 동시에 두 명이 당첨돼도 서로 다른 번호를 받는다.
   * 잠긴 행을 기다리지 않고 다음 행으로 넘어가기 때문이다.
   */
  update serial_pool sp
     set assigned_to = p_participant,
         assigned_at = now()
   where sp.seq = (
     select seq from serial_pool
      where assigned_to is null
      order by seq
      limit 1
      for update skip locked
   )
  returning sp.serial into v_serial;

  if v_serial is null then
    -- 번호가 모두 나갔다. 게임 성공은 인정하되 당첨은 아니다 (요구사항 10.3).
    update participants
       set state = 'exhausted'::play_state
     where id = p_participant;
    return query select 'sold_out'::text, null::text;
    return;
  end if;

  insert into winners (participant_id, attempt_id, serial)
  values (p_participant, p_attempt, v_serial);

  -- 남은 재고를 풀 기준으로 맞춰 둔다. 화면 안내와 통계에 쓰인다.
  update prize_stock
     set remaining = (select count(*) from serial_pool where assigned_to is null)
   where id = 'main';

  update participants
     set state = 'won'::play_state, has_won = true
   where id = p_participant;

  return query select 'won'::text, v_serial;
end;
$$;

-- ============================================================
-- 운영자용 현황 조회
-- ============================================================

/*
 * 일련번호 현황. 어떤 번호가 누구에게 언제 나갔는지 본다.
 * Supabase SQL Editor에서 select * from serial_status(); 로 조회한다.
 */
create or replace function serial_status()
returns table (
  seq integer,
  serial text,
  상태 text,
  닉네임 text,
  지급시각 timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    sp.seq,
    sp.serial,
    case when sp.assigned_to is null then '미사용' else '지급됨' end,
    p.nickname,
    sp.assigned_at
  from serial_pool sp
  left join participants p on p.id = sp.assigned_to
  order by sp.seq;
$$;

/*
 * 옛 형식 당첨 기록(CHU-...)은 여기서 건드리지 않는다.
 *
 * 0009_test_reset.sql의 test_reset_winner()로 언제든 되돌릴 수 있으므로
 * 마이그레이션이 데이터를 임의로 지우지 않는 편이 안전하다.
 */

/*
 * 요약. 전체·지급·남은 개수와 다음에 나갈 번호를 한 줄로 보여준다.
 */
create or replace function serial_summary()
returns table (
  전체 bigint,
  지급됨 bigint,
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
    (select serial from serial_pool where assigned_to is null
      order by seq limit 1)
  from serial_pool;
$$;
