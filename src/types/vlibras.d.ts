// Tipagem mínima do plugin global do VLibras (https://vlibras.gov.br/app/vlibras-plugin.js)
interface VLibrasWidgetConstructor {
  new (rootPath?: string): unknown;
}

interface Window {
  VLibras?: {
    Widget: VLibrasWidgetConstructor;
  };
}
