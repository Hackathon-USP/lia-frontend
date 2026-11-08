/*
 * Player do VLibras servido por este site (mesma origem), usado pela página /treinar.
 *
 * É o mesmo player Unity do widget oficial: o loader e o build vêm de vlibras.gov.br/app
 * (com CORS liberado) e os sinais, do dicionário do VLibras. Diferenças para o player oficial
 * (vlibras.gov.br/app/unity/index.html), que o totem usa num <iframe> de outra origem:
 *  - está na mesma origem do site, então a página pai consegue ler os pixels do avatar;
 *  - o WebGL é criado com preserveDrawingBuffer: true, para o canvas poder ser copiado a
 *    qualquer momento (e não só durante o desenho do Unity).
 *
 *  - tem um relógio que pode ser controlado de fora (clock): no modo manual, o Unity só avança
 *    quando a página pai pede, um quadro de cada vez e com o tempo que ela escolher. A gravação
 *    sai sempre a 30 quadros por segundo, mesmo num computador lento ou com a aba estrangulada,
 *    do mesmo jeito que a importação de vídeos percorre o arquivo quadro a quadro.
 *
 * A página pai fala com ele por window.vlibrasCapture (send, on, canvas, loaded, clock), sem
 * postMessage. Os eventos têm os mesmos nomes do player oficial: on_load_player, update_progress,
 * on_playing_state_change, counter_gloss, get_avatar, finish_welcome e on_error.
 */
(function () {
  'use strict';

  var ROOT = 'https://vlibras.gov.br/app/unity/';
  var requested = new URLSearchParams(window.location.search).get('v') || '';
  var version = /^[\w.-]{1,20}$/.test(requested) ? requested : '7.12.2';

  var listeners = [];
  var instance = null;
  var loaded = false;

  /*
   * Relógio. O Unity (Emscripten) lê o tempo em performance.now() e agenda cada quadro com
   * window.requestAnimationFrame, chamando os dois a cada quadro. No modo manual, o tempo fica
   * parado e os quadros pedidos esperam numa fila até a página pai chamar step(ms).
   * Ao voltar ao tempo real, o relógio continua de onde parou (nunca volta para trás).
   */
  var realRAF = window.requestAnimationFrame.bind(window);
  var realCancelRAF = window.cancelAnimationFrame.bind(window);
  var realNow = performance.now.bind(performance);
  var manual = false;
  var virtualNow = 0;
  var offset = 0;
  var queue = [];
  var nextManualId = 1e9;

  performance.now = function () {
    return manual ? virtualNow : realNow() + offset;
  };
  window.requestAnimationFrame = function (callback) {
    if (manual) {
      nextManualId += 1;
      queue.push({ id: nextManualId, callback: callback });
      return nextManualId;
    }
    return realRAF(function (t) {
      callback(t + offset);
    });
  };
  window.cancelAnimationFrame = function (id) {
    queue = queue.filter(function (item) {
      return item.id !== id;
    });
    realCancelRAF(id);
  };

  var clock = {
    /** Para o tempo: daqui em diante o Unity só anda com step(). */
    enter: function () {
      if (manual) return;
      virtualNow = realNow() + offset;
      manual = true;
    },
    /** Avança o tempo em `ms` e roda um quadro. Devolve quantos quadros pendentes rodaram (0 ou 1). */
    step: function (ms) {
      if (!manual) throw new Error('clock.step fora do modo manual');
      virtualNow += ms;
      var pending = queue;
      queue = [];
      pending.forEach(function (item) {
        item.callback(virtualNow);
      });
      return pending.length;
    },
    /** Volta ao tempo real. */
    exit: function () {
      if (!manual) return;
      offset = virtualNow - realNow();
      manual = false;
      var pending = queue;
      queue = [];
      pending.forEach(function (item) {
        realRAF(function (t) {
          item.callback(t + offset);
        });
      });
    },
    get manual() {
      return manual;
    },
    /** Quadros esperando o próximo step (1 quando o laço do Unity já está na fila). */
    get pending() {
      return queue.length;
    },
  };

  function emit(event, data) {
    listeners.slice().forEach(function (fn) {
      try {
        fn(event, data);
      } catch (err) {
        console.error('[vlibras-player]', err);
      }
    });
  }

  window.vlibrasCapture = {
    /** Manda uma mensagem para um objeto do Unity, ex.: send('PlayerManager', 'playNow', 'OI'). */
    send: function (object, method, param) {
      if (!instance) return false;
      if (param === undefined) instance.SendMessage(object, method);
      else instance.SendMessage(object, method, param);
      return true;
    },
    /** Escuta os eventos do player. Devolve a função que para de escutar. */
    on: function (fn) {
      listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (f) {
          return f !== fn;
        });
      };
    },
    /** O <canvas> WebGL onde o Unity desenha o avatar. */
    canvas: function () {
      return document.querySelector('#gameContainer canvas');
    },
    get loaded() {
      return loaded;
    },
    clock: clock,
    version: version,
  };

  // Funções globais que o Unity chama (Application.ExternalCall).
  window.onLoadPlayer = function () {
    loaded = true;
    emit('on_load_player');
  };
  window.onPlayingStateChange = function () {
    emit('on_playing_state_change', Array.prototype.slice.call(arguments));
  };
  window.CounterGloss = function () {
    emit('counter_gloss', Array.prototype.slice.call(arguments));
  };
  window.GetAvatar = function (avatar) {
    emit('get_avatar', avatar);
  };
  window.FinishWelcome = function (finished) {
    emit('finish_welcome', finished);
  };

  var script = document.createElement('script');
  script.src = ROOT + 'unity-loader.js?v=' + encodeURIComponent(version);
  script.onerror = function () {
    emit('on_error', 'loader');
  };
  script.onload = function () {
    var UnityLoader = window.UnityLoader;
    instance = UnityLoader.instantiate('gameContainer', ROOT + 'playerweb.json?v=' + encodeURIComponent(version), {
      // O loader só completa com o playerweb.json o que não vier aqui.
      Module: { webglContextAttributes: { preserveDrawingBuffer: true } },
      onProgress: function (_instance, progress) {
        emit('update_progress', progress);
      },
      compatibilityCheck: function (_instance, accept, deny) {
        if (UnityLoader.SystemInfo.hasWebGL) return accept();
        emit('on_error', 'unsupported');
        deny();
      },
    });
  };
  document.head.appendChild(script);
})();
