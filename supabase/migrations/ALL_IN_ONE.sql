-- 추석 소원 이벤트: 전체 스키마 (3개 파일 합본)
-- Supabase SQL Editor에 이 파일 전체를 붙여넣고 Run 하세요.


-- ============================================================
-- 0001_init.sql
-- ============================================================

-- 추석 소원 이벤트: 초기 스키마
-- 설계 문서의 "Data Models" 절에 대응한다.
--
-- 핵심 원칙: 참여자는 아무것도 쓸 수 없다.
-- 모든 쓰기는 서비스 역할 키를 쓰는 서버 코드에서만 일어난다.

-- ============================================================
-- 참여자
-- ============================================================

-- 참여 상태 기계 (설계 문서 "기회 모델: 카운터가 아니라 상태 기계")
--   available     참여 가능
--   in_progress   게임 진행 중
--   exhausted     기회 소진 (공유하면 재도전 가능)
--   retry_pending 공유 후 전송 확인 대기
--   retry_ready   재도전 가능 (시작하면 즉시 소모)
--   won           당첨 완료 (이벤트 기간 내 추가 참여 불가)
create type play_state as enum (
  'available',
  'in_progress',
  'exhausted',
  'retry_pending',
  'retry_ready',
  'won'
);

create table participants (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '',
  state play_state not null default 'available',
  -- 상태 기준 날짜(KST). 이 값이 오늘보다 이전이면 자정 리셋 대상이다.
  state_date date not null default (now() at time zone 'Asia/Seoul')::date,
  has_won boolean not null default false,
  created_at timestamptz not null default now()
);

comment on column participants.state is
  '참여 상태. 정수 카운터가 아닌 상태 기계로 관리해 재도전 권리 쌓기를 구조적으로 차단한다.';
comment on column participants.has_won is
  '당첨 여부. true이면 이벤트 기간 내 추가 참여와 재도전 해제가 모두 차단된다.';

-- ============================================================
-- 참여 회차
-- ============================================================

