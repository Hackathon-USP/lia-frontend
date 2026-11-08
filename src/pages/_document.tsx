import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        <meta name="description" content="LIA — atendimento em Libras para unidades de saúde" />
        {/* PNG com fundo transparente (gerado a partir de favicon.jpg) */}
        <link rel="icon" type="image/png" href="/assets/favicon.png" />
        <link rel="apple-touch-icon" href="/assets/favicon.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
