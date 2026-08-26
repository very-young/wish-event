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
