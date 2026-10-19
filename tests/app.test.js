const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const catalogProducts = require("../catalog-products");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "fvb-catalog-test-"));
process.env.DB_PATH = path.join(temporaryDirectory, "test.sqlite");
process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
process.env.NODE_ENV = "test";

const { app, db } = require("../server");
const { hashPassword } = require("../auth-utils");

let server;
let baseUrl;
let sessionCookie = "";
let csrfToken = "";

before(async () => {
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, 'admin')
  `).run("Administrador de teste", "admin@example.com", hashPassword("admin-password-for-tests"));

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function request(route, { method = "GET", body, token = csrfToken, origin = baseUrl } = {}) {
  const headers = { Origin: origin };
  if (sessionCookie) headers.Cookie = sessionCookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers["X-CSRF-Token"] = token;
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) sessionCookie = setCookie.split(";")[0];
  const data = response.status === 204 ? null : await response.json();
  return { response, data };
}

test("customer accounts, order registration, and admin-only catalog management", async (t) => {
  await t.test("serves catalog with a nonce-based CSP and seeds the spreadsheet catalog", async () => {
    const page = await fetch(`${baseUrl}/`);
    const html = await page.text();
    const policy = page.headers.get("content-security-policy");
    const nonce = html.match(/<script nonce="([^"]+)">/)?.[1];
    assert.equal(page.status, 200);
    assert.match(html, /FVB Materiais/);
    assert.ok(nonce);
    assert.ok(policy.includes(`'nonce-${nonce}'`));
    const scriptPolicy = policy.split(";").find((directive) => directive.trim().startsWith("script-src "));
    assert.ok(!scriptPolicy.includes("'unsafe-inline'"));

    const productList = await request("/api/products");
    assert.equal(productList.response.status, 200);
    assert.equal(productList.data.products.length, catalogProducts.length);
    assert.ok(productList.data.products.some((product) => product.brand === "MTX"));
    assert.ok(productList.data.products.some((product) => product.brand === "LOTUS"));
    assert.ok(productList.data.products.some((product) => product.price === null));
  });

  await t.test("registers a normal user and denies admin APIs", async () => {
    const initialSession = await request("/api/auth/session");
    csrfToken = initialSession.data.csrfToken;

    const registration = await request("/api/auth/register", {
      method: "POST",
      body: {
        name: "Loja de Teste",
        email: "cliente@example.com",
        password: "senha-segura-de-teste"
      }
    });
    assert.equal(registration.response.status, 201);
    assert.equal(registration.data.user.role, "user");
    csrfToken = registration.data.csrfToken;

    const denied = await request("/api/admin/products");
    assert.equal(denied.response.status, 403);
  });

  await t.test("records server-priced orders and blocks cross-origin mutations", async () => {
    const productList = await request("/api/products");
    const pricedProduct = productList.data.products.find((product) => product.price !== null);
    const quoteProduct = productList.data.products.find((product) => product.price === null);
    assert.ok(pricedProduct);
    assert.ok(quoteProduct);

    const order = await request("/api/orders", {
      method: "POST",
      body: {
        customerName: "Loja de Teste",
        notes: "Bauru",
        items: [{ id: pricedProduct.id, quantity: 3 }, { id: quoteProduct.id, quantity: 2 }]
      }
    });
    assert.equal(order.response.status, 201);
    assert.equal(order.data.totalCents, Math.round(pricedProduct.price * 100) * 3);
    assert.equal(order.data.items[0].quantity, 3);
    assert.equal(order.data.items[1].priceCents, null);

    const crossOrigin = await request("/api/orders", {
      method: "POST",
      origin: "https://example.invalid",
      body: { items: [{ id: 1, quantity: 1 }] }
    });
    assert.equal(crossOrigin.response.status, 403);
  });

  await t.test("admin can add, deactivate, restore products, and review orders", async () => {
    const logout = await request("/api/auth/logout", { method: "POST" });
    assert.equal(logout.response.status, 204);
    const freshSession = await request("/api/auth/session");
    csrfToken = freshSession.data.csrfToken;

    const login = await request("/api/auth/login", {
      method: "POST",
      body: { email: "admin@example.com", password: "admin-password-for-tests" }
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.data.user.role, "admin");
    csrfToken = login.data.csrfToken;

    const created = await request("/api/admin/products", {
      method: "POST",
      body: {
        name: "Produto de teste",
        price: 23.45,
        brand: "MTX",
        category: "Ferramentas",
        image: "https://example.com/product.jpg",
        description: "Descrição de teste",
        sku: "TEST-01"
      }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.product.sku, "TEST-01");
    const productId = created.data.product.id;

    const quoteCreated = await request("/api/admin/products", {
      method: "POST",
      body: {
        name: "Produto sob consulta",
        price: null,
        brand: "MTX",
        category: "Ferramentas",
        image: "https://example.com/quote-product.jpg",
        description: "Preço a confirmar"
      }
    });
    assert.equal(quoteCreated.response.status, 201);
    assert.equal(quoteCreated.data.product.price, null);

    const deactivated = await request(`/api/admin/products/${productId}`, {
      method: "PATCH",
      body: { active: false }
    });
    assert.equal(deactivated.data.active, false);
    let publicProducts = await request("/api/products");
    assert.ok(!publicProducts.data.products.some((product) => product.id === productId));

    const restored = await request(`/api/admin/products/${productId}`, {
      method: "PATCH",
      body: { active: true }
    });
    assert.equal(restored.data.active, true);

    const orders = await request("/api/admin/orders");
    assert.equal(orders.response.status, 200);
    assert.equal(orders.data.orders.length, 1);
    assert.equal(orders.data.orders[0].customerEmail, "cliente@example.com");

    const status = await request(`/api/admin/orders/${orders.data.orders[0].id}`, {
      method: "PATCH",
      body: { status: "confirmed" }
    });
    assert.equal(status.data.status, "confirmed");
  });
});
