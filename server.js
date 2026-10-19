require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const db = require("./database");
const SqliteSessionStore = require("./sqlite-session-store");
const { hashPassword, PASSWORD_MIN_LENGTH, validEmail, verifyPassword } = require("./auth-utils");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET;
const PUBLIC_DIRECTORY = path.join(__dirname, "public");
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error("Configure SESSION_SECRET com pelo menos 32 caracteres no arquivo .env.");
}
if (process.env.NODE_ENV === "production" && !process.env.DB_PATH) {
  console.warn("DB_PATH não definido. Configure um caminho persistente para o banco antes da publicação.");
}

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);

app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(18).toString("base64");
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      scriptSrc: [
        "'self'",
        "'unsafe-eval'",
        "https://cdn.tailwindcss.com",
        (req, res) => `'nonce-${res.locals.cspNonce}'`
      ],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

app.use(express.json({ limit: "32kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "8kb" }));
app.use(session({
  name: "fvb.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new SqliteSessionStore(db, SESSION_MAX_AGE_MS),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE_MS
  }
}));
app.use(express.static(PUBLIC_DIRECTORY, { index: false, fallthrough: true, maxAge: "1h" }));

app.get("/", serveCatalog);
app.get("/Catalogo.html", serveCatalog);

function serveCatalog(req, res, next) {
  fs.readFile(path.join(__dirname, "Catalogo.html"), "utf8", (error, html) => {
    if (error) return next(error);
    const securedHtml = html.replace(/<script>\r?\n/, `<script nonce="${res.locals.cspNonce}">\n`);
    res.type("html").send(securedHtml);
  });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return req.session.csrfToken;
}

function requireCsrf(req, res, next) {
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) {
        return res.status(403).json({ error: "Origem da solicitação não permitida." });
      }
    } catch {
      return res.status(403).json({ error: "Origem da solicitação inválida." });
    }
  }

  const submittedToken = req.get("x-csrf-token") || "";
  const expectedToken = req.session.csrfToken || "";
  const supplied = Buffer.from(submittedToken);
  const expected = Buffer.from(expectedToken);
  if (!expected.length || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(403).json({ error: "Sua sessão expirou. Atualize a página e tente novamente." });
  }
  next();
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve());
  });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function requireAuth(req, res, next) {
  const user = req.session.userId
    ? db.prepare("SELECT id, name, email, role, is_active FROM users WHERE id = ?").get(req.session.userId)
    : null;
  if (!user || user.is_active !== 1) {
    return res.status(401).json({ error: "Entre na sua conta para continuar." });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Acesso permitido somente para administradores." });
  }
  next();
}

function validateText(value, label, maxLength, required = true) {
  if (typeof value !== "string") return required ? `${label} é obrigatório.` : null;
  const cleaned = value.trim();
  if (required && !cleaned) return `${label} é obrigatório.`;
  if (cleaned.length > maxLength) return `${label} deve ter até ${maxLength} caracteres.`;
  return null;
}

function productFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price_cents === null ? null : row.price_cents / 100,
    brand: row.brand,
    category: row.category,
    image: row.image,
    description: row.description,
    sku: row.sku
  };
}

function validateProduct(body) {
  const fields = [
    ["name", "Nome", 120],
    ["brand", "Marca", 80],
    ["category", "Categoria", 80],
    ["description", "Descrição", 500],
    ["image", "Imagem", 1000]
  ];
  for (const [field, label, maxLength] of fields) {
    const error = validateText(body[field], label, maxLength);
    if (error) return error;
  }

  const skuError = validateText(body.sku, "Código", 80, false);
  if (skuError) return skuError;

  const price = body.price === null || body.price === undefined || body.price === "" ? null : Number(body.price);
  if (price !== null && (!Number.isFinite(price) || price <= 0 || price > 999999.99)) {
    return "Informe um preço válido maior que zero ou deixe em branco para consulta.";
  }

  let imageUrl;
  try {
    imageUrl = new URL(body.image.trim());
  } catch {
    return "Informe um endereço válido para a imagem.";
  }
  if (imageUrl.protocol !== "https:") return "A imagem deve usar um endereço HTTPS.";

  return {
    name: body.name.trim(),
    priceCents: price === null ? null : Math.round(price * 100),
    brand: body.brand.trim(),
    category: body.category.trim(),
    image: imageUrl.href,
    description: body.description.trim(),
    sku: typeof body.sku === "string" ? body.sku.trim() : ""
  };
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." }
});

