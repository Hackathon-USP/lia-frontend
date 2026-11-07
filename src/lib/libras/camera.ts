import { LiaVisionError } from './errors';

/** 720p a 30 fps, câmera frontal. São "ideais": o navegador usa o mais próximo disponível. */
export const DEFAULT_CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
  facingMode: 'user',
};

/** Abre a webcam (só vídeo, sem áudio). */
export async function openCamera(constraints: MediaTrackConstraints = DEFAULT_CAMERA_CONSTRAINTS): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new LiaVisionError(
      'camera-unavailable',
      'Este navegador não dá acesso à câmera. A página precisa estar em HTTPS ou em localhost.',
    );
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError')
      throw new LiaVisionError('camera-denied', 'A permissão para usar a câmera foi negada.', err);
    if (name === 'NotFoundError' || name === 'OverconstrainedError')
      throw new LiaVisionError('camera-not-found', 'Nenhuma câmera compatível foi encontrada.', err);
    if (name === 'NotReadableError' || name === 'AbortError')
      throw new LiaVisionError('camera-busy', 'A câmera está em uso por outro programa.', err);
    throw new LiaVisionError('camera-unavailable', 'Não foi possível abrir a câmera.', err);
  }
}
