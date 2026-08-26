import type { Metadata, Viewport } from "next";
import { Gowun_Batang, Gowun_Dodum } from "next/font/google";
import "./globals.css";

/*
 * 요구사항 14.7: 제목·본문은 명조 계열, 안내 문구는 고딕 계열.
 * 외부 CDN 지연을 피하기 위해 next/font로 셀프 호스팅한다.
 */
const gowunBatang = Gowun_Batang({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-gowun-batang",
  display: "swap",
});

const gowunDodum = Gowun_Dodum({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-gowun-dodum",
  display: "swap",
});

export const metadata: Metadata = {
  title: "달님에게 소원을 | 추석 소원 이벤트",
  description:
    "추석 보름달에 소원을 빌어보세요. 종이비행기를 접어 달님에게 날려 보내는 이벤트예요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${gowunBatang.variable} ${gowunDodum.variable}`}>
        {children}
      </body>
    </html>
  );
}
