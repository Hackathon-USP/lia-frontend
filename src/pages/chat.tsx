import Head from "next/head";
import dynamic from "next/dynamic";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "./_app";

// Só no navegador: usa câmera, WebGL e os sinais salvos no localStorage.
const CallScreen = dynamic(() => import("@/components/call/TotemScreen").then((m) => m.TotemScreen), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-tinta text-xl font-bold text-white">
      Abrindo o atendimento…
    </div>
  ),
});

const ChatPage: NextPageWithLayout = () => {
  return (
    <>
      <Head>
        <title>Atendimento · LIA</title>
      </Head>
      <CallScreen />
    </>
  );
};

// Tela cheia, sem o cabeçalho do site: é a tela do totem.
ChatPage.getLayout = (page: ReactElement) => page;

export default ChatPage;