app.get("/api/auth/session", asyncRoute(async (req, res) => {
  const user = req.session.userId
    ? db.prepare("SELECT id, name, email, role, is_active FROM users WHERE id = ?").get(req.session.userId)
    : null;
  if (user && user.is_active !== 1) {
    await new Promise((resolve, reject) => {
      req.session.destroy((error) => error ? reject(error) : resolve());
    });
    res.clearCookie("fvb.sid", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
    return res.json({ user: null, csrfToken: crypto.randomBytes(32).toString("hex") });
  }
  res.json({ user: user ? publicUser(user) : null, csrfToken: csrfToken(req) });
}));

app.post("/api/auth/register", authLimiter, requireCsrf, asyncRoute(async (req, res) => {
  const { name, email, password } = req.body || {};
  const nameError = validateText(name, "Nome", 80);
  if (nameError) return res.status(400).json({ error: nameError });
  if (!validEmail(email)) return res.status(400).json({ error: "Informe um e-mail válido." });
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH || password.length > 128) {
    return res.status(400).json({ error: `A senha deve ter entre ${PASSWORD_MIN_LENGTH} e 128 caracteres.` });
  }

  let result;
  try {
    result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, 'user')
    `).run(name.trim(), email.trim().toLowerCase(), hashPassword(password));
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "Já existe uma conta com este e-mail." });
    }
    throw error;
  }

  await regenerateSession(req);
  req.session.userId = Number(result.lastInsertRowid);
  req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  await saveSession(req);
  const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(req.session.userId);
  res.status(201).json({ user: publicUser(user), csrfToken: req.session.csrfToken });
}));

app.post("/api/auth/login", authLimiter, requireCsrf, asyncRoute(async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password || password.length > 128) {
    return res.status(400).json({ error: "Informe seu e-mail e senha." });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email);
  if (!user || user.is_active !== 1 || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "E-mail ou senha incorretos." });
  }

  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  await saveSession(req);
  res.json({ user: publicUser(user), csrfToken: req.session.csrfToken });
}));

app.post("/api/auth/logout", requireCsrf, requireAuth, asyncRoute(async (req, res) => {
  await new Promise((resolve, reject) => {
    req.session.destroy((error) => error ? reject(error) : resolve());
  });
  res.clearCookie("fvb.sid", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
  res.status(204).end();
}));

app.get("/api/products", (req, res) => {
  const products = db.prepare("SELECT * FROM products WHERE is_active = 1 ORDER BY category COLLATE NOCASE, name COLLATE NOCASE").all();
  res.json({ products: products.map(productFromRow) });
});

app.post("/api/orders", requireCsrf, requireAuth, asyncRoute(async (req, res) => {
  const customerName = typeof req.body?.customerName === "string" && req.body.customerName.trim()
    ? req.body.customerName.trim()
    : req.user.name;
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
  if (customerName.length > 80 || notes.length > 500) {
    return res.status(400).json({ error: "Confira o nome e as observações do pedido." });
  }
  const requestItems = req.body?.items;
  if (!Array.isArray(requestItems) || requestItems.length === 0 || requestItems.length > 100) {
    return res.status(400).json({ error: "Adicione ao menos um produto ao pedido." });
  }

  const quantities = new Map();
  for (const item of requestItems) {
    const id = Number(item?.id);
    const quantity = Number(item?.quantity);
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) {
      return res.status(400).json({ error: "Um dos itens do pedido tem quantidade inválida." });
    }
    quantities.set(id, (quantities.get(id) || 0) + quantity);
  }

  const getProduct = db.prepare("SELECT * FROM products WHERE id = ? AND is_active = 1");
  const items = [];
  let totalCents = 0;
  for (const [id, quantity] of quantities) {
    const product = getProduct.get(id);
    if (!product) return res.status(400).json({ error: "Um produto não está mais disponível. Atualize o catálogo." });
    const lineTotalCents = product.price_cents === null ? 0 : product.price_cents * quantity;
    totalCents += lineTotalCents;
    items.push({
      id: product.id,
      name: product.name,
      brand: product.brand,
      priceCents: product.price_cents,
      quantity,
      lineTotalCents
    });
  }

  const result = db.prepare(`
    INSERT INTO orders (user_id, customer_name, notes, items_json, total_cents)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, customerName, notes, JSON.stringify(items), totalCents);

  res.status(201).json({ id: Number(result.lastInsertRowid), customerName, notes, items, totalCents });
}));

