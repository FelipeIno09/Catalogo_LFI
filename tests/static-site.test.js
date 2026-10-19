const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const siteDirectory = path.join(__dirname, "..", "docs");
const html = fs.readFileSync(path.join(siteDirectory, "index.html"), "utf8");
const rootPage = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("static catalog assets and product data are ready for GitHub Pages", () => {
  const productsContext = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(siteDirectory, "catalog-products.js"), "utf8"),
    productsContext
  );
  const products = productsContext.window.FVB_PRODUCTS;

  assert.ok(Array.isArray(products));
  assert.ok(products.length > 0);
  assert.ok(products.every((product) =>
    typeof product.name === "string" &&
    (product.priceCents === null || Number.isInteger(product.priceCents)) &&
    typeof product.brand === "string" &&
    typeof product.category === "string" &&
    typeof product.image === "string"
  ));
  assert.match(html, /src="\.\/catalog-products\.js"/);
  assert.ok(fs.existsSync(path.join(siteDirectory, "product-placeholder.svg")));
  assert.match(rootPage, /url=\.\/docs\//);
});

test("catalog has no server or account dependencies and builds WhatsApp orders", () => {
  const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inlineScript, "inline catalog script exists");
  assert.doesNotThrow(() => new vm.Script(inlineScript));
  assert.doesNotMatch(html, /\/api\/|login\.html|admin\.html|csrfToken|currentUser/);
  assert.match(inlineScript, /https:\/\/wa\.me\/\$\{WHATSAPP_NUMBER\}/);
  assert.match(inlineScript, /productById\.get\(item\.id\)/);
  assert.match(inlineScript, /window\.open\(whatsappUrl/);
});
