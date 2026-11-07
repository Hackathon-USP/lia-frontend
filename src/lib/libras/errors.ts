export type LiaVisionErrorCode =
  | 'camera-unavailable' // navegador sem getUserMedia ou página fora de HTTPS/localhost
  | 'camera-denied' // a pessoa (ou a política do navegador) negou a permissão
  | 'camera-not-found' // nenhuma câmera conectada
  | 'camera-busy' // câmera em uso por outro programa
  | 'model-load-failed' // não foi possível carregar o WASM ou os modelos do MediaPipe
  | 'video-failed' // o vídeo não começou a tocar
  | 'processing-failed' // erro ao processar um quadro
  | 'video-decode-failed' // importação: o navegador não conseguiu abrir o vídeo
  | 'video-no-hands' // importação: nenhuma mão detectada no vídeo
  | 'video-no-segment'; // importação: a segmentação não achou nenhum sinal

export class LiaVisionError extends Error {
  readonly code: LiaVisionErrorCode;
  override readonly cause?: unknown;
  /** Informações extras (por exemplo, o relatório de uma importação que falhou). */
  readonly details?: unknown;

  constructor(code: LiaVisionErrorCode, message: string, cause?: unknown, details?: unknown) {
    super(message);
    this.name = 'LiaVisionError';
    this.code = code;
    this.cause = cause;
    this.details = details;
  }
}
