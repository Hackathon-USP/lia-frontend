import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus =
  | "idle" // câmera desligada
  | "requesting" // esperando a pessoa permitir no navegador
  | "active" // vídeo rodando
  | "denied" // a pessoa (ou o navegador) negou a permissão
  | "not-found" // nenhum dispositivo de câmera
  | "busy" // câmera em uso por outro app
  | "unsupported" // navegador sem getUserMedia ou página sem HTTPS
  | "error";

const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: "user", // câmera frontal em celular/tablet/totem
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
};

function statusFromError(err: unknown): CameraStatus {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "not-found";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "error";
}

/**
 * Liga/desliga a câmera e entrega o vídeo num <video ref={videoRef}>.
 * O mesmo videoRef é o ponto de entrada para o reconhecimento de Libras
 * (ler os quadros do vídeo e mandar para o modelo).
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
      streamRef.current = stream;
      // Se a câmera for desconectada ou revogada no meio do uso.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => stop());
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStatus("active");
    } catch (err) {
      setStatus(statusFromError(err));
    }
  }, [stop]);

  // Desliga a câmera ao sair da página (a luz da câmera não fica acesa).
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { videoRef, status, start, stop, isActive: status === "active" };
}
