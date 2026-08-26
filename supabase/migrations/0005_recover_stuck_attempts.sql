-- 진행 중 상태에 갇힌 회차 복구
--
-- 문제: 게임 결과가 서버에 전달되지 않으면 회차가 in_progress로 남고
--       참여자 상태도 in_progress에 갇힌다. 이러면 다음 참여가 영구히
--       막히고 결과 화면도 볼 수 없다.
--
-- 원인이 될 수 있는 상황:
--   - 브라우저를 닫거나 새로고침
--   - 네트워크 끊김
--   - 결과 제출 중 오류
--
-- 대책: 참여 시작 시점에 오래된 in_progress를 자동으로 실패 처리한다.
--       사용자가 갇히지 않게 하는 것이 우선이다.

/** 진행 중 회차가 이 시간을 넘기면 방치된 것으로 본다 */
create or replace function stale_attempt_timeout() returns interval
language sql immutable as $$
  select interval '30 minutes';
$$;

/**
 * 방치된 회차를 정리한다.
 * 참여 시작 전에 호출해 갇힌 상태를 풀어준다.
 */
create or replace function recover_stale_attempts(p_participant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 오래된 진행 중 회차를 실패로 마감한다
  update attempts
     set status = 'failed',
         ended_at = now()
   where participant_id = p_participant
     and status = 'in_progress'
     and started_at < now() - stale_attempt_timeout();

  -- 참여자 상태도 풀어준다.
  -- 진행 중인 회차가 하나도 없다면 in_progress에 남아 있을 이유가 없다.
  update participants p
     set state = 'exhausted'
   where p.id = p_participant
     and p.state = 'in_progress'
     and not exists (
       select 1 from attempts a
       where a.participant_id = p_participant
         and a.status = 'in_progress'
     );
end;
$$;

-- 참여 시작 함수에 복구 단계를 추가한다
create or replace function start_attempt(
  p_participant uuid,
  p_seeds jsonb
)
returns table (attempt_id uuid, was_retry boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state play_state;
  v_is_retry boolean := false;
  v_attempt uuid;
begin
  if event_window_status() <> 'open' then
    return;
  end if;

  -- 갇힌 상태를 먼저 풀어준다
  perform recover_stale_attempts(p_participant);

  select state into v_state
  from participants
  where id = p_participant
  for update;

  if not found then
    return;
  end if;

  -- 자정 리셋 (요구사항 13.5, 13.6)
  update participants
     set state = 'available',
         state_date = today_kst()
   where id = p_participant
     and state_date < today_kst()
     and has_won = false;

  select state into v_state from participants where id = p_participant;

  v_is_retry := (v_state = 'retry_ready');

  update participants
     set state = 'in_progress'
   where id = p_participant
     and has_won = false
     and state in ('available', 'retry_ready');

  if not found then
    return;
  end if;

  insert into attempts (participant_id, round_seeds, is_retry)
  values (p_participant, p_seeds, v_is_retry)
  returning id into v_attempt;

  return query select v_attempt, v_is_retry;
end;
$$;

-- 지금 갇혀 있는 회차를 즉시 정리한다 (일회성)
update attempts
   set status = 'failed', ended_at = now()
 where status = 'in_progress';

update participants
   set state = 'exhausted'
 where state = 'in_progress';
