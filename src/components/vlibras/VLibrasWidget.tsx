import Script from "next/script";
import { env } from "@/config/env";

/**
 * Widget oficial do VLibras. Montado uma vez no _app.
 * O plugin procura a marcação [vw] no DOM e injeta o avatar.
 * TODO: definir a Hosana como avatar padrão e ligar as respostas da LIA à tradução.
 */
export function VLibrasWidget() {
  return (
    <>
      {/* Atributos customizados exigidos pelo plugin */}
      <div {...{ vw: "" }} className="enabled">
        <div {...{ "vw-access-button": "" }} className="active" />
        <div {...{ "vw-plugin-wrapper": "" }}>
          <div className="vw-plugin-top-wrapper" />
        </div>
      </div>

      <Script
        src={`${env.vlibrasUrl}/vlibras-plugin.js`}
        strategy="afterInteractive"
        onLoad={() => {
          if (window.VLibras) new window.VLibras.Widget(env.vlibrasUrl);
        }}
      />
    </>
  );
}
