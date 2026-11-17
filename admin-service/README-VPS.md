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

## Acesso e conta

Acesse `/admin/` e entre diretamente com usuário `admin` e senha `admin` enquanto nenhuma credencial personalizada tiver sido gravada. Não há convite, token ou etapa obrigatória de troca: o login abre os produtos.

Em **Minha conta**, o usuário pode alterar login e senha mediante confirmação da senha atual. As credenciais são derivadas com scrypt e gravadas em arquivo privado, sem armazenar a senha original. Ao salvar, as outras sessões são invalidadas e a combinação padrão deixa de ser aceita. Contas já configuradas são preservadas; arquivos antigos sem campo de usuário continuam funcionando com usuário `admin` e a senha que já estava salva.

As chamadas de API têm limite de espera de 12 segundos. Falhas liberam o botão para outra tentativa. O login mantém proteção de origem, limite de tentativas e cookies HttpOnly/Secure/SameSite. Links antigos de ativação redirecionam ao login comum e não controlam acesso.

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

## Protecoes revisadas em 17/11/2026

O Nginx precisa incluir `/etc/nginx/snippets/reidaschaves-site-security.conf`, instalado a partir de `admin-service/security-headers.conf`. O include aparece tambem nas rotas com `add_header` proprio, pois essas rotas nao herdam os cabecalhos do bloco superior nas versoes atuais deste servidor. Os cabecalhos acrescentam HSTS, nosniff, bloqueio de enquadramento, politica de referenciador e restricoes a objetos/base HTML. A politica mais restritiva do painel permanece ativa.

O proxy sobrescreve `X-Real-IP` com `$remote_addr`. O servidor usa esse valor somente quando a conexao vem de loopback, para separar tentativas de visitantes distintos. Nao exponha a porta 3010 nem repasse um valor de X-Real-IP fornecido pelo visitante.

O acesso padrao admin/admin continua conforme solicitado pelo proprietario. Enquanto nao for substituido em Minha conta, qualquer pessoa que conheca essa combinacao pode gerenciar o catalogo. A revisao nao alterou credenciais, nao modificou o banco e nao executou testes em navegador.
