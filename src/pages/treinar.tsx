import Head from "next/head";
import dynamic from "next/dynamic";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "./_app";

// Só no navegador: WebGL (avatar e MediaPipe) e o dataset no IndexedDB.
const TreinoScreen = dynamic(() => import("@/components/treino/TreinoScreen").then((m) => m.TreinoScreen), {
  ssr: false,
  loading: () => <div className="flex min-h-dvh items-center justify-center bg-creme text-xl font-bold text-tinta">Abrindo o treino…</div>,
});

/**
 * Página da equipe: gera exemplos de sinais com o avatar do VLibras para o reconhecimento de
 * Libras dos totens. Não é para pacientes (não linkar no site).
 */
const TreinarPage: NextPageWithLayout = () => (
  <>
    <Head>
      <title>Treinar Libras · LIA</title>
      <meta name="robots" content="noindex, nofollow" />
    </Head>
    <TreinoScreen />
  </>
);

// Tela cheia, sem o cabeçalho do site.
TreinarPage.getLayout = (page: ReactElement) => page;

export default TreinarPage;
