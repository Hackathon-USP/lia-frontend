import { useRef } from "react";
import { CAMERA_HINT } from "@/components/call/CameraPip";
import { SignTrainer } from "@/components/call/SignTrainer";
import { btn } from "@/components/recepcao/estilos";
import { useCamera } from "@/hooks/useCamera";
import { useSignRecognition } from "@/hooks/useSignRecognition";
import type { LiaVision } from "@/lib/libras";

interface Props {
  engine: LiaVision | null;
  engineError: string | null;
  onClose: () => void;
}

export function CameraSignTrainer({ engine, engineError, onClose }: Props) {
  const { videoRef, status: cameraStatus, start, stop, isActive } = useCamera();
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const signs = useSignRecognition({
    videoRef,
    overlayRef,
    enabled: isActive,
    captureEngine: engine,
    onPhrase: () => {},
  });
  const cameraReady = isActive && signs.status === "ready";
  const requesting = cameraStatus === "requesting";
  const modelError = engineError || signs.status === "error";
  const status = modelError
    ? "Não foi possível carregar a leitura das mãos. Recarregue a página para tentar de novo."
    : isActive
      ? cameraReady
        ? signs.handsVisible ? "Mãos visíveis" : "Posicione as mãos e os ombros no quadro."
        : "Carregando a leitura das mãos…"
      : CAMERA_HINT[cameraStatus];

  return (
    <SignTrainer
      {...signs}
      open
      onClose={onClose}
      cameraReady={cameraReady}
      cameraPreview={
        <div className="space-y-2 rounded-2xl border border-white/15 p-2 sm:p-3">
          <div hidden={!isActive} className="relative h-[min(22dvh,12rem)] overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              aria-label="Prévia da sua câmera"
              className="size-full -scale-x-100 object-contain"
            />
            <canvas ref={overlayRef} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full -scale-x-100 object-contain" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="min-w-0 flex-1 text-sm text-white/90">{status}</p>
            <button
              type="button"
              onClick={isActive ? stop : () => void start()}
              disabled={requesting || signs.recording !== null || (!!engineError && !isActive)}
              className={`${btn} bg-white/15 hover:bg-white/25`}
            >
              {isActive ? "Desligar câmera" : "Ligar câmera"}
            </button>
          </div>
        </div>
      }
    />
  );
}
