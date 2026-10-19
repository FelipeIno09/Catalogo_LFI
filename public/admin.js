const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const errorBox = document.getElementById("admin-error");
const successBox = document.getElementById("admin-success");
let csrfToken = "";
let allProducts = [];
let visibleProductCount = 60;
let productSearchTerm = "";
const productPageSize = 60;

const orderStatuses = {
  new: "Novo",
  contacted: "Em contato",
  confirmed: "Confirmado",
  cancelled: "Cancelado"
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showAdminMessage(box, message) {
  errorBox.classList.add("hidden");
  successBox.classList.add("hidden");
  box.textContent = message;
  box.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function apiRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const requestOptions = { ...options, credentials: "same-origin", headers };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    requestOptions.body = JSON.stringify(options.body);
  }
  if (options.method && options.method !== "GET") headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(url, requestOptions);
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || "Não foi possível concluir a solicitação.");
  return data;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(`${dateString.replace(" ", "T")}Z`));
}

function renderProducts() {
  const list = document.getElementById("product-list");
  const matchingProducts = allProducts.filter((product) =>
    `${product.name} ${product.sku} ${product.brand} ${product.category}`.toLocaleLowerCase("pt-BR").includes(productSearchTerm)
  );
  const visibleProducts = matchingProducts.slice(0, visibleProductCount);
  document.getElementById("products-empty").classList.toggle("hidden", matchingProducts.length > 0);
  document.getElementById("product-list-count").textContent = `${matchingProducts.length.toLocaleString("pt-BR")} produtos encontrados`;
  document.getElementById("load-more-admin-products").classList.toggle("hidden", visibleProducts.length >= matchingProducts.length);
  list.innerHTML = visibleProducts.map((product) => `
    <article class="flex gap-3 rounded-2xl border border-[#e8eae6] p-3 ${product.active ? "" : "bg-[#f5f6f4] opacity-75"}">
      <img src="${escapeHtml(product.image)}" alt="" class="h-16 w-16 shrink-0 rounded-xl bg-[#e8ece8] object-cover">
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="truncate text-sm font-bold text-[#344238]">${escapeHtml(product.name)}</h3>
            <p class="mt-0.5 text-[11px] font-semibold uppercase tracking-[.1em] text-[#b7794d]">${escapeHtml(product.brand)} · ${escapeHtml(product.category)}</p>
            ${product.sku ? `<p class="mt-1 text-[10px] text-[#858b83]">Cód. ${escapeHtml(product.sku)}</p>` : ""}
          </div>
          <span class="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${product.active ? "bg-[#eaf4ec] text-[#37664a]" : "bg-[#eceeeb] text-[#737b74]"}">${product.active ? "Ativo" : "Inativo"}</span>
        </div>
        <div class="mt-2 flex items-center justify-between gap-2">
          <span class="text-sm font-bold text-[#344c40]">${product.price === null ? "Sob consulta" : money.format(product.price)}</span>
          <button type="button" data-product-id="${product.id}" data-active="${!product.active}" class="rounded-lg border border-[#e2e5e1] px-2.5 py-1.5 text-[11px] font-bold text-[#536258] hover:border-[#344c40] hover:text-[#344c40]">${product.active ? "Desativar" : "Reativar"}</button>
        </div>
      </div>
    </article>
  `).join("");
}

