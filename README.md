# Scripts 3º RI Goiânia

Userscripts (Tampermonkey) para automatizar tarefas repetitivas no dia a dia do cartório.

## Como instalar

1. Instale a extensão **Tampermonkey** no Chrome (ou Edge): https://www.tampermonkey.net/
2. Clique no link `raw` do script que quiser instalar (abaixo) — o Tampermonkey deve abrir automaticamente uma tela de instalação.
3. Confirme a instalação.

## Scripts disponíveis

### Vigia do Ofício
Mantém a sessão do certificado ativa no [oficioeletronico.com.br](https://oficioeletronico.com.br/), evitando que o timeout de inatividade derrube a sessão.

- Instalar: https://raw.githubusercontent.com/guilherme3rigoiania/scripts-3ri/main/vigia-do-oficio.user.js
- Só funciona na página inicial do site.
- Vem **desligado por padrão** — é preciso ligar manualmente pelo painel (ícone 👁️, meio da tela, lado direito) toda vez que abrir uma aba nova.

### Sentinela ONR
Automatiza os cliques do fluxo "Importar Pedidos" / "Atualizar Pedidos" do ONR - E-Protocolo no Asgard, sempre com autenticação manual do certificado.

- Instalar: https://raw.githubusercontent.com/guilherme3rigoiania/scripts-3ri/main/sentinela-onr.user.js
- Só funciona na tela de tarefas (`.../app/v1/#/tarefas`) do Asgard.
- Vem **desligado por padrão** — é preciso ligar manualmente pelo painel (canto inferior direito) toda vez que abrir uma aba nova.
- Não digita nem armazena nenhuma senha — a autenticação do certificado é sempre feita manualmente.

## Atualizações

Os dois scripts têm atualização automática configurada: o Tampermonkey confere periodicamente se há uma versão nova aqui no repositório e atualiza sozinho, sem precisar reinstalar.
