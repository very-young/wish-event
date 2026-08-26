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
