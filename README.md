# Catalogo_LFI
Catalogo da empresa LFI Tools
# LFI Tools — catálogo para lojistas

Catálogo estático publicado no GitHub Pages, com autenticação, preços protegidos e painel administrativo fornecidos pelo Supabase.

## Rotas

- `?rota=catalogo` (padrão): catálogo público sem preços, carrinho ou pedidos.
- `?rota=login`: acesso à conta.
- `?rota=cadastro`: solicitação de cadastro de cliente com nome, loja, celular e cidade. Novas contas começam pendentes até confirmarem o e-mail e receberem aprovação.
- `?rota=conta`: atualizar contato, loja, cidade e foto do perfil.
- `?rota=senha`: recuperar o acesso ou definir uma nova senha pelo link enviado ao e-mail.
- `?rota=admin`: painel para aprovar/recusar clientes e adicionar, editar ou desativar produtos. O painel exige uma conta promovida a administradora.

O pedido do cliente aprovado continua sendo preparado no WhatsApp; o cliente revisa e envia a mensagem. O cadastro não cria um pedido automaticamente.

## Configuração inicial do Supabase

O projeto do site é servido por arquivos estáticos. A autenticação e a proteção dos preços ficam no banco/API do Supabase — não em verificações de interface. Preços não são publicados no diretório `docs`.

1. Crie um projeto Supabase.
2. No SQL Editor do projeto, execute o conteúdo atualizado de [`supabase/schema.sql`](./supabase/schema.sql). Se o esquema já foi configurado, execute o arquivo inteiro novamente para adicionar os campos do perfil, o armazenamento de fotos e o bucket de imagens dos produtos; os comandos são reaplicáveis.
3. Em **Authentication → URL Configuration**, defina `https://felipeino09.github.io/Catalogo_LFI/docs/` como URL principal e adicione `https://felipeino09.github.io/Catalogo_LFI/docs/**` e `http://localhost:8000/**` às URLs de redirecionamento permitidas.
4. Copie a URL do projeto e a chave pública `anon`/`publishable` para [`docs/supabase-config.js`](./docs/supabase-config.js). Essas duas informações são públicas por desenho. **Nunca** coloque a chave `service_role` nesse arquivo ou em qualquer arquivo dentro de `docs`.
5. Importe a planilha local `Extras/ProdutosFinal.xlsx` usando a chave `service_role` somente no terminal local. No PowerShell, na raiz do repositório:

   ```powershell
   $env:SUPABASE_URL = "https://SEU-PROJETO.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY = "SUA_CHAVE_SERVICE_ROLE"
   python supabase/import_products.py
   Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
   Remove-Item Env:SUPABASE_URL
   ```

   O importador usa apenas a biblioteca padrão do Python. Ele importa descrição, referência e preço; como a planilha não fornece imagens, o catálogo associa ilustrações locais por tipo de produto, como chaves, alicates, martelos e brocas. A importação usa o número da linha como identificador de origem e pode ser repetida para atualizar os produtos da planilha.
6. Cadastre a conta do proprietário pela tela de cadastro do site e confirme o e-mail, se a confirmação estiver habilitada. Promova essa conta a administradora no SQL Editor, substituindo pelo e-mail cadastrado:

   ```sql
   update public.profiles
   set role = 'admin', status = 'approved'
   where lower(email) = lower('seu-email@exemplo.com');
   ```

7. Publique `docs` pelo GitHub Pages e verifique o login, aprovação e painel. Nas configurações do Supabase, mantenha a confirmação de e-mail habilitada quando apropriado para sua operação.

As políticas de Row Level Security do esquema deixam a listagem pública limitada a nome, referência, imagem e descrição. Preços são obtidos por uma função que exige sessão aprovada; a chave de serviço deve permanecer privada. O painel pode aprovar ou recusar clientes, editar preços de produtos, desativar produtos sem removê-los e escolher fotos JPG, PNG ou WebP de até 5 MB pelo seletor de imagens do dispositivo. As fotos de produtos ficam no bucket público `product-images`, com envio e remoção restritos a administradores. Fotos de perfil ficam em outro bucket público para poderem aparecer no catálogo; oriente os clientes a usar apenas uma foto de perfil, sem informações privadas. Se o envio de uma foto for recusado, execute novamente `supabase/schema.sql` no SQL Editor para configurar os buckets e suas políticas.

## Desenvolver localmente

Inicie um servidor estático na pasta `docs`:

```powershell
py -m http.server 8000 --directory docs
```

Abra `http://localhost:8000`. Configure o projeto Supabase e a URL local antes de testar login, preços e painel.

Execute os testes:

```powershell
node --test
python -m py_compile supabase/import_products.py
```

## Publicar pelo GitHub Pages

Nas configurações do repositório, em **Settings → Pages**, selecione **Deploy from a branch**, branch `main` e pasta `/docs`. A página inicial da raiz redireciona para o catálogo.

Depois de editar `docs/supabase-config.js`, confira que ela contém somente a URL do projeto e a chave pública anon/publishable. Não publique chaves de serviço, senhas, tokens administrativos ou planilhas de preço em `docs`.
