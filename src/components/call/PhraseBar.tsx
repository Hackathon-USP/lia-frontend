import type { PatientInput } from "@/hooks/usePatientInput";
import { pillBtn } from "./styles";

type Signs = PatientInput["signs"];

const SPELL_HINT: Record<string, string> = {
  "sem-mao": "Levante a mão acima da cintura.",
  movendo: "Forme a letra…",
  segurando: "Segure…",
  solte: "Mude a mão para a próxima letra (ou deslize para repetir).",
};

/** Orientação para quem ainda não sinalizou nada. */
function readingHint(signs: Signs, spelling: boolean) {
  if (signs.status === "loading") return "Carregando a leitura das mãos…";
  if (signs.status === "error") return "Não foi possível carregar a leitura das mãos. Recarregue a página.";
  if (signs.status === "off") return "Ligue a câmera para conversar em Libras.";
  if (!signs.hasTrainedSigns) return "Use as opções na tela para responder.";
  if (spelling) return "Soletre letra por letra: cada letra conta quando a mão fica parada.";
  return "Sinalize de frente para a câmera. Abaixe as mãos para enviar a frase.";
}

/** A frase sendo montada em Libras (sinais ou letras soletradas), com apagar e enviar. */
export function PhraseBar({ signs, busy }: { signs: Signs; busy: boolean }) {
  const spelling = signs.mode === "datilologia";

  return (
    <section aria-label="Sua frase em Libras" className="shrink-0 border-t border-white/10 bg-black/30 px-3 py-3 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
        <div className="flex min-h-10 min-w-0 flex-[1_1_14rem] flex-wrap items-center gap-2" aria-live="polite">
          {signs.words.length ? (
            signs.words.map((w, i) => (
              <span key={`${w}-${i}`} className="max-w-full rounded-full bg-white px-3 py-1 font-bold text-tinta">
                {w}
              </span>
            ))
          ) : (
            <span className="text-sm text-white/80">{readingHint(signs, spelling)}</span>
          )}
          {spelling && signs.status === "ready" && (
            <span className="max-w-full rounded-2xl border border-dashed border-ambar/70 px-3 py-1 font-bold tracking-widest text-ambar">
              {signs.spelling.join("") || "…"}
              <span aria-hidden="true" className="motion-safe:animate-pulse">
                _
              </span>
            </span>
          )}
          {spelling && signs.spellState && <span className="text-sm text-white/80">{SPELL_HINT[signs.spellState]}</span>}
          {!spelling && signs.guess && (
            <span className="text-sm text-ambar">
              vendo: {signs.guess.label} ({Math.round(signs.guess.confidence * 100)}%)
            </span>
          )}
          {signs.missed && (
            <span role="status" className="text-sm font-semibold text-red-300">
              Não entendi. Repita, por favor.
            </span>
          )}
        </div>
        {spelling && signs.spelling.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={signs.undoLetter} className={`${pillBtn} bg-white/15 hover:bg-white/25`}>
              Apagar letra
            </button>
            <button type="button" onClick={signs.commitSpelling} className={`${pillBtn} bg-ambar text-tinta hover:bg-ambar/90`}>
              Confirmar palavra
            </button>
          </div>
        )}
        {signs.words.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={signs.removeLastWord} className={`${pillBtn} bg-white/15 hover:bg-white/25`}>
              Apagar última
            </button>
            <button type="button" onClick={signs.sendPhrase} disabled={busy} className={`${pillBtn} bg-petroleo hover:bg-petroleo-escuro`}>
              Enviar frase
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
