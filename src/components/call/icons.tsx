import type { ReactNode } from "react";

/* Ícones de traço da chamada (decorativos: o texto do botão é que descreve a ação). */

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="size-6">
      {children}
    </svg>
  );
}

export const IconCamera = () => (
  <Svg>
    <rect x="2" y="6" width="14" height="12" rx="2" />
    <path d="m22 8-6 4 6 4V8z" />
  </Svg>
);
export const IconCameraOff = () => (
  <Svg>
    <path d="M10.7 6H14a2 2 0 0 1 2 2v3.3l1 1L22 8v8" />
    <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
    <path d="m2 2 20 20" />
  </Svg>
);
export const IconSwap = () => (
  <Svg>
    <path d="m16 3 4 4-4 4M20 7H4" />
    <path d="m8 21-4-4 4-4M4 17h16" />
  </Svg>
);
export const IconHand = () => (
  <Svg>
    <path d="M18 11V6a2 2 0 0 0-4 0v5" />
    <path d="M14 10V4a2 2 0 0 0-4 0v6" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" />
  </Svg>
);
export const IconVoiceOn = () => (
  <Svg>
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 5a10 10 0 0 1 0 14" />
  </Svg>
);
export const IconVoiceOff = () => (
  <Svg>
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="m22 9-6 6M16 9l6 6" />
  </Svg>
);
export const IconMic = () => (
  <Svg>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
  </Svg>
);
export const IconMicOff = () => (
  <Svg>
    <path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5 2.2" />
    <path d="M19 10a7 7 0 0 1-1.1 3.8M5 10a7 7 0 0 0 11.4 5.4M12 17v5M8 22h8" />
    <path d="m2 2 20 20" />
  </Svg>
);
export const IconSend = () => (
  <Svg>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </Svg>
);
export const IconEnd = () => (
  <Svg>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
