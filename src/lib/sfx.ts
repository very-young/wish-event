/**
 * 효과음. (요구사항 9.2, 9.4, 9.5)
 *
 * 외부 음원 파일 없이 브라우저 내장 오디오로 소리를 만든다.
 * 시안의 Web Audio 코드를 그대로 옮긴다.
 *
 * 브라우저가 재생을 막으면 조용히 실패한다. 소리는 부가 요소이므로
 * 시각 연출만으로 진행되어야 한다 (요구사항 9.5).
 */

let ctx: AudioContext | null = null;

/** 오디오 컨텍스트를 준비한다. 사용자 조작 중에 호출해야 한다. */
export function primeAudio(): void {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // 오디오를 쓸 수 없는 환경. 무음으로 진행한다.
    ctx = null;
  }
}

function audio(): AudioContext | null {
  primeAudio();
  return ctx;
}

/** 점점 커지는 드럼롤 (요구사항 9.2) */
export function playDrumroll(durationMs: number): void {
  const ac = audio();
  if (!ac) return;

  try {
    const t0 = ac.currentTime;
    const hits = Math.floor(durationMs / 45);

    for (let i = 0; i < hits; i++) {
      const t = t0 + i * 0.045;

      // 짧은 노이즈 버스트 = 드럼 타격음
      const buf = ac.createBuffer(1, 441, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let j = 0; j < data.length; j++) {
        data[j] = (Math.random() * 2 - 1) * (1 - j / data.length) ** 2;
      }

      const src = ac.createBufferSource();
      src.buffer = buf;

      const gain = ac.createGain();
      // 점점 커지게 (crescendo)
      const vol = 0.1 + 0.18 * (i / hits);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      const bandpass = ac.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 220;

      src.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(ac.destination);
      src.start(t);
      src.stop(t + 0.06);
    }
  } catch {
    // 무음으로 진행
  }
}

/** 짜잔 효과음: 밝은 화음 + 심벌 (요구사항 9.3) */
export function playTada(): void {
  const ac = audio();
  if (!ac) return;

  try {
    const t = ac.currentTime;

    // 밝은 화음 (C-E-G-C)
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02 + i * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.95);
    });

    // 심벌 반짝임 (고역 노이즈)
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.7), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < data.length; j++) {
      data[j] = (Math.random() * 2 - 1) * (1 - j / data.length) ** 1.5;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6000;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(hp);
    hp.connect(gain);
    gain.connect(ac.destination);
    src.start(t);
    src.stop(t + 0.7);
  } catch {
    // 무음으로 진행
  }
}
