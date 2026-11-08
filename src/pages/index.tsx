import dynamic from "next/dynamic";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";
import { LiaLogo, LiaWordmark } from "@/components/brand/LiaLogo";
import { IconHand, IconTicket, IconVoice } from "@/components/sobre/icons";
import { ROUTES } from "@/routes";
import type { NextPageWithLayout } from "./_app";

// Só no navegador: o avatar é um player Unity (WebGL) num iframe.
const LiaVitrine = dynamic(() => import("@/components/home/LiaVitrine").then((m) => m.LiaVitrine), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-[4/5] flex-col items-center justify-center gap-4 rounded-4xl bg-[#E6E1D8] text-lg font-bold text-tinta shadow-xl">
      <Image src="/assets/favicon.png" alt="" width={88} height={88} className="size-22 drop-shadow-md" />
      A LIA está chegando…
    </div>
  ),
});

const DESTAQUES = [
  { Icone: IconHand, titulo: "Libras de verdade", texto: "Vê os sinais pela câmera e responde sinalizando, com legenda em português." },
  { Icone: IconVoice, titulo: "Voz e toque também", texto: "Quem preferir fala ou toca nas opções. A LIA conversa e entende." },
  { Icone: IconTicket, titulo: "Da triagem à senha", texto: "Faz as perguntas, entrega a senha e a recepção já recebe o resumo." },
];

const botao =
  "inline-flex min-h-14 items-center rounded-full px-7 text-lg font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar";

const HomePage: NextPageWithLayout = () => (
  <>
    <Head>
      <title>LIA · Atendimento acessível em Libras</title>
      <meta name="description" content="LIA é uma assistente que atende pessoas surdas em Libras, por voz ou toque, e faz a triagem na unidade de saúde." />
    </Head>

    <div className="min-h-dvh bg-creme text-tinta">
      <header className="sticky top-0 z-40 border-b border-tinta/10 bg-creme/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <nav aria-label="Principal" className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <LiaLogo />
          <div className="flex items-center gap-1 sm:gap-2">
            <Link href={ROUTES.sobre} className="rounded-full px-4 py-2 font-semibold hover:bg-menta">
              Sobre o projeto
            </Link>
            <Link href={ROUTES.chat} className="hidden h-11 items-center rounded-full bg-petroleo px-5 font-bold text-white hover:bg-petroleo-escuro sm:inline-flex">
              Abrir o totem
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:py-16">
          <div className="space-y-7">
            <p className="inline-block rounded-full bg-ambar px-4 py-1.5 font-bold text-tinta">Atendimento acessível no SUS</p>
            <h1 className="text-5xl font-bold leading-[1.05] sm:text-6xl">
              Olá, eu sou a{" "}
              <span className="whitespace-nowrap">
                <LiaWordmark className="text-petroleo" />
                <span className="sr-only">LIA</span>.
              </span>
            </h1>
            <p className="max-w-xl text-xl leading-relaxed text-tinta-suave">
              Converso em Libras com quem chega à unidade de saúde e faço a triagem até a senha. Esta aqui sou eu, ao vivo:
              escreva uma frase e veja.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={ROUTES.chat} className={`${botao} bg-petroleo text-white hover:bg-petroleo-escuro`}>
                Começar atendimento
              </Link>
              <Link href={ROUTES.sobre} className={`${botao} border-2 border-petroleo text-petroleo hover:bg-menta`}>
                Como funciona
              </Link>
            </div>
          </div>

          <div aria-label="A LIA ao vivo" role="region" className="mx-auto w-full max-w-xl">
            <LiaVitrine />
          </div>
        </section>

        <section aria-labelledby="destaques" className="border-t border-tinta/10 bg-white">
          <h2 id="destaques" className="sr-only">O que a LIA faz</h2>
          <ul className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3 sm:px-6 lg:px-8">
            {DESTAQUES.map(({ Icone, titulo, texto }) => (
              <li key={titulo} className="flex gap-4">
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-menta text-petroleo">
                  <Icone />
                </span>
                <div>
                  <p className="text-lg font-bold">{titulo}</p>
                  <p className="mt-1 leading-relaxed text-tinta-suave">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  </>
);

// Página própria (vitrine), sem o layout padrão estreito.
HomePage.getLayout = (page: ReactElement) => page;

export default HomePage;
