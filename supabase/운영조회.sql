-- ============================================================
-- 운영 중 확인용 쿼리 모음
-- ============================================================
--
-- 쓰는 방법
--   1) Supabase 대시보드 → SQL Editor 열기
--   2) 아래에서 보고 싶은 쿼리 한 덩어리만 복사해 붙여넣기
--   3) RUN
--
-- ⚠️ 파일 전체를 한 번에 실행하지 마세요.
--    쿼리가 여러 개라 마지막 결과만 보입니다. 한 덩어리씩 쓰는 파일입니다.
--
-- ⚠️ 이 파일의 쿼리는 모두 읽기만 합니다. 데이터를 바꾸지 않습니다.
--    (맨 아래 "테스트 정리" 항목만 예외이며, 따로 표시해 두었습니다.)
--
-- 준비: 따로 실행할 것이 없습니다. 필요한 함수는 모두 DB에 들어가 있습니다.
--       (2026-09-07 확인. scripts/verify-ops-queries.mjs로 다시 점검할 수 있습니다.)


-- ============================================================
-- 1. 일련번호 현황
-- ============================================================

-- 요약: 전체 몇 개 중 몇 개가 나갔고, 다음에 나갈 번호는 무엇인지
select * from serial_summary();

-- 200개 전체 목록. 지급된 번호에는 받은 사람 이름이 붙습니다.
select * from serial_status();

-- 나간 번호만 골라 보기
select seq as 순서, serial as 일련번호, 닉네임, 지급시각
from serial_status()
where 상태 = '지급됨';


-- ============================================================
-- 2. 참여 현황
-- ============================================================

-- 참여자 수, 라운드별 도달 수, 당첨자 수, 당첨률, 오늘 참여자 수
select * from event_stats();

-- 소원 유형별로 몇 명이 골랐고 몇 번 성공했는지
select * from event_stats_by_category();

-- 날짜별 참여 추이 (한국 시간 기준)
select * from event_stats_daily();


-- ============================================================
-- 3. 당첨자 명단
-- ============================================================

-- 당첨자와 받은 일련번호. 네이버폼 제출 내용과 대조할 때 씁니다.
select p.nickname   as 닉네임,
       w.serial     as 일련번호,
       w.won_at     as 당첨시각
from winners w
join participants p on p.id = w.participant_id
order by w.won_at;

-- 참여자가 제출한 일련번호가 진짜인지 확인
-- ('여기에-번호-입력' 자리에 확인할 번호를 넣으세요)
select p.nickname   as 닉네임,
       w.serial     as 일련번호,
       w.won_at     as 당첨시각
from winners w
join participants p on p.id = w.participant_id
where w.serial = '여기에-번호-입력';


-- ============================================================
-- 4. 경품 재고
-- ============================================================

-- 남은 수량. remaining이 0이면 게임은 되지만 당첨은 안 됩니다.
select total as 전체, remaining as 남음
from prize_stock
where id = 'main';


-- ============================================================
-- 5. 이벤트 기간
-- ============================================================

-- DB에 설정된 기간과 지금 열려 있는지 여부
-- (화면에 보이는 기간은 코드에 있고, 실제 차단은 이 값이 합니다)
select start_date            as 시작일,
       end_date              as 종료일,
       event_window_status() as 현재상태
from event_config
where id = 'main';
--   before = 아직 시작 전, open = 참여 가능, after = 종료됨


-- ============================================================
-- 6. 참여자 상태
-- ============================================================

-- 지금 누가 어떤 상태인지
select nickname   as 닉네임,
       state      as 상태,
       has_won    as 당첨여부,
       state_date as 기준날짜
from participants
order by state_date desc, nickname;
--   available     = 오늘 참여 가능
--   in_progress   = 게임 진행 중
--   exhausted     = 오늘 기회 다 씀 (공유하면 재도전 가능)
--   retry_pending = 공유하고 전송 확인을 기다리는 중
--   retry_ready   = 재도전 기회 있음
--   won           = 당첨 완료


-- ============================================================
-- 7. 문제 상황 점검
-- ============================================================

-- 게임 진행 중에 멈춰 있는 회차. 있으면 참여자가 다음 참여를 못 합니다.
-- 정상이면 결과가 비어 있습니다.
select p.nickname     as 닉네임,
       a.started_at   as 시작시각,
       a.reached_round as 도달라운드
from attempts a
join participants p on p.id = a.participant_id
where a.status = 'in_progress'
order by a.started_at;

-- 공유 전송 확인을 기다리는 채로 남아 있는 참여자.
-- 있어도 공유하기를 다시 누르면 풀립니다 (0013 적용 후).
select p.nickname   as 닉네임,
       p.state_date as 기준날짜
