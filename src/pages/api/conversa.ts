import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import type { PedidoConversa, RespostaConversa } from "@/types/conversa";

/*
 * A LIA entendendo a fala livre do paciente (Claude): POST PedidoConversa → RespostaConversa.
 * GET → { enabled } (o front pergunta se a conversa com IA está configurada).
 *
 * Só no servidor (variável SEM NEXT_PUBLIC_):
 *   ANTHROPIC_API_KEY=...   chave da API da Anthropic
 *
 * Privacidade: o CPF nunca é enviado (dígitos são mascarados aqui também, por garantia).
 */

const MODEL = "claude-opus-5-5";
const RATE_LIMIT = 30; // pedidos por minuto, por IP
const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  h.count++;
  return h.count > RATE_LIMIT;
}

/** Fixo (vai para o cache de prompt): quem é a LIA e como responder. */
const SYSTEM = `Você é a LIA, assistente de um totem de atendimento acessível numa unidade de saúde pública no Brasil. O paciente conversa com você por voz, por Libras (as frases chegam como glosas em maiúsculas, ex.: "DOR CABEÇA") ou digitando. Tudo o que você diz é mostrado como legenda, falado em voz alta e traduzido automaticamente para Libras por um avatar.

Seu trabalho nesta chamada: entender a última frase do paciente dentro da etapa atual e decidir a ação.

Etapas:
- consentimento: o paciente precisa concordar que a unidade guarde informações do atendimento (motivo da vinda e CPF). "consentir" se ele concorda, "recusar" se não quer.
- pergunta: há uma pergunta da triagem com opções (ou uma escala de números). "responder" com o id exato da opção (ou o número da escala, como texto) quando a frase indica claramente uma delas, mesmo dita de outro jeito ("tá doendo muito a barriga" → opção da barriga; "uns sete" → "7").
- identificacao: o paciente está informando o nome completo. "nome" com o nome completo, só quando ele disse um nome de pessoa. O CPF é tratado fora daqui: nunca peça, repita ou comente números de CPF.

Quando usar "nenhuma" (e então escrever a fala):
- a frase é ambígua ou não responde: peça para escolher, citando as opções de forma curta;
- é uma dúvida ("pra que serve?", "por que preciso?"): explique em uma frase e refaça a pergunta;
- pede para repetir: repita a pergunta atual;
- quer falar com uma pessoa ou desistir: diga que pode procurar a recepção a qualquer momento;
- conta sinais de emergência (dor forte no peito, falta de ar forte, desmaio, sangramento forte, convulsão): diga para procurar a recepção agora mesmo, e só depois retome.

Como falar (campo "fala"):
- português simples e direto, frases curtas, no máximo duas frases e cerca de 30 palavras — isso vira Libras;
- sem emojis, sem listas, sem markdown, sem gírias; trate por "você";
- acolhedora, sem pressa; nunca dê diagnóstico, orientação de remédio ou conselho médico;
- quando a ação for "responder", "consentir", "recusar" ou "nome", deixe "fala" vazia: o totem já anuncia o próximo passo.

Os campos "valor" e "nome" ficam null quando não se aplicam.`;

const Resposta = z.object({
  acao: z.enum(["nenhuma", "responder", "consentir", "recusar", "nome"]),
  fala: z.string(),
  valor: z.string().nullable(),
  nome: z.string().nullable(),
});

const Pedido = z.object({
  fase: z.enum(["consentimento", "pergunta", "identificacao"]),
  modo: z.enum(["libras", "voz", "toque"]),
  canal: z.enum(["libras", "voz", "toque"]),
  frase: z.string().trim().min(1).max(400),
  pergunta: z
    .object({
      texto: z.string().max(600),
      tipo: z.enum(["opcoes", "escala"]),
      opcoes: z.array(z.object({ id: z.string().max(80), rotulo: z.string().max(120) })).max(20),
      minimo: z.number().nullable(),
      maximo: z.number().nullable(),
    })
    .optional(),
  historico: z.array(z.object({ quem: z.enum(["lia", "paciente"]), texto: z.string().max(600) })).max(10),
});

/** Por garantia: nenhum número longo (CPF) sai do servidor para a IA. */
const semCpf = (s: string) => s.replace(/\d[\d.\s-]{5,}\d/g, "[número]");

function contexto(p: PedidoConversa) {
  const linhas = [`Etapa: ${p.fase}`, `Modo do atendimento: ${p.modo}. Canal desta frase: ${p.canal}.`];
  if (p.fase === "pergunta" && p.pergunta) {
    const q = p.pergunta;
    linhas.push(`Pergunta atual: ${q.texto}`);
    linhas.push(
      q.tipo === "escala"
        ? `Escala de ${q.minimo ?? 0} a ${q.maximo ?? 10} (valor = o número, como texto).`
        : `Opções (id: rótulo): ${q.opcoes.map((o) => `${o.id}: ${o.rotulo}`).join("; ")}`,
    );
  }
  if (p.historico.length) {
    linhas.push("Conversa até agora:");
    for (const t of p.historico) linhas.push(`${t.quem === "lia" ? "LIA" : "Paciente"}: ${semCpf(t.texto)}`);
  }
  linhas.push(`Última frase do paciente: ${semCpf(p.frase)}`);
  return linhas.join("\n");
}

/** Só aceita ações coerentes com a etapa (a IA nunca grava algo que a pergunta não tem). */
function validar(p: PedidoConversa, r: RespostaConversa): RespostaConversa {
  const nada = (fala: string): RespostaConversa => ({ acao: "nenhuma", fala, valor: null, nome: null });
  const fala = r.fala.trim();
  switch (r.acao) {
    case "consentir":
    case "recusar":
      return p.fase === "consentimento" ? { ...r, fala: "" } : nada(fala);
    case "nome":
      return p.fase === "identificacao" && r.nome?.trim() ? { ...r, fala: "", nome: r.nome.trim() } : nada(fala);
    case "responder": {
      const q = p.pergunta;
      if (p.fase !== "pergunta" || !q || r.valor === null) return nada(fala);
      if (q.tipo === "escala") {
        const n = Number(r.valor);
        const ok = Number.isInteger(n) && n >= (q.minimo ?? 0) && n <= (q.maximo ?? 10);
        return ok ? { ...r, fala: "", valor: String(n) } : nada(fala);
      }
      return q.opcoes.some((o) => o.id === r.valor) ? { ...r, fala: "" } : nada(fala);
    }
    default:
      return nada(fala);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const enabled = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ enabled });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método não permitido" });
  }
  if (!enabled) return res.status(503).json({ error: "Conversa com IA não configurada (ANTHROPIC_API_KEY)." });

  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress ?? "?").trim();
  if (rateLimited(ip)) return res.status(429).json({ error: "Muitos pedidos. Tente em instantes." });

  const parsed = Pedido.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido inválido." });
  const pedido = parsed.data as PedidoConversa;

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 2048,
        // Conversa em tempo real: pouco raciocínio, resposta rápida.
        output_config: { effort: "low", format: betaZodOutputFormat(Resposta) },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: contexto(pedido) }],
      },
      { timeout: 20_000, maxRetries: 1 },
    );

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return res.status(200).json(validar(pedido, { acao: "nenhuma", fala: "", valor: null, nome: null }));
    }
    return res.status(200).json(validar(pedido, response.parsed_output));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "IA ocupada. Tente em instantes." });
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: "Chave da IA inválida." });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `A IA respondeu com erro ${err.status}.` });
    return res.status(504).json({ error: "A IA demorou para responder." });
  }
}
