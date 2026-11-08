import { useMemo } from "react";
import { alignGlossToWords, type WordRange } from "@/lib/libras/alignCaption";

interface Props {
  /** "LIA" para as respostas dela, "Em Libras" para a tradução da fala de alguém */
  label: string;
  text: string;
  gloss: string;
  /** Sinal da glosa que o avatar está fazendo agora (-1 = parado) */
  glossIndex: number;
  playing: boolean;
  /** Palavra que a voz está falando agora (tem prioridade sobre os sinais) */
  voiceWord: number | null;
  /** "grande" no totem; "media" em vitrines menores */
  tamanho?: "grande" | "media";
}

/**
 * Legenda da LIA com destaque na palavra que está sendo falada ou sinalizada agora.
 * O que já passou fica normal; o que ainda vem, um pouco mais apagado.
 */
export function LiaCaption({ label, text, gloss, glossIndex, playing, voiceWord, tamanho = "grande" }: Props) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const ranges = useMemo(() => (gloss ? alignGlossToWords(words, gloss.split(/\s+/)) : []), [words, gloss]);

  let current: WordRange | null = null;
  if (voiceWord !== null) {
    // Com voz: destaca a palavra falada (voz e legenda juntas).
    current = { start: voiceWord, end: voiceWord };
  } else if (playing && glossIndex >= 0) {
    // Sem voz: segue os sinais; marcações ([PONTO], [INTERROGAÇÃO]) mantêm o destaque anterior.
    for (let i = Math.min(glossIndex, ranges.length - 1); i >= 0 && !current; i--) current = ranges[i];
  }

  return (
    <p
      className={`max-w-3xl rounded-2xl bg-tinta/90 px-5 py-3 text-center leading-relaxed text-white shadow-lg ${
        tamanho === "grande" ? "text-lg sm:text-2xl" : "text-base sm:text-lg"
      }`}
    >
      <span className="font-bold text-ambar">{label}: </span>
      {words.map((w, i) => {
        const isCurrent = current !== null && i >= current.start && i <= current.end;
        const isFuture = current !== null && i > current.end;
        return (
          <span key={i}>
            <span
              className={`rounded-md px-0.5 motion-safe:transition-colors motion-safe:duration-150 ${
                isCurrent ? "bg-ambar font-bold text-tinta" : isFuture ? "text-white/75" : ""
              }`}
            >
              {w}
            </span>{" "}
          </span>
        );
      })}
    </p>
  );
}
