import Head from "next/head";

export default function SobrePage() {
  return (
    <>
      <Head>
        <title>Sobre · LIA</title>
      </Head>
      <h1 className="mb-4 text-2xl font-bold md:text-3xl">Sobre a LIA</h1>
      <p className="opacity-80 md:text-lg">
        A LIA é uma assistente que responde em Libras usando a avatar Hosana, da biblioteca VLibras.
      </p>
    </>
  );
}
