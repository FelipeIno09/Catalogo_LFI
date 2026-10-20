(() => {
  "use strict";

  const WHATSAPP_NUMBER = "5514991622498";
  const STORAGE_KEY = "fvb-materiais-cart-v3";
  const PRODUCT_PAGE_SIZE = 48;
  const ADMIN_PRODUCT_PAGE_SIZE = 40;
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const elements = Object.fromEntries(
    [
      "admin-error",
      "admin-link",
      "admin-load-more",
      "admin-product-count",
      "admin-product-search",
      "admin-view",
      "account-avatar",
      "account-avatar-fallback",
      "account-error",
      "account-form",
      "account-status",
      "account-view",
      "app-notice",
      "auth-description",
      "auth-error",
      "auth-eyebrow",
      "auth-message",
      "auth-submit",
      "auth-title",
      "back-to-catalog",
      "cart-content",
      "cart-count",
      "cart-drawer",
      "cart-overlay",
      "cart-price-note",
      "cart-subtitle",
      "cart-total",
      "cart-total-label",
      "catalog-result-count",
      "checkout-button",
      "close-cart",
      "customer-list",
      "display-name-field",
      "display-name-input",
      "empty-state",
      "email-input",
      "forgot-password-link",
      "hero-view",
      "login-form",
      "login-link",
      "load-more-products",
      "logout-button",
      "menu-open-cart",
      "profile-menu",
      "profile-menu-account",
      "profile-menu-toggle",
      "password-input",
      "password-field",
      "new-password-field",
      "new-password-input",
      "product-admin-list",
      "product-create-form",
      "product-grid",
      "register-link",
      "register-prompt",
      "remove-profile-photo",
      "resend-confirmation-link",
      "profile-avatar",
      "profile-avatar-fallback",
      "profile-city",
      "profile-display-name",
      "profile-email",
      "profile-phone",
      "profile-photo-input",
      "profile-photo-name",
      "profile-store-name",
      "save-profile-button",
      "search-input",
      "signup-city-input",
      "signup-extra-fields",
      "signup-phone-input",
      "signup-store-input",
      "toggle-password",
      "login-view",
      "catalog-view",
    ].map((id) => [id, document.getElementById(id)])
  );

  const state = {
    client: null,
    session: null,
    profile: null,
    products: [],
    cart: [],
    searchTerm: "",
    visibleProductLimit: PRODUCT_PAGE_SIZE,
    adminProductLimit: ADMIN_PRODUCT_PAGE_SIZE,
    toastTimeout: null,
    authMode: "login",
    adminProductSearch: "",
    route: "catalogo",
    pendingProfilePhoto: null,
    removeProfilePhoto: false,
    passwordRecovery: false,
    avatarPreviewUrl: "",
  };

  const isApproved = () => state.profile?.status === "approved";
  const isAdmin = () => isApproved() && state.profile?.role === "admin";
  const canOrder = () => isApproved() && state.profile?.role === "customer";
  const cartStorageKey = () => `${STORAGE_KEY}:${state.session?.user?.id || "guest"}`;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function normalizeEmail(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function formatPhoneNumber(value) {
    let digits = String(value ?? "").replace(/\D/g, "");
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
      digits = digits.slice(2);
    }
    digits = digits.slice(0, 11);
    if (digits.length <= 2) return digits;

    const areaCode = digits.slice(0, 2);
    const subscriber = digits.slice(2);
    if (subscriber.length <= 8) {
      const firstPart = subscriber.slice(0, 4);
      const secondPart = subscriber.slice(4);
      return `(${areaCode}) ${firstPart}${secondPart ? `-${secondPart}` : ""}`;
    }
    return `(${areaCode}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`;
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(state.toastTimeout);
    state.toastTimeout = setTimeout(() => toast.classList.add("hidden"), 3200);
  }

  function setNotice(message, isError = false) {
    elements["app-notice"].textContent = message;
    elements["app-notice"].classList.toggle("hidden", !message);
    elements["app-notice"].classList.toggle("bg-[#f8ece8]", isError);
    elements["app-notice"].classList.toggle("text-[#8c4131]", isError);
    elements["app-notice"].classList.toggle("bg-[#eff3ed]", !isError);
    elements["app-notice"].classList.toggle("text-[#344c40]", !isError);
  }

  function setAccountError(message) {
    elements["account-error"].textContent = message;
    elements["account-error"].classList.toggle("hidden", !message);
  }

  function setAuthMessage(message, isError = false) {
    const target = isError ? elements["auth-error"] : elements["auth-message"];
    const other = isError ? elements["auth-message"] : elements["auth-error"];
    other.textContent = "";
    other.classList.add("hidden");
    target.textContent = message;
    target.classList.toggle("hidden", !message);
  }

  function currentRoute() {
    const route = new URLSearchParams(window.location.search).get("rota");
    return ["login", "cadastro", "admin", "conta", "senha"].includes(route) ? route : "catalogo";
  }

  function getAvatarUrl(path) {
    if (!path || !state.client) return "";
    const { data } = state.client.storage.from("profile-photos").getPublicUrl(path);
    return data.publicUrl;
  }

  function clearAvatarPreview() {
    if (!state.avatarPreviewUrl) return;
    URL.revokeObjectURL(state.avatarPreviewUrl);
    state.avatarPreviewUrl = "";
  }

  function getProductIllustration(name, description = "", image = "") {
    const defaultImages = ["./product-placeholder.svg", "./images/products/generic.svg"];
    if (image && !defaultImages.includes(image)) return image;

    const terms = `${name} ${description}`
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
    const illustrations = [
      [/\b(fenda|philips|phillips|bit|bits|canhao)\b/, "screwdriver"],
      [/\b(biela|combinada|inglesa|estrela|soquete|fixa|grifo|roda|catraca)\b/, "wrench"],
      [/\b(alicate|torques)\b/, "pliers"],
      [/\bmartelo\b/, "hammer"],
      [/\b(broca|mandril|furadeira|parafusadeira)\b/, "drill-bit"],
      [/\b(serra|serrote|arco de serra)\b/, "saw"],
      [/\b(disco|lixa|desbaste|rebolo|lima)\b/, "abrasive"],
      [/\b(trena|nivel|esquadro|metro|paquimetro|prumo)\b/, "measuring"],
      [/\bfita isolante\b/, "electrical"],
      [/\bfita\b/, "tape"],
      [/\b(pincel|rolo|tinta|trincha|escova|broxa)\b/, "painting"],
      [/\b(torneira|registro|valvula|mangueira|engate|esguicho|bomba|niple|acabamento|mecanismo)\b/, "plumbing"],
      [/\b(parafuso|bucha|abracadeira|abraca|porca|arruela|rebite|pino|grampo|cantoneira|dobradica|flange|chaveta)\b/, "fasteners"],
      [/\b(fio|eletrodo|multimetro|tomada|interruptor|conector|cabo de forca|arame mig|chave teste)\b/, "electrical"],
      [/\b(formao|tesoura|estilete|lamina|talhadeira|raspador|espatula|aplicador)\b/, "hand-tools"],
      [/\b(colher|desempenadeira|sacho|enxada)\b/, "masonry"],
    ];
    const match = illustrations.find(([pattern]) => pattern.test(terms));
    return `./images/products/${match ? match[1] : "generic"}.svg`;
  }

  function routeUrl(route) {
    const url = new URL(window.location.href);
    if (route === "catalogo") url.searchParams.delete("rota");
    else url.searchParams.set("rota", route);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function renderRoute() {
    state.route = currentRoute();
    const adminRouteAllowed = state.route === "admin" && isAdmin();
    const accountRouteAllowed = state.route === "conta" && Boolean(state.session?.user && state.profile);
    const loginVisible = state.route === "login" || state.route === "cadastro" ||
      state.route === "senha" ||
      ((state.route === "admin" || state.route === "conta") && !accountRouteAllowed && !isAdmin());
    elements["login-view"].hidden = !loginVisible;
    elements["admin-view"].hidden = !adminRouteAllowed;
    elements["account-view"].hidden = !accountRouteAllowed;
    elements["catalog-view"].hidden = loginVisible || adminRouteAllowed || accountRouteAllowed;
    elements["hero-view"].hidden = loginVisible || adminRouteAllowed || accountRouteAllowed;

    if (loginVisible) {
      setNotice(
        state.route === "cadastro"
          ? "Crie sua solicitação de acesso: confirme o e-mail e aguarde nossa equipe aprovar seu cadastro."
          : state.route === "senha"
            ? "Use o e-mail da sua conta. Enviaremos um link seguro para você criar uma senha nova."
            : state.route === "admin"
              ? "Acesso restrito: entre com a conta de administrador autorizada."
              : "Entre para consultar preços e preparar pedidos. Ainda não tem acesso? Solicite seu cadastro nesta página."
      );
    }

    if (state.route === "cadastro") {
      setAuthMode("signup");
    } else if (state.route === "senha") {
      setAuthMode(state.passwordRecovery ? "recovery" : "reset");
    } else if (loginVisible) {
      setAuthMode("login");
      if (state.route === "admin") {
        elements["auth-title"].textContent = "Acesso administrativo";
        elements["auth-description"].textContent = "Entre com uma conta de administrador autorizada.";
        elements["register-link"].classList.add("hidden");
        elements["register-prompt"].classList.add("hidden");
        elements["forgot-password-link"].classList.add("hidden");
      } else if (state.route === "conta" && !state.session?.user) {
        elements["auth-description"].textContent = "Entre para acessar seus dados, telefone e foto do perfil.";
      }
    }

    if (accountRouteAllowed) renderAccount();
    if (adminRouteAllowed) {
      loadAdminData().catch((error) => reportAdminError(error));
    }
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    const isSignup = mode === "signup";
    const isRecovery = mode === "recovery";
    const isReset = mode === "reset";
    const passwordRecovery = isRecovery || isReset;
    elements["display-name-field"].classList.toggle("hidden", !isSignup);
    elements["signup-extra-fields"].classList.toggle("hidden", !isSignup);
    elements["display-name-input"].required = isSignup;
    elements["display-name-input"].autocomplete = "name";
    elements["password-field"].classList.toggle("hidden", passwordRecovery);
    elements["password-input"].required = !passwordRecovery;
    elements["new-password-field"].classList.toggle("hidden", !isRecovery);
    elements["new-password-input"].required = isRecovery;
    elements["toggle-password"].classList.toggle("hidden", passwordRecovery);
    elements["forgot-password-link"].classList.toggle("hidden", isSignup || passwordRecovery || state.route === "admin");
    elements["resend-confirmation-link"].classList.add("hidden");
    elements["auth-eyebrow"].textContent = isSignup ? "Novo cliente" : "Área do cliente";
    elements["auth-title"].textContent = isSignup
      ? "Solicite seu acesso"
      : isRecovery ? "Crie uma nova senha"
        : isReset ? "Recuperar acesso" : "Entre na sua conta";
    elements["auth-description"].textContent = isSignup
      ? "Etapas: envie seus dados, confirme o e-mail pelo link recebido e aguarde a aprovação da equipe para consultar preços e preparar pedidos."
      : isRecovery ? "Escolha uma senha nova para continuar acessando sua conta."
        : isReset ? "Informe seu e-mail e enviaremos um link seguro para redefinir sua senha."
          : "Entre com seu e-mail e senha. Preços e pedidos são liberados depois que a equipe aprova seu cadastro.";
    elements["auth-submit"].textContent = isSignup
      ? "Enviar solicitação de cadastro"
      : isRecovery ? "Salvar nova senha"
        : isReset ? "Enviar link de recuperação" : "Entrar";
    elements["register-prompt"].classList.toggle("hidden", isSignup);
    elements["register-link"].classList.toggle("hidden", isSignup);
    elements["back-to-catalog"].classList.toggle("hidden", isSignup || passwordRecovery);
    setAuthMessage("");
  }

  function renderAccount() {
    if (!state.profile || !state.session?.user) return;
    clearAvatarPreview();
    elements["profile-display-name"].value = state.profile.display_name || "";
    elements["profile-store-name"].value = state.profile.store_name || "";
    elements["profile-email"].value = state.profile.email || state.session.user.email || "";
    elements["profile-phone"].value = formatPhoneNumber(state.profile.phone);
    elements["profile-city"].value = state.profile.city || "";
    elements["account-error"].classList.add("hidden");
    elements["profile-photo-input"].value = "";
    elements["profile-photo-name"].textContent = "";
    state.pendingProfilePhoto = null;
    state.removeProfilePhoto = false;
    const avatarUrl = getAvatarUrl(state.profile.avatar_path);
    elements["profile-avatar"].hidden = !avatarUrl;
    elements["profile-avatar-fallback"].classList.toggle("hidden", Boolean(avatarUrl));
    if (avatarUrl) elements["profile-avatar"].src = avatarUrl;
    else elements["profile-avatar"].removeAttribute("src");
    elements["remove-profile-photo"].classList.toggle("hidden", !avatarUrl);
    const statusText = state.profile.status === "approved"
      ? "Seu acesso está aprovado. Os preços aparecem no catálogo; você pode montar um pedido e revisar tudo antes de enviá-lo pelo WhatsApp."
      : state.profile.status === "rejected"
        ? "Seu cadastro não foi aprovado. Fale com nossa equipe pelo WhatsApp para saber como solicitar uma nova análise."
        : "Seu cadastro está aguardando aprovação. Enquanto isso, você pode navegar pelo catálogo, mas os preços e pedidos ficam indisponíveis. Nossa equipe precisa aprovar seu acesso.";
    elements["account-status"].textContent = `${statusText} E-mail da conta: ${state.profile.email || state.session.user.email}.`;
  }

  function updateHeader() {
    const loggedIn = Boolean(state.session?.user);
    elements["login-link"].classList.toggle("hidden", loggedIn);
    elements["logout-button"].hidden = !loggedIn;
    elements["logout-button"].classList.toggle("hidden", !loggedIn);
    elements["admin-link"].hidden = !isAdmin();
    elements["admin-link"].classList.toggle("hidden", !isAdmin());
    elements["menu-open-cart"].hidden = !canOrder();
    elements["menu-open-cart"].classList.toggle("hidden", !canOrder());
    const avatarUrl = getAvatarUrl(state.profile?.avatar_path);
    elements["account-avatar"].hidden = !avatarUrl;
    elements["account-avatar-fallback"].classList.toggle("hidden", Boolean(avatarUrl));
    if (avatarUrl) elements["account-avatar"].src = avatarUrl;
    else elements["account-avatar"].removeAttribute("src");
    if (!canOrder()) {
      state.cart = [];
      renderCart();
    }
  }

  function normalizeProduct(product) {
    return {
      id: product.id,
      nome: product.name,
      sku: product.sku || "",
      preco: Number.isInteger(product.price_cents) ? product.price_cents / 100 : null,
      imagem: getProductIllustration(product.name, product.description, product.image),
      descricao: product.description || "",
      ativo: product.active !== false,
    };
  }

  async function loadProducts() {
    let result;
    if (isAdmin() && state.route === "admin") {
      result = await state.client.rpc("admin_list_products");
    } else if (isApproved()) {
      result = await state.client.rpc("products_with_prices");
    } else {
      result = await state.client
        .from("products")
        .select("id,name,sku,image,description,active")
        .eq("active", true)
        .order("name")
        .range(0, 999);
    }

    if (result.error) throw result.error;
    state.products = (result.data || []).map(normalizeProduct);
    const productById = new Map(state.products.map((product) => [product.id, product]));
    state.cart = canOrder()
      ? loadCart().filter((item) => productById.has(item.id))
      : [];
    renderProducts();
    renderCart();
    saveCart();
  }

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(cartStorageKey()) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.filter((item) =>
        item &&
        typeof item.id === "string" &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0
      );
    } catch (error) {
      console.error("Não foi possível ler o carrinho salvo:", error);
      showToast("Não foi possível ler o carrinho salvo neste dispositivo.");
      return [];
    }
  }

  function saveCart() {
    if (!canOrder()) return;
    try {
      localStorage.setItem(cartStorageKey(), JSON.stringify(state.cart));
    } catch (error) {
      console.error("Não foi possível salvar o carrinho:", error);
      showToast("Não foi possível salvar o carrinho neste dispositivo.");
    }
  }

  function formatPrice(price) {
    return price === null ? "Sob consulta" : money.format(price);
  }

  function renderProducts() {
    const matchingProducts = state.products.filter((product) => [
      product.nome,
      product.sku,
      product.descricao,
    ].join(" ").toLocaleLowerCase("pt-BR").includes(state.searchTerm));
    const visibleProducts = matchingProducts.slice(0, state.visibleProductLimit);

    elements["empty-state"].classList.toggle("hidden", matchingProducts.length > 0);
    elements["catalog-result-count"].textContent =
      `${matchingProducts.length.toLocaleString("pt-BR")} produtos encontrados`;
    elements["load-more-products"].classList.toggle("hidden", visibleProducts.length >= matchingProducts.length);
    elements["product-grid"].innerHTML = visibleProducts.map((product) => `
      <article class="product-card overflow-hidden rounded-[20px] border border-[#eceae4] bg-white shadow-[0_5px_18px_-15px_#29332955]">
        <div class="image-zoom relative aspect-[1/1] overflow-hidden bg-[#eeede7]">
          <img src="${escapeHtml(product.imagem)}" alt="${escapeHtml(product.nome)}" loading="lazy" class="h-full w-full object-cover">
        </div>
        <div class="p-3 sm:p-4">
          <h3 class="font-display min-h-[38px] text-center text-[13px] font-bold leading-[1.4] tracking-[-.02em] text-[#28362d] sm:min-h-0 sm:text-base">${escapeHtml(product.nome)}</h3>
          ${product.sku ? `<p class="mt-1 text-center text-[10px] text-[#92948d]">Ref. ${escapeHtml(product.sku)}</p>` : ""}
          ${product.descricao ? `<p class="mt-1.5 hidden min-h-[40px] text-center text-xs leading-5 text-[#85877f] sm:block">${escapeHtml(product.descricao)}</p>` : ""}
          ${isApproved() ? `
            <div class="mt-2.5 flex items-center justify-between gap-1 sm:mt-3">
              <span class="font-display text-sm font-extrabold tracking-[-.03em] text-[#344c40] sm:text-base">${formatPrice(product.preco)}</span>
              ${canOrder() ? `<button type="button" data-add="${escapeHtml(product.id)}" class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#edf1ed] text-[#344c40] transition hover:bg-[#344c40] hover:text-white focus:outline-none focus:ring-4 focus:ring-[#344c40]/15 sm:flex sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3" aria-label="Adicionar ${escapeHtml(product.nome)} ao carrinho"><span aria-hidden="true">+</span><span class="hidden text-xs font-bold sm:inline">Adicionar</span></button>` : ""}
            </div>
          ` : `<p class="mt-3 text-xs font-semibold text-[#54735d]">Entre para consultar preços e fazer pedidos.</p>`}
          ${product.descricao ? `<p class="mt-2 line-clamp-2 text-center text-[10px] leading-4 text-[#92948d] sm:hidden">${escapeHtml(product.descricao)}</p>` : ""}
        </div>
      </article>
    `).join("");
    applyImageFallbacks(elements["product-grid"]);
  }

  function renderCart() {
    const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    const productsById = new Map(state.products.map((product) => [product.id, product]));
    const cartProducts = state.cart.map((item) => productsById.get(item.id)).filter(Boolean);
    const hasQuoteItems = cartProducts.some((product) => product.preco === null);
    const total = state.cart.reduce(
      (sum, item) => sum + (productsById.get(item.id)?.preco || 0) * item.quantity,
      0
    );

    elements["cart-count"].textContent = String(totalItems);
    elements["menu-open-cart"].setAttribute(
      "aria-label",
      `Abrir carrinho, ${totalItems} ${totalItems === 1 ? "item" : "itens"}`
    );
    elements["cart-total"].textContent =
      hasQuoteItems && total === 0 ? "Sob consulta" : money.format(total);
    elements["cart-total-label"].textContent = hasQuoteItems ? "Subtotal conhecido" : "Total do pedido";
    elements["cart-price-note"].textContent = hasQuoteItems
      ? "Itens sem preço cadastrado serão cotados pelo WhatsApp."
      : "Preços e disponibilidade serão confirmados no atendimento.";
    elements["cart-subtitle"].textContent = totalItems === 0
      ? "Monte sua consulta de produtos"
      : `${totalItems} ${totalItems === 1 ? "item selecionado" : "itens selecionados"}`;
    elements["checkout-button"].disabled = totalItems === 0;

    if (!cartProducts.length) {
      elements["cart-content"].innerHTML = `
        <div class="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
          <p class="font-display text-base font-bold text-[#3a473d]">Seu pedido está vazio</p>
          <p class="mt-1 max-w-[230px] text-xs leading-5 text-[#85877f]">Adicione produtos para montar sua consulta.</p>
          <button type="button" data-close-cart class="mt-4 rounded-full bg-[#344c40] px-4 py-2.5 text-xs font-semibold text-white">Ver catálogo</button>
        </div>`;
      return;
    }

    elements["cart-content"].innerHTML = `<div class="space-y-4">${state.cart.map((item) => {
      const product = productsById.get(item.id);
      if (!product) return "";
      return `
        <article class="flex gap-3 border-b border-[#eeede7] pb-4">
          <img src="${escapeHtml(product.imagem)}" alt="" class="h-[76px] w-[76px] shrink-0 rounded-2xl bg-[#eeede7] object-cover">
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 class="font-display truncate text-sm font-bold text-[#303a32]">${escapeHtml(product.nome)}</h3>
                <p class="mt-1 text-xs font-semibold text-[#54735d]">${formatPrice(product.preco)}</p>
              </div>
              <button type="button" data-remove="${escapeHtml(product.id)}" class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#a1a29c] hover:bg-[#f8ece8] hover:text-[#ae5d48]" aria-label="Remover ${escapeHtml(product.nome)} do carrinho">×</button>
            </div>
            <div class="mt-2.5 flex items-center justify-between">
              <div class="inline-flex h-8 items-center rounded-lg border border-[#e7e5de] bg-white">
                <button type="button" data-quantity="${escapeHtml(product.id)}" data-delta="-1" class="grid h-8 w-8 place-items-center" aria-label="Diminuir quantidade">−</button>
                <span class="w-6 text-center text-xs font-bold">${item.quantity}</span>
                <button type="button" data-quantity="${escapeHtml(product.id)}" data-delta="1" class="grid h-8 w-8 place-items-center" aria-label="Aumentar quantidade">+</button>
              </div>
              <span class="text-xs font-bold">${product.preco === null ? "Sob consulta" : money.format(product.preco * item.quantity)}</span>
            </div>
          </div>
        </article>`;
    }).join("")}</div>`;
    applyImageFallbacks(elements["cart-content"]);
  }

  function addToCart(id) {
    if (!canOrder()) {
      showToast("Para adicionar itens ao pedido, entre com uma conta de cliente aprovada pela equipe.");
      return;
    }
    const product = state.products.find((item) => item.id === id);
    if (!product) return;
    const item = state.cart.find((entry) => entry.id === id);
    if (item) item.quantity += 1;
    else state.cart.push({ id, quantity: 1 });
    saveCart();
    renderCart();
    showToast(`${product.nome} adicionado ao carrinho`);
  }

  function openCart() {
    if (!canOrder()) return;
    elements["cart-overlay"].classList.remove("hidden");
    elements["cart-drawer"].classList.remove("translate-x-full");
    elements["cart-drawer"].setAttribute("aria-hidden", "false");
    elements["cart-overlay"].setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    elements["close-cart"].focus();
  }

  function closeCart() {
    elements["cart-overlay"].classList.add("hidden");
    elements["cart-drawer"].classList.add("translate-x-full");
    elements["cart-drawer"].setAttribute("aria-hidden", "true");
    elements["cart-overlay"].setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (canOrder()) elements["profile-menu-toggle"].focus();
  }

  function setProfileMenuOpen(isOpen) {
    elements["profile-menu"].hidden = !isOpen;
    elements["profile-menu"].classList.toggle("hidden", !isOpen);
    elements["profile-menu-toggle"].setAttribute("aria-expanded", String(isOpen));
  }

  function closeProfileMenu() {
    setProfileMenuOpen(false);
  }

  async function checkout() {
    if (!canOrder() || state.cart.length === 0) return;
    if (!/^\d{10,15}$/.test(WHATSAPP_NUMBER)) {
      showToast("Configure um número de WhatsApp válido.");
      return;
    }
    const customerName = document.getElementById("customer-name").value.trim() || state.profile.display_name || "Cliente";
    const notes = document.getElementById("customer-notes").value.trim();
    const productsById = new Map(state.products.map((product) => [product.id, product]));
    const items = state.cart
      .map((item) => ({ product: productsById.get(item.id), quantity: item.quantity }))
      .filter((item) => item.product);
    const total = items.reduce(
      (sum, item) => sum + (item.product.preco || 0) * item.quantity,
      0
    );
    const hasQuoteItems = items.some((item) => item.product.preco === null);
    const lines = [
      `*Pedido para LFI Tools — ${customerName}*`,
      "----------------------------------",
      ...items.map(({ product, quantity }) =>
        `• ${quantity}x ${product.nome}${product.sku ? ` (ref. ${product.sku})` : ""} - ${product.preco === null ? "sob consulta" : money.format(product.preco * quantity)}`
      ),
      "----------------------------------",
      `${hasQuoteItems ? "*Subtotal dos itens com preço:*" : "*Total:*"} ${money.format(total)}`,
      `*Cidade/Endereço/Obs:* ${notes || "Não informado"}`,
    ];
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
    const whatsappWindow = window.open(whatsappUrl, "_blank");
    if (whatsappWindow) whatsappWindow.opener = null;
    else window.location.assign(whatsappUrl);
    state.cart = [];
    saveCart();
    renderCart();
    closeCart();
    showToast("Pedido preparado no WhatsApp. Confira e envie a mensagem.");
  }

  function applyImageFallbacks(container) {
    container.querySelectorAll("img").forEach((image) => {
      image.addEventListener("error", () => {
        if (image.dataset.fallbackApplied) return;
        image.dataset.fallbackApplied = "true";
        image.src = "./images/products/generic.svg";
      }, { once: true });
    });
  }

  function reportAdminError(error) {
    console.error("Falha ao carregar o painel administrativo:", error);
    elements["admin-error"].textContent = `Não foi possível carregar o painel: ${error.message || error}`;
    elements["admin-error"].classList.remove("hidden");
  }

  async function loadAdminData() {
    if (!isAdmin()) return;
    elements["admin-error"].classList.add("hidden");
    const [customersResult, productsResult] = await Promise.all([
      state.client
        .from("profiles")
        .select("id,email,display_name,store_name,phone,city,status,created_at")
        .eq("role", "customer")
        .order("created_at", { ascending: false })
        .range(0, 999),
      state.client.rpc("admin_list_products"),
    ]);
    if (customersResult.error) throw customersResult.error;
    if (productsResult.error) throw productsResult.error;
    renderCustomers(customersResult.data || []);
    state.products = (productsResult.data || []).map(normalizeProduct);
    renderAdminProducts();
    renderProducts();
  }

  function renderCustomers(customers) {
    if (!customers.length) {
      elements["customer-list"].innerHTML = '<p class="text-sm text-[#737b74]">Nenhum cliente cadastrado ainda.</p>';
      return;
    }
    elements["customer-list"].innerHTML = customers.map((customer) => `
      <article class="flex flex-col gap-3 rounded-xl border border-[#eceae4] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-[#28362d]">${escapeHtml(customer.display_name || "Cliente")}</p>
            ${customer.store_name ? `<p class="truncate text-xs text-[#54735d]">${escapeHtml(customer.store_name)}</p>` : ""}
            <p class="truncate text-xs text-[#737b74]">${escapeHtml(customer.email)}${customer.phone ? ` · ${escapeHtml(customer.phone)}` : ""}</p>
            <p class="mt-1 text-xs text-[#85877f]">Situação: ${escapeHtml(customer.status)}${customer.city ? ` · ${escapeHtml(customer.city)}` : ""}</p>
        </div>
        <div class="flex shrink-0 justify-center gap-2 sm:justify-start">
          ${customer.status !== "approved" ? `<button type="button" data-profile-id="${escapeHtml(customer.id)}" data-status="approved" class="rounded-lg bg-[#344c40] px-3 py-2 text-xs font-bold text-white">Aprovar</button>` : ""}
          ${customer.status !== "rejected" ? `<button type="button" data-profile-id="${escapeHtml(customer.id)}" data-status="rejected" class="rounded-lg border border-[#e2e5e1] px-3 py-2 text-xs font-bold text-[#8c4131]">Recusar</button>` : ""}
        </div>
      </article>
    `).join("");
  }

  function renderAdminProducts() {
    const query = state.adminProductSearch.toLocaleLowerCase("pt-BR");
    const matching = state.products.filter((product) =>
      `${product.nome} ${product.sku}`.toLocaleLowerCase("pt-BR").includes(query)
    );
    const visible = matching.slice(0, state.adminProductLimit);
    elements["admin-product-count"].textContent =
      `${matching.length.toLocaleString("pt-BR")} produtos`;
    elements["admin-load-more"].classList.toggle("hidden", visible.length >= matching.length);
    elements["product-admin-list"].innerHTML = visible.map((product) => `
      <form data-product-id="${escapeHtml(product.id)}" class="grid gap-2 rounded-xl border border-[#eceae4] p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input name="name" required maxlength="200" aria-label="Nome do produto" value="${escapeHtml(product.nome)}" class="h-10 rounded-lg border border-[#e2e5e1] px-2 text-sm">
        <input name="sku" maxlength="80" aria-label="Referência" value="${escapeHtml(product.sku)}" placeholder="Referência" class="h-10 rounded-lg border border-[#e2e5e1] px-2 text-sm">
        <input name="price" type="number" required min="0" step="0.01" aria-label="Preço em reais" value="${product.preco === null ? "" : product.preco.toFixed(2)}" class="h-10 rounded-lg border border-[#e2e5e1] px-2 text-sm">
        <input name="image" required maxlength="1000" aria-label="Imagem" value="${escapeHtml(product.imagem)}" class="h-10 rounded-lg border border-[#e2e5e1] px-2 text-sm">
        <input name="description" maxlength="1000" aria-label="Descrição" value="${escapeHtml(product.descricao)}" placeholder="Descrição" class="h-10 rounded-lg border border-[#e2e5e1] px-2 text-sm sm:col-span-2">
        <label class="flex items-center gap-2 px-2 text-sm text-[#555c53]">
          <input name="active" type="checkbox" ${product.ativo ? "checked" : ""}> Ativo
        </label>
        <button type="submit" class="min-h-10 rounded-lg bg-[#344c40] px-3 text-xs font-bold text-white">Salvar alterações</button>
      </form>
    `).join("");
  }

  async function refreshSession() {
    const previousUserId = state.session?.user?.id || null;
    const { data, error } = await state.client.auth.getSession();
    if (error) throw error;
    state.session = data.session;
    state.profile = null;
    if (state.session?.user) {
      const result = await state.client
        .from("profiles")
        .select("id,email,display_name,store_name,phone,city,avatar_path,role,status")
        .eq("id", state.session.user.id)
        .single();
      if (result.error) {
        setNotice(`Não foi possível validar sua conta: ${result.error.message}`, true);
      } else {
        state.profile = result.data;
        setNotice(
          state.profile.status === "pending"
            ? "Cadastro pendente: você ainda pode navegar pelo catálogo. Para consultar preços e fazer pedidos, aguarde a aprovação da nossa equipe."
            : state.profile.status === "rejected"
              ? "Não foi possível liberar o acesso neste cadastro. Fale com nossa equipe pelo botão WhatsApp para receber orientação."
              : isAdmin()
                ? "Acesso de administrador liberado. Use o botão Painel para gerenciar produtos e cadastros."
                : "Acesso aprovado! Os preços e as opções para montar pedidos já estão disponíveis no catálogo."
        );
      }
    } else {
      setNotice("Explore o catálogo sem entrar. Para consultar preços e montar pedidos, entre ou solicite seu acesso de cliente.");
    }

    if (previousUserId !== (state.session?.user?.id || null)) {
      state.cart = [];
    }
    updateHeader();
    await loadProducts();
    renderRoute();
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthMessage("");
    const email = normalizeEmail(elements["email-input"].value);
    elements["email-input"].value = email;
    const password = elements["password-input"].value;
    elements["auth-submit"].disabled = true;
    try {
      if (state.authMode === "signup") {
        const displayName = elements["display-name-input"].value.trim();
        const storeName = elements["signup-store-input"].value.trim();
        const phone = formatPhoneNumber(elements["signup-phone-input"].value);
        const city = elements["signup-city-input"].value.trim();
        const { data, error } = await state.client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${routeUrl("login")}`,
            data: { display_name: displayName, store_name: storeName, phone, city },
          },
        });
        if (error) throw error;
        if (data.session) {
          state.session = data.session;
          await refreshSession();
          window.history.replaceState({}, "", routeUrl("catalogo"));
          renderRoute();
        } else {
          setAuthMessage("Solicitação enviada. 1. Abra o e-mail de confirmação (confira também o spam). 2. Clique no link para confirmar seu endereço. 3. Aguarde a aprovação da equipe. Você só verá preços depois da aprovação.");
        }
      } else if (state.authMode === "reset") {
        const { error } = await state.client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${routeUrl("senha")}`,
        });
        if (error) throw error;
        setAuthMessage("Se existir uma conta com esse e-mail, enviaremos um link seguro para redefinir sua senha. Confira também o spam.");
      } else if (state.authMode === "recovery") {
        const newPassword = elements["new-password-input"].value;
        const { error } = await state.client.auth.updateUser({ password: newPassword });
        if (error) throw error;
        state.passwordRecovery = false;
        window.history.replaceState({}, "", routeUrl("login"));
        renderRoute();
        setAuthMessage("Senha alterada com sucesso. Faça login com sua nova senha.");
      } else {
        const requestedRoute = state.route;
        const { error } = await state.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await refreshSession();
        const nextRoute = requestedRoute === "admin" && isAdmin() ? "admin" : "catalogo";
        window.history.replaceState({}, "", routeUrl(nextRoute));
        renderRoute();
      }
    } catch (error) {
      console.error("Falha na autenticação:", error);
      const errorMessage = String(error.message || "");
      if (/email not confirmed/i.test(errorMessage)) {
        elements["resend-confirmation-link"].classList.remove("hidden");
        setAuthMessage("Seu e-mail ainda não foi confirmado. Abra a mensagem de confirmação que enviamos ou use a opção para reenviá-la.", true);
      } else if (/invalid login credentials/i.test(errorMessage)) {
        setAuthMessage("E-mail ou senha não conferem. Confira os dados ou use “Esqueci minha senha”.", true);
      } else if (/password should be at least/i.test(errorMessage)) {
        setAuthMessage("Escolha uma senha com pelo menos 8 caracteres.", true);
      } else if (/email rate limit exceeded|rate limit.*email/i.test(errorMessage)) {
        setAuthMessage("O limite de envio de e-mails foi atingido. Aguarde antes de tentar novamente; várias tentativas seguidas não aceleram o envio.", true);
      } else {
        setAuthMessage(error.message || "Não foi possível concluir a solicitação. Tente novamente.", true);
      }
    } finally {
      elements["auth-submit"].disabled = false;
    }
  }

  async function resendConfirmation() {
    const email = normalizeEmail(elements["email-input"].value);
    elements["email-input"].value = email;
    if (!email) {
      setAuthMessage("Digite seu e-mail acima para enviarmos uma nova confirmação.", true);
      elements["email-input"].focus();
      return;
    }
    elements["resend-confirmation-link"].disabled = true;
    try {
      const { error } = await state.client.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}${routeUrl("login")}` },
      });
      if (error) throw error;
      elements["resend-confirmation-link"].classList.add("hidden");
      setAuthMessage("Se o cadastro ainda precisar de confirmação, enviaremos outro e-mail. Confira a caixa de entrada e o spam.");
    } catch (error) {
      console.error("Falha ao reenviar confirmação:", error);
      const message = String(error.message || "");
      setAuthMessage(
        /email rate limit exceeded|rate limit.*email/i.test(message)
          ? "O limite de envio de e-mails foi atingido. Aguarde antes de pedir outra confirmação; várias tentativas seguidas não aceleram o envio."
          : message || "Não foi possível reenviar o e-mail. Tente novamente.",
        true
      );
    } finally {
      elements["resend-confirmation-link"].disabled = false;
    }
  }

  function previewProfilePhoto(file) {
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setAccountError("Escolha uma imagem JPG, PNG ou WebP.");
      elements["profile-photo-input"].value = "";
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setAccountError("A foto precisa ter até 3 MB. Reduza o tamanho e tente novamente.");
      elements["profile-photo-input"].value = "";
      return;
    }
    setAccountError("");
    state.pendingProfilePhoto = file;
    state.removeProfilePhoto = false;
    if (state.avatarPreviewUrl) {
      URL.revokeObjectURL(state.avatarPreviewUrl);
      state.avatarPreviewUrl = "";
    }
    const previewUrl = URL.createObjectURL(file);
    state.avatarPreviewUrl = previewUrl;
    elements["profile-avatar"].src = previewUrl;
    elements["profile-avatar"].hidden = false;
    elements["profile-avatar-fallback"].classList.add("hidden");
    elements["profile-photo-name"].textContent = file.name;
    elements["remove-profile-photo"].classList.remove("hidden");
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    if (!state.session?.user || !state.profile) return;
    setAccountError("");
    elements["save-profile-button"].disabled = true;
    elements["save-profile-button"].textContent = "Salvando...";
    const userId = state.session.user.id;
    const oldAvatarPath = state.profile.avatar_path;
    let newAvatarPath = oldAvatarPath;
    let uploadedPath = "";

    try {
      if (state.pendingProfilePhoto) {
        const extensionByType = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        };
        const extension = extensionByType[state.pendingProfilePhoto.type];
        const photoId = typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const path = `${userId}/${photoId}.${extension}`;
        const upload = await state.client.storage
          .from("profile-photos")
          .upload(path, state.pendingProfilePhoto, {
            upsert: false,
            contentType: state.pendingProfilePhoto.type,
            cacheControl: "3600",
          });
        if (upload.error) throw upload.error;
        newAvatarPath = upload.data.path;
        uploadedPath = upload.data.path;
      } else if (state.removeProfilePhoto) {
        newAvatarPath = null;
      }

      const update = await state.client
        .from("profiles")
        .update({
          display_name: elements["profile-display-name"].value.trim(),
          store_name: elements["profile-store-name"].value.trim(),
          phone: formatPhoneNumber(elements["profile-phone"].value),
          city: elements["profile-city"].value.trim(),
          avatar_path: newAvatarPath,
        })
        .eq("id", userId)
        .select("id,email,display_name,store_name,phone,city,avatar_path,role,status")
        .single();
      if (update.error) throw update.error;

      state.profile = update.data;
      let photoCleanupWarning = "";
      if (oldAvatarPath && oldAvatarPath !== newAvatarPath) {
        const removal = await state.client.storage.from("profile-photos").remove([oldAvatarPath]);
        if (removal.error) {
          console.error("Perfil salvo, mas não foi possível remover a foto antiga:", removal.error);
          photoCleanupWarning = "Seus dados foram salvos, mas a foto antiga não pôde ser removida do armazenamento. Tente novamente mais tarde.";
        }
      }

      state.pendingProfilePhoto = null;
      state.removeProfilePhoto = false;
      clearAvatarPreview();
      updateHeader();
      renderAccount();
      if (photoCleanupWarning) setAccountError(photoCleanupWarning);
      showToast("Seus dados foram salvos.");
    } catch (error) {
      console.error("Falha ao salvar o perfil:", error);
      if (uploadedPath && uploadedPath !== oldAvatarPath) {
        const cleanup = await state.client.storage.from("profile-photos").remove([uploadedPath]);
        if (cleanup.error) console.error("Não foi possível limpar a foto enviada após falha:", cleanup.error);
      }
      const errorDetails = `${error.message || error} ${error.details || ""}`.toLocaleLowerCase("pt-BR");
      const setupHint = errorDetails.includes("bucket not found") || errorDetails.includes("profile-photos")
        ? " Verifique se o bucket profile-photos e suas políticas foram criados executando novamente supabase/schema.sql no SQL Editor do Supabase."
        : errorDetails.includes("row-level security")
          ? " O Supabase bloqueou o envio pelas políticas de acesso. Execute novamente supabase/schema.sql no SQL Editor e tente outra vez."
          : errorDetails.includes("avatar_path") && errorDetails.includes("column")
            ? " Atualize as colunas do perfil executando supabase/schema.sql no SQL Editor do Supabase."
            : " Confira a configuração de armazenamento e as permissões no Supabase.";
      setAccountError(`Não foi possível salvar seu perfil: ${error.message || error}.${setupHint}`);
    } finally {
      elements["save-profile-button"].disabled = false;
      elements["save-profile-button"].textContent = "Salvar meus dados";
    }
  }

  async function requestPasswordReset() {
    window.history.pushState({}, "", routeUrl("senha"));
    renderRoute();
    elements["email-input"].focus();
  }

  async function handleLogout() {
    const { error } = await state.client.auth.signOut();
    if (error) {
      console.error("Falha ao sair da conta:", error);
      showToast(`Não foi possível sair: ${error.message}`);
      return;
    }
    state.profile = null;
    state.cart = [];
    window.history.replaceState({}, "", routeUrl("catalogo"));
    await refreshSession();
  }

  async function handleCustomerStatusChange(event) {
    const button = event.target.closest("[data-profile-id][data-status]");
    if (!button || !isAdmin()) return;
    button.disabled = true;
    const { error } = await state.client.rpc("set_customer_status", {
      p_profile_id: button.dataset.profileId,
      p_status: button.dataset.status,
    });
    if (error) {
      button.disabled = false;
      reportAdminError(error);
      return;
    }
    try {
      const result = await state.client
        .from("profiles")
        .select("id,email,display_name,store_name,phone,city,status,created_at")
        .eq("role", "customer")
        .order("created_at", { ascending: false })
        .range(0, 999);
      if (result.error) throw result.error;
      renderCustomers(result.data || []);
    } catch (error) {
      reportAdminError(error);
    }
  }

  async function handleProductSave(event) {
    const form = event.target.closest("form[data-product-id]");
    if (!form || !isAdmin()) return;
    event.preventDefault();
    const values = new FormData(form);
    const price = Number(values.get("price"));
    if (!Number.isFinite(price) || price < 0) {
      showToast("Informe um preço válido.");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const result = await state.client
      .from("products")
      .update({
        name: String(values.get("name")).trim(),
        sku: String(values.get("sku") || "").trim(),
        price_cents: Math.round(price * 100),
        image: String(values.get("image")).trim(),
        description: String(values.get("description") || "").trim(),
        active: values.has("active"),
      })
      .eq("id", form.dataset.productId)
      .select("id");
    button.disabled = false;
    if (result.error) {
      reportAdminError(result.error);
      return;
    }
    showToast("Produto atualizado.");
    await loadAdminData();
  }

  async function handleProductCreate(event) {
    event.preventDefault();
    if (!isAdmin()) return;
    const values = new FormData(elements["product-create-form"]);
    const price = Number(values.get("price"));
    if (!Number.isFinite(price) || price < 0) {
      showToast("Informe um preço válido.");
      return;
    }
    const button = elements["product-create-form"].querySelector('button[type="submit"]');
    button.disabled = true;
    const { error } = await state.client.from("products").insert({
      name: String(values.get("name")).trim(),
      sku: String(values.get("sku") || "").trim(),
      price_cents: Math.round(price * 100),
      image: String(values.get("image") || "./images/products/generic.svg").trim(),
      description: String(values.get("description") || "").trim(),
      active: true,
    });
    button.disabled = false;
    if (error) {
      reportAdminError(error);
      return;
    }
    elements["product-create-form"].reset();
    elements["product-create-form"].elements.image.value = "./images/products/generic.svg";
    showToast("Produto adicionado.");
    await loadAdminData();
  }

  function initializeEvents() {
    elements["login-form"].addEventListener("submit", handleAuthSubmit);
    elements["email-input"].addEventListener("blur", (event) => {
      event.target.value = normalizeEmail(event.target.value);
    });
    for (const phoneInput of [elements["signup-phone-input"], elements["profile-phone"]]) {
      phoneInput.addEventListener("input", (event) => {
        const input = event.target;
        const previousLength = input.value.length;
        const cursor = input.selectionStart;
        input.value = formatPhoneNumber(input.value);
        const nextCursor = Math.max(0, Math.min(
          input.value.length,
          cursor + input.value.length - previousLength
        ));
        input.setSelectionRange(nextCursor, nextCursor);
      });
      phoneInput.addEventListener("blur", (event) => {
        event.target.value = formatPhoneNumber(event.target.value);
      });
    }
    elements["register-link"].addEventListener("click", (event) => {
      event.preventDefault();
      window.history.pushState({}, "", routeUrl("cadastro"));
      renderRoute();
    });
    document.getElementById("back-to-catalog").addEventListener("click", (event) => {
      event.preventDefault();
      window.history.pushState({}, "", routeUrl("catalogo"));
      renderRoute();
    });
    elements["logout-button"].addEventListener("click", () => {
      closeProfileMenu();
      handleLogout();
    });
    elements["forgot-password-link"].addEventListener("click", requestPasswordReset);
    elements["resend-confirmation-link"].addEventListener("click", resendConfirmation);
    elements["toggle-password"].addEventListener("click", () => {
      const isVisible = elements["password-input"].type === "text";
      elements["password-input"].type = isVisible ? "password" : "text";
      elements["toggle-password"].textContent = isVisible ? "Mostrar" : "Ocultar";
      elements["toggle-password"].setAttribute("aria-label", isVisible ? "Mostrar senha" : "Ocultar senha");
    });
    elements["account-form"].addEventListener("submit", (event) => {
      handleProfileSave(event).catch((error) => {
        console.error("Falha ao salvar perfil:", error);
        setAccountError(`Não foi possível salvar seus dados: ${error.message || error}`);
        elements["save-profile-button"].disabled = false;
        elements["save-profile-button"].textContent = "Salvar meus dados";
      });
    });
    elements["profile-avatar"].addEventListener("error", () => {
      elements["profile-avatar"].hidden = true;
      elements["profile-avatar-fallback"].classList.remove("hidden");
    });
    elements["account-avatar"].addEventListener("error", () => {
      elements["account-avatar"].hidden = true;
      elements["account-avatar-fallback"].classList.remove("hidden");
    });
    elements["profile-photo-input"].addEventListener("change", (event) => {
      previewProfilePhoto(event.target.files?.[0]);
    });
    elements["remove-profile-photo"].addEventListener("click", () => {
      state.pendingProfilePhoto = null;
      state.removeProfilePhoto = true;
      elements["profile-photo-input"].value = "";
      elements["profile-photo-name"].textContent = "A foto será removida ao salvar.";
      elements["profile-avatar"].hidden = true;
      elements["profile-avatar"].removeAttribute("src");
      elements["profile-avatar-fallback"].classList.remove("hidden");
      elements["remove-profile-photo"].classList.add("hidden");
      setAccountError("");
    });
    elements["product-grid"].addEventListener("click", (event) => {
      const button = event.target.closest("[data-add]");
      if (button) addToCart(button.dataset.add);
    });
    elements["load-more-products"].addEventListener("click", () => {
      state.visibleProductLimit += PRODUCT_PAGE_SIZE;
      renderProducts();
    });
    elements["search-input"].addEventListener("input", (event) => {
      state.searchTerm = event.target.value.trim().toLocaleLowerCase("pt-BR");
      state.visibleProductLimit = PRODUCT_PAGE_SIZE;
      renderProducts();
    });
    elements["profile-menu-toggle"].addEventListener("click", () => {
      setProfileMenuOpen(elements["profile-menu"].hidden);
    });
    elements["profile-menu"].addEventListener("click", (event) => {
      if (event.target.closest("a")) closeProfileMenu();
    });
    elements["menu-open-cart"].addEventListener("click", () => {
      closeProfileMenu();
      openCart();
    });
    document.addEventListener("click", (event) => {
      if (!elements["profile-menu"].hidden && !event.target.closest("#profile-menu-toggle, #profile-menu")) {
        closeProfileMenu();
      }
    });
    elements["close-cart"].addEventListener("click", closeCart);
    elements["cart-overlay"].addEventListener("click", closeCart);
    elements["checkout-button"].addEventListener("click", () => {
      checkout().catch((error) => {
        console.error("Falha ao preparar o pedido:", error);
        showToast(`Não foi possível preparar o pedido: ${error.message}`);
      });
    });
    elements["cart-content"].addEventListener("click", (event) => {
      if (event.target.closest("[data-close-cart]")) {
        closeCart();
        return;
      }
      const quantityButton = event.target.closest("[data-quantity]");
      if (quantityButton) {
        const item = state.cart.find((entry) => entry.id === quantityButton.dataset.quantity);
        if (!item) return;
        item.quantity += Number(quantityButton.dataset.delta);
        if (item.quantity <= 0) {
          state.cart = state.cart.filter((entry) => entry.id !== item.id);
        }
        saveCart();
        renderCart();
        return;
      }
      const removeButton = event.target.closest("[data-remove]");
      if (removeButton) {
        state.cart = state.cart.filter((entry) => entry.id !== removeButton.dataset.remove);
        saveCart();
        renderCart();
      }
    });
    elements["customer-list"].addEventListener("click", (event) => {
      handleCustomerStatusChange(event).catch(reportAdminError);
    });
    elements["product-admin-list"].addEventListener("submit", (event) => {
      handleProductSave(event).catch(reportAdminError);
    });
    elements["product-create-form"].addEventListener("submit", (event) => {
      handleProductCreate(event).catch(reportAdminError);
    });
    elements["admin-product-search"].addEventListener("input", (event) => {
      state.adminProductSearch = event.target.value.trim();
      state.adminProductLimit = ADMIN_PRODUCT_PAGE_SIZE;
      renderAdminProducts();
    });
    elements["admin-load-more"].addEventListener("click", () => {
      state.adminProductLimit += ADMIN_PRODUCT_PAGE_SIZE;
      renderAdminProducts();
    });
    window.addEventListener("popstate", renderRoute);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!elements["profile-menu"].hidden) {
          closeProfileMenu();
          elements["profile-menu-toggle"].focus();
        } else if (!elements["cart-drawer"].classList.contains("translate-x-full")) {
          closeCart();
        }
      }
    });
  }

  async function initialize() {
    initializeEvents();
    state.passwordRecovery = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
    const config = window.FVB_SUPABASE_CONFIG;
    if (
      !config ||
      !config.url ||
      !config.anonKey ||
      config.url.includes("YOUR-PROJECT") ||
      config.anonKey.includes("YOUR_SUPABASE")
    ) {
      setNotice("O catálogo está aguardando a configuração do Supabase pelo administrador.", true);
      elements["auth-submit"].disabled = true;
      elements["empty-state"].classList.remove("hidden");
      elements["empty-state"].textContent = "O catálogo ainda não foi conectado ao banco de dados.";
      renderRoute();
      return;
    }
    if (!window.supabase?.createClient) {
      setNotice("Não foi possível carregar a biblioteca de autenticação. Atualize a página.", true);
      elements["auth-submit"].disabled = true;
      return;
    }

    state.client = window.supabase.createClient(config.url, config.anonKey);
    try {
      await refreshSession();
    } catch (error) {
      console.error("Falha ao inicializar o catálogo:", error);
      setNotice(`Não foi possível conectar ao catálogo: ${error.message || error}`, true);
    }
    state.client.auth.onAuthStateChange((event) => {
      setTimeout(() => {
        if (event === "PASSWORD_RECOVERY" ||
          new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery") {
          state.passwordRecovery = true;
          window.history.replaceState({}, "", routeUrl("senha"));
        }
        refreshSession().catch((error) => {
          console.error("Falha ao atualizar a sessão:", error);
          setNotice(`Não foi possível atualizar sua sessão: ${error.message || error}`, true);
        });
      }, 0);
    });
  }

  initialize().catch((error) => {
    console.error("Falha ao iniciar o catálogo:", error);
    setNotice(`Não foi possível iniciar o site: ${error.message || error}`, true);
  });
})();
