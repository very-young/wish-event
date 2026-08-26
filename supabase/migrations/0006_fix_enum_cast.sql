-- enum 타입 캐스팅 오류 수정
--
-- 문제: finish_attempt_failed 호출 시 아래 오류가 발생했다.
--   column "status" is of type attempt_status but expression is of type text
--
-- 원인: case 식의 결과가 text로 추론되는데 attempt_status 컬럼에 넣으려 했다.
--       PostgreSQL은 이 경우 자동 변환을 하지 않는다.
--
-- 영향: 게임 실패가 서버에 기록되지 못해 회차가 in_progress에 갇혔다.
--       그 결과 다음 참여, 결과 재열람, 공유가 모두 막혔다.
--
-- 수정: 명시적으로 ::attempt_status 캐스팅을 붙인다.

create or replace function finish_attempt_failed(
  p_participant uuid,
  p_attempt uuid,
  p_reached_round smallint,
  p_invalid boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update attempts
     set status = (
           case when p_invalid then 'invalid' else 'failed' end
         )::attempt_status,
         reached_round = p_reached_round,
         ended_at = now()
   where id = p_attempt and participant_id = p_participant;

  -- 실패하면 기회 소진 상태가 된다. 공유하면 재도전이 열린다.
  update participants
     set state = 'exhausted'
   where id = p_participant
     and state = 'in_progress';
end;
$$;

-- ============================================================
-- 성공 처리 함수도 같은 방식으로 점검해 캐스팅을 명시한다
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
  v_remaining integer;
  v_serial text;
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i integer;
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

  -- 이미 당첨된 계정이면 재고를 건드리지 않는다
  if exists (select 1 from winners where participant_id = p_participant) then
    update participants
       set state = 'won'::play_state, has_won = true
     where id = p_participant;
    return query select 'sold_out'::text, null::text;
    return;
  end if;

  -- 재고 원자적 차감 (요구사항 10.4)
  update prize_stock
     set remaining = remaining - 1
   where id = 'main' and remaining > 0
  returning remaining into v_remaining;

  if v_remaining is null then
    -- 경품 소진. 게임 성공은 인정하되 당첨은 아니다 (요구사항 10.3).
    update participants
       set state = 'exhausted'::play_state
     where id = p_participant;
    return query select 'sold_out'::text, null::text;
    return;
  end if;

  -- 일련번호 생성. 혼동되는 글자(O,0,I,1,L)를 제외한다.
  v_serial := 'CHU-';
  for i in 1..8 loop
    v_serial := v_serial ||
      substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
  end loop;

  insert into winners (participant_id, attempt_id, serial)
  values (p_participant, p_attempt, v_serial);

  update participants
     set state = 'won'::play_state, has_won = true
   where id = p_participant;

  return query select 'won'::text, v_serial;
end;
$$;

-- ============================================================
-- 나머지 함수의 enum 대입도 명시적으로 캐스팅한다
-- ============================================================

create or replace function recover_stale_attempts(p_participant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update attempts
     set status = 'failed'::attempt_status,
         ended_at = now()
   where participant_id = p_participant
     and status = 'in_progress'::attempt_status
     and started_at < now() - stale_attempt_timeout();

  update participants p
     set state = 'exhausted'::play_state
   where p.id = p_participant
     and p.state = 'in_progress'::play_state
     and not exists (
       select 1 from attempts a
       where a.participant_id = p_participant
         and a.status = 'in_progress'::attempt_status
     );
end;
$$;

-- ============================================================
-- 지금 갇혀 있는 회차를 정리한다
-- ============================================================

update attempts
   set status = 'failed'::attempt_status, ended_at = now()
 where status = 'in_progress'::attempt_status;

update participants
   set state = 'exhausted'::play_state
 where state = 'in_progress'::play_state;
