import type { NextApiRequest, NextApiResponse } from "next";

/*
 * Voz neural da LIA (Azure Speech): POST { text, voice? } → áudio MP3.
 * GET → { enabled, voices } (o front pergunta se a voz na nuvem está configurada).
 *
 * A chave fica só no servidor (variáveis SEM NEXT_PUBLIC_):
 *   AZURE_SPEECH_KEY=...           chave do recurso "Speech" no portal do Azure
 *   AZURE_SPEECH_REGION=brazilsouth  região do recurso (ex.: brazilsouth, eastus)
 *   AZURE_SPEECH_VOICE=pt-BR-FranciscaNeural  (opcional) voz padrão
 */

/** Vozes femininas em português do Brasil liberadas para o front escolher. */
export const AZURE_VOICES = [
  { id: "pt-BR-FranciscaNeural", label: "Francisca" },
  { id: "pt-BR-ThalitaNeural", label: "Thalita" },
  { id: "pt-BR-BrendaNeural", label: "Brenda" },
  { id: "pt-BR-GiovannaNeural", label: "Giovanna" },
  { id: "pt-BR-LeticiaNeural", label: "Letícia" },
  { id: "pt-BR-YaraNeural", label: "Yara" },
] as const;

const MAX_CHARS = 800;
const RATE_LIMIT = 60; // pedidos por minuto, por IP
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

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string);
}

function config() {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_SPEECH_REGION?.trim();
  const fallback = process.env.AZURE_SPEECH_VOICE?.trim() || AZURE_VOICES[0].id;
  return { key, region, defaultVoice: fallback, enabled: Boolean(key && region) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { key, region, defaultVoice, enabled } = config();

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ enabled, defaultVoice, voices: enabled ? AZURE_VOICES : [] });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método não permitido" });
  }
  if (!enabled) return res.status(503).json({ error: "Voz na nuvem não configurada (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)." });

  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress ?? "?").trim();
  if (rateLimited(ip)) return res.status(429).json({ error: "Muitos pedidos de voz. Tente em instantes." });

  const body = (req.body ?? {}) as { text?: unknown; voice?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Texto vazio." });
  if (text.length > MAX_CHARS) return res.status(413).json({ error: `Texto maior que ${MAX_CHARS} caracteres.` });
  const voice = AZURE_VOICES.some((v) => v.id === body.voice) ? (body.voice as string) : defaultVoice;

  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">` +
    `<voice name="${escapeXml(voice)}"><prosody rate="-4%">${escapeXml(text)}</prosody></voice></speak>`;

  try {
    const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key as string,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "lia-totem",
      },
      body: ssml,
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      const detail = r.status === 401 ? "chave ou região do Azure inválida" : `Azure respondeu ${r.status}`;
      return res.status(502).json({ error: `Não foi possível gerar a voz: ${detail}.` });
    }
    const audio = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    // O mesmo texto com a mesma voz gera o mesmo áudio: o navegador pode reaproveitar.
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.status(200).send(audio);
  } catch {
    return res.status(504).json({ error: "O serviço de voz demorou para responder." });
  }
}
