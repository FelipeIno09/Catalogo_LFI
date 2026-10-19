require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const catalogProducts = require("./catalog-products");

const databasePath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "data", "fvb.sqlite");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price_cents INTEGER CHECK (price_cents IS NULL OR price_cents > 0),
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    image TEXT NOT NULL,
    description TEXT NOT NULL,
    sku TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    customer_name TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    items_json TEXT NOT NULL,
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'confirmed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    session_json TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
  CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders(user_id);
`);

const productSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'products'").get().sql;
const productColumns = new Set(db.prepare("PRAGMA table_info(products)").all().map((column) => column.name));
if (!productSchema.toLowerCase().includes("price_cents is null or price_cents > 0") || !productColumns.has("sku")) {
  const skuColumn = productColumns.has("sku") ? "sku" : "''";
  db.transaction(() => {
    db.exec(`
      CREATE TABLE products_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price_cents INTEGER CHECK (price_cents IS NULL OR price_cents > 0),
        brand TEXT NOT NULL,
        category TEXT NOT NULL,
        image TEXT NOT NULL,
        description TEXT NOT NULL,
        sku TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      INSERT INTO products_migrated
        (id, name, price_cents, brand, category, image, description, sku, is_active, created_at, updated_at)
      SELECT id, name, price_cents, brand, category, image, description, ${skuColumn}, is_active, created_at, updated_at
      FROM products;
      DROP TABLE products;
      ALTER TABLE products_migrated RENAME TO products;
    `);
  })();
}

const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
if (productCount === 0) {
  const addProduct = db.prepare(`
    INSERT INTO products (name, price_cents, brand, category, image, description, sku)
    VALUES (@name, @priceCents, @brand, @category, @image, @description, @sku)
  `);
  const seedProducts = db.transaction((products) => {
    for (const product of products) addProduct.run(product);
  });
  seedProducts(catalogProducts);
}

module.exports = db;
