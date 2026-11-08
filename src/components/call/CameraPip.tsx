import type { RefObject } from "react";
import type { CameraStatus } from "@/hooks/useCamera";

export type PipSide = "left" | "right";

const HINT: Partial<Record<CameraStatus, string>> = {
  idle: "Câmera desligada",
  requesting: "Permita a câmera no navegador",
  denied: "Câmera bloqueada. Libere no cadeado ao lado do endereço.",
  "not-found": "Nenhuma câmera encontrada",
  busy: "Câmera em uso por outro programa",
  unsupported: "Navegador sem acesso à câmera (use https)",
  error: "Não foi possível ligar a câmera",
};

/** Sua imagem, pequena, no canto superior da chamada, com as mãos detectadas desenhadas por cima. */
export function CameraPip({
  videoRef,
  overlayRef,
  status,
  side,
  handsVisible,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  status: CameraStatus;
  side: PipSide;
  handsVisible: boolean;
}) {
  const active = status === "active";
  const problem = !active && status !== "idle" && status !== "requesting";
  // Mesmo enquadramento no vídeo e no desenho das mãos (canvas também aceita object-fit).
  const media = "aspect-video w-full -scale-x-100 object-cover sm:aspect-video";

  return (
    <figure
      className={`absolute top-4 z-20 w-36 overflow-hidden rounded-2xl bg-black shadow-2xl ring-2 sm:top-6 sm:w-40 md:w-44 ${
        handsVisible ? "ring-ambar" : "ring-white/25"
      } ${side === "right" ? "right-4 sm:right-6" : "left-4 sm:left-6"}`}
    >
      {/* O <video> fica sempre montado para o ref existir quando o stream chegar. */}
      <video ref={videoRef} autoPlay muted playsInline aria-label="Sua câmera" className={`${media} ${active ? "" : "invisible"}`} />
      <canvas ref={overlayRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full ${media}`} />
      {!active && (
        <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs sm:text-sm">
          <p role={problem ? "alert" : undefined} className={problem ? "text-red-300" : "text-white/85"}>
            {HINT[status]}
          </p>
        </div>
      )}
      <figcaption className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold text-white sm:text-sm">
        Você{handsVisible ? " · mãos visíveis" : ""}
      </figcaption>
    </figure>
  );
}
