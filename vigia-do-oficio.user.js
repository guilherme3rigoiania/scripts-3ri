// ==UserScript==
// @name         Vigia do Ofício
// @namespace    guilherme.vigia.oficio
// @version      2.4
// @author       Guilherme S. Costa
// @description  Mantém a sessão do certificado ativa no oficioeletronico.com.br enquanto a aba estiver aberta. Desligado por padrão — ligue pelo painel flutuante (ícone 👁️, lado direito). Ligado, a cada 5 min faz um "ping" real no servidor (requisição à própria página usando a sua sessão), que é o que de fato reinicia o contador de inatividade e impede a queda da sessão; também dispara eventos de atividade na página. Se o servidor derrubar a sessão (redirecionar pro login), você é avisado na hora. As notificações visuais têm liga/desliga próprio, desligado por padrão, e NÃO afetam a manutenção da sessão. Não digita nem armazena nenhuma senha.
// v1.1: adicionado toast visual.
// v1.2: adicionadas notificações nativas do Chrome (sucesso silencioso, erro com som).
// v1.3: toast movido para o canto superior direito, maior/mais destacado, duração de 10s.
// v2.0: (1) Painel flutuante fixo (ícone 👁️) com liga/desliga da automação — SEMPRE começa DESLIGADA em toda aba nova (não persiste de propósito). (2) Auditoria: o painel mostra o horário da última atividade (com sucesso/falha), guardado em localStorage. (3) Notificação nativa mais robusta (tag única por evento, requireInteraction, clique traz a aba para frente).
// v2.1: o script só inicializa na página inicial (/) do site.
// v2.2: (1) Notificações ganharam liga/desliga próprio, desligado por padrão. (2) Com notificações ligadas, aviso de sucesso só a cada 20 min. (3) Falha sempre notifica.
// v2.3: o script também inicializa em /Home/Index, além de /.
// v2.4: CORREÇÃO IMPORTANTE DO QUE MANTÉM A SESSÃO. (1) Antes a "manutenção" só disparava eventos sintéticos de mouse/teclado na página — isso NÃO garante que o servidor reinicie o timeout de inatividade (o timeout é server-side). Agora, a cada ciclo, o script faz uma requisição real (fetch) à própria página usando a sua sessão, que é o que de fato zera o contador de inatividade no servidor. Os eventos sintéticos continuam (ajudam se o site também tiver detecção de ociosidade no lado do navegador). (2) A manutenção da sessão agora é 100% independente das notificações — ligar/desligar aviso não interfere em nada no keep-alive. (3) Detecção de queda: se o servidor redirecionar o ping pro login, o script avisa que a sessão caiu (toast de erro + notificação, sempre). (4) Toast agora dura 2 segundos (erros duram mais, 8s). (5) Painel mais útil: mostra renovações feitas nesta aba, horário da última e a previsão da próxima.
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
  // nada. Só funciona se o caminho já for um desses no momento do carregamento;
  // navegar internamente pra lá sem recarregar não ativa (precisa dar F5).
  const CAMINHOS_PERMITIDOS = ['/', '', '/Home/Index'];
  const caminhoAtual = location.pathname.replace(/\/+$/, ''); // remove barra final, se houver
  if (!CAMINHOS_PERMITIDOS.includes(location.pathname) && !CAMINHOS_PERMITIDOS.includes(caminhoAtual)) {
    return;
  }

  const NOME_SCRIPT = 'Vigia do Ofício';

  // Intervalo entre renovações da sessão (em minutos). O timeout de inatividade
  // do site observado gira em torno de 30-60 min, então 5 min tem margem de sobra.
  const INTERVALO_MINUTOS = 5;

  // A cada quantos minutos, no máximo, uma notificação de SUCESSO pode aparecer
  // (quando as notificações estão ligadas). Não afeta notificação de falha.
  const INTERVALO_NOTIFICACAO_MINUTOS = 20;

  // Duração dos toasts na tela (em ms). Avisos normais somem rápido (2s); avisos de
  // erro ficam mais tempo (8s), porque indicam um problema que você precisa ver.
  const TOAST_DURACAO_MS = 2000;
  const TOAST_DURACAO_ERRO_MS = 8000;

  // Automação (manutenção da sessão) começa SEMPRE DESLIGADA em toda aba nova, de
  // propósito — pra nunca rodar sozinha sem você ligar explicitamente pelo painel.
  let automacaoAtiva = false;
  let intervaloAtivo = null;

  // Controle separado das notificações visuais (toast + notificação nativa). Também
  // começa SEMPRE DESLIGADO. NÃO afeta a manutenção da sessão de forma nenhuma.
  let notificacoesAtivas = false;

  // Marca de quando foi a última notificação de SUCESSO mostrada (pra respeitar o
  // intervalo mínimo entre avisos). Começa em 0 pra já poder notificar na 1ª vez.
  let ultimaNotificacaoSucessoEm = 0;

  // Contadores/estado só pra exibir no painel (não afetam a lógica).
  let contadorRenovacoes = 0;
  let proximaRenovacaoEm = 0; // timestamp (ms) previsto da próxima renovação
  let renovacaoEmAndamento = false; // evita pings sobrepostos

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

  function mostrarToast(mensagem, cor, duracaoMs) {
    const container = criarToastContainer();
    container.textContent = mensagem;
    container.style.background = cor || 'rgba(20, 40, 90, 0.92)';
    container.style.opacity = '1';

    clearTimeout(container.__hideTimer);
    container.__hideTimer = setTimeout(() => {
      container.style.opacity = '0';
    }, duracaoMs || TOAST_DURACAO_MS);
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
        tag: 'vigia-do-oficio-' + Date.now(), // tag única: não substitui uma anterior ainda não vista
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

  function registrarHistorico(sucesso, detalhe) {
    try {
      const hist = { hora: new Date().toISOString(), sucesso: !!sucesso, detalhe: detalhe || '' };
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

  function formatarHoraCurta(timestampMs) {
    if (!timestampMs) return '—';
    return new Date(timestampMs).toLocaleTimeString('pt-BR');
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
    painel.style.minWidth = '280px';
    painel.style.display = 'none';

    const titulo = document.createElement('div');
    titulo.textContent = 'Vigia do Ofício';
    titulo.style.fontSize = '15px';
    titulo.style.fontWeight = 'bold';
    titulo.style.marginBottom = '12px';

    // Linha do liga/desliga da automação (manutenção da sessão).
    const linhaToggle = document.createElement('div');
    linhaToggle.style.display = 'flex';
    linhaToggle.style.alignItems = 'center';
    linhaToggle.style.justifyContent = 'space-between';
    linhaToggle.style.marginBottom = '10px';
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

    // Linha do liga/desliga das notificações visuais.
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

    // Bloco de status (renovações, última, próxima).
    const blocoStatus = document.createElement('div');
    blocoStatus.style.fontSize = '12.5px';
    blocoStatus.style.lineHeight = '1.6';
    blocoStatus.style.marginBottom = '14px';
    blocoStatus.style.padding = '10px 12px';
    blocoStatus.style.background = 'rgba(0,0,0,0.18)';
    blocoStatus.style.borderRadius = '6px';

    const linhaUltimaAtividade = document.createElement('div');
    const linhaProxima = document.createElement('div');
    const linhaContador = document.createElement('div');

    blocoStatus.appendChild(linhaUltimaAtividade);
    blocoStatus.appendChild(linhaProxima);
    blocoStatus.appendChild(linhaContador);

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
    painel.appendChild(blocoStatus);
    painel.appendChild(btnFecharPainel);
    document.body.appendChild(painel);

    painel.__labelToggle = labelToggle;
    painel.__btnToggle = btnToggle;
    painel.__labelToggleNotif = labelToggleNotif;
    painel.__btnToggleNotif = btnToggleNotif;
    painel.__linhaUltimaAtividade = linhaUltimaAtividade;
    painel.__linhaProxima = linhaProxima;
    painel.__linhaContador = linhaContador;
    painel.__btnFecharPainel = btnFecharPainel;

    return painel;
  }

  function atualizarPainelAuditoria() {
    const painel = document.getElementById('__vigia_do_oficio_painel');
    if (!painel) return;
    const hist = lerHistorico();

    if (!hist.hora) {
      painel.__linhaUltimaAtividade.textContent = 'Última renovação: nunca.';
    } else {
      const status = hist.sucesso ? '✅ ok' : '⚠️ falhou';
      let txt = 'Última renovação: ' + formatarHora(hist.hora) + ' (' + status + ')';
      if (!hist.sucesso && hist.detalhe) txt += ' — ' + hist.detalhe;
      painel.__linhaUltimaAtividade.textContent = txt;
    }

    if (automacaoAtiva && proximaRenovacaoEm) {
      painel.__linhaProxima.textContent = 'Próxima renovação prevista: ' + formatarHoraCurta(proximaRenovacaoEm);
    } else {
      painel.__linhaProxima.textContent = 'Próxima renovação prevista: —';
    }

    painel.__linhaContador.textContent = 'Renovações nesta aba: ' + contadorRenovacoes;

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
      painel.__labelToggleNotif.textContent = 'Avisos na tela: ligados';
      painel.__btnToggleNotif.textContent = 'Desligar';
      painel.__btnToggleNotif.style.background = '#dc2626';
      painel.__btnToggleNotif.style.color = '#fff';
    } else {
      painel.__labelToggleNotif.textContent = 'Avisos na tela: desligados';
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

  // ---------- Lógica principal: manter a sessão viva ----------

  // Dispara eventos de atividade na página (ajuda se o SITE tiver detecção de
  // ociosidade no lado do navegador). Sozinho NÃO basta — ver pingServidor().
  function dispararEventosAtividade() {
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
  }

  // Faz uma requisição REAL ao servidor usando a sua sessão. É isso que de fato
  // reinicia o contador de inatividade no servidor. Retorna um objeto descrevendo
  // o resultado, inclusive se a sessão parece ter caído (redirecionou pro login).
  async function pingServidor() {
    const resp = await fetch(location.href, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
    });

    // Heurística de queda de sessão: se o servidor redirecionou a requisição pra
    // uma tela de login/autenticação, a sessão provavelmente caiu.
    const urlFinal = (resp.url || '').toLowerCase();
    const caiu = resp.redirected && /(login|signin|entrar|autentic|acesso)/.test(urlFinal);

    return { ok: resp.ok && !caiu, status: resp.status, caiu: caiu, urlFinal: resp.url };
  }

  // Ciclo completo de renovação da sessão. Independente das notificações.
  async function renovarSessao(origem) {
    if (renovacaoEmAndamento) {
      log('Renovação já em andamento, pulando (origem: ' + (origem || 'timer') + ').');
      return;
    }
    renovacaoEmAndamento = true;

    const hora = new Date().toLocaleTimeString('pt-BR');
    try {
      dispararEventosAtividade();
      const r = await pingServidor();

      if (r.ok) {
        contadorRenovacoes += 1;
        log('Sessão renovada em ' + hora + ' (HTTP ' + r.status + ', renovação #' + contadorRenovacoes + ').');
        registrarHistorico(true);

        // Notificação de sucesso só se o aviso estiver ligado e respeitando o intervalo.
        if (notificacoesAtivas) {
          const agora = Date.now();
          if (agora - ultimaNotificacaoSucessoEm >= INTERVALO_NOTIFICACAO_MINUTOS * 60 * 1000) {
            ultimaNotificacaoSucessoEm = agora;
            mostrarToast('Sessão mantida ativa às ' + hora);
            enviarNotificacao(NOME_SCRIPT, 'Sessão mantida ativa às ' + hora, false);
          }
        }
      } else if (r.caiu) {
        // Sessão caiu: AVISA SEMPRE, independente do controle de notificações.
        log('Sessão parece ter CAÍDO em ' + hora + ' (redirecionou para ' + r.urlFinal + ').');
        registrarHistorico(false, 'sessão caiu (redirecionou pro login)');
        mostrarToast('A sessão caiu! Faça login de novo às ' + hora + '.', 'rgba(150, 30, 30, 0.95)', TOAST_DURACAO_ERRO_MS);
        enviarNotificacao(NOME_SCRIPT + ' — Sessão caiu', 'A sessão do certificado caiu. Entre de novo no oficioeletronico.', true);
      } else {
        log('Ping respondeu HTTP ' + r.status + ' em ' + hora + '.');
        registrarHistorico(false, 'HTTP ' + r.status);
        mostrarToast('Resposta inesperada do servidor (HTTP ' + r.status + ') às ' + hora + '.', 'rgba(150, 30, 30, 0.95)', TOAST_DURACAO_ERRO_MS);
        enviarNotificacao(NOME_SCRIPT + ' — Atenção', 'O servidor respondeu HTTP ' + r.status + ' ao manter a sessão. Verifique a aba.', true);
      }
    } catch (e) {
      // Erro de rede (sem internet, servidor fora, etc). Avisa sempre.
      log('Erro ao renovar sessão em ' + hora + ': ' + e.message);
      registrarHistorico(false, 'erro de rede');
      mostrarToast('Falha ao manter sessão às ' + hora + ' — verifique a conexão/aba!', 'rgba(150, 30, 30, 0.95)', TOAST_DURACAO_ERRO_MS);
      enviarNotificacao(NOME_SCRIPT + ' — Falha', 'Não foi possível manter a sessão ativa às ' + hora + '. Verifique a conexão e a aba.', true);
    } finally {
      renovacaoEmAndamento = false;
      if (automacaoAtiva) {
        proximaRenovacaoEm = Date.now() + INTERVALO_MINUTOS * 60 * 1000;
      }
      atualizarPainelAuditoria();
    }
  }

  // Liga/desliga a manutenção da sessão a partir do painel.
  function alternarAutomacao() {
    automacaoAtiva = !automacaoAtiva;
    if (automacaoAtiva) {
      log('Vigia ligado pelo painel.');
      mostrarToast(NOME_SCRIPT + ': ligado — mantendo a sessão.', 'rgba(20, 110, 60, 0.95)');
      proximaRenovacaoEm = Date.now() + INTERVALO_MINUTOS * 60 * 1000;
      renovarSessao('ligar'); // renova já na hora de ligar
      clearInterval(intervaloAtivo);
      intervaloAtivo = setInterval(() => renovarSessao('timer'), INTERVALO_MINUTOS * 60 * 1000);
    } else {
      log('Vigia desligado pelo painel.');
      mostrarToast(NOME_SCRIPT + ': desligado.', 'rgba(150, 30, 30, 0.95)');
      clearInterval(intervaloAtivo);
      intervaloAtivo = null;
      proximaRenovacaoEm = 0;
    }
  }

  // Liga/desliga apenas os avisos visuais. NÃO afeta a manutenção da sessão.
  function alternarNotificacoes() {
    notificacoesAtivas = !notificacoesAtivas;
    if (notificacoesAtivas) {
      log('Avisos na tela ligados pelo painel.');
      ultimaNotificacaoSucessoEm = 0; // permite avisar já na próxima renovação
      mostrarToast(NOME_SCRIPT + ': avisos ligados (sucesso a cada ' + INTERVALO_NOTIFICACAO_MINUTOS + ' min).', 'rgba(20, 110, 60, 0.95)');
    } else {
      log('Avisos na tela desligados pelo painel.');
      mostrarToast(NOME_SCRIPT + ': avisos desligados (a sessão continua sendo mantida).', 'rgba(150, 30, 30, 0.95)');
    }
  }

  // Se a aba ficou em segundo plano, o Chrome pode atrasar/congelar o timer. Quando
  // ela volta a ficar visível, checamos se a renovação está atrasada e, se estiver,
  // renovamos na hora — assim a sessão não fica desprotegida por causa de throttling.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && automacaoAtiva) {
      const atrasada = !proximaRenovacaoEm || Date.now() >= proximaRenovacaoEm;
      if (atrasada) {
        log('Aba voltou ao foco e a renovação estava atrasada — renovando agora.');
        renovarSessao('visibilidade');
      }
    }
  });

  inicializarPainelAuditoria(alternarAutomacao, alternarNotificacoes);

  log('Script carregado, mas DESLIGADO por padrão. Ligue pelo painel (ícone 👁️, lado direito) quando quiser começar a manter a sessão.');
  mostrarToast(NOME_SCRIPT + ' carregado — desligado. Ligue pelo painel.');
  pedirPermissaoNotificacao();
})();