function renderOrders(orders) {
  const list = document.getElementById("order-list");
  document.getElementById("orders-empty").classList.toggle("hidden", orders.length > 0);
  list.innerHTML = orders.map((order) => `
    <article class="rounded-2xl border border-[#e8eae6] p-4 sm:p-5">
      <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-display text-base font-extrabold">Pedido #${order.id}</h3>
            <span class="rounded-full bg-[#f5ecd9] px-2.5 py-1 text-[10px] font-bold text-[#8c651f]">${escapeHtml(orderStatuses[order.status] || order.status)}</span>
          </div>
          <p class="mt-1 text-xs text-[#59645b]">${escapeHtml(order.customerName)} · ${escapeHtml(order.customerEmail)}</p>
          <p class="mt-1 text-[11px] text-[#858b83]">${escapeHtml(formatDate(order.createdAt))}</p>
        </div>
        <label class="flex items-center gap-2 text-xs font-semibold text-[#626b63]">
          Status
          <select data-order-status="${order.id}" class="h-9 rounded-lg border border-[#e2e5e1] bg-white px-2 text-xs outline-none focus:border-[#78947e]">
            ${Object.entries(orderStatuses).map(([value, label]) => `<option value="${value}" ${order.status === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="my-3 border-t border-dashed border-[#e5e8e3]"></div>
      <ul class="space-y-1.5 text-xs text-[#555f56]">
        ${order.items.map((item) => `<li class="flex justify-between gap-3"><span>${item.quantity}× ${escapeHtml(item.name)} (${escapeHtml(item.brand)})</span><span class="shrink-0 font-semibold">${item.priceCents == null ? "Sob consulta" : money.format(item.lineTotalCents / 100)}</span></li>`).join("")}
      </ul>
      <div class="mt-3 flex justify-between border-t border-[#eef0ec] pt-3 text-sm">
        <span class="font-semibold text-[#59645b]">${order.items.some((item) => item.priceCents == null) ? "Subtotal conhecido" : "Total"}</span>
        <strong class="font-display font-extrabold text-[#344c40]">${money.format(order.totalCents / 100)}</strong>
      </div>
      ${order.notes ? `<p class="mt-3 rounded-xl bg-[#f7f8f6] px-3 py-2 text-xs leading-5 text-[#68746b]"><strong>Entrega/observações:</strong> ${escapeHtml(order.notes)}</p>` : ""}
    </article>
  `).join("");
}

async function loadProducts() {
  const data = await apiRequest("/api/admin/products");
  allProducts = data.products;
  renderProducts();
}

async function loadOrders() {
  const data = await apiRequest("/api/admin/orders");
  renderOrders(data.orders);
}

async function initializeAdmin() {
  try {
    const session = await apiRequest("/api/auth/session");
    csrfToken = session.csrfToken;
    if (!session.user) {
      window.location.replace("/login.html?next=admin");
      return;
    }
    if (session.user.role !== "admin") {
      window.location.replace("/");
      return;
    }
    document.getElementById("admin-name").textContent = session.user.name;
    await Promise.all([loadProducts(), loadOrders()]);
  } catch (error) {
    showAdminMessage(errorBox, error.message);
  }
}

document.getElementById("product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = document.getElementById("add-product-button");
  button.disabled = true;
  const values = new FormData(form);
  const body = Object.fromEntries(values.entries());
  body.price = body.price === "" ? null : Number(body.price);

  try {
    await apiRequest("/api/admin/products", { method: "POST", body });
    form.reset();
    await loadProducts();
    showAdminMessage(successBox, "Produto cadastrado e publicado no catálogo.");
  } catch (error) {
    showAdminMessage(errorBox, error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("product-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-product-id]");
  if (!button) return;
  button.disabled = true;
  try {
    await apiRequest(`/api/admin/products/${button.dataset.productId}`, {
      method: "PATCH",
      body: { active: button.dataset.active === "true" }
    });
    await loadProducts();
    showAdminMessage(successBox, button.dataset.active === "true" ? "Produto reativado." : "Produto desativado. O histórico de pedidos foi preservado.");
  } catch (error) {
    showAdminMessage(errorBox, error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("product-search").addEventListener("input", (event) => {
  productSearchTerm = event.target.value.trim().toLocaleLowerCase("pt-BR");
  visibleProductCount = productPageSize;
  renderProducts();
});

document.getElementById("load-more-admin-products").addEventListener("click", () => {
  visibleProductCount += productPageSize;
  renderProducts();
});

document.getElementById("order-list").addEventListener("change", async (event) => {
  const select = event.target.closest("[data-order-status]");
  if (!select) return;
  select.disabled = true;
  try {
    await apiRequest(`/api/admin/orders/${select.dataset.orderStatus}`, {
      method: "PATCH",
      body: { status: select.value }
    });
    await loadOrders();
    showAdminMessage(successBox, "Status do pedido atualizado.");
  } catch (error) {
    showAdminMessage(errorBox, error.message);
    await loadOrders();
  } finally {
    select.disabled = false;
  }
});

document.getElementById("refresh-products").addEventListener("click", () => loadProducts().catch((error) => showAdminMessage(errorBox, error.message)));
document.getElementById("refresh-orders").addEventListener("click", () => loadOrders().catch((error) => showAdminMessage(errorBox, error.message)));
document.getElementById("logout-button").addEventListener("click", async () => {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
    window.location.replace("/");
  } catch (error) {
    showAdminMessage(errorBox, error.message);
  }
});

initializeAdmin();
