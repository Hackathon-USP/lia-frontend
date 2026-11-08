import dynamic from "next/dynamic";
import Head from "next/head";
import Link from "next/link";
import type { ReactElement } from "react";
import { ROUTES } from "@/routes";
import type { NextPageWithLayout } from "./_app";

// Só no navegador: o avatar é um player Unity (WebGL) num iframe.
const LiaVitrine = dynamic(() => import("@/components/home/LiaVitrine").then((m) => m.LiaVitrine), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-[4/5] items-center justify-center rounded-[2rem] bg-[#E6E1D8] text-lg font-bold text-tinta shadow-xl">
      A LIA está chegando…
    </div>
  ),
});

const DESTAQUES = [
  { titulo: "Libras de verdade", texto: "Ela vê seus sinais pela câmera e responde sinalizando, com legenda." },
  { titulo: "Voz e toque também", texto: "Quem preferir pode falar ou tocar nas opções. A LIA conversa e entende." },
  { titulo: "Senha na mão", texto: "Faz a triagem e entrega a senha; a recepção já recebe o resumo." },
];

const HomePage: NextPageWithLayout = () => (
  <>
    <Head>
      <title>LIA · Atendimento acessível em Libras</title>
      <meta name="description" content="LIA é uma assistente que atende pessoas surdas em Libras, por voz ou toque, e faz a triagem na unidade de saúde." />
    </Head>

    <div className="min-h-dvh bg-creme text-tinta">
      <header className="border-b border-tinta/10 pt-[env(safe-area-inset-top)]">
        <nav aria-label="Principal" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href={ROUTES.home} className="rounded-lg text-2xl font-bold tracking-tight text-petroleo">
            LIA<span className="sr-only">, página inicial</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link href={ROUTES.sobre} className="rounded-full px-4 py-2 font-semibold hover:bg-menta">
              Sobre o projeto
            </Link>
            <Link href={ROUTES.chat} className="hidden rounded-full bg-petroleo px-5 py-2 font-bold text-white hover:bg-petroleo-escuro sm:inline-flex">
              Abrir o totem
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:px-8 lg:py-16">
        <div className="space-y-7">
          <p className="inline-block rounded-full bg-menta px-4 py-1.5 font-bold text-petroleo">Atendimento acessível em saúde</p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Olá, eu sou a <span className="text-petroleo">LIA</span>.
          </h1>
          <p className="max-w-xl text-xl leading-relaxed text-tinta-suave">
            Converso em Libras com quem chega à unidade de saúde: vejo os sinais pela câmera, respondo sinalizando e
            faço a triagem até a senha. Aqui na página sou eu, ao vivo: escreva algo e veja.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={ROUTES.chat}
              className="inline-flex min-h-14 items-center rounded-full bg-petroleo px-7 text-lg font-bold text-white hover:bg-petroleo-escuro focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar"
            >
              Começar atendimento
            </Link>
            <Link
              href={ROUTES.sobre}
              className="inline-flex min-h-14 items-center rounded-full border-2 border-petroleo px-7 text-lg font-bold text-petroleo hover:bg-menta focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar"
            >
              Como funciona
            </Link>
          </div>
          <ul className="grid gap-4 pt-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {DESTAQUES.map((d) => (
              <li key={d.titulo} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-tinta/5">
                <p className="font-bold text-petroleo">{d.titulo}</p>
                <p className="mt-1 text-tinta-suave">{d.texto}</p>
              </li>
            ))}
          </ul>
        </div>

        <section aria-label="A LIA ao vivo">
          <LiaVitrine />
        </section>
      </main>
    </div>
  </>
);

// Página própria (vitrine), sem o layout padrão estreito.
HomePage.getLayout = (page: ReactElement) => page;

export default HomePage;
