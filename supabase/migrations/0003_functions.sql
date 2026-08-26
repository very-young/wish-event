-- 원자적 연산 함수
--
-- 동시성이 걸리는 지점은 애플리케이션 코드가 아니라 DB 함수로 처리한다.
-- 여러 사람이 같은 순간에 요청해도 잘못된 상태가 만들어지지 않아야 한다.

-- ============================================================
-- 오늘 날짜 (KST)
-- ============================================================

create or replace function today_kst() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

-- ============================================================
-- 이벤트 기간 판정
-- ============================================================
--
-- 서버 시각을 기준으로 한다 (요구사항 1.6).
-- 브라우저 시각을 신뢰하면 PC 시계를 바꿔 우회할 수 있다.

create table event_config (
  id text primary key,
  start_date date not null,
  end_date date not null
);

insert into event_config (id, start_date, end_date)
values ('main', '2026-09-14', '2026-09-27');

alter table event_config enable row level security;
create policy event_config_select on event_config for select using (true);

create or replace function event_window_status()
returns text
language sql stable as $$
  select case
    when today_kst() < c.start_date then 'before'
    when today_kst() > c.end_date then 'after'
    else 'open'
  end
  from event_config c where c.id = 'main';
$$;

-- ============================================================
-- 참여 시작 (자정 리셋 + 상태 전이)
-- ============================================================
--
-- 하나의 함수로 처리해 동시 요청에서 중복 리셋이나 이중 시작이 없게 한다.
-- 반환값이 null이면 참여할 수 없다는 뜻이다.

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
  -- 이벤트 기간이 아니면 시작하지 않는다
  if event_window_status() <> 'open' then
    return;
  end if;

  -- 행을 잠그고 상태를 확인한다. 동시 요청은 여기서 직렬화된다.
  select state into v_state
  from participants
  where id = p_participant
  for update;

  if not found then
    return;
  end if;

  -- 자정 리셋: 날짜가 지났으면 참여 가능 상태로 되돌린다.
  -- 미사용 재도전 권리(retry_ready)도 이 덮어쓰기로 소멸한다 (요구사항 13.6).
  -- has_won이 true면 리셋하지 않는다 (요구사항 13.7).
  update participants
     set state = 'available',
         state_date = today_kst()
   where id = p_participant
     and state_date < today_kst()
     and has_won = false
  returning state into v_state;

  if v_state is null then
    select state into v_state from participants where id = p_participant;
  end if;

  -- 재도전으로 시작하는지 판별
  v_is_retry := (v_state = 'retry_ready');

  -- 상태 전이. 조건에 맞지 않으면 아무 행도 갱신되지 않는다.
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

-- ============================================================
-- 게임 실패 처리
-- ============================================================

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
     set status = case when p_invalid then 'invalid' else 'failed' end,
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
-- 당첨 확정 (경품 재고 원자적 차감)
-- ============================================================
--
-- 요구사항 10.4: 동시 요청에서도 준비 수량을 초과해 당첨이 발생하지 않아야 한다.
--
-- 조건부 UPDATE 한 번으로 처리한다. remaining > 0인 행만 갱신되므로
-- 동시에 100명이 요청해도 재고 수만큼만 성공한다.
--
-- 반환값의 outcome:
--   'won'       당첨 확정 (serial 발급)
--   'sold_out'  게임은 성공했으나 경품 소진
--   'rejected'  상태가 맞지 않아 처리하지 않음

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
  -- 진행 중인 회차만 처리한다
  update attempts
     set status = 'success',
         reached_round = 3,
         places_shown = p_places,
         ended_at = now()
   where id = p_attempt
     and participant_id = p_participant
     and status = 'in_progress';

  if not found then
    return query select 'rejected'::text, null::text;
    return;
  end if;

  -- 이미 당첨된 계정이면 재고를 건드리지 않는다
  if exists (select 1 from winners where participant_id = p_participant) then
    update participants set state = 'won', has_won = true
     where id = p_participant;
    return query select 'sold_out'::text, null::text;
    return;
  end if;

  -- 재고 원자적 차감. remaining > 0 조건이 초과 당첨을 막는다.
  update prize_stock
     set remaining = remaining - 1
   where id = 'main' and remaining > 0
  returning remaining into v_remaining;

  if v_remaining is null then
    -- 경품 소진. 게임 성공은 인정하되 당첨은 아니다 (요구사항 10.3).
    update participants set state = 'exhausted' where id = p_participant;
    return query select 'sold_out'::text, null::text;
    return;
  end if;

  -- 일련번호 생성. 혼동되는 글자(O,0,I,1,L)를 제외한다.
  v_serial := 'CHU-';
  for i in 1..8 loop
    v_serial := v_serial ||
      substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
  end loop;

  -- 당첨 기록. participant_id UNIQUE 위반이면 예외가 발생해
  -- 트랜잭션 전체가 롤백되고 재고도 복구된다 (요구사항 10.4).
  insert into winners (participant_id, attempt_id, serial)
  values (p_participant, p_attempt, v_serial);

  update participants
     set state = 'won', has_won = true
   where id = p_participant;

  return query select 'won'::text, v_serial;
end;
$$;

-- ============================================================
-- 공유 티켓 발급
-- ============================================================
--
-- exhausted 상태에서만 발급한다.
-- 발급 시점에 retry_pending으로 전이하므로, 대기 중 재호출해도
-- 새 티켓이 나오지 않는다 (요구사항 12.18).

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
     set state = 'retry_pending'
   where id = p_participant
     and has_won = false
     and state = 'exhausted';

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
-- 재도전 해제 (웹훅에서 호출)
-- ============================================================
--
-- 판정 순서가 중요하다 (설계 문서 "재도전 해제" 절):
--   1) 톡방 이력에 먼저 기록 → 새 톡방인지 판정
--   2) 티켓 단위 해제 → 한 공유에서 1회만
--   3) 상태 전이
--
-- 이 순서여야 새 톡방과 사용한 톡방을 섞어 보냈을 때
-- 새 톡방이 하나라도 있으면 해제된다 (요구사항 12.12).
--
-- 반환값:
--   'granted'    재도전 해제
--   'duplicate'  이미 사용한 톡방
--   'already'    이 공유는 이미 해제 처리됨
--   'rejected'   티켓 무효, 만료, 당첨자 등

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
  select t.participant_id, t.status, t.expires_at, p.has_won
    into v_participant, v_status, v_expires, v_has_won
  from share_tickets t
  join participants p on p.id = t.participant_id
  where t.id = p_ticket
  for update of t;

  if not found then
    return 'rejected';
  end if;

  if v_expires < now() then
    update share_tickets set status = 'expired' where id = p_ticket;
    return 'rejected';
  end if;

  -- 당첨자는 재도전을 얻을 수 없다 (요구사항 12.15)
  if v_has_won then
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

-- ============================================================
-- 공유 대기 타임아웃 처리
-- ============================================================

create or replace function expire_share_wait(p_participant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update share_tickets
     set status = 'expired'
   where participant_id = p_participant and status = 'pending';

  -- 대기를 종료하고 다시 공유할 수 있는 상태로 되돌린다 (요구사항 12.20)
  update participants
     set state = 'exhausted'
   where id = p_participant
     and state = 'retry_pending';
end;
$$;

-- ============================================================
-- 참여 가능 여부 조회
-- ============================================================

create or replace function get_play_state(p_participant uuid)
returns table (
  state text,
  has_won boolean,
  event_status text,
  needs_reset boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.state::text,
    p.has_won,
    event_window_status(),
    (p.state_date < today_kst() and p.has_won = false)
  from participants p
  where p.id = p_participant;
$$;
