-- 웹훅 처리 함수 수정
--
-- 문제: 존재하지 않는 티켓이 들어오면 예외가 발생해 'rejected' 대신
--       'exception'이 반환됐다.
--
-- 원인: `for update of t`가 join된 쿼리에서 제약이 있고, 행이 없을 때
--       변수가 null로 남아 이후 처리에서 문제가 생겼다.
--
-- 수정: 티켓 조회와 잠금을 분리하고, 각 단계에서 행 존재를 명확히 확인한다.

create or replace function grant_retry_from_webhook(
  p_ticket uuid,
  p_chat_hash text,
  p_chat_type text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant uuid;
  v_status ticket_status;
  v_expires timestamptz;
  v_has_won boolean;
  v_room uuid;
  v_grant uuid;
begin
  -- 티켓을 잠그고 가져온다. 없으면 즉시 거부.
  select t.participant_id, t.status, t.expires_at
    into v_participant, v_status, v_expires
  from share_tickets t
  where t.id = p_ticket
  for update;

  if v_participant is null then
    return 'rejected';
  end if;

  if v_expires < now() then
    update share_tickets set status = 'expired' where id = p_ticket;
    return 'rejected';
  end if;

  -- 당첨자는 재도전을 얻을 수 없다 (요구사항 12.15)
  select p.has_won into v_has_won
  from participants p
  where p.id = v_participant;

  if v_has_won is null or v_has_won then
    return 'rejected';
  end if;

  -- 1) 톡방 이력. INSERT 성공 여부가 "새 톡방인가"를 판정한다.
  insert into used_chatrooms (participant_id, chat_hash, chat_type)
  values (v_participant, p_chat_hash, p_chat_type)
  on conflict (participant_id, chat_hash) do nothing
  returning id into v_room;

  if v_room is null then
    -- 이미 보낸 톡방이다. 해제하지 않는다 (요구사항 12.13).
    return 'duplicate';
  end if;

  -- 2) 티켓 단위 해제. 한 공유에서 여러 톡방으로 보내도 여기서 1회로 묶인다.
  insert into share_grants (participant_id, ticket_id, granting_chat_hash)
  values (v_participant, p_ticket, p_chat_hash)
  on conflict (ticket_id) do nothing
  returning id into v_grant;

  if v_grant is null then
    return 'already';
  end if;

  -- 3) 상태 전이
  update participants
     set state = 'retry_ready'
   where id = v_participant
     and has_won = false
     and state = 'retry_pending';

  update share_tickets set status = 'consumed' where id = p_ticket;

  return 'granted';
end;
$$;
