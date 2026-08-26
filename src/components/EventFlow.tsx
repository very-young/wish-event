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

import { useCallback, useEffect, useState } from "react";
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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  // ---------- 로그인 상태 확인 ----------

  useEffect(() => {
    const supabase = createClient();

    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setSignedIn(true);
      const meta = data.user.user_metadata ?? {};
      setNickname(
        (meta.name as string) ??
          (meta.nickname as string) ??
          "달빛 손님",
      );
    });

    // 로그인 콜백 결과를 처리한다 (요구사항 2.3)
    const params = new URLSearchParams(window.location.search);
    const login = params.get("login");

    if (login === "cancelled" || login === "failed") {
      // 다음 프레임으로 미뤄 렌더 중 상태 변경을 피한다
      window.setTimeout(
        () => showToast("로그인이 필요해요. 다시 시도해 주세요."),
        0,
      );
    }

    if (login === "ok") {
      // 로그인 성공 후 돌아온 경우 자동으로 다음 화면으로 진행한다
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
      setStep("fold");
    } finally {
      setBusy(false);
    }
  };

  // ---------- 게임 종료 ----------

  const handleGameEnd = useCallback(
    async (_clientSuccess: boolean, log: InputLog) => {
      if (!attemptId) return;

      /*
       * 클라이언트의 성공 주장은 참고하지 않는다.
       * 서버가 seed로 재현해 판정한 결과만 사용한다 (설계 결정 D1).
       */
      const result = await submitResult(attemptId, log);

      if (!result.ok) {
        showToast(COMMON.storeFailed);
        setWon(false);
        setStep("letter");
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

  const handleSaveImage = () => {
    // TODO(3.11): 결과 이미지 저장
    showToast("이미지 저장은 준비 중이에요.");
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
          onShareRetry={handleShareRetry}
          onShareInvite={handleShareInvite}
          onSaveImage={handleSaveImage}
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
