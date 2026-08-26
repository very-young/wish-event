/**
 * 표정 있는 달 캐릭터. (요구사항 1.1)
 * 시안의 CSS 달을 그대로 옮긴다. 인트로·당첨 발표 화면에서 재사용한다.
 */

export interface MoonCharacterProps {
  size: number;
  /** 부유 애니메이션 적용 여부 */
  float?: boolean;
  /** 분화구 표시 여부 */
  craters?: boolean;
  className?: string;
}

export function MoonCharacter({
  size,
  float = false,
  craters = false,
  className = "",
}: MoonCharacterProps) {
  return (
    <div
      className={`moon-char ${float ? "moon-float" : ""} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="웃고 있는 보름달"
    >
      {craters && (
        <>
          <span
            className="moon-crater"
            style={{ width: "13%", height: "13%", top: "24%", left: "26%" }}
          />
          <span
            className="moon-crater"
            style={{ width: "9%", height: "9%", top: "60%", left: "62%" }}
          />
          <span
            className="moon-crater"
            style={{ width: "6%", height: "6%", top: "38%", left: "70%" }}
          />
        </>
      )}
      <span className="moon-eye moon-eye-l" />
      <span className="moon-eye moon-eye-r" />
      <span className="moon-cheek moon-cheek-l" />
      <span className="moon-cheek moon-cheek-r" />
      <span className="moon-mouth" />
    </div>
  );
}