app.get("/api/admin/products", requireAuth, requireAdmin, (req, res) => {
  const products = db.prepare("SELECT * FROM products ORDER BY is_active DESC, name COLLATE NOCASE").all();
  res.json({ products: products.map((row) => ({ ...productFromRow(row), active: row.is_active === 1 })) });
});

app.post("/api/admin/products", requireCsrf, requireAuth, requireAdmin, (req, res) => {
  const product = validateProduct(req.body || {});
  if (typeof product === "string") return res.status(400).json({ error: product });

  const result = db.prepare(`
    INSERT INTO products (name, price_cents, brand, category, image, description, sku)
    VALUES (@name, @priceCents, @brand, @category, @image, @description, @sku)
  `).run(product);
  res.status(201).json({
    product: {
      id: Number(result.lastInsertRowid),
      ...product,
      price: product.priceCents === null ? null : product.priceCents / 100,
      active: true
    }
  });
});

app.patch("/api/admin/products/:id", requireCsrf, requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const active = req.body?.active;
  if (!Number.isSafeInteger(id) || id < 1 || typeof active !== "boolean") {
    return res.status(400).json({ error: "Dados inválidos para atualizar o produto." });
  }
  const result = db.prepare(`
    UPDATE products SET is_active = ?, updated_at = datetime('now') WHERE id = ?
  `).run(active ? 1 : 0, id);
  if (result.changes === 0) return res.status(404).json({ error: "Produto não encontrado." });
  res.json({ id, active });
});

app.get("/api/admin/orders", requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT orders.*, users.email AS customer_email
    FROM orders JOIN users ON users.id = orders.user_id
    ORDER BY orders.created_at DESC, orders.id DESC
    LIMIT 500
  `).all();
  res.json({
    orders: rows.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      notes: row.notes,
      items: JSON.parse(row.items_json),
      totalCents: row.total_cents,
      status: row.status,
      createdAt: row.created_at
    }))
  });
});

app.patch("/api/admin/orders/:id", requireCsrf, requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const allowedStatuses = ["new", "contacted", "confirmed", "cancelled"];
  if (!Number.isSafeInteger(id) || id < 1 || !allowedStatuses.includes(req.body?.status)) {
    return res.status(400).json({ error: "Status de pedido inválido." });
  }
  const result = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(req.body.status, id);
  if (result.changes === 0) return res.status(404).json({ error: "Pedido não encontrado." });
  res.json({ id, status: req.body.status });
});

app.use("/api", (req, res) => res.status(404).json({ error: "Recurso da API não encontrado." }));
app.use((error, req, res, next) => {
  console.error("Erro na aplicação:", error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "Ocorreu um erro interno. Tente novamente." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FVB Materiais disponível em http://localhost:${PORT}`);
  });
}

module.exports = { app, db };
