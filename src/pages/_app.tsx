import type { AppProps } from "next/app";
import type { NextPage } from "next";
import type { ReactElement, ReactNode } from "react";
import Head from "next/head";
import { Geist } from "next/font/google";
import { Layout, VLibrasWidget } from "@/components";
import "@/styles/globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

/** Página que pode definir o próprio layout (ex.: a landing /sobre). */
export type NextPageWithLayout<P = object> = NextPage<P> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & { Component: NextPageWithLayout };

const defaultLayout = (page: ReactElement) => <Layout>{page}</Layout>;

export default function App({ Component, pageProps }: AppPropsWithLayout) {
  const getLayout = Component.getLayout ?? defaultLayout;

  return (
    <div className={`${geist.variable} antialiased`}>
      <Head>
        <title>LIA</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      {getLayout(<Component {...pageProps} />)}
      <VLibrasWidget />
    </div>
  );
}
