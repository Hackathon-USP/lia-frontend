import { useCallback, useEffect, useRef, useState } from "react";
import { buscarFila, chamarProxima, detalharAtendimento, mensagemDeErro, mudarStatusSenha } from "@/services";
import type { Chamada, ItemFila } from "@/types";

/*
 * Estado da tela do guichê:
 *   fila (consultada a cada FILA_INTERVALO_MS, não há websocket)
 *   chamada atual → "Chamar próxima" (POST /chamar) ou uma senha da fila (PATCH em_atendimento)
 *                 → "Concluir" (PATCH finalizada)
 */

/** Intervalo de atualização da fila. */
const FILA_INTERVALO_MS = 8000;
/** A partir desse tempo esperando, avisa que o back está acordando (Render gratuito: 30–60 s). */
const LENTO_MS = 4000;

export function useRecepcao() {
  /** null = ainda não carregou nenhuma vez */
  const [fila, setFila] = useState<ItemFila[] | null>(null);
  const [erroFila, setErroFila] = useState<string | null>(null);
  const [chamada, setChamada] = useState<Chamada | null>(null);
  /** O último "Chamar próxima" encontrou a fila vazia */
  const [ninguemAguardando, setNinguemAguardando] = useState(false);
  const [ocupado, setOcupado] = useState<"chamando" | "concluindo" | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [lento, setLento] = useState(false);
  const buscando = useRef(false);

  const atualizar = useCallback(async () => {
    if (buscando.current) return;
    buscando.current = true;
    const timer = setTimeout(() => setLento(true), LENTO_MS);
    try {
      setFila(await buscarFila());
      setErroFila(null);
    } catch (err) {
      setErroFila(mensagemDeErro(err));
    } finally {
      clearTimeout(timer);
      setLento(false);
      buscando.current = false;
    }
  }, []);

  // Fila sempre atualizada; pausa com a aba escondida e atualiza ao voltar.
  useEffect(() => {
    const primeira = setTimeout(atualizar, 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void atualizar();
    }, FILA_INTERVALO_MS);
    const onVisible = () => document.visibilityState === "visible" && void atualizar();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(primeira);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [atualizar]);

  /** Roda uma ação do guichê com estado de "ocupado" e erro amigável; atualiza a fila no fim. */
  const executar = useCallback(
    async (tipo: "chamando" | "concluindo", fn: () => Promise<void>) => {
      setOcupado(tipo);
      setErroAcao(null);
      const timer = setTimeout(() => setLento(true), LENTO_MS);
      try {
        await fn();
      } catch (err) {
        setErroAcao(mensagemDeErro(err));
      } finally {
        clearTimeout(timer);
        setLento(false);
        setOcupado(null);
        void atualizar();
      }
    },
    [atualizar],
  );

  /** "Chamar próxima": o back escolhe (preferenciais primeiro) e garante que dois guichês não peguem a mesma. */
  const chamarProximaSenha = useCallback(
    () =>
      executar("chamando", async () => {
        const c = await chamarProxima();
        setNinguemAguardando(!c);
        if (c) setChamada(c);
      }),
    [executar],
  );

  /** Chama uma senha específica da fila. */
  const chamarSenha = useCallback(
    (item: ItemFila) =>
      executar("chamando", async () => {
        const senha = await mudarStatusSenha(item.codigo, "em_atendimento");
        const detalhe = item.atendimento_id ? await detalharAtendimento(item.atendimento_id).catch(() => null) : null;
        setNinguemAguardando(false);
        setChamada({
          senha,
          atendimento_id: item.atendimento_id,
          modo: item.modo,
          nome: item.nome,
          cpf: item.cpf,
          alertas: item.alertas,
          resumo: detalhe?.resumo ?? null,
        });
      }),
    [executar],
  );

  /** "Concluir atendimento" da chamada atual. */
  const concluir = useCallback(() => {
    const atual = chamada;
    if (!atual) return;
    void executar("concluindo", async () => {
      await mudarStatusSenha(atual.senha.codigo, "finalizada");
      setChamada(null);
    });
  }, [chamada, executar]);

  return {
    fila,
    erroFila,
    lento,
    atualizar,
    chamada,
    ninguemAguardando,
    ocupado,
    erroAcao,
    chamarProxima: chamarProximaSenha,
    chamarSenha,
    concluir,
  };
}
