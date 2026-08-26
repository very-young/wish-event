"use client";

/**
 * 카카오 JS SDK 로드와 공유 호출. (요구사항 12.26~12.29)
 *
 * 두 종류의 공유가 있고 처리 경로가 다르다.
 *  - 재도전용: serverCallbackArgs에 티켓을 담는다 → 웹훅이 온다
 *  - 초대용:   serverCallbackArgs를 담지 않는다 → 웹훅이 오지 않는다
 *
 * serverCallbackArgs가 없으면 카카오가 웹훅을 보내지 않는다.
 * 이게 두 경로를 구분하는 가장 확실한 방법이다 (요구사항 12.25).
 */

import { INVITE_SHARE, RETRY_SHARE_CARD } from "@/content/copy";
import { SHARE_IMAGE_URL, SITE_URL } from "@/content/settings";

/**
 * 카카오 JS SDK.
 *
 * 도메인은 t1.kakaocdn.net 이다 (t1.kakao.com은 존재하지 않는다).
 * integrity 값은 실제 배포 파일에서 계산한 값이며, 버전을 올릴 때
 * 반드시 새로 계산해야 한다. 값이 틀리면 브라우저가 스크립트를 차단한다.
 */
const SDK_VERSION = "2.7.5";
const SDK_URL = `https://t1.kakaocdn.net/kakao_js_sdk/${SDK_VERSION}/kakao.min.js`;
const SDK_INTEGRITY =
  "sha384-dok87au0gKqJdxs7msEdBPNnKSRT+/mhTVzq+qOhcL464zXwvcrpjeWvyj1kCdq6";

interface KakaoLink {
  mobileWebUrl: string;
  webUrl: string;
}

interface KakaoShareParams {
  objectType: "feed";
  content: {
    title: string;
    description: string;
    imageUrl: string;
    link: KakaoLink;
  };
  buttons?: { title: string; link: KakaoLink }[];
  serverCallbackArgs?: Record<string, string>;
}

interface KakaoSDK {
  init(key: string): void;
  isInitialized(): boolean;
  Share: {
    sendDefault(params: KakaoShareParams): void;
  };
}

declare global {
  interface Window {
    Kakao?: KakaoSDK;
  }
}

let loadPromise: Promise<KakaoSDK> | null = null;

/** SDK를 로드하고 초기화한다. 여러 번 호출해도 한 번만 로드한다. */
export function loadKakao(): Promise<KakaoSDK> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<KakaoSDK>((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!key) {
      reject(new Error("카카오 JS 키가 설정되지 않았습니다"));
      return;
    }

    const finish = () => {
      const sdk = window.Kakao;
      if (!sdk) {
        reject(new Error("카카오 SDK를 불러오지 못했습니다"));
        return;
      }
      if (!sdk.isInitialized()) sdk.init(key);
      resolve(sdk);
    };

    if (window.Kakao) {
      finish();
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.integrity = SDK_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = finish;
    script.onerror = () => {
      // 원인을 구분할 수 있게 로그를 남긴다.
      // 흔한 원인: 잘못된 SDK 주소, integrity 불일치, 네트워크 차단
      console.error("[kakao] SDK 로드 실패", SDK_URL);
      reject(new Error("카카오 SDK 로드에 실패했습니다"));
    };
    document.head.appendChild(script);
  });

  // 실패하면 다음 시도에서 다시 로드할 수 있게 캐시를 비운다
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
}

function eventLink(): KakaoLink {
  // 공유 링크는 항상 인트로로 향한다 (요구사항 12.27)
  return { mobileWebUrl: SITE_URL, webUrl: SITE_URL };
}

/**
 * 재도전용 공유. 전송이 확인되면 웹훅으로 재도전이 열린다.
 *
 * @param ticketId 서버가 발급한 일회용 티켓
 */
export async function shareForRetry(ticketId: string): Promise<void> {
  const sdk = await loadKakao();
  const link = eventLink();

  sdk.Share.sendDefault({
    objectType: "feed",
    content: {
      title: RETRY_SHARE_CARD.title,
      description: RETRY_SHARE_CARD.description,
      imageUrl: SHARE_IMAGE_URL,
      link,
    },
    buttons: [{ title: RETRY_SHARE_CARD.button, link }],
    // 이 값이 있어야 카카오가 전송 성공 웹훅을 보낸다
    serverCallbackArgs: { ticket: ticketId },
  });
}

/**
 * 이벤트 초대용 공유. 재도전은 열리지 않는다.
 *
 * serverCallbackArgs를 담지 않으므로 웹훅이 오지 않는다.
 */
export async function shareInvite(nickname: string): Promise<void> {
  const sdk = await loadKakao();
  const link = eventLink();

  // 닉네임에 특수문자가 있어도 카드가 깨지지 않게 정리한다
  const safeNickname = nickname.replace(/[\r\n\t]/g, " ").slice(0, 20).trim();

  sdk.Share.sendDefault({
    objectType: "feed",
    content: {
      title: INVITE_SHARE.cardTitle.replace(
        "{nickname}",
        safeNickname || "친구",
      ),
      description: INVITE_SHARE.cardDescription,
      imageUrl: SHARE_IMAGE_URL,
      link,
    },
    buttons: [{ title: INVITE_SHARE.cardButton, link }],
    // serverCallbackArgs 없음 → 웹훅 없음 → 재도전 없음
  });
}
