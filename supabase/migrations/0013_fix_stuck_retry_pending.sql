-- 공유 대기 상태에 갇히는 문제 수정
--
-- ============================================================
-- 문제
-- ============================================================
--
-- 공유 버튼을 눌러 티켓을 받은 뒤, 카카오톡으로 보내지 않고
-- 브라우저를 강제로 닫으면 참여 상태가 retry_pending에 남는다.
-- 서버에 대기 종료를 알릴 틈이 없기 때문이다.
--
-- 그 뒤로는 공유 버튼을 눌러도 "지금은 재도전 공유를 할 수 없어요"만
-- 뜬다. issue_share_ticket이 exhausted 상태에서만 티켓을 주기 때문이다.
-- 날짜가 넘어가면 저절로 풀리지만, 그날 하루는 재도전을 할 수 없다.
--
-- (그만두기 버튼을 누른 경우는 서버에 알려주므로 문제가 없다.)
--
-- ============================================================
-- 수정
-- ============================================================
--
-- 티켓 발급 조건에 retry_pending을 더한다.
--
--   변경 전: and state = 'exhausted'
--   변경 후: and state in ('exhausted', 'retry_pending')
--
-- 대기 중이어도 공유 버튼을 다시 누르면 새 티켓이 나온다.
-- 새 티켓 번호가 카카오톡 메시지에 실려 나가므로, 전송이 확인되면
-- 그 새 티켓으로 재도전이 열린다. 옛 티켓은 무관해진다.
--
-- 중복 당첨 위험은 없다. 재도전이 열리는 조건은 여전히
-- "아직 보내지 않은 톡방"이라, 티켓을 여러 번 받아도 같은 톡방으로는
-- 열리지 않는다 (grant_retry_from_webhook의 used_chatrooms 판정).
--
-- expire_share_wait는 손대지 않는다. 원래 동작 그대로다.

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
  update participants
     set state = 'retry_pending'::play_state
   where id = p_participant
     and has_won = false
     -- retry_pending을 더한 것이 이 수정의 전부다.
     -- 대기에 갇혀 있어도 다시 공유할 수 있게 한다.
     and state in ('exhausted'::play_state, 'retry_pending'::play_state);

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

-- 확인
select nickname, state, has_won from participants order by state_date desc;
