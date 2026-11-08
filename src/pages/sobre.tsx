import dynamic from "next/dynamic";
import Head from "next/head";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { Atkinson_Hyperlegible } from "next/font/google";
import type { NextPageWithLayout } from "./_app";
import { ROUTES } from "@/routes";
import { SiteHeader } from "@/components/sobre/SiteHeader";
import { ContactForm } from "@/components/sobre/ContactForm";
import {
  IconBuilding,
  IconCheck,
  IconCheckCircle,
  IconChoice,
  IconClipboardCheck,
  IconGlobe,
  IconHand,
  IconHospital,
  IconImage,
  IconLock,
  IconMessage,
  IconQueue,
  IconTicket,
  IconUser,
  IconVideo,
  IconVoice,
  IconX,
} from "@/components/sobre/icons";

const atkinson = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-atkinson-hyperlegible",
});

/* ---------- Conteúdo ---------- */

const CENSO = [
  { valor: "14,4 milhões", texto: "de pessoas com deficiência no Brasil." },
  { valor: "2,3 milhões", texto: "delas têm deficiência auditiva." },
  { valor: "7,9 milhões", texto: "de pessoas têm dificuldade para enxergar." },
];

const PASSOS = [
  {
    icon: IconChoice,
    titulo: "Escolha como conversar",
    texto: "Libras, voz, figuras ou outro idioma. A pessoa escolhe logo na primeira tela do totem.",
  },
  {
    icon: IconMessage,
    titulo: "Conte o que sente",
    texto: "A LIA faz as perguntas da triagem no modo escolhido. Em Libras, a câmera lê os sinais que a pessoa faz.",
  },
  {
    icon: IconClipboardCheck,
    titulo: "Confirme o resumo",
    texto: "A LIA mostra o que entendeu antes de enviar. Nada sai do totem sem a pessoa confirmar.",
  },
  {
    icon: IconTicket,
    titulo: "Receba sua senha",
    texto: "A senha sai na hora, e a recepção recebe o resumo pronto. Sinais de alerta, como falta de ar, sobem para o topo da fila.",
  },
];

const PUBLICOS = [
  {
    icon: IconHand,
    quem: "Pessoas surdas",
    modo: "Libras",
    texto: "Uma avatar 3D humana sinaliza as perguntas, e a câmera lê os sinais que a pessoa faz de volta.",
  },
  {
    icon: IconVoice,
    quem: "Pessoas cegas",
    modo: "Voz",
    texto: "A LIA fala as perguntas e entende as respostas faladas. Não é preciso enxergar a tela.",
  },
  {
    icon: IconImage,
    quem: "Pessoas idosas e analfabetas",
    modo: "Figuras",
    texto: "Cada pergunta vem com figuras grandes e claras. Quem não lê responde tocando na imagem.",
  },
  {
    icon: IconGlobe,
    quem: "Imigrantes",
    modo: "Idioma",
    texto: "Atendimento em espanhol e em crioulo haitiano, para quem ainda não fala português.",
  },
];

const COMPARATIVO = [
  {
    aspecto: "Sentido da conversa",
    vlibras: "Mão única: português → Libras",
    lia: "Nos dois sentidos: sinaliza e lê os sinais do paciente",
  },
  {
    aspecto: "Entende o paciente",
    vlibras: "Não. Só traduz o texto que recebe",
    lia: "Sim. Faz a triagem com começo, meio e fim",
  },
  {
    aspecto: "Conhece a UBS",
    vlibras: "Não sabe o que é uma UBS e não faz nada com a resposta",
    lia: "Gera a senha e manda o resumo pronto para a recepção",
  },
  {
    aspecto: "Quem atende",
    vlibras: "Pessoas surdas",
    lia: "Pessoas surdas, cegas, idosas, analfabetas e imigrantes, ao mesmo tempo",
  },
  {
    aspecto: "Quando a conversa fica complexa",
    vlibras: "Não há caminho seguinte",
    lia: "Chama um intérprete humano por vídeo",
  },
];

const IMPACTO = [
  {
    icon: IconUser,
    titulo: "Autonomia",
    texto: "A pessoa é atendida sozinha, na própria língua, sem depender de alguém para falar por ela.",
  },
  {
    icon: IconLock,
    titulo: "Sigilo",
    texto: "O que ela sente fica entre ela e a equipe de saúde, sem passar pela boca de um parente.",
  },
  {
    icon: IconQueue,
    titulo: "Fila mais justa",
    texto: "Sinais de alerta, como falta de ar, sobem para o topo da fila, seja qual for a língua do paciente.",
  },
  {
    icon: IconCheckCircle,
    titulo: "Menos retrabalho na recepção",
    texto: "A queixa chega resumida e a senha já está gerada. Menos idas e vindas no balcão.",
  },
];

