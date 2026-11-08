import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        <meta name="description" content="LIA — atendimento em Libras para unidades de saúde" />
        <link rel="icon" type="image/jpeg" href="/assets/icon.jpeg" />
        <link rel="apple-touch-icon" href="/assets/icon.jpeg" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
