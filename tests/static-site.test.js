const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const repositoryDirectory = path.join(__dirname, "..");
const siteDirectory = path.join(repositoryDirectory, "docs");
const html = fs.readFileSync(path.join(siteDirectory, "index.html"), "utf8");
const app = fs.readFileSync(path.join(siteDirectory, "app.js"), "utf8");
const config = fs.readFileSync(path.join(siteDirectory, "supabase-config.js"), "utf8");
const schema = fs.readFileSync(path.join(repositoryDirectory, "supabase", "schema.sql"), "utf8");
const rootPage = fs.readFileSync(path.join(repositoryDirectory, "index.html"), "utf8");

test("static catalog routes load the Supabase app without publishing a price catalog", () => {
  assert.doesNotThrow(() => new vm.Script(app));
  assert.match(html, /@supabase\/supabase-js@2/);
  assert.match(html, /src="\.\/supabase-config\.js"/);
  assert.match(html, /src="\.\/app\.js"/);
  assert.match(html, /id="catalog-view"/);
  assert.match(html, /id="login-view"/);
  assert.match(html, /id="admin-view"/);
  assert.doesNotMatch(html, /catalog-products\.js/);
  assert.ok(!fs.existsSync(path.join(siteDirectory, "catalog-products.js")));
  assert.ok(fs.existsSync(path.join(siteDirectory, "product-placeholder.svg")));
  assert.match(rootPage, /url=\.\/docs\//);
});

test("public catalog queries omit prices and protected roles use database functions", () => {
  assert.match(app, /\.select\("id,name,sku,image,description,active"\)/);
  assert.match(app, /\.rpc\("products_with_prices"\)/);
  assert.match(app, /\.rpc\("admin_list_products"\)/);
  assert.match(app, /auth\.signUp/);
  assert.match(app, /auth\.signInWithPassword/);
  assert.match(app, /status === "approved"/);
  assert.match(schema, /enable row level security/i);
  assert.match(schema, /grant select \(id, name, sku, image, description, active\) on public\.products to anon, authenticated/i);
  assert.match(schema, /function public\.products_with_prices\(\)/);
  assert.match(schema, /function public\.admin_list_products\(\)/);
  assert.match(schema, /role in \('customer', 'admin'\)/);
});

test("public Supabase configuration contains no service-role credential", () => {
  assert.match(config, /url:\s*"https:\/\/[a-z0-9-]+\.supabase\.co"/);
  assert.doesNotMatch(config, /\/rest\/v1/);
  assert.match(config, /anonKey:\s*"[A-Za-z0-9._-]+"/);
  assert.doesNotMatch(config, /service[_-]?role/i);
  assert.doesNotMatch(html, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("product import utility uses the standard library and private environment credentials", () => {
  const importer = fs.readFileSync(
    path.join(repositoryDirectory, "supabase", "import_products.py"),
    "utf8"
  );
  assert.match(importer, /zipfile/);
  assert.match(importer, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(importer, /price_cents/);
  assert.match(importer, /on_conflict=source_row/);
  assert.doesNotMatch(importer, /YOUR_SUPABASE_SERVICE_ROLE_KEY\s*=/);
});
