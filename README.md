# FVB Materiais

Catálogo estático para lojas de construção. Os visitantes podem pesquisar produtos, filtrar por categoria e marca, montar um carrinho e preparar um pedido para enviar pelo WhatsApp.

## Acessar o catálogo

O site é publicado pelo GitHub Pages:

https://grupotcc-jacob.github.io/Catalogo_FVB/

O catálogo é totalmente estático: não há servidor, cadastro/login, banco de dados nem painel administrativo. O envio do pedido abre uma conversa do WhatsApp com os itens e observações preenchidos; a pessoa precisa revisar e enviar a mensagem no WhatsApp.

## Funcionalidades

- Busca por nome, marca, categoria e código.
- Filtros por categoria e marca, com carregamento progressivo.
- Carrinho guardado localmente no navegador do visitante.
- Preparação do pedido pelo WhatsApp, incluindo quantidades, preços disponíveis, itens sob consulta, nome e observações.

O carrinho fica apenas no dispositivo/navegador de cada visitante. O pedido só chega à FVB quando o visitante confirma o envio da mensagem no WhatsApp. Preços e disponibilidade devem ser confirmados no atendimento.

## Desenvolver localmente

Não é necessário instalar dependências. Abra `docs/index.html` no navegador ou inicie um servidor estático na pasta `docs`:

```powershell
py -m http.server 8000 --directory docs
```

Abra `http://localhost:8000`.

Para executar os testes de integridade dos arquivos estáticos e dos dados:

```powershell
node --test
```

## Publicar pelo GitHub Pages

Nas configurações do repositório, abra **Settings → Pages** e configure:

1. **Build and deployment:** `Deploy from a branch`.
2. **Branch:** `main`.
3. **Folder:** `/docs`.
4. Clique em **Save** e acompanhe o deploy em **Actions**.

## Atualizar produtos

Edite `docs/catalog-products.js`, mantendo a lista `window.FVB_PRODUCTS` e os campos `name`, `priceCents`, `brand`, `category`, `sku`, `image` e `description`. Preços são armazenados em centavos; use `null` para itens sob consulta. As imagens devem ser caminhos relativos a `docs` ou endereços HTTPS.

## Configurar o WhatsApp

Edite a constante `WHATSAPP_NUMBER` no script de `docs/index.html`. Use código do país, DDD e telefone, sem espaços ou símbolos, por exemplo `5511999999999`.

O número comercial é público no site. Não coloque senhas, tokens ou outros segredos nos arquivos do catálogo.