const LINHA_DO_TEMPO = [
  { titulo: "Hackathon", texto: "A ideia da LIA ganha forma." },
  { titulo: "Piloto em 1 UBS", texto: "O totem na recepção de uma unidade de saúde de verdade." },
  { titulo: "Consultório", texto: "Um tablet na mesa do médico, para a consulta inteira." },
  { titulo: "Outros serviços públicos", texto: "Cartórios, INSS e bancos." },
];

/* ---------- Peças de layout ---------- */

function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

function SectionHeading({ id, eyebrow, title, intro }: { id: string; eyebrow: string; title: string; intro?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="font-bold uppercase tracking-wider text-petroleo">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-3xl font-bold leading-tight text-tinta sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="mt-4 text-lg leading-relaxed text-tinta-suave sm:text-xl">{intro}</p>}
    </div>
  );
}

function IconBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-menta text-petroleo">{children}</span>
  );
}

/** Ilustração do totem: aparece enquanto o avatar da LIA carrega. */
function TotemIlustracao() {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="flex aspect-[4/5] items-center justify-center rounded-[2rem] border-2 border-dashed border-petroleo/40 bg-menta p-8">
        <svg
          viewBox="0 0 200 260"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          className="h-full max-h-80 w-auto text-petroleo"
        >
          {/* totem */}
          <rect x="40" y="10" width="120" height="170" rx="20" />
          <rect x="54" y="26" width="92" height="120" rx="12" />
          <path d="M100 180v50M65 245h70" />
          {/* avatar */}
          <circle cx="100" cy="66" r="16" />
          <path d="M70 146c0-20 13-34 30-34s30 14 30 34" />
          {/* mãos sinalizando */}
          <path d="M66 118c-6-8-6-18 0-24M134 118c6-8 6-18 0-24" />
          <circle cx="100" cy="163" r="5" />
        </svg>
      </div>
    </div>
  );
}

// A LIA ao vivo (avatar do VLibras): só no navegador, é um player WebGL num iframe.
const LiaVitrine = dynamic(() => import("@/components/home/LiaVitrine").then((m) => m.LiaVitrine), {
  ssr: false,
  loading: () => <TotemIlustracao />,
});

/** No lugar do vídeo: a própria LIA, se apresentando em Libras e sinalizando o que a pessoa escrever. */
function LiaAoVivo() {
  return (
    <figure className="relative mx-auto w-full max-w-lg">
      <LiaVitrine />
      <figcaption className="mt-3 text-center text-tinta-suave">
        Esta é a LIA de verdade, ao vivo. Escreva uma frase e veja em Libras.
      </figcaption>
    </figure>
  );
}

/* ---------- Página ---------- */

