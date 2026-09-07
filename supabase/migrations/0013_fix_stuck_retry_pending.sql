-- 공유 관련 두 가지 문제 수정
--
-- ============================================================
-- 문제 1 (심각): 정당한 공유가 무효가 된다
-- ============================================================
--
-- expire_share_wait가 유효한 티켓까지 만료시켰다. 그래서 이런 일이 생긴다.
--
--   1) 공유 버튼 → 티켓 발급 (5분 유효)
--   2) 카카오톡에서 친구를 고르는 중
--   3) 대기 화면이 60초 지나 시간 초과 → 티켓을 만료시킴
--   4) 참여자가 전송 완료
--   5) 카카오 웹훅 도착 → 티켓이 만료돼 거부
--   6) 참여자는 공유했는데 재도전이 열리지 않는다
--
-- 60초 안에 친구를 골라 보내지 못하면 무효가 됐다. 흔한 상황이다.
--
-- 수정: 아직 유효한 티켓은 건드리지 않는다. 화면 대기가 끝나도
--       티켓은 살려두어 늦게 도착한 전송도 인정한다.
--
-- ============================================================
-- 문제 2: 공유 대기 상태에 갇힌다
-- ============================================================
--
-- 티켓을 받은 뒤 전송하지 않고 이탈하면 retry_pending에 머물러
-- "지금은 재도전 공유를 할 수 없어요"만 나오고 다시 공유할 수 없었다.
--
-- 수정: 티켓을 발급할 때 만료된 대기를 먼저 정리한다.

-- ============================================================
-- 1) 대기 종료 시 유효한 티켓을 보존한다
-- ============================================================

create or replace function expire_share_wait(p_participant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  /*
   * 이미 만료 시각이 지난 티켓만 정리한다.
   *
   * ⚠️ 유효한 티켓을 만료시키면 참여자가 전송을 완료해도 재도전이
   *    열리지 않는다. 화면 대기(60초)보다 티켓 유효 시간(5분)이 길어
   *    그 사이에 전송을 마치는 경우가 많다.
   */
  update share_tickets
     set status = 'expired'::ticket_status
   where participant_id = p_participant
     and status = 'pending'::ticket_status
     and expires_at < now();

  /*
   * 상태도 유효한 티켓이 없을 때만 되돌린다.
   *
   * 유효한 티켓이 남아 있다면 아직 전송을 기다리는 중이다.
   * retry_pending을 유지해야 웹훅이 도착했을 때 정상 처리된다.
   */
  update participants
     set state = 'exhausted'::play_state
   where id = p_participant
     and state = 'retry_pending'::play_state
     and not exists (
       select 1 from share_tickets t
       where t.participant_id = p_participant
         and t.status = 'pending'::ticket_status
         and t.expires_at >= now()
     );
end;
$$;

-- ============================================================
-- 2) 티켓 발급 시 만료된 대기를 정리한다
-- ============================================================

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
  -- 만료된 티켓 정리
  update share_tickets
     set status = 'expired'::ticket_status
   where participant_id = p_participant
     and status = 'pending'::ticket_status
     and expires_at < now();

  /*
   * 유효한 티켓이 하나도 없는데 retry_pending에 머물러 있다면
   * 전송하지 않고 이탈한 것이다. 다시 공유할 수 있게 되돌린다.
   *
   * 진행 중인 공유는 건드리지 않는다.
   */
  update participants
     set state = 'exhausted'::play_state
   where id = p_participant
     and has_won = false
     and state = 'retry_pending'::play_state
     and not exists (
       select 1 from share_tickets t
       where t.participant_id = p_participant
         and t.status = 'pending'::ticket_status
         and t.expires_at >= now()
     );

  -- 원래 조건대로 발급
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
-- 3) 지금 갇혀 있는 참여자를 풀어준다
-- ============================================================

update share_tickets
   set status = 'expired'::ticket_status
 where status = 'pending'::ticket_status
   and expires_at < now();

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
