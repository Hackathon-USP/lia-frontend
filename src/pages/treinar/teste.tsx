import dynamic from "next/dynamic";
import Head from "next/head";
import type { NextPageWithLayout } from "../_app";

const SignTestScreen = dynamic(() => import("@/components/treino/SignTestScreen").then((m) => m.SignTestScreen), {
  ssr: false,
  loading: () => <p className="p-6 text-center">Abrindo o teste de Libras…</p>,
});

const SignTestPage: NextPageWithLayout = () => (
  <>
    <Head>
      <title>Teste de reconhecimento de Libras · LIA</title>
      <meta name="robots" content="noindex, nofollow" />
    </Head>
    <SignTestScreen />
  </>
);

SignTestPage.getLayout = (page) => page;
export default SignTestPage;
