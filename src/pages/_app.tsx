import type { AppProps } from "next/app";
import Head from "next/head";
import { Geist } from "next/font/google";
import { Layout, VLibrasWidget } from "@/components";
import "@/styles/globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${geist.variable} antialiased`}>
      <Head>
        <title>LIA</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Layout>
        <Component {...pageProps} />
      </Layout>
      <VLibrasWidget />
    </div>
  );
}
