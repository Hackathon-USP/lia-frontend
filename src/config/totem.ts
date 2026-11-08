/**
 * Regras do totem que mais de um arquivo precisa conhecer:
 * tempos de sessão, sessão salva e o aviso de "a pessoa ainda está aqui".
 */

/** Depois da senha (ou da recusa), a tela volta ao início sozinha para o próximo paciente. */
export const RESTART_AFTER_END_MS = 60_000;
/** Sem interação por esse tempo, o totem pergunta "Você ainda está aqui?". */
export const IDLE_WARNING_MS = 180_000;
/** Sem resposta ao aviso, a tela é limpa. */
export const IDLE_RESET_MS = 210_000;
/** Segundos mostrados no aviso de inatividade. */
export const IDLE_COUNTDOWN_S = (IDLE_RESET_MS - IDLE_WARNING_MS) / 1000;

/** Tamanho máximo de uma resposta digitada. */
export const MAX_MESSAGE_LENGTH = 2000;

/* ---------- atividade do paciente ---------- */

const ACTIVITY_EVENT = "lia:activity";

/** Avisa o totem que o paciente interagiu (adia o aviso de inatividade). */
export function markActivity() {
  window.dispatchEvent(new Event(ACTIVITY_EVENT));
}

/** Escuta as interações do paciente. Devolve a função que para de escutar. */
export function onActivity(callback: () => void) {
  window.addEventListener(ACTIVITY_EVENT, callback);
  return () => window.removeEventListener(ACTIVITY_EVENT, callback);
}

/* ---------- atendimento salvo (retomar se a tela recarregar) ---------- */

const SESSION_STORAGE_KEY = "lia:atendimento";

export function readSavedSession(): number | null {
  try {
    const v = Number(window.sessionStorage.getItem(SESSION_STORAGE_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveSession(id: number) {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, String(id));
  } catch {
    /* sem armazenamento: só não retoma após recarregar */
  }
}

export function clearSavedSession() {
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* sem armazenamento */
  }
}
