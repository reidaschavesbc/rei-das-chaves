# Rei das Chaves: site e painel na VPS

O site e o painel funcionam em um serviço separado do Sistema Chaveiro, sem banco de dados e sem token do GitHub em produção. O repositório mantém o código; os preços editados no painel ficam nas versões do site na VPS. Portanto, um novo deploy de código não deve sobrescrever a pasta de dados nem os preços sem uma reconciliação explícita.

## Estrutura

- Código: `/opt/reidaschaves-site/app`, somente leitura para o usuário do serviço.
- Usuário dedicado: `reidaschaves-site`, sem shell e sem privilégios administrativos.
- Dados exclusivos: `/var/lib/reidaschaves-site`.
- Site ativo: `/var/lib/reidaschaves-site/current`, apontando para uma versão imutável em `releases/`.
- Credencial derivada: `private/password.json`, com acesso restrito. A senha original não é gravada.
- Serviço: `reidaschaves-site.service`, porta interna `127.0.0.1:3010`.
- Configuração Nginx própria: `zz-reidaschaves-site`. O tráfego público de imagens, HTML e vídeos é entregue pelo Nginx; somente `/admin/` e `/api/` usam Node.js.
- HTTPS próprio para o domínio e `www`, com redirecionamento para o domínio principal. Configuração final em `nginx-https.conf`; `nginx-http.conf` é somente a preparação anterior ao HTTPS.
- Limites planejados: 192 MB máximos de RAM, 128 MB de faixa preferencial, 25% de um núcleo, 64 tarefas. O site compartilha o host e o Nginx com o sistema; isso não constitui isolamento físico.

## Primeiro acesso

Após apontar o DNS e ativar HTTPS, o responsável recebe um link de ativação. No primeiro acesso, entra com usuário `admin` e senha `admin`. Essa combinação é aceita apenas com o convite, e libera somente a tela obrigatória de definição de usuário e nova senha (mínimo de 12 caracteres). Não dá acesso aos produtos até essa troca. O convite deixa de funcionar quando o acesso definitivo é criado; `admin/admin` não permanece como credencial de produção.

O link de primeiro acesso usa `/admin/ativar/TOKEN`: o servidor valida o convite, grava um cookie HttpOnly/Secure/SameSite e redireciona para `/admin/`, retirando o token da barra. Essa autorização dura até quatro horas, só permite o acesso inicial enquanto a conta não foi configurada e não substitui usuário e senha. O painel consulta a existência do convite sem disponibilizar seu valor ao JavaScript. Os links antigos por fragmento continuam aceitos na mesma aba. Quando não há convite, a tela explica como abrir o primeiro acesso sem deixar o botão desativado. Chamadas de API têm limite de espera de 12 segundos.

Depois do login, **Minha conta** permite alterar usuário e senha mediante confirmação da senha atual. A alteração invalida as outras sessões. Credenciais no formato antigo (somente senha) continuam aceitas com usuário `admin`, preservando o hash existente.

O serviço tem sessão HttpOnly/Secure/SameSite, verificação de origem, limite de tentativas e não permite uma segunda criação da senha. Reiniciar o serviço invalida as sessões. O painel não deve ser habilitado em HTTP aberto.

## Renovação do HTTPS

O certificado e a conta da autoridade certificadora ficam em `/etc/reidaschaves-site/letsencrypt`, separados do Sistema Chaveiro. A emissão inicial usou TXT temporários para permitir preparar o HTTPS antes da troca do DNS. Após a troca, a configuração foi convertida para validação HTTP pelo diretório `/var/lib/reidaschaves-site/acme`, com simulação de renovação aprovada.

O timer independente `reidaschaves-site-cert-renew.timer` executa `reidaschaves-site-cert-renew.service` duas vezes ao dia, com atraso aleatório. O hook `/etc/reidaschaves-site/reload-nginx-after-renewal.sh` testa o Nginx antes de recarregar o certificado. Não altera a renovação do Sistema Chaveiro. Logs: `/var/log/reidaschaves-site-acme`.

Os TXT `_acme-challenge` e `_acme-challenge.www` podem ser removidos do painel do domínio depois da emissão: a renovação automática não depende deles.

## Atualização e reversão

O painel lê os HTMLs da versão ativa. Um salvamento valida os produtos, gera uma nova versão, altera o cartão e os dois preços na página do produto e publica tudo por troca atômica de link. As imagens são reaproveitadas por hard links; HTMLs alterados recebem novos arquivos. As cinco versões mais recentes são preservadas, além da versão inicial de instalação. Repetições não geram novas versões e edições de uma revisão antiga são recusadas.

Para reverter um preço, use o painel e informe o valor anterior. Uma reversão completa de versão pode ser feita pelo administrador trocando `current` atomicamente para uma versão conhecida dentro de `releases/`. Nunca edite um arquivo de uma versão diretamente: os arquivos que não mudaram podem estar compartilhados por hard links.

O backup das versões na própria VPS protege de alterações acidentais, mas não da perda da VPS. Uma cópia externa de `/var/lib/reidaschaves-site` deve ser incluída na rotina de backup antes de depender do painel no dia a dia.

## Desenvolvimento e testes

Node.js 20 ou superior, sem dependências adicionais. Os testes usam HTTP e arquivos temporários em Linux; não usam navegador nem alteram dados reais:

```sh
SITE_SOURCE=/caminho/dos/arquivos/publicos node --test admin-service/catalog.test.mjs admin-service/vps.test.mjs admin-service/login-ui.test.mjs
```

Não compartilhar `private/`, o convite ou os arquivos de ambiente no GitHub. O Nginx não deve entregar arquivos ocultos, o código de servidor, `release.json` nem diretórios privados.
