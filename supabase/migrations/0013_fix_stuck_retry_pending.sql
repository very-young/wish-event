-- 공유 대기 상태에 갇히는 문제 수정
--
-- 문제: 공유 버튼을 눌러 티켓을 받은 뒤 카카오톡 전송을 하지 않고
--       페이지를 벗어나면 상태가 retry_pending에 머문다.
--       그 뒤로는 "지금은 재도전 공유를 할 수 없어요"만 나오고
--       다시 공유할 방법이 없다.
--
-- 원인: issue_share_ticket이 exhausted 상태만 받아들인다.
--       화면에는 60초 뒤 되돌리는 처리가 있지만, 그 전에 창을 닫거나
--       앱으로 전환하면 실행되지 않는다.
--
-- 수정: 티켓을 발급할 때 만료된 대기를 먼저 정리한다.
--       이미 만료된 티켓 때문에 계속 막히는 일이 없어진다.

create or replace function issue_share_ticket(
  p_participant uuid,
  p_attempt uuid,
  p_ttl_seconds integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket uuid;
begin
  /*
   * 1) 만료된 대기를 먼저 정리한다.
   *
   * 유효한 티켓이 하나도 없는데 retry_pending에 머물러 있다면
   * 전송을 하지 않고 이탈한 것이다. 다시 공유할 수 있게 되돌린다.
   */
  update share_tickets
     set status = 'expired'::ticket_status
   where participant_id = p_participant
     and status = 'pending'::ticket_status
     and expires_at < now();

  update participants
     set state = 'exhausted'::play_state
   where id = p_participant
     and has_won = false
     and state = 'retry_pending'::play_state
     -- 아직 기다릴 만한 티켓이 없을 때만 되돌린다.
     -- 진행 중인 공유를 끊어버리면 안 된다.
     and not exists (
       select 1 from share_tickets t
       where t.participant_id = p_participant
         and t.status = 'pending'::ticket_status
         and t.expires_at >= now()
     );

  -- 2) 원래 조건대로 티켓을 발급한다
  update participants
     set state = 'retry_pending'::play_state
   where id = p_participant
     and has_won = false
     and state = 'exhausted'::play_state;

  if not found then
    return null;
  end if;

  insert into share_tickets (participant_id, attempt_id, expires_at)
  values (
    p_participant,
    p_attempt,
    now() + make_interval(secs => p_ttl_seconds)
  )
  returning id into v_ticket;

  return v_ticket;
end;
$$;

-- ============================================================
-- 지금 갇혀 있는 참여자를 풀어준다
-- ============================================================

-- 만료된 대기 티켓 정리
update share_tickets
   set status = 'expired'::ticket_status
 where status = 'pending'::ticket_status
   and expires_at < now();

-- 유효한 티켓 없이 대기 중인 참여자를 되돌린다
update participants p
   set state = 'exhausted'::play_state
 where p.has_won = false
   and p.state = 'retry_pending'::play_state
   and not exists (
     select 1 from share_tickets t
     where t.participant_id = p.id
       and t.status = 'pending'::ticket_status
       and t.expires_at >= now()
   );

-- 확인
select nickname, state, has_won from participants order by state_date desc;
