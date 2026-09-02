"use client";

/**
 * 참여 플로우 전체. 화면 전환과 상태를 관리한다.
 *
 * 판정은 모두 서버가 한다. 이 컴포넌트는 서버 응답에 따라
 * 화면을 보여주는 역할만 한다.
 *
 * 결과 화면을 별도 URL로 만들지 않고 같은 경로에서 화면만 전환한다.
 * 공유 링크에 남의 결과가 실릴 여지를 없애기 위한 구조다 (요구사항 1.8).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StarField } from "./StarField";
import { GameCanvas } from "./GameCanvas";
import { ShareWaitOverlay } from "./ShareWaitOverlay";
import { IntroScreen } from "./screens/IntroScreen";
import { CategoryScreen } from "./screens/CategoryScreen";
import { WriteScreen } from "./screens/WriteScreen";
import { FoldScreen } from "./screens/FoldScreen";
import { CelebrateScreen } from "./screens/CelebrateScreen";
import { LetterScreen } from "./screens/LetterScreen";
import { BlockedScreen } from "./screens/BlockedScreen";
import type { CategoryId, Place } from "@/content/categories";
import { BLOCKED, COMMON, MODERATION, PRIVACY, RETRY_SHARE } from "@/content/copy";
import type { InputLog } from "@/game/replay";
import { primeAudio } from "@/lib/sfx";
import { loadKakao, shareForRetry, shareInvite } from "@/lib/kakao";
import { createClient } from "@/lib/supabase/client";
import { useRecommendation } from "@/lib/use-recommendation";
import {
  getLastAttempt,
  getPlayState,
  issueShareTicket,
  startAttempt,
  submitResult,
  submitWish,
} from "@/app/actions";

type Step =
  | "intro"
  | "blocked"
  | "category"
  | "write"
  | "fold"
  | "game"
  | "celebrate"
  | "letter";

interface BlockInfo {
  title: string;
  body: string;
}

export function EventFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [busy, setBusy] = useState(false);
  const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null);

  const [signedIn, setSignedIn] = useState(false);
  const [nickname, setNickname] = useState("");
  /** 로그인 콜백으로 돌아온 직후인지. 자동으로 다음 화면으로 넘긴다. */
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  /**
   * 이미 로그인된 상태로 재방문했는지.
   *
   * 참여를 마친 사람만 결과 화면으로 되돌려보낸다.
   * 아직 기회가 남은 사람은 인트로에 그대로 둔다.
   */
  const [shouldResume, setShouldResume] = useState(false);

  const [category, setCategory] = useState<CategoryId | null>(null);
  const [wish, setWish] = useState("");

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [seeds, setSeeds] = useState<number[] | null>(null);
  const [gameKey, setGameKey] = useState(0);

  const [won, setWon] = useState(false);
  const [prizeSoldOut, setPrizeSoldOut] = useState(false);
  const [serial, setSerial] = useState<string | null>(null);
  /** 서버가 확정한 추천 명소. 재열람 시 같은 명소를 보여주기 위해 사용한다. */
  const [places, setPlaces] = useState<readonly Place[] | undefined>();

  const [waitingShare, setWaitingShare] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  /*
   * AI 추천. 종이접기 시점에 요청을 시작해 게임하는 동안 뒤에서 생성한다.
   * 결과는 편지 화면에서 쓴다.
   */
  const recommendation = useRecommendation();
  /*
   * restore를 콜백에서 쓰기 위해 ref에 담는다.
   *
   * recommendation 객체를 의존성에 직접 넣으면 렌더마다 값이 바뀌어
   * showLastResult가 매번 새로 만들어지고, 그것을 의존하는 효과가
   * 반복 실행된다. restore 자체는 useCallback으로 고정돼 있다.
   */
  const restoreRef = useRef(recommendation.restore);
  useEffect(() => {
    restoreRef.current = recommendation.restore;
  }, [recommendation.restore]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  // ---------- 로그인 상태 확인 ----------

  useEffect(() => {
    const supabase = createClient();

    // 로그인 콜백 결과를 먼저 읽는다 (요구사항 2.3)
    const params = new URLSearchParams(window.location.search);
    const login = params.get("login");

    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setSignedIn(true);
      const meta = data.user.user_metadata ?? {};
      setNickname(
        (meta.name as string) ??
          (meta.nickname as string) ??
          "달빛 손님",
      );

      /*
       * 로그인 콜백으로 온 것이 아니라 이미 로그인된 채로 재방문한 경우다.
       *
       * 카카오는 한 번 동의하면 다음부터 동의 화면 없이 즉시 되돌려보내고,
       * 세션이 남아 있으면 로그인 절차 자체가 생략된다. 그때는 주소창에
       * login=ok가 붙지 않아서 아무 처리도 일어나지 않았다.
       * 사용자에게는 "눌렀는데 반응이 없다"로 보였다.
       *
       * 참여를 마친 사람은 결과 화면으로 되돌려보낸다 (요구사항 13.9, 13.10).
       */
      if (login !== "ok") setShouldResume(true);
    });

    if (login === "cancelled" || login === "failed") {
      // 다음 프레임으로 미뤄 렌더 중 상태 변경을 피한다
      window.setTimeout(
        () => showToast("로그인이 필요해요. 다시 시도해 주세요."),
        0,
      );
    }

    if (login === "ok") {
      // 로그인 직후에는 소원 작성까지 자동으로 이어준다
      window.setTimeout(() => setJustLoggedIn(true), 0);
    }

    if (login) {
      // 주소창을 정리해 새로고침 시 다시 뜨지 않게 한다
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [showToast]);

  // ---------- 참여 차단 안내 ----------

  const showBlocked = (state: string | undefined, eventStatus?: string) => {
    if (eventStatus === "before") setBlockInfo(BLOCKED.beforeEvent);
    else if (eventStatus === "after") setBlockInfo(BLOCKED.afterEvent);
    else if (state === "won") setBlockInfo(BLOCKED.alreadyWon);
    else setBlockInfo(BLOCKED.noChance);
    setStep("blocked");
  };

  // ---------- 시작 ----------

  /**
   * 참여 가능 여부를 서버에 확인하고 다음 화면으로 넘긴다.
   * 로그인 버튼과 로그인 콜백 자동 진행에서 함께 사용한다.
   */
  /**
   * 지난 회차 결과를 불러와 결과 화면으로 보낸다.
   *
   * 기회를 다 쓴 참여자에게 막다른 안내만 보여주면 공유로 재도전을
   * 열 방법이 없다. 결과 화면을 다시 보여줘야 거기서 공유할 수 있다.
   */
  const showLastResult = useCallback(async (): Promise<boolean> => {
    const last = await getLastAttempt();
    if (!last.ok || !last.attempt) return false;

    const a = last.attempt;
    setAttemptId(a.attemptId);
    if (a.category) setCategory(a.category as CategoryId);
    if (a.wishText) setWish(a.wishText);
    setWon(a.status === "success");
    // 성공했는데 일련번호가 없으면 경품 소진으로 성공한 경우다
    setPrizeSoldOut(a.status === "success" && !a.serial);
    setSerial(a.serial);
    if (Array.isArray(a.places)) setPlaces(a.places as Place[]);

    /*
     * 저장해 둔 AI 결과를 되살린다.
     *
     * 이 처리가 없으면 재접속했을 때 답장과 명소가 사라진다.
     * Gemini를 다시 부르지 않는다 — 매번 다른 결과가 나오면
     * 참여자에게는 "내 결과가 바뀌었다"로 보인다.
     */
    restoreRef.current({
      attemptId: a.attemptId,
      letter: a.aiLetter,
      picks: a.aiPicks,
      status: a.aiStatus,
    });

    setStep("letter");
    return true;
  }, []);

  const proceedToCategory = useCallback(async () => {
    setBusy(true);
    try {
      const state = await getPlayState();
      if (!state.ok) {
        showToast("상태를 확인할 수 없어요. 다시 시도해 주세요.");
        return;
      }
      if (state.eventStatus !== "open") {
        showBlocked(state.state, state.eventStatus);
        return;
      }
      if (state.hasWon) {
        // 당첨자는 결과와 일련번호를 다시 볼 수 있어야 한다 (요구사항 13.9)
        const shown = await showLastResult();
        if (!shown) showBlocked("won");
        return;
      }
      if (state.state !== "available" && state.state !== "retry_ready") {
        /*
         * 기회를 다 쓴 상태라면 지난 결과를 보여준다.
         * 그 화면에서 공유해 재도전을 열 수 있다 (요구사항 12.1).
         */
        const shown = await showLastResult();
        if (!shown) showBlocked(state.state);
        return;
      }
      setStep("category");
    } finally {
      setBusy(false);
    }
  }, [showToast, showLastResult]);

  const handleStart = async () => {
    if (busy) return;
    // 오디오는 사용자 조작 중에 준비해야 나중에 재생이 막히지 않는다
    primeAudio();

    if (!signedIn) {
      // 카카오 로그인으로 이동 (요구사항 2.1, 2.4)
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          /*
           * 닉네임만 요청한다 (요구사항 2.4).
           *
           * 프로필 사진은 화면에서 쓰지 않으므로 요청하지 않는다.
           * 친구 목록은 비즈 앱 심사가 필요하고, 공유창은 카카오가
           * 직접 띄우므로 우리가 친구 목록에 접근할 이유가 없다.
           */
          scopes: "profile_nickname",
        },
      });
      if (error) showToast("로그인을 시작할 수 없어요. 다시 시도해 주세요.");
      return;
    }

    await proceedToCategory();
  };

  /*
   * 로그인 콜백으로 돌아온 직후에는 버튼을 다시 누르지 않아도
   * 바로 다음 화면으로 넘긴다.
   *
   * 이 처리가 없으면 사용자는 "로그인 눌렀는데 다시 시작 버튼이 뜬다"고
   * 느껴 오류로 오해한다.
   */
  useEffect(() => {
    if (!justLoggedIn || !signedIn) return;

    // 다음 프레임으로 미뤄 렌더 중 상태 변경을 피한다
    const t = window.setTimeout(() => {
      setJustLoggedIn(false);
      primeAudio();
      void proceedToCategory();
    }, 0);

    return () => window.clearTimeout(t);
  }, [justLoggedIn, signedIn, proceedToCategory]);

  /*
   * 이미 로그인된 상태로 다시 들어온 경우, 참여를 마친 사람은
   * 지난 결과 화면으로 되돌려보낸다.
   *
   * 당첨자는 일련번호를 다시 확인해야 하고(요구사항 13.9),
   * 기회를 다 쓴 사람은 그 화면에서 공유해 재도전을 열어야 한다
   * (요구사항 12.1). 인트로에 머물면 둘 다 불가능하다.
   *
   * 아직 기회가 남은 사람은 건드리지 않는다. 인트로에서 시작해야 한다.
   */
  useEffect(() => {
    if (!shouldResume || !signedIn) return;

    let cancelled = false;
    void (async () => {
      const state = await getPlayState();
      if (cancelled || !state.ok) return;
      // 이벤트 기간이 아니면 시작 시점에 안내하므로 여기서는 두고 본다
      if (state.eventStatus !== "open") return;
      // 아직 참여할 수 있으면 인트로에 머문다
      if (
        !state.hasWon &&
        (state.state === "available" || state.state === "retry_ready")
      ) {
        return;
      }
      await showLastResult();
    })();

    return () => {
      cancelled = true;
    };
    // shouldResume은 한 번 켜지면 다시 꺼지지 않으므로 이 효과는 한 번만 돈다
  }, [shouldResume, signedIn, showLastResult]);

  // ---------- 소원 제출 후 게임 시작 ----------

  const handleWishSubmit = async () => {
    if (busy || !category) return;
    setBusy(true);
    try {
      // 참여 권리를 소모하고 seed를 받는다 (요구사항 13.3)
      const start = await startAttempt();
      if (!start.ok) {
        if (start.reason === "blocked") showBlocked(start.state);
        else if (start.reason === "unauthenticated")
          showToast("로그인이 필요해요.");
        else showToast("참여를 시작할 수 없어요. 다시 시도해 주세요.");
        return;
      }

      // 서버가 소원 문구를 다시 검사한다 (요구사항 5.1)
      const submitted = await submitWish(start.attemptId, category, wish);
      if (!submitted.ok) {
        if (submitted.reason === "rejected") {
          showToast(
            submitted.detail === "personalInfo"
              ? MODERATION.personalInfo
              : submitted.detail === "notAWish"
                ? MODERATION.notAWish
                : MODERATION.bannedWord,
          );
        } else {
          showToast("소원을 저장할 수 없어요. 다시 시도해 주세요.");
        }
        return;
      }

      setAttemptId(start.attemptId);
      setSeeds(start.roundSeeds);
      setGameKey((k) => k + 1);

      /*
       * AI 추천을 여기서 시작한다 (종이접기 진입 시점).
       * 접기 5단계와 게임 3라운드를 하는 동안 뒤에서 생성되므로
       * 결과 화면에서 기다리는 일이 거의 없다.
       */
      recommendation.start(start.attemptId);

      setStep("fold");
    } finally {
      setBusy(false);
    }
  };

  // ---------- 게임 종료 ----------

  const handleGameEnd = useCallback(
    async (clientSuccess: boolean, log: InputLog) => {
      /**
       * 서버 통신이 실패했을 때의 처리.
       *
       * ⚠️ 통신 실패를 게임 실패로 바꿔서는 안 된다.
       *    라운드 3을 깼는데 네트워크 문제로 실패 화면을 보게 되면
       *    참여자에게는 명백한 오류다.
       *
       * 화면에서는 성공을 인정하되, 경품은 서버가 확정하지 못했으므로
       * 지급하지 않는다(소진 경로와 동일하게 처리). 저장 실패도 알린다.
       */
      const fallbackToClientResult = () => {
        showToast(COMMON.storeFailed);
        setWon(clientSuccess);
        setPrizeSoldOut(clientSuccess); // 경품 확정 불가 → 소진과 같은 안내
        setSerial(null);
        setStep(clientSuccess ? "celebrate" : "letter");
      };

      if (!attemptId) {
        console.error("[game] attemptId 없이 게임이 끝났습니다");
        fallbackToClientResult();
        return;
      }

      /*
       * 클라이언트의 성공 주장은 경품 지급 근거로 쓰지 않는다.
       * 서버가 seed로 재현해 판정한 결과만 신뢰한다 (설계 결정 D1).
       */
      let result;
      try {
        result = await submitResult(attemptId, log);
      } catch (e) {
        console.error("[game] 결과 제출 중 오류", e);
        fallbackToClientResult();
        return;
      }

      if (!result.ok) {
        console.error("[game] 결과 제출 거부", result.reason);
        fallbackToClientResult();
        return;
      }

      if (result.outcome === "won") {
        setWon(true);
        setPrizeSoldOut(false);
        setSerial(result.serial);
        setStep("celebrate");
      } else if (result.outcome === "soldOut") {
        setWon(true);
        setPrizeSoldOut(true);
        setSerial(null);
        setStep("celebrate");
      } else {
        setWon(false);
        setPrizeSoldOut(false);
        setSerial(null);
        setStep("letter");
      }
    },
    [attemptId, showToast],
  );

  // ---------- 재도전용 공유 ----------

  const handleShareRetry = async () => {
    if (busy || !attemptId) return;
    setBusy(true);
    try {
      // SDK를 먼저 확인한다. 없으면 티켓을 낭비하지 않는다.
      try {
        await loadKakao();
      } catch (e) {
        // 원인 파악을 위해 콘솔에 남긴다
        console.error("[share] 카카오 SDK 준비 실패", e);
        showToast(RETRY_SHARE.unavailable);
        return;
      }

      const ticket = await issueShareTicket(attemptId);
      if (!ticket.ok) {
        showToast(
          ticket.reason === "notAllowed"
            ? "지금은 재도전 공유를 할 수 없어요."
            : "공유를 준비할 수 없어요. 다시 시도해 주세요.",
        );
        return;
      }

      await shareForRetry(ticket.ticketId);
      // 전송 완료 확인을 기다린다 (요구사항 12.4)
      setWaitingShare(true);
    } catch {
      showToast(RETRY_SHARE.failed);
    } finally {
      setBusy(false);
    }
  };

  const handleShareGranted = useCallback(() => {
    setWaitingShare(false);
    showToast(RETRY_SHARE.granted);

    /*
     * 재도전은 소원 유형과 문구를 유지하고 접기 단계를 건너뛰어
     * 발사 화면부터 시작한다 (요구사항 12.19).
     * 이미 접은 비행기를 다시 접게 하면 지루해진다.
     */
    void (async () => {
      const start = await startAttempt();
      if (!start.ok) {
        showToast("재도전을 시작할 수 없어요.");
        return;
      }

      // 새 회차에도 소원을 다시 저장한다.
      // 회차마다 소원이 기록되어야 결과 화면에서 명소를 보여줄 수 있다.
      if (category) {
        await submitWish(start.attemptId, category, wish);
      }

      setAttemptId(start.attemptId);
      setSeeds(start.roundSeeds);
      setGameKey((k) => k + 1);
      setWon(false);
      setSerial(null);
      setPrizeSoldOut(false);
      setStep("game");
    })();
  }, [showToast, category, wish]);

  const handleShareCancel = useCallback(
    (reason: "timeout" | "closed") => {
      setWaitingShare(false);
      if (reason === "timeout") showToast(RETRY_SHARE.timeout);
    },
    [showToast],
  );

  // ---------- 초대용 공유 ----------

  const handleShareInvite = async () => {
    try {
      await shareInvite(nickname);
    } catch {
      showToast(RETRY_SHARE.unavailable);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setSignedIn(false);
    setNickname("");
    setStep("intro");
    router.refresh();
  };

  return (
    <main className="stage">
      <StarField />

      <IntroScreen
        active={step === "intro"}
        // 로그인 직후 자동 진행 중에도 버튼을 잠가 중복 클릭을 막는다
        busy={busy || justLoggedIn}
        signedIn={signedIn}
        onStart={handleStart}
        onOpenPrivacy={() => setShowPrivacy(true)}
        onLogout={signedIn ? handleLogout : undefined}
      />

      {step === "blocked" && blockInfo && (
        <BlockedScreen
          title={blockInfo.title}
          body={blockInfo.body}
          onBack={() => setStep("intro")}
        />
      )}

      <CategoryScreen
        active={step === "category"}
        selected={category}
        onSelect={setCategory}
        onNext={() => setStep("write")}
      />

      <WriteScreen
        active={step === "write"}
        category={category}
        value={wish}
        busy={busy}
        onChange={setWish}
        onNext={handleWishSubmit}
      />

      {step === "fold" && <FoldScreen onComplete={() => setStep("game")} />}

      {step === "game" && seeds && (
        <section className="screen" data-active="true" style={{ padding: 0 }}>
          <GameCanvas
            key={gameKey}
            roundSeeds={seeds}
            onEnd={handleGameEnd}
          />
        </section>
      )}

      {step === "celebrate" && (
        <CelebrateScreen
          prizeSoldOut={prizeSoldOut}
          onNext={() => setStep("letter")}
        />
      )}

      {step === "letter" && (
        <LetterScreen
          category={category}
          won={won}
          prizeSoldOut={prizeSoldOut}
          places={places}
          serial={serial}
          // 달님 답장과 명소 3곳은 AI가 소원을 읽고 만든 것을 쓴다
          aiState={recommendation.state}
          aiLetter={recommendation.data?.letter}
          aiPicks={recommendation.data?.picks}
          onWaitStart={recommendation.beginWaiting}
          onAiRetry={recommendation.retry}
          onShareRetry={handleShareRetry}
          onShareInvite={handleShareInvite}
          onNotify={showToast}
        />
      )}

      {waitingShare && (
        <ShareWaitOverlay
          onGranted={handleShareGranted}
          onCancel={handleShareCancel}
        />
      )}

      {showPrivacy && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={PRIVACY.linkLabel}
        >
          <div className="modal-card">
            <h2 className="title-md">{PRIVACY.linkLabel}</h2>
            <p className="lead" style={{ marginTop: 14 }}>
              {PRIVACY.body}
            </p>
            <button
              type="button"
              className="btn ghost"
              style={{ marginTop: 20 }}
              onClick={() => setShowPrivacy(false)}
            >
              {COMMON.close}
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
