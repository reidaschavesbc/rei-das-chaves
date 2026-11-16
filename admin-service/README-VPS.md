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
- Limites planejados: 192 MB máximos de RAM, 128 MB de faixa preferencial, 25% de um núcleo, 64 tarefas. O site compartilha o host e o Nginx com o sistema; isso não constitui isolamento físico.

## Primeiro acesso

Após apontar o DNS e ativar HTTPS, o responsável recebe um link de ativação com um token de uso único. Define sua própria senha (mínimo de 12 caracteres) na tela e não precisa enviá-la no chat. O convite deixa de funcionar quando o acesso é criado. O token fica no fragmento do link e é removido da barra antes das chamadas de API.

O serviço tem sessão HttpOnly/Secure/SameSite, verificação de origem, limite de tentativas e não permite uma segunda criação da senha. Reiniciar o serviço invalida as sessões. O painel não deve ser habilitado em HTTP aberto.

## Atualização e reversão

O painel lê os HTMLs da versão ativa. Um salvamento valida os produtos, gera uma nova versão, altera o cartão e os dois preços na página do produto e publica tudo por troca atômica de link. As imagens são reaproveitadas por hard links; HTMLs alterados recebem novos arquivos. As cinco versões mais recentes são preservadas, além da versão inicial de instalação. Repetições não geram novas versões e edições de uma revisão antiga são recusadas.

Para reverter um preço, use o painel e informe o valor anterior. Uma reversão completa de versão pode ser feita pelo administrador trocando `current` atomicamente para uma versão conhecida dentro de `releases/`. Nunca edite um arquivo de uma versão diretamente: os arquivos que não mudaram podem estar compartilhados por hard links.

O backup das versões na própria VPS protege de alterações acidentais, mas não da perda da VPS. Uma cópia externa de `/var/lib/reidaschaves-site` deve ser incluída na rotina de backup antes de depender do painel no dia a dia.

## Desenvolvimento e testes

Node.js 20 ou superior, sem dependências adicionais. Os testes usam HTTP e arquivos temporários em Linux; não usam navegador nem alteram dados reais:

```sh
SITE_SOURCE=/caminho/dos/arquivos/publicos node --test admin-service/catalog.test.mjs admin-service/vps.test.mjs
```

Não compartilhar `private/`, o convite ou os arquivos de ambiente no GitHub. O Nginx não deve entregar arquivos ocultos, o código de servidor, `release.json` nem diretórios privados.