create type attempt_status as enum (
  'in_progress',
  'success',
  'failed',
  'invalid'  -- 서버 재현 검증에서 조작이 의심된 경우
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  category text,
  wish_text text,
  -- 라운드별 seed. 서버가 발급하고 결과 재현 검증에 사용한다.
  round_seeds jsonb not null,
  status attempt_status not null default 'in_progress',
  reached_round smallint not null default 1,
  -- 결과 화면에 보여준 명소. 재열람 시 같은 명소가 나오게 한다.
  places_shown jsonb,
  -- 이 회차가 재도전으로 시작되었는지
  is_retry boolean not null default false,
  -- 운영자가 부적절한 소원을 숨길 때 사용 (요구사항 5.5)
  hidden_at timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index attempts_participant_idx on attempts (participant_id, started_at desc);

-- ============================================================
-- 공유 티켓
-- ============================================================

create type ticket_status as enum ('pending', 'consumed', 'expired');

create table share_tickets (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  attempt_id uuid references attempts (id) on delete set null,
  status ticket_status not null default 'pending',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index share_tickets_participant_idx on share_tickets (participant_id);

comment on table share_tickets is
  '카카오 공유 시 serverCallbackArgs에 담는 일회용 티켓. 참여자 ID를 직접 넣으면 위조 가능하므로 서버가 발급한 티켓으로 소유자를 특정한다.';

-- ============================================================
-- 사용한 톡방 (중복 공유 차단)
-- ============================================================

create table used_chatrooms (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  -- 카카오가 주는 채팅방 해시. 서비스별로 유일하며 개인정보가 아니다.
  chat_hash text not null,
  chat_type text,
  first_used_at timestamptz not null default now(),
  -- 같은 참여자가 같은 톡방을 재사용할 수 없게 한다 (요구사항 12.11)
  unique (participant_id, chat_hash)
);

comment on table used_chatrooms is
  '재도전 해제에 사용된 톡방 이력. 날짜별로 초기화하지 않는다 — 톡방 고갈은 당첨자 수를 억제하는 의도된 제약이다.';

-- ============================================================
-- 재도전 해제 기록
-- ============================================================

create table share_grants (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  -- 티켓 단위 유일 제약: 한 공유에서 여러 톡방으로 보내도 해제는 1회 (요구사항 12.8)
  ticket_id uuid not null unique references share_tickets (id) on delete cascade,
  granting_chat_hash text not null,
  granted_at timestamptz not null default now()
);

-- ============================================================
-- 당첨자
-- ============================================================

create table winners (
  id uuid primary key default gen_random_uuid(),
  -- 한 참여자는 한 번만 당첨된다
  participant_id uuid not null unique references participants (id) on delete cascade,
  attempt_id uuid not null references attempts (id) on delete cascade,
  -- 참여자가 네이버폼에 제출할 일련번호. 반드시 서버가 발급한다.
  serial text not null unique,
  won_at timestamptz not null default now()
);

comment on column winners.serial is
  '당첨 일련번호. 참여자가 네이버폼으로 제출하며, 운영자가 이 테이블과 대조해 진위를 확인한다.';

-- ============================================================
-- 경품 재고
-- ============================================================

create table prize_stock (
  id text primary key,
  total integer not null check (total >= 0),
  -- 음수가 될 수 없다. 동시 요청에서도 초과 당첨을 막는 마지막 방어선.
  remaining integer not null check (remaining >= 0)
);

-- 초기값. 실제 수량은 운영 단계에서 갱신한다 (작업 8.2).
insert into prize_stock (id, total, remaining) values ('main', 0, 0);

-- 참여자에게는 남은 수량 유무만 노출한다. 정확한 수를 보면 몰릴 수 있다.
create view prize_availability as
  select id, (remaining > 0) as available from prize_stock;

-- ============================================================
-- 금지어
-- ============================================================

create table moderation_blocks (
  id uuid primary key default gen_random_uuid(),
  pattern text not null unique,
  kind text not null default 'word',
  created_at timestamptz not null default now()
);


-- ============================================================
-- 0002_rls.sql
-- ============================================================

-- 행 수준 보안 정책 (요구사항 13.12, 13.13, 13.14)
--
-- 원칙: 참여자는 자기 행만 읽을 수 있고, 어떤 테이블에도 쓸 수 없다.
-- 쓰기는 서비스 역할 키를 쓰는 서버 코드에서만 일어난다.
-- (서비스 역할 키는 RLS를 우회하므로 별도 정책이 필요 없다.)
--
-- 이 구조 덕분에 "참여자가 자기 참여 상태나 당첨 여부를 직접 바꿀 수 없다"는
-- 요구사항이 애플리케이션 코드가 아니라 DB 레벨에서 보장된다.

alter table participants enable row level security;
alter table attempts enable row level security;
alter table share_tickets enable row level security;
alter table used_chatrooms enable row level security;
alter table share_grants enable row level security;
alter table winners enable row level security;
alter table prize_stock enable row level security;
alter table moderation_blocks enable row level security;

-- ------------------------------------------------------------
-- 읽기: 자기 행만
-- ------------------------------------------------------------

create policy participants_select_own on participants
  for select using (auth.uid() = id);

create policy attempts_select_own on attempts
  for select using (auth.uid() = participant_id);

create policy share_tickets_select_own on share_tickets
  for select using (auth.uid() = participant_id);

create policy used_chatrooms_select_own on used_chatrooms
  for select using (auth.uid() = participant_id);

create policy share_grants_select_own on share_grants
  for select using (auth.uid() = participant_id);

create policy winners_select_own on winners
  for select using (auth.uid() = participant_id);

-- ------------------------------------------------------------
-- 쓰기 정책 없음 = 전부 차단
-- ------------------------------------------------------------
--
-- INSERT/UPDATE/DELETE 정책을 만들지 않으면 RLS가 모두 거부한다.
-- 의도적으로 비워두는 것이므로 나중에 "정책이 없네" 하고 추가하지 말 것.

-- ------------------------------------------------------------
-- 경품 재고와 금지어: 참여자 접근 완전 차단
-- ------------------------------------------------------------
--
-- prize_stock에는 읽기 정책도 만들지 않는다.
-- 남은 수량 유무는 prize_availability 뷰로만 노출한다.

grant select on prize_availability to authenticated, anon;


-- ============================================================
-- 0003_functions.sql
-- ============================================================

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


