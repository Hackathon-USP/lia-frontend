import type { RefObject } from "react";
import type { CameraStatus } from "@/hooks/useCamera";

export type PipSide = "left" | "right";

export const CAMERA_HINT: Partial<Record<CameraStatus, string>> = {
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
  handsVisible,
  recognitionLabel,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  status: CameraStatus;
  handsVisible: boolean;
  recognitionLabel?: string;
}) {
  const active = status === "active";
  const problem = !active && status !== "idle" && status !== "requesting";
  // Mesmo enquadramento no vídeo e no desenho das mãos (canvas também aceita object-fit).
  const media = "size-full -scale-x-100 object-cover";

  return (
    <figure
      className={`relative w-28 overflow-hidden rounded-xl bg-black shadow-sm ring-2 sm:w-36 md:w-44 ${
        handsVisible ? "ring-ambar" : "ring-white/25"
      }`}
    >
      {/* O <video> fica sempre montado para o ref existir quando o stream chegar. */}
      <div className={active ? "relative aspect-video" : "invisible absolute inset-0"}>
        <video ref={videoRef} autoPlay muted playsInline aria-label="Sua câmera" className={media} />
        <canvas ref={overlayRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 ${media}`} />
      </div>
      {active ? (
        <figcaption className="grid min-h-10 place-items-center px-2 py-1 text-center text-xs font-semibold text-white">
          <span role="status" className="line-clamp-2 wrap-anywhere">{recognitionLabel ?? "Você"}</span>
        </figcaption>
      ) : (
        <figcaption className="grid min-h-16 place-items-center px-2 py-1.5 text-center text-xs sm:min-h-20">
          <span role={problem ? "alert" : undefined} className={problem ? "text-red-300" : "text-white/85"}>{CAMERA_HINT[status]}</span>
        </figcaption>
      )}
    </figure>
  );
}
