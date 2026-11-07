// Tipagem mínima do plugin global do VLibras (https://vlibras.gov.br/app/vlibras-plugin.js)
interface VLibrasWidgetOptions {
  rootPath?: string;
  avatar?: "icaro" | "hosana" | "guga" | "random";
  /** "L" = esquerda; padrão direita */
  position?: "L" | "R";
  personalization?: string;
}

interface VLibrasWidgetConstructor {
  new (rootPathOrOptions?: string | VLibrasWidgetOptions): unknown;
}

interface Window {
  VLibras?: {
    Widget: VLibrasWidgetConstructor;
  };
}
