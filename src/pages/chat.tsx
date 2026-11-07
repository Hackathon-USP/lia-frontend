import Head from "next/head";
import { ChatWindow } from "@/components";

export default function ChatPage() {
  return (
    <>
      <Head>
        <title>Conversar · LIA</title>
      </Head>
      <ChatWindow />
    </>
  );
}
