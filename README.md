# Catalogo_FVB

# FVB Materiais

Catálogo online da FVB Materiais para lojas de construção. Clientes podem pesquisar produtos por categoria, marca e código, montar um pedido e encaminhá-lo pelo WhatsApp. A equipe administra produtos e acompanha os pedidos em uma área protegida.

O catálogo inicial foi preenchido com os produtos e marcas identificáveis na planilha fornecida. Os preços foram importados das colunas de venda; itens sem preço utilizável aparecem como **Sob consulta**. Nenhum custo da planilha é publicado. Confirme preços, embalagem e disponibilidade antes de fechar cada pedido.

## Funcionalidades

- Catálogo responsivo com pesquisa por produto, marca, categoria e código, filtros por marca e categoria e carregamento progressivo.
- Cadastro e login de clientes.
- Carrinho salvo no navegador.
- Registro do pedido no sistema e abertura da conversa no WhatsApp.
- Painel restrito para cadastrar produtos com código opcional, preço ou cotação, desativá-los sem apagar o histórico e reativá-los.
- Consulta dos pedidos enviados pelo catálogo e atualização do status.
- Senhas protegidas com hash scrypt, sessões em SQLite, proteção CSRF, limitação de tentativas de login e endpoints administrativos autorizados no servidor.

## Requisitos

- Node.js 20 ou superior.
- npm.
- Conexão à internet para carregar Tailwind CSS e fontes servidos por CDN.

## Executar localmente

Abra um terminal nesta pasta e rode:

```powershell
npm install
Copy-Item .env.example .env
```

Edite `.env`:

1. Gere um valor aleatório longo para `SESSION_SECRET` e coloque-o no arquivo. No PowerShell, pode gerar um com:

   ```powershell
   $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
   $bytes = New-Object byte[] 48
   $rng.GetBytes($bytes)
   [Convert]::ToBase64String($bytes)
   $rng.Dispose()
   ```

2. Para criar o primeiro administrador, defina temporariamente `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Use uma senha forte com pelo menos 10 caracteres.
3. Crie a conta administrativa:

   ```powershell
   npm run admin:create
   ```

4. Apague `ADMIN_PASSWORD` do `.env` depois da criação. O `.env` e o banco de dados estão excluídos do Git.
5. Inicie a aplicação:

   ```powershell
   npm start
   ```

6. Acesse `http://localhost:3000`. Para entrar no painel, use a conta administrativa em `/login.html`; contas de cliente podem ser criadas pelo próprio formulário.

O catálogo **não funciona abrindo o arquivo HTML diretamente**: a autenticação, o banco e os pedidos dependem do servidor Node.js.

## Executar com Docker

Requisitos: Docker Desktop (com Docker Compose) ou Docker Engine com o plugin Compose.

1. Crie o arquivo de configuração local e gere um segredo para as sessões:

   ```powershell
   Copy-Item .env.docker.example .env
   $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
   $bytes = New-Object byte[] 48
   $rng.GetBytes($bytes)
   $secret = [Convert]::ToBase64String($bytes)
   $rng.Dispose()
   notepad .env
   ```

   Preencha `SESSION_SECRET` no `.env` com o conteúdo de `$secret` e salve o arquivo. O Compose não inicia sem esse segredo. Não compartilhe nem versione esse valor.

2. Compile e inicie a aplicação:

   ```powershell
   docker compose up --build -d
   ```

3. Acesse `http://localhost:3000`. Para criar o primeiro administrador, rode uma vez:

   ```powershell
   docker compose run --rm -e ADMIN_EMAIL="seu-email@exemplo.com" -e ADMIN_PASSWORD="uma-senha-forte-com-10-ou-mais-caracteres" app npm run admin:create
   ```

   Use o e-mail e a senha definitivos desejados. O comando não imprime nem salva a senha no arquivo `.env`.

Comandos úteis:

```powershell
docker compose logs -f app  # acompanhar os logs
docker compose restart      # reiniciar a aplicação
docker compose down         # parar e remover os containers
```

Os dados do SQLite ficam no volume Docker `catalog_data`, então permanecem após `docker compose down` e recriações da imagem. **Não use `docker compose down -v`**, pois isso também apaga o volume e os dados. Faça backups regulares desse volume antes de atualizações ou operações de manutenção.

## Painel administrativo

Depois de entrar com uma conta `admin`, acesse **Painel admin** no cabeçalho ou abra `/admin.html`.

No painel você pode:

- Pesquisar os produtos importados por nome, marca, categoria ou código.
- Cadastrar produto com nome, código, marca, categoria, preço opcional, descrição e endereço HTTPS da foto.
- Deixar o preço em branco para publicar o produto como **Sob consulta**.
- Desativar produtos sem apagá-los do banco; eles deixam de aparecer no catálogo, mas os pedidos antigos preservam os dados dos itens.
- Reativar produtos desativados.
- Consultar pedidos enviados pelo site e mudar seu status para **Novo**, **Em contato**, **Confirmado** ou **Cancelado**.

Os pedidos são registrados quando o cliente envia o formulário do catálogo. Isso registra uma solicitação comercial, **não confirma pagamento nem conclusão da venda**; a negociação acontece pelo WhatsApp.

## Personalização

### WhatsApp

O telefone da FVB está no bloco JavaScript de `Catalogo.html`:

```js
const WHATSAPP_NUMBER = "5514991622498";
```

Use código do país, DDD e número, sem espaços ou símbolos.

### Produtos iniciais

Os produtos importados são definidos em `catalog-products.js` e incluídos no banco quando ele é criado pela primeira vez. A planilha mistura abas atuais e antigas; os registros repetidos foram consolidados, mantendo a versão atual quando disponível. Nas abas de parafusos, o valor de venda da embalagem foi dividido pela quantidade da embalagem para mostrar o preço unitário. Os produtos sem preço utilizável são mantidos para cotação. As imagens usam um marcador local genérico; adicione fotos reais pelo painel quando disponíveis.

O preenchimento inicial acontece apenas quando a tabela de produtos está vazia. Se já existir um banco com produtos, ele não será substituído automaticamente; faça backup antes de qualquer migração ou importação manual.

### Dados locais

Por padrão, o banco SQLite fica em `data/fvb.sqlite`. Para escolher outro caminho, defina `DB_PATH` no `.env`. Faça cópias de segurança regulares desse arquivo.

## Testes

Execute:

```powershell
npm test
```

Os testes verificam cadastro e login, permissões de administrador, registro de pedidos com preços calculados no servidor, proteção contra requisições de outra origem e ativação/desativação de produtos.

## Publicação

Para uso real, publique em um serviço compatível com Node.js, configure `SESSION_SECRET` e `DB_PATH` como variáveis de ambiente, use HTTPS e habilite `TRUST_PROXY=true` quando o serviço estiver atrás de um proxy reverso confiável. O diretório do banco precisa ser persistente entre reinicializações e implantações; não use um disco efêmero para guardar pedidos e sessões.

Não coloque senhas, segredos ou o arquivo `.env` no repositório. Configure também rotina de backup e monitore o armazenamento do banco.

## Tecnologias

- HTML5, Tailwind CSS via CDN e JavaScript.
- Node.js e Express.
- SQLite (`better-sqlite3`) para contas, produtos, sessões e pedidos.