const SobrePage: NextPageWithLayout = () => {
  return (
    <>
      <Head>
        <title>Sobre · LIA, a UBS que fala a sua língua</title>
        <meta
          name="description"
          content="A LIA é uma assistente virtual para a recepção das UBS. Atende em Libras, por voz, por figuras e em outros idiomas, faz a triagem e gera a senha."
        />
      </Head>

      {/* 1. Hero */}
      <section aria-labelledby="hero-titulo" className="pt-12 pb-20 sm:pt-16 lg:pt-24 lg:pb-28">
        <Container className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-flex rounded-full bg-ambar px-4 py-1.5 font-bold text-tinta">
              Acessibilidade no atendimento do SUS
            </p>
            <h1 id="hero-titulo" className="mt-6 text-4xl font-bold leading-[1.1] text-tinta sm:text-5xl lg:text-6xl">
              A UBS que fala a sua língua.
            </h1>
            <p className="mt-6 max-w-xl text-xl leading-relaxed text-tinta-suave sm:text-2xl">
              A LIA é uma assistente virtual no totem da recepção que atende em Libras, por voz, por figuras e em
              outros idiomas.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href="#como-funciona"
                className="inline-flex h-14 items-center justify-center rounded-full bg-petroleo px-8 text-lg font-bold text-white hover:bg-petroleo-escuro"
              >
                Ver como funciona
              </a>
              <a
                href="#contato"
                className="inline-flex h-14 items-center justify-center rounded-full border-2 border-petroleo px-8 text-lg font-bold text-petroleo hover:bg-menta"
              >
                Quero a LIA na minha cidade
              </a>
            </div>
          </div>
          <LiaAoVivo />
        </Container>
      </section>

      {/* 2. O problema */}
      <section id="problema" aria-labelledby="problema-titulo" className="bg-menta py-20 lg:py-28">
        <Container>
          <SectionHeading
            id="problema-titulo"
            eyebrow="O problema"
            title="A lei existe. O atendimento, não."
          />

          <figure className="mt-10 rounded-[2rem] bg-white p-8 sm:p-12">
            <blockquote>
              <p className="text-3xl font-bold leading-snug text-tinta sm:text-4xl lg:text-5xl">
                <span aria-hidden="true" className="text-petroleo">
                  “
                </span>
                20 anos de lei, e o surdo ainda precisa levar a mãe na consulta.
                <span aria-hidden="true" className="text-petroleo">
                  ”
                </span>
              </p>
            </blockquote>
            <div className="mt-8 grid gap-6 text-lg leading-relaxed text-tinta-suave md:grid-cols-2">
              <p>
                O Decreto 5.626/2005 obriga o SUS a atender pessoas surdas em Libras. Quase 20 anos depois, as unidades
                seguem sem intérpretes e as equipes não estão preparadas.
              </p>
              <p>
                Sem intérprete, a pessoa surda depende de um acompanhante. Perde a autonomia e perde o sigilo sobre a
                própria saúde.
              </p>
            </div>
          </figure>

          <h3 className="mt-14 text-2xl font-bold text-tinta">Quem é esquecido no balcão</h3>
          <ul className="mt-6 grid gap-5 md:grid-cols-3">
            {CENSO.map((item) => (
              <li key={item.valor} className="rounded-3xl bg-creme p-8">
                <p className="text-4xl font-bold text-petroleo sm:text-5xl">{item.valor}</p>
                <p className="mt-3 text-lg text-tinta">{item.texto}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-tinta-suave">Fonte: IBGE, Censo Demográfico 2022.</p>

          <p className="mt-10 max-w-3xl rounded-3xl border-l-8 border-ambar bg-white p-6 text-lg leading-relaxed text-tinta">
            E o balcão também falha com quem não lê: o analfabetismo entre pessoas com deficiência é de{" "}
            <strong>21,3%</strong>, contra <strong>5,2%</strong> entre as demais.
          </p>
        </Container>
      </section>

      {/* 3. Como funciona */}
      <section id="como-funciona" aria-labelledby="como-titulo" className="py-20 lg:py-28">
        <Container>
          <SectionHeading
            id="como-titulo"
            eyebrow="Como funciona"
            title="Da chegada à senha, em quatro passos."
            intro="A LIA fica num totem ou tablet na recepção da UBS. A conversa acontece no modo que a pessoa escolher."
          />
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PASSOS.map((passo, i) => (
              <li key={passo.titulo} className="flex flex-col rounded-3xl border border-tinta/10 bg-white p-7">
                <div className="flex items-center justify-between">
                  <IconBadge>
                    <passo.icon className="size-7" />
                  </IconBadge>
                  <span className="text-lg font-bold text-tinta-suave" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-bold text-tinta">
                  <span className="sr-only">Passo {i + 1}: </span>
                  {passo.titulo}
                </h3>
                <p className="mt-3 leading-relaxed text-tinta-suave">{passo.texto}</p>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-col gap-5 rounded-3xl bg-menta p-7 sm:flex-row sm:items-center">
            <IconBadge>
              <IconVideo className="size-7" />
            </IconBadge>
            <p className="text-lg leading-relaxed text-tinta">
              <strong>E quando a conversa fica complexa?</strong> A LIA chama um intérprete humano por vídeo. Ninguém
              fica sem resposta.
            </p>
          </div>
        </Container>
      </section>

      {/* 4. Para quem */}
      <section id="para-quem" aria-labelledby="para-quem-titulo" className="bg-menta py-20 lg:py-28">
        <Container>
          <SectionHeading
            id="para-quem-titulo"
            eyebrow="Para quem"
            title="Um totem, várias formas de conversar."
            intro="A LIA atende quem hoje é esquecido no balcão, e cada pessoa conversa do jeito que funciona para ela."
          />
          <ul className="mt-12 grid gap-5 sm:grid-cols-2">
            {PUBLICOS.map((p) => (
              <li key={p.quem} className="rounded-3xl bg-white p-8">
                <div className="flex items-start justify-between gap-4">
                  <IconBadge>
                    <p.icon className="size-7" />
                  </IconBadge>
                  <p className="rounded-full bg-ambar px-4 py-1.5 font-bold text-tinta">
                    <span className="sr-only">Modo: </span>
                    {p.modo}
                  </p>
                </div>
                <h3 className="mt-6 text-2xl font-bold text-tinta">{p.quem}</h3>
                <p className="mt-3 text-lg leading-relaxed text-tinta-suave">{p.texto}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* 5. VLibras × LIA */}
      <section id="comparativo" aria-labelledby="comparativo-titulo" className="py-20 lg:py-28">
        <Container>
          <SectionHeading
            id="comparativo-titulo"
            eyebrow="VLibras × LIA"
            title="O VLibras traduz. A LIA atende."
            intro="O VLibras, do governo federal, é código aberto e gratuito. A LIA usa o VLibras como peça e acrescenta o resto: a conversa, a triagem e a ligação com a recepção."
          />

          <div className="mt-12 overflow-hidden rounded-[2rem] border border-tinta/10 bg-white">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Comparação entre o VLibras e a LIA em cinco aspectos</caption>
              <thead>
                <tr className="bg-tinta text-white">
                  <th scope="col" className="w-1/4 p-4 text-base font-bold sm:p-6 sm:text-lg">
                    <span className="sr-only">Aspecto</span>
                  </th>
                  <th scope="col" className="p-4 text-base font-bold sm:p-6 sm:text-lg">
                    VLibras
                  </th>
                  <th scope="col" className="bg-petroleo p-4 text-base font-bold sm:p-6 sm:text-lg">
                    LIA
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARATIVO.map((linha) => (
                  <tr key={linha.aspecto} className="border-t border-tinta/10 align-top">
                    <th scope="row" className="p-4 font-bold text-tinta sm:p-6 sm:text-lg">
                      {linha.aspecto}
                    </th>
                    <td className="p-4 text-tinta-suave sm:p-6 sm:text-lg">
                      <span className="flex gap-2">
                        <IconX className="mt-0.5 size-5 shrink-0 text-tinta-suave" />
                        {linha.vlibras}
                      </span>
                    </td>
                    <td className="bg-menta/60 p-4 text-tinta sm:p-6 sm:text-lg">
                      <span className="flex gap-2">
                        <IconCheck className="mt-0.5 size-5 shrink-0 text-petroleo" />
                        {linha.lia}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-14 text-2xl font-bold text-tinta">Há demanda, aqui e lá fora</h3>
          <ul className="mt-6 grid gap-5 md:grid-cols-2">
            <li className="rounded-3xl bg-menta p-8">
              <p className="font-bold uppercase tracking-wider text-petroleo">No Brasil</p>
              <p className="mt-3 text-lg leading-relaxed text-tinta">
                Em 2026, o Ministério Público do Rio Grande do Sul abriu edital para um tradutor Português ↔ Libras com
                IA, para uso em tablets e totens de atendimento.
              </p>
            </li>
            <li className="rounded-3xl bg-menta p-8">
              <p className="font-bold uppercase tracking-wider text-petroleo">No Reino Unido</p>
              <p className="mt-3 text-lg leading-relaxed text-tinta">
                A Signapse já usa intérpretes digitais de língua de sinais em estações de trem, com modelo de
                assinatura.
              </p>
            </li>
          </ul>
        </Container>
      </section>

      {/* 6. Impacto */}
      <section id="impacto" aria-labelledby="impacto-titulo" className="on-dark bg-petroleo py-20 text-white lg:py-28">
        <Container>
          <div className="max-w-3xl">
            <p className="font-bold uppercase tracking-wider text-white">Impacto</p>
            <h2 id="impacto-titulo" className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              Bom para quem chega. Bom para quem recebe.
            </h2>
          </div>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {IMPACTO.map((item) => (
              <li key={item.titulo} className="rounded-3xl bg-white/10 p-7 ring-1 ring-white/20">
                <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-ambar text-tinta">
                  <item.icon className="size-7" />
                </span>
                <h3 className="mt-6 text-xl font-bold">{item.titulo}</h3>
                <p className="mt-3 leading-relaxed text-white">{item.texto}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* 7. Modelo de negócio e próximos passos */}
      <section id="modelo" aria-labelledby="modelo-titulo" className="py-20 lg:py-28">
        <Container>
          <SectionHeading
            id="modelo-titulo"
            eyebrow="Modelo de negócio"
            title="Como a LIA chega às unidades."
          />
          <ul className="mt-12 grid gap-5 md:grid-cols-2">
            <li className="rounded-3xl border border-tinta/10 bg-white p-8">
              <IconBadge>
                <IconBuilding className="size-7" />
              </IconBadge>
              <h3 className="mt-6 text-2xl font-bold text-tinta">Prefeituras e estados</h3>
              <p className="mt-3 text-lg leading-relaxed text-tinta-suave">
                Assinatura mensal por unidade, com o equipamento cedido em comodato. A compra pode ser feita pelo
                Contrato Público para Solução Inovadora, do Marco Legal das Startups.
              </p>
            </li>
            <li className="rounded-3xl border border-tinta/10 bg-white p-8">
              <IconBadge>
                <IconHospital className="size-7" />
              </IconBadge>
              <h3 className="mt-6 text-2xl font-bold text-tinta">Saúde privada</h3>
              <p className="mt-3 text-lg leading-relaxed text-tinta-suave">
                Hospitais, laboratórios e planos de saúde, que também são obrigados a ser acessíveis pela Lei Brasileira
                de Inclusão.
              </p>
            </li>
          </ul>

          <h3 className="mt-16 text-2xl font-bold text-tinta">Próximos passos</h3>
          <ol className="relative mt-8 grid gap-8 md:grid-cols-4 md:gap-5">
            {/* linha que liga as etapas */}
            <span
              aria-hidden="true"
              className="absolute top-0 bottom-0 left-6 w-0.5 bg-petroleo/30 md:top-6 md:right-6 md:bottom-auto md:left-6 md:h-0.5 md:w-auto"
            />
            {LINHA_DO_TEMPO.map((etapa, i) => (
              <li key={etapa.titulo} className="relative flex gap-5 md:flex-col md:gap-0">
                <span className="relative z-10 inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-petroleo text-lg font-bold text-white ring-8 ring-creme">
                  <span className="sr-only">Etapa </span>
                  {i + 1}
                </span>
                <div className="md:mt-5">
                  <p className="text-xl font-bold text-tinta">{etapa.titulo}</p>
                  <p className="mt-2 leading-relaxed text-tinta-suave">{etapa.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* 8. Contato */}
      <section id="contato" aria-labelledby="contato-titulo" className="bg-menta py-20 lg:py-28">
        <Container className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionHeading
              id="contato-titulo"
              eyebrow="Contato"
              title="Quero a LIA na minha cidade."
              intro="Trabalha numa prefeitura, secretaria de saúde, hospital ou laboratório? Conte onde você está e o que precisa. A gente responde."
            />
            <div className="mt-8 flex items-start gap-4 rounded-3xl bg-white p-6">
              <IconHand className="mt-1 size-6 shrink-0 text-petroleo" />
              <p className="leading-relaxed text-tinta">
                Este site tem o widget do VLibras. Use o botão azul no canto da tela para ler o conteúdo em Libras.
              </p>
            </div>
          </div>
          <ContactForm />
        </Container>
      </section>
    </>
  );
};

function SiteFooter() {
  return (
    <footer className="on-dark bg-tinta py-14 text-white">
      <Container className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-3xl font-bold">LIA</p>
          <p className="mt-2 text-lg">O VLibras traduz. A LIA atende.</p>
        </div>
        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            <li>
              <Link href={ROUTES.home} className="rounded underline underline-offset-4 hover:text-ambar">
                Início
              </Link>
            </li>
            <li>
              <Link href={ROUTES.chat} className="rounded underline underline-offset-4 hover:text-ambar">
                Conversar com a LIA
              </Link>
            </li>
            <li>
              <a href="#contato" className="rounded underline underline-offset-4 hover:text-ambar">
                Contato
              </a>
            </li>
          </ul>
        </nav>
      </Container>
      <Container>
        <p className="mt-10 border-t border-white/20 pt-6 text-white/85">
          © {new Date().getFullYear()} LIA · Acessibilidade no atendimento do SUS.
        </p>
      </Container>
    </footer>
  );
}

SobrePage.getLayout = function getLayout(page: ReactElement) {
  return (
    <div className={`${atkinson.variable} lia-page min-h-dvh bg-creme font-atkinson text-tinta`}>
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-full bg-tinta px-5 py-3 font-bold text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Pular para o conteúdo
      </a>
      <SiteHeader />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        {page}
      </main>
      <SiteFooter />
    </div>
  );
};

export default SobrePage;
