import { useState, type FormEvent } from "react";

const field =
  "mt-2 block w-full rounded-2xl border-2 border-tinta-suave bg-white px-4 py-3 text-lg text-tinta placeholder:text-tinta-suave";
const label = "block text-lg font-bold text-tinta";

export function ContactForm() {
  const [sent, setSent] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // TODO: enviar os dados para o backend (ainda não existe endpoint de contato).
    // const data = Object.fromEntries(new FormData(e.currentTarget));
    e.currentTarget.reset();
    setSent(true);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 rounded-[2rem] bg-white p-6 sm:p-8" aria-describedby="contato-obrigatorio">
      <p id="contato-obrigatorio" className="text-tinta-suave">
        Todos os campos são obrigatórios.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contato-nome" className={label}>
            Nome
          </label>
          <input id="contato-nome" name="nome" type="text" autoComplete="name" required className={field} />
        </div>
        <div>
          <label htmlFor="contato-email" className={label}>
            E-mail
          </label>
          <input id="contato-email" name="email" type="email" autoComplete="email" required className={field} />
        </div>
      </div>

      <div>
        <label htmlFor="contato-instituicao" className={label}>
          Cidade ou instituição
        </label>
        <input
          id="contato-instituicao"
          name="instituicao"
          type="text"
          autoComplete="organization"
          required
          className={field}
        />
      </div>

      <div>
        <label htmlFor="contato-mensagem" className={label}>
          Mensagem
        </label>
        <textarea id="contato-mensagem" name="mensagem" rows={5} required className={field} />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          className="inline-flex h-14 items-center rounded-full bg-petroleo px-8 text-lg font-bold text-white hover:bg-petroleo-escuro"
        >
          Enviar mensagem
        </button>
        <p role="status" className="font-bold text-petroleo">
          {sent ? "Mensagem enviada. Obrigado! Vamos responder pelo e-mail informado." : ""}
        </p>
      </div>
    </form>
  );
}
