-- 테스트용 초기화 함수.
--
-- 테스트 중 당첨돼서 일련번호를 받으면 그 계정은 다시 참여할 수 없고
-- 번호도 하나 소모된다. 테스트를 반복하려면 되돌릴 수단이 필요하다.
--
-- ⚠️ 운영 중에는 쓰지 말 것. 실제 당첨자를 지우면 분쟁이 생긴다.

-- ============================================================
-- 한 사람의 당첨을 취소한다
-- ============================================================

/*
 * 지정한 참여자의 당첨을 취소하고 일련번호를 풀로 되돌린다.
 *
 * 되돌리는 것:
 *   - 당첨 기록 삭제
 *   - 일련번호를 미사용으로 복구 (같은 번호가 다음 당첨자에게 다시 나간다)
 *   - 참여 상태를 오늘 참여 가능으로 복구
 *   - 경품 재고 재계산
 *
 * 닉네임으로 찾는다. 같은 닉네임이 여러 명이면 모두 처리된다.
 */
create or replace function test_reset_winner(p_nickname text)
returns table (닉네임 text, 되돌린번호 text, 결과 text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_serial text;
begin
  for v_id in
    select id from participants where nickname = p_nickname
  loop
    -- 이 사람에게 나간 번호를 미사용으로 되돌린다
    update serial_pool
       set assigned_to = null, assigned_at = null
     where assigned_to = v_id
    returning serial into v_serial;

    delete from winners where participant_id = v_id;

    -- 오늘 다시 참여할 수 있는 상태로 되돌린다
    update participants
       set state = 'available'::play_state,
           has_won = false,
           state_date = today_kst()
     where id = v_id;

    /*
     * 공유 이력을 지워 같은 톡방으로 다시 시험할 수 있게 한다.
     * 참조하는 쪽부터 지운다.
     *   share_grants → share_tickets → attempts
     */
    delete from share_grants where participant_id = v_id;
    delete from share_tickets where participant_id = v_id;
    delete from used_chatrooms where participant_id = v_id;

    -- 지난 회차를 지워 결과 화면이 남지 않게 한다
    delete from attempts where participant_id = v_id;

    return query select p_nickname, coalesce(v_serial, '(없음)'), '초기화 완료'::text;
  end loop;

  -- 해당 닉네임이 없으면 알려준다
  if not found then
    return query select p_nickname, '(없음)'::text, '해당 닉네임을 찾지 못했습니다'::text;
  end if;

  -- 재고를 남은 번호 개수와 맞춘다
  update prize_stock
     set remaining = (select count(*) from serial_pool where assigned_to is null)
   where id = 'main';
end;
$$;

-- ============================================================
-- 전체 테스트 데이터 초기화
-- ============================================================

/*
 * 모든 당첨과 참여 기록을 지우고 번호 100개를 전부 미사용으로 되돌린다.
 * 참여자 계정(로그인 정보)은 남긴다.
 *
 * ⚠️ 이벤트 시작 전 마지막 정리에만 쓸 것.
 */
create or replace function test_reset_all()
returns table (항목 text, 개수 bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_winners bigint;
  v_attempts bigint;
begin
  select count(*) into v_winners from winners;
  select count(*) into v_attempts from attempts;

  delete from winners;
  delete from share_grants;
  delete from share_tickets;
  delete from used_chatrooms;
  delete from attempts;

  update serial_pool set assigned_to = null, assigned_at = null;

  update participants
     set state = 'available'::play_state,
         has_won = false,
         state_date = today_kst();

  update prize_stock
     set remaining = (select count(*) from serial_pool)
   where id = 'main';

  return query
    select '삭제된 당첨 기록'::text, v_winners
    union all
    select '삭제된 참여 기록'::text, v_attempts
    union all
    select '복구된 일련번호'::text, (select count(*) from serial_pool);
end;
$$;