from participants p
where p.state = 'retry_pending'
  and p.has_won = false;

-- 최근 공유 티켓 상태
--   pending  = 전송 확인 대기 중
--   consumed = 전송 확인됨 (재도전 열림)
--   expired  = 시간이 지나 무효
select p.nickname                     as 닉네임,
       t.status                       as 상태,
       t.issued_at                    as 발급시각,
       (t.expires_at < now())         as 만료됨
from share_tickets t
join participants p on p.id = t.participant_id
order by t.issued_at desc
limit 20;


-- ============================================================
-- 7-2. 사람별 공유 현황
-- ============================================================
--
-- 공유하기를 몇 번 눌렀고, 그중 몇 번이 실제 전송으로 이어졌는지 봅니다.
-- 시도는 많은데 성공이 적으면 공유 과정에서 이탈하고 있다는 뜻입니다.
--
-- ⚠️ 누구에게 보냈는지는 알 수 없습니다. 카카오가 톡방을 알아볼 수 없는
--    문자열로 바꿔서 주기 때문입니다. "같은 방에 또 보냈나"만 판별합니다.

select p.nickname as 닉네임,
       (select count(*) from share_tickets t
         where t.participant_id = p.id)      as 공유시도,
       (select count(*) from share_grants g
         where g.participant_id = p.id)      as 전송성공,
       (select count(*) from used_chatrooms u
         where u.participant_id = p.id)      as 보낸톡방수
from participants p
order by 2 desc, p.nickname;

-- 전체 합계. 공유 시도 중 몇 %가 실제 전송까지 갔는지 봅니다.
select (select count(*) from share_tickets)  as 총공유시도,
       (select count(*) from share_grants)   as 총전송성공,
       round(100.0 * (select count(*) from share_grants)
                   / greatest((select count(*) from share_tickets), 1), 1)
                                             as 성공률퍼센트;

-- 단체방과 1:1 중 어디로 많이 보내는지
--   DirectChat = 1:1 대화, MultiChat = 단체방, Memo = 나와의 채팅
select chat_type as 톡방종류, count(*) as 건수
from used_chatrooms
group by chat_type
order by count(*) desc;


-- ============================================================
-- 8. 소원 내용 살펴보기
-- ============================================================

-- 참여자가 실제로 어떤 소원을 적었는지. 이상한 입력이 들어오는지 봅니다.
select p.nickname    as 닉네임,
       a.category    as 소원유형,
       a.wish_text   as 소원문구,
       a.status      as 결과,
       a.started_at  as 시각
from attempts a
join participants p on p.id = a.participant_id
where a.wish_text is not null
order by a.started_at desc
limit 30;


-- ============================================================
-- 9. AI 추천 상태
-- ============================================================

-- 명소가 몇 번씩 추천됐는지. 한 곳에 쏠리는지 봅니다.
select * from spot_count_status();

-- Gemini 호출 횟수와 토큰 사용량. 비용 확인용입니다.
select count(*)              as 호출횟수,
       sum(total_tokens)     as 총토큰,
       round(avg(total_tokens)) as 평균토큰,
       max(created_at)       as 최근호출
from gemini_usage;

-- 날짜별 Gemini 호출량 (한국 시간 기준)
select (created_at at time zone 'Asia/Seoul')::date as 날짜,
       count(*)                                     as 호출횟수,
       sum(total_tokens)                            as 총토큰
from gemini_usage
group by 1
order by 1 desc;


-- ============================================================
-- 10. 테스트 정리 (⚠️ 데이터를 지웁니다)
-- ============================================================
--
-- ⚠️ 아래는 읽기가 아니라 삭제입니다. 오픈 직전에 한 번만 쓰세요.
--    한 번 지우면 되돌릴 수 없습니다.
--
-- 준비: supabase/migrations/0009_test_reset.sql을 한 번 실행해 두어야 합니다.

-- (가) 한 사람만 되돌리기.
--     테스트 중에 당첨된 계정 하나만 취소할 때 씁니다.
--     닉네임 자리를 바꿔 넣으세요.
--
-- select * from test_reset_winner('닉네임');

-- (나) 전부 되돌리기. 오픈 직전 마지막 정리용입니다.
--     당첨 기록과 회차가 지워지고 일련번호가 1번부터 다시 나갑니다.
--
-- select * from test_reset_all();
-- select * from serial_status();   -- 지워졌는지 확인

-- 위 두 개는 앞의 '--'를 지워야 실행됩니다. 실수로 돌아가지 않게 막아둔 것입니다.
--
-- (터미널을 쓸 수 있다면 node scripts/reset-winner.mjs --all 도 같은 일을 합니다)
