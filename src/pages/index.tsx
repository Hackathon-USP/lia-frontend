import Link from "next/link";
import { ROUTES } from "@/routes";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center sm:gap-6">
      <h1 className="text-3xl font-bold sm:text-4xl md:text-5xl">Olá, eu sou a LIA</h1>
      <p className="max-w-md text-base opacity-80 md:max-w-lg md:text-lg">
        Converse comigo e acompanhe as respostas em Libras com a Hosana, do VLibras.
      </p>
      <Link
        href={ROUTES.chat}
        className="w-full rounded-xl bg-blue-600 px-6 py-3 font-medium text-white sm:w-auto"
      >
        Começar conversa
      </Link>
    </div>
  );
}
