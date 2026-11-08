import Head from "next/head";
import dynamic from "next/dynamic";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "./_app";

// Só no navegador: a fila é consultada direto do back e muda a todo momento.
const RecepcaoScreen = dynamic(() => import("@/components/recepcao/RecepcaoScreen").then((m) => m.RecepcaoScreen), {
  ssr: false,
  loading: () => <div className="flex min-h-dvh items-center justify-center bg-creme text-xl font-bold text-tinta">Abrindo a recepção…</div>,
});

/**
 * Tela do guichê. As rotas /recepcao do back ainda não têm autenticação e devolvem
 * nome, CPF e sintomas: não linkar no site nem divulgar a URL.
 */
const RecepcaoPage: NextPageWithLayout = () => (
  <>
    <Head>
      <title>Recepção · LIA</title>
      <meta name="robots" content="noindex, nofollow" />
    </Head>
    <RecepcaoScreen />
  </>
);

// Tela cheia, sem o cabeçalho do site.
RecepcaoPage.getLayout = (page: ReactElement) => page;

export default RecepcaoPage;
