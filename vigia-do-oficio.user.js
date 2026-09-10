// ==UserScript==
// @name         Vigia do Ofício
// @namespace    guilherme.vigia.oficio
// @version      2.3
// @author       Guilherme S. Costa
// @description  Automação desligada por padrão — ligue pelo painel flutuante (canto inferior direito, ícone 👁️). Ligado, simula atividade mínima periódica na aba do oficioeletronico.com.br para evitar que o timeout de inatividade derrube a sessão do certificado enquanto a aba estiver aberta. As notificações (toast + notificação nativa do Chrome) têm um controle separado, também desligado por padrão, e quando ligadas avisam a cada 20 minutos (não a cada execução). Uma falha ao manter a sessão sempre notifica, independente desse controle. O painel mostra a última atividade e permite ligar/desligar cada coisa.
// v1.1: adicionado toast visual.
// v1.2: adicionadas notificações nativas do Chrome (sucesso silencioso, erro com som).
// v1.3: toast movido para o canto superior direito, maior/mais destacado, duração de 10s.
// v2.0: (1) Painel flutuante fixo (canto inferior direito, ícone 👁️) com liga/desliga da automação — SEMPRE começa DESLIGADA em toda aba nova (não persiste de propósito); enquanto desligada, o script não simula atividade nem manda nada, só quando ligado manualmente pelo painel. (2) Auditoria: o painel mostra o horário da última atividade simulada (com sucesso/falha), guardado em localStorage — sobrevive a recarregar a página. (3) Notificação nativa mais robusta (tag única por evento, requireInteraction, clique na notificação traz a aba para frente).
// v2.1: o script agora só inicializa (painel flutuante, atividade simulada, tudo) se a página carregar exatamente em https://oficioeletronico.com.br/ (a página inicial) — em qualquer outro caminho do site, o script fica completamente inativo, sem aparecer nada. Só funciona se o caminho já for "/" no momento do carregamento; navegar internamente pra outras telas sem recarregar não desativa (o script continua rodando na aba já carregada), mas se você recarregar estando em outra tela, ele não ativa.
// v2.2: (1) Notificações (toast + notificação nativa) agora têm um liga/desliga próprio no painel, SEMPRE desligado por padrão em toda aba nova (mesma lógica de segurança do liga/desliga da automação). A automação de manter a sessão continua rodando a cada 5 min independente disso. (2) Quando as notificações estão ligadas, elas não aparecem mais a cada execução — só a cada 20 minutos, pra não encher a tela de avisos. (3) Uma falha ao manter a sessão sempre notifica (toast de erro + notificação nativa), mesmo com o controle de notificações desligado, porque isso indica um problema real que precisa da sua atenção.
// v2.3: o script agora também inicializa em https://oficioeletronico.com.br/Home/Index, além da página inicial (/). Continua não ativando em nenhum outro caminho do site.
// @match        https://oficioeletronico.com.br/*
// @updateURL    https://raw.githubusercontent.com/guilherme3rigoiania/scripts-3ri/main/vigia-do-oficio.user.js
// @downloadURL  https://raw.githubusercontent.com/guilherme3rigoiania/scripts-3ri/main/vigia-do-oficio.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // O script só deve funcionar na página inicial (https://oficioeletronico.com.br/
  // ou https://oficioeletronico.com.br/Home/Index — mesma página, dois caminhos),
  // não em nenhuma outra tela/caminho do site. Se a página carregar em qualquer
  // outro caminho (ex: /Protocolo/..., /Consulta/...), o script não inicializa
  // nada — nem toast, nem painel flutuante, nem notificação. Só funciona se o
  // caminho já for um desses no momento do carregamento; navegar internamente pra
  // lá sem recarregar não ativa (precisa dar F5 na página).
  const CAMINHOS_PERMITIDOS = ['/', '', '/Home/Index'];
  const caminhoAtual = location.pathname.replace(/\/+$/, ''); // remove barra final, se houver
  if (!CAMINHOS_PERMITIDOS.includes(location.pathname) && !CAMINHOS_PERMITIDOS.includes(caminhoAtual)) {
    return;
  }

  const NOME_SCRIPT = 'Vigia do Ofício';

  // Intervalo entre "toques" de atividade (em minutos).
  // O site verifica a sessão a cada 1-2 min e o timeout de inatividade
  // observado no código gira em torno de 30-60 min, então 5 em 5 min
  // é mais que suficiente e não sobrecarrega nada.
  const INTERVALO_MINUTOS = 5;

  // A cada quantos minutos, no máximo, uma notificação de sucesso (toast + nativa)
  // pode aparecer — mesmo com a atividade sendo simulada a cada INTERVALO_MINUTOS.
  // Não afeta a notificação de falha, que é sempre mostrada.
  const INTERVALO_NOTIFICACAO_MINUTOS = 20;

  // Automação começa sempre DESLIGADA em toda aba nova (não persiste entre aberturas
  // da página, de propósito — pra nunca rodar sozinha sem você ligar explicitamente
  // pelo painel). Enquanto desligada, nenhuma atividade é simulada nem notificação
  // aparece — o script fica quieto até você ligar.
  let automacaoAtiva = false;
  let intervaloAtivo = null;

  // Controle separado das notificações (toast + notificação nativa). Também começa
  // sempre DESLIGADO em toda aba nova, de propósito, e não depende do estado da
  // automação principal — dá pra manter a sessão ativa sem ficar recebendo avisos.
  let notificacoesAtivas = false;

  // Marca de quando foi a última notificação de SUCESSO mostrada, pra respeitar o
  // intervalo de INTERVALO_NOTIFICACAO_MINUTOS. Começa em 0 pra já poder notificar
  // assim que ligar.
  let ultimaNotificacaoSucessoEm = 0;

  function log(msg) {
    console.log('[' + NOME_SCRIPT + '] ' + msg);
  }

  // ---------- Toast visual (dentro da página) ----------

  function criarToastContainer() {
    let container = document.getElementById('__vigia_do_oficio_toast');
    if (container) return container;

    container = document.createElement('div');
    container.id = '__vigia_do_oficio_toast';
    container.style.position = 'fixed';
    container.style.top = '16px';
    container.style.right = '16px';
    container.style.zIndex = '2147483647';
    container.style.padding = '16px 22px';
    container.style.borderRadius = '8px';
    container.style.background = 'rgba(20, 40, 90, 0.95)';
    container.style.color = '#fff';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '18px';
    container.style.fontWeight = 'bold';
    container.style.boxShadow = '0 4px 14px rgba(0,0,0,0.35)';
    container.style.opacity = '0';
    container.style.transition = 'opacity 0.4s ease';
    container.style.pointerEvents = 'none';
    container.textContent = '';
    document.body.appendChild(container);
    return container;
  }

  function mostrarToast(mensagem, cor) {
    const container = criarToastContainer();
    container.textContent = mensagem;
    container.style.background = cor || 'rgba(20, 40, 90, 0.92)';
    container.style.opacity = '1';

    clearTimeout(container.__hideTimer);
    container.__hideTimer = setTimeout(() => {
      container.style.opacity = '0';
    }, 10000);
  }

  // ---------- Notificação nativa do Chrome ----------

  function pedirPermissaoNotificacao() {
    if (!('Notification' in window)) {
      log('Este navegador não suporta notificações nativas.');
      return;
    }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        log('Permissão de notificação: ' + perm);
      });
    }
  }

  function enviarNotificacao(titulo, corpo, isErro) {
    if (!('Notification' in window)) return null;
    if (Notification.permission !== 'granted') {
      log('Sem permissão de notificação (status: ' + Notification.permission + ').');
      return null;
    }
    try {
      const notif = new Notification(titulo, {
        body: corpo,
        icon: 'https://oficioeletronico.com.br/Content/Images/img-logo-oficio-interno.png',
        silent: !isErro, // erro pode tocar som, sucesso fica silencioso
        tag: 'vigia-do-oficio-' + Date.now(), // tag única: não substitui uma notificação anterior ainda não vista
        requireInteraction: isErro, // erro fica na tela até você interagir; sucesso some sozinho
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      return notif;
    } catch (e) {
      log('Falha ao criar notificação: ' + e.message);
      return null;
    }
  }

  // ---------- Histórico / auditoria (persistido em localStorage) ----------

  const CHAVE_HISTORICO = 'vigia_do_oficio_historico';

  function lerHistorico() {
    try {
      const bruto = localStorage.getItem(CHAVE_HISTORICO);
      return bruto ? JSON.parse(bruto) : {};
    } catch (e) {
      return {};
    }
  }

  function registrarHistorico(sucesso) {
    try {
      const hist = { hora: new Date().toISOString(), sucesso: !!sucesso };
      localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(hist));
    } catch (e) {
      log('Não foi possível salvar histórico: ' + e.message);
    }
  }

  function formatarHora(isoString) {
    if (!isoString) return 'nunca';
    const d = new Date(isoString);
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR');
  }

  // ---------- Painel flutuante de auditoria ----------

  function criarBotaoFlutuante() {
    let btn = document.getElementById('__vigia_do_oficio_fab');
    if (btn) return btn;

    btn = document.createElement('button');
    btn.id = '__vigia_do_oficio_fab';
    btn.textContent = '👁️';
    btn.title = 'Vigia do Ofício — auditoria';
    btn.style.position = 'fixed';
    btn.style.top = '50%';
    btn.style.right = '16px';
    btn.style.transform = 'translateY(-50%)';
    btn.style.zIndex = '2147483646';
    btn.style.width = '48px';
    btn.style.height = '48px';
    btn.style.borderRadius = '50%';
    btn.style.border = 'none';
    btn.style.background = 'rgba(20, 40, 90, 0.95)';
    btn.style.color = '#fff';
    btn.style.fontSize = '22px';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4)';
    document.body.appendChild(btn);
    return btn;
  }

  function criarPainelAuditoria() {
    let painel = document.getElementById('__vigia_do_oficio_painel');
    if (painel) return painel;

    painel = document.createElement('div');
    painel.id = '__vigia_do_oficio_painel';
    painel.style.position = 'fixed';
    painel.style.top = '50%';
    painel.style.right = '72px';
    painel.style.transform = 'translateY(-50%)';
    painel.style.zIndex = '2147483646';
    painel.style.background = '#182848';
    painel.style.color = '#fff';
    painel.style.fontFamily = 'Arial, sans-serif';
    painel.style.padding = '18px 20px';
    painel.style.borderRadius = '10px';
    painel.style.boxShadow = '0 8px 30px rgba(0,0,0,0.5)';
    painel.style.minWidth = '270px';
    painel.style.display = 'none';

    const titulo = document.createElement('div');
    titulo.textContent = 'Vigia do Ofício — Auditoria';
    titulo.style.fontSize = '15px';
    titulo.style.fontWeight = 'bold';
    titulo.style.marginBottom = '12px';

    // Linha do liga/desliga da automação.
    const linhaToggle = document.createElement('div');
    linhaToggle.style.display = 'flex';
    linhaToggle.style.alignItems = 'center';
    linhaToggle.style.justifyContent = 'space-between';
    linhaToggle.style.marginBottom = '14px';
    linhaToggle.style.padding = '8px 10px';
    linhaToggle.style.background = 'rgba(255,255,255,0.06)';
    linhaToggle.style.borderRadius = '6px';

    const labelToggle = document.createElement('span');
    labelToggle.style.fontSize = '13px';
    labelToggle.style.fontWeight = 'bold';

    const btnToggle = document.createElement('button');
    btnToggle.style.border = 'none';
    btnToggle.style.padding = '6px 12px';
    btnToggle.style.borderRadius = '5px';
    btnToggle.style.cursor = 'pointer';
    btnToggle.style.fontSize = '12px';
    btnToggle.style.fontWeight = 'bold';

    linhaToggle.appendChild(labelToggle);
    linhaToggle.appendChild(btnToggle);

    // Linha do liga/desliga das notificações (toast + notificação nativa).
    const linhaToggleNotif = document.createElement('div');
    linhaToggleNotif.style.display = 'flex';
    linhaToggleNotif.style.alignItems = 'center';
    linhaToggleNotif.style.justifyContent = 'space-between';
    linhaToggleNotif.style.marginBottom = '14px';
    linhaToggleNotif.style.padding = '8px 10px';
    linhaToggleNotif.style.background = 'rgba(255,255,255,0.06)';
    linhaToggleNotif.style.borderRadius = '6px';

    const labelToggleNotif = document.createElement('span');
    labelToggleNotif.style.fontSize = '13px';
    labelToggleNotif.style.fontWeight = 'bold';

    const btnToggleNotif = document.createElement('button');
    btnToggleNotif.style.border = 'none';
    btnToggleNotif.style.padding = '6px 12px';
    btnToggleNotif.style.borderRadius = '5px';
    btnToggleNotif.style.cursor = 'pointer';
    btnToggleNotif.style.fontSize = '12px';
    btnToggleNotif.style.fontWeight = 'bold';

    linhaToggleNotif.appendChild(labelToggleNotif);
    linhaToggleNotif.appendChild(btnToggleNotif);

    const linhaUltimaAtividade = document.createElement('div');
    linhaUltimaAtividade.style.fontSize = '13px';
    linhaUltimaAtividade.style.marginBottom = '14px';

    const btnFecharPainel = document.createElement('button');
    btnFecharPainel.textContent = 'Fechar';
    btnFecharPainel.style.background = 'transparent';
    btnFecharPainel.style.color = '#aaa';
    btnFecharPainel.style.border = '1px solid #555';
    btnFecharPainel.style.padding = '7px 14px';
    btnFecharPainel.style.width = '100%';
    btnFecharPainel.style.borderRadius = '6px';
    btnFecharPainel.style.cursor = 'pointer';
    btnFecharPainel.style.fontSize = '12px';

    painel.appendChild(titulo);
    painel.appendChild(linhaToggle);
    painel.appendChild(linhaToggleNotif);
    painel.appendChild(linhaUltimaAtividade);
    painel.appendChild(btnFecharPainel);
    document.body.appendChild(painel);

    painel.__labelToggle = labelToggle;
    painel.__btnToggle = btnToggle;
    painel.__labelToggleNotif = labelToggleNotif;
    painel.__btnToggleNotif = btnToggleNotif;
    painel.__linhaUltimaAtividade = linhaUltimaAtividade;
    painel.__btnFecharPainel = btnFecharPainel;

    return painel;
  }

  function atualizarPainelAuditoria() {
    const painel = document.getElementById('__vigia_do_oficio_painel');
    if (!painel) return;
    const hist = lerHistorico();

    if (!hist.hora) {
      painel.__linhaUltimaAtividade.textContent = 'Última atividade: nunca executada.';
    } else {
      const status = hist.sucesso ? '✅ sucesso' : '⚠️ falhou';
      painel.__linhaUltimaAtividade.textContent = 'Última atividade: ' + formatarHora(hist.hora) + ' (' + status + ')';
    }

    if (automacaoAtiva) {
      painel.__labelToggle.textContent = 'Vigia: ligado';
      painel.__btnToggle.textContent = 'Desligar';
      painel.__btnToggle.style.background = '#dc2626';
      painel.__btnToggle.style.color = '#fff';
    } else {
      painel.__labelToggle.textContent = 'Vigia: desligado';
      painel.__btnToggle.textContent = 'Ligar';
      painel.__btnToggle.style.background = '#16a34a';
      painel.__btnToggle.style.color = '#fff';
    }

    if (notificacoesAtivas) {
      painel.__labelToggleNotif.textContent = 'Notificações: ligadas';
      painel.__btnToggleNotif.textContent = 'Desligar';
      painel.__btnToggleNotif.style.background = '#dc2626';
      painel.__btnToggleNotif.style.color = '#fff';
    } else {
      painel.__labelToggleNotif.textContent = 'Notificações: desligadas';
      painel.__btnToggleNotif.textContent = 'Ligar';
      painel.__btnToggleNotif.style.background = '#16a34a';
      painel.__btnToggleNotif.style.color = '#fff';
    }
  }

  function inicializarPainelAuditoria(aoAlternarAutomacao, aoAlternarNotificacoes) {
    const fab = criarBotaoFlutuante();
    const painel = criarPainelAuditoria();

    fab.onclick = () => {
      atualizarPainelAuditoria();
      painel.style.display = painel.style.display === 'none' ? 'block' : 'none';
    };

    painel.__btnFecharPainel.onclick = () => {
      painel.style.display = 'none';
    };

    painel.__btnToggle.onclick = () => {
      aoAlternarAutomacao();
      atualizarPainelAuditoria();
    };

    painel.__btnToggleNotif.onclick = () => {
      aoAlternarNotificacoes();
      atualizarPainelAuditoria();
    };
  }

  // ---------- Lógica principal ----------

  function simularAtividade() {
    try {
      const evtMove = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: Math.floor(Math.random() * 100) + 10,
        clientY: Math.floor(Math.random() * 100) + 10,
      });
      document.dispatchEvent(evtMove);

      const evtKey = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Shift',
      });
      document.dispatchEvent(evtKey);

      const hora = new Date().toLocaleTimeString('pt-BR');
      log('Atividade simulada em ' + hora);
      registrarHistorico(true);

      // Notificação de sucesso (toast + nativa) só aparece se o controle de
      // notificações estiver ligado, e respeitando o intervalo mínimo entre avisos.
      if (notificacoesAtivas) {
        const agora = Date.now();
        const passouIntervalo = agora - ultimaNotificacaoSucessoEm >= INTERVALO_NOTIFICACAO_MINUTOS * 60 * 1000;
        if (passouIntervalo) {
          ultimaNotificacaoSucessoEm = agora;
          mostrarToast('Sessão mantida ativa às ' + hora);
          enviarNotificacao(NOME_SCRIPT, 'Sessão mantida ativa às ' + hora, false);
        }
      }
    } catch (e) {
      const hora = new Date().toLocaleTimeString('pt-BR');
      log('Erro ao simular atividade: ' + e.message);
      registrarHistorico(false);

      // Falha sempre notifica, independente do controle de notificações estar
      // ligado ou desligado — é um problema real que precisa de atenção.
      mostrarToast('Falha ao manter sessão às ' + hora + ' — verifique a aba!', 'rgba(150, 30, 30, 0.95)');
      enviarNotificacao(NOME_SCRIPT + ' — Falha', 'Não foi possível manter a sessão ativa às ' + hora + '. Verifique a aba.', true);
    }
  }

  // Liga/desliga a automação a partir do painel.
  function alternarAutomacao() {
    automacaoAtiva = !automacaoAtiva;
    if (automacaoAtiva) {
      log('Vigia ligado pelo painel.');
      mostrarToast(NOME_SCRIPT + ': ligado.', 'rgba(20, 110, 60, 0.95)');
      simularAtividade(); // primeiro "toque" imediato ao ligar
      clearInterval(intervaloAtivo);
      intervaloAtivo = setInterval(simularAtividade, INTERVALO_MINUTOS * 60 * 1000);
    } else {
      log('Vigia desligado pelo painel.');
      mostrarToast(NOME_SCRIPT + ': desligado.', 'rgba(150, 30, 30, 0.95)');
      clearInterval(intervaloAtivo);
      intervaloAtivo = null;
    }
  }

  // Liga/desliga o controle de notificações a partir do painel. Independente do
  // estado da automação principal.
  function alternarNotificacoes() {
    notificacoesAtivas = !notificacoesAtivas;
    if (notificacoesAtivas) {
      log('Notificações ligadas pelo painel.');
      ultimaNotificacaoSucessoEm = 0; // permite notificar já na próxima execução
      mostrarToast(NOME_SCRIPT + ': notificações ligadas (a cada ' + INTERVALO_NOTIFICACAO_MINUTOS + ' min).', 'rgba(20, 110, 60, 0.95)');
    } else {
      log('Notificações desligadas pelo painel.');
      mostrarToast(NOME_SCRIPT + ': notificações desligadas.', 'rgba(150, 30, 30, 0.95)');
    }
  }

  inicializarPainelAuditoria(alternarAutomacao, alternarNotificacoes);

  log('Script carregado, mas desligado por padrão. Ligue pelo painel (canto inferior direito, 👁️) quando quiser começar.');
  mostrarToast(NOME_SCRIPT + ' carregado — desligado. Ligue pelo painel.');
  pedirPermissaoNotificacao();
})();
