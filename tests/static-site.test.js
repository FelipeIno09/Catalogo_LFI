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
const adminCustomerFunction = fs.readFileSync(
  path.join(repositoryDirectory, "supabase", "functions", "admin-create-customer", "index.ts"),
  "utf8"
);

test("static catalog routes load the Supabase app without publishing a price catalog", () => {
  assert.doesNotThrow(() => new vm.Script(app));
  assert.match(html, /@supabase\/supabase-js@2/);
  assert.match(html, /src="\.\/supabase-config\.js"/);
  assert.match(html, /src="\.\/app\.js\?v=20261027-3"/);
  assert.match(html, /src="\.\/images\/lfi-tools-logo\.png\?v=20261020-3"/);
  assert.match(html, /id="catalog-view"/);
  assert.match(html, /id="login-view"/);
  assert.match(html, /id="admin-view"/);
  assert.match(html, /id="account-view"/);
  assert.match(html, /id="profile-menu-toggle"/);
  assert.match(html, /id="profile-menu"/);
  assert.match(html, /id="profile-menu-account"[^>]*>Perfil<\/a>/);
  assert.match(html, /id="contact-link" href="https:\/\/wa\.me\/5514991212375"/);
  assert.match(html, /Entrar em contato/);
  assert.match(html, /id="header-cart-button"/);
  assert.match(html, /id="header-catalog-link" href="\.\/#catalogo"/);
  assert.doesNotMatch(html, /id="profile-menu-catalog"|id="menu-open-cart"/);
  assert.match(html, /id="logout-button"[^>]*>Sair<\/button>/);
  assert.doesNotMatch(html, /id="open-cart"/);
  assert.match(html, /id="login-link"/);
  assert.match(html, /id="google-login-button"[^>]*>[\s\S]*Continuar com Google/);
  assert.match(html, /id="google-login-section"/);
  assert.match(html, /@media \(max-width: 767px\)/);
  assert.match(html, /html \{ overflow-x: clip; \}/);
  assert.match(html, /body \{ margin: 0; min-width: 0; \}/);
  assert.match(html, /Depois, toque em “Salvar meus dados”/);
  assert.match(html, /Os preços aparecem para clientes aprovados/);
  assert.match(html, /Revisar pedido no WhatsApp/);
  assert.match(app, /aguarde a aprovação da equipe para consultar preços/);
  assert.match(app, /o limite de envio de e-mails foi atingido/i);
  assert.match(html, /autocapitalize="none" spellcheck="false" inputmode="email"/);
  assert.match(html, /id="signup-phone-input" type="tel" inputmode="tel" maxlength="16"/);
  assert.match(html, /id="signup-cnpj-input"[^>]*required/);
  assert.match(html, /id="profile-phone" name="phone" type="tel" inputmode="tel" maxlength="16"/);
  assert.doesNotMatch(html, /catalog-products\.js/);
  assert.ok(!fs.existsSync(path.join(siteDirectory, "catalog-products.js")));
  assert.ok(fs.existsSync(path.join(siteDirectory, "product-placeholder.svg")));
  assert.ok(fs.existsSync(path.join(siteDirectory, "images", "products", "generic.svg")));
  assert.ok(fs.existsSync(path.join(siteDirectory, "images", "default-avatar.svg")));
  assert.ok(fs.existsSync(path.join(siteDirectory, "images", "lfi-tools-logo.png")));
  assert.match(html, /aria-label="LFI Tools, início">\s*<img src="\.\/images\/lfi-tools-logo\.png\?v=20261020-3"/);
  assert.match(html, /id="profile-menu-toggle"[^>]*aria-label="Abrir menu"/);
  assert.match(html, /<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" aria-hidden="true">/);
  assert.match(html, /id="profile-avatar-fallback" src="\.\/images\/default-avatar\.svg"/);
  assert.match(rootPage, /url=\.\/docs\//);
});

test("approved customers can select product quantities and see the cart outside the profile menu", () => {
  assert.match(app, /const WHATSAPP_NUMBER = "5514991212375"/);
  assert.match(app, /data-quantity-for="\$\{escapeHtml\(product\.id\)\}"/);
  assert.match(app, /type="number" min="1" max="9999" step="1" value="1"/);
  assert.match(app, /function addToCart\(id, quantity = 1\)/);
  assert.match(app, /item\.quantity \+ quantity > 9999/);
  assert.match(app, /elements\["cart-count"\]\.textContent = totalItems > 99 \? "99\+" : String\(totalItems\)/);
  assert.match(html, /id="header-cart-button"[^>]*aria-label="Abrir carrinho"/);
  assert.match(app, /elements\["header-cart-button"\]\.addEventListener\("click", openCart\)/);
});

test("adding a selected quantity merges it into the cart and rejects invalid totals", () => {
  const addToCartSource = app.match(
    /  function addToCart\(id, quantity = 1\) \{[\s\S]*?\n  \}/
  )?.[0];
  assert.ok(addToCartSource, "cart add handler should exist");
  const state = {
    cart: [],
    products: [{ id: "product-1", nome: "Martelo" }],
  };
  const notifications = [];
  const addToCart = vm.runInNewContext(`(${addToCartSource.trim()})`, {
    state,
    canOrder: () => true,
    saveCart: () => {},
    renderCart: () => {},
    showToast: (message) => notifications.push(message),
  });

  addToCart("product-1", 4);
  addToCart("product-1", 2);
  assert.equal(state.cart[0].quantity, 6);
  addToCart("product-1", 0);
  addToCart("product-1", 9994);
  assert.equal(state.cart[0].quantity, 6);
  assert.equal(notifications.length, 4);
});

test("administrators can upload validated product images from the device picker", () => {
  assert.match(html, /name="image-file" type="file" accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(app, /function validateProductImage\(file\)/);
  assert.match(app, /file\.size > 5 \* 1024 \* 1024/);
  assert.match(app, /function uploadProductImage\(file\)/);
  assert.match(app, /\.from\("product-images"\)[\s\S]*?\.upload\(path, file/);
  assert.match(app, /image: uploadedImage\?\.url/);
  assert.match(schema, /'product-images'[\s\S]*?5242880[\s\S]*?image\/webp/);
  assert.match(schema, /Admins can upload product photos[\s\S]*?public\.is_catalog_admin\(\)/);
  assert.match(schema, /Admins can delete product photos[\s\S]*?public\.is_catalog_admin\(\)/);
});

test("event listeners only target existing and cached page elements", () => {
  const elementIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id));
  const cacheSource = app.match(/const elements = Object\.fromEntries\(\s*\[([\s\S]*?)\]\.map/)?.[1];
  assert.ok(cacheSource, "page element cache should exist");
  const cachedIds = new Set([...cacheSource.matchAll(/"([^"]+)"/g)].map(([, id]) => id));
  const targets = [...app.matchAll(
    /elements\["([^"]+)"\]\.addEventListener|document\.getElementById\("([^"]+)"\)\.addEventListener/g
  )].map(([, cachedId, directId]) => ({ id: cachedId || directId, cached: Boolean(cachedId) }));

  for (const target of targets) {
    assert.ok(elementIds.has(target.id), `event listener target #${target.id} should exist in the page`);
    if (target.cached) {
      assert.ok(cachedIds.has(target.id), `event listener target #${target.id} should be cached`);
    }
  }
});

test("logging out redirects to the login screen", () => {
  const logoutSource = app.match(/  async function handleLogout\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(logoutSource, "logout handler should exist");
  assert.match(logoutSource, /auth\.signOut\(\)/);
  assert.match(logoutSource, /replaceState\(\{\},\s*\"\",\s*routeUrl\(\"login\"\)\)/);
  assert.match(logoutSource, /await refreshSession\(\)/);
});

test("Google sign-in uses Supabase OAuth and returns to the catalog", () => {
  assert.match(app, /auth\.signInWithOAuth\(\{\s*provider:\s*"google"/);
  assert.match(app, /redirectTo:\s*`\$\{window\.location\.origin\}\$\{routeUrl\("catalogo"\)\}`/);
  assert.match(app, /elements\["google-login-button"\]\.addEventListener\("click", handleGoogleLogin\)/);
  assert.match(app, /const showGoogleLogin = !isSignup && !passwordRecovery && state\.route !== "admin"/);
  assert.match(schema, /'customer',\s*'pending'\s*\)/);
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
  assert.match(schema, /function public\.set_customer_status\(p_profile_id uuid, p_status text\)/);
  assert.match(schema, /role in \('customer', 'admin'\)/);
  assert.match(schema, /grant update \(display_name, store_name, cnpj, phone, city, avatar_path\) on public\.profiles to authenticated/i);
  assert.match(schema, /cnpj text not null default ''/i);
  assert.match(schema, /revoke update \(status\) on public\.profiles from authenticated/i);
  assert.match(schema, /profile-photos/);
  assert.match(app, /storage\.from\("profile-photos"\)/);
  assert.match(app, /upsert:\s*false/);
  assert.match(app, /Execute novamente supabase\/schema\.sql/);
  assert.match(app, /auth\.resetPasswordForEmail/);
});

test("products without a custom image use an illustration matched to their description", () => {
  const resolverSource = app.match(
    /  function getProductIllustration\(name, description = "", image = ""\) \{[\s\S]*?\n  \}/
  )?.[0];
  assert.ok(resolverSource, "product illustration resolver should exist");
  const getProductIllustration = vm.runInNewContext(`(${resolverSource.trim()})`);

  assert.equal(
    getProductIllustration("CHAVE PHILLIPS", "", "./product-placeholder.svg"),
    "./images/products/screwdriver.svg"
  );
  assert.equal(
    getProductIllustration("BROCA ACO RAPIDO", "", "./images/products/generic.svg"),
    "./images/products/drill-bit.svg"
  );
  assert.equal(
    getProductIllustration("TORNEIRA CROMADA", "", "./product-placeholder.svg"),
    "./images/products/plumbing.svg"
  );
  assert.equal(
    getProductIllustration("COLHER PEDREIRO", "", "./images/products/generic.svg"),
    "./images/products/masonry.svg"
  );
  assert.equal(
    getProductIllustration("FITA DUPLA FACE", "", "./product-placeholder.svg"),
    "./images/products/tape.svg"
  );
  assert.equal(
    getProductIllustration("Produto com foto propria", "", "https://example.com/produto.jpg"),
    "https://example.com/produto.jpg"
  );

  for (const illustration of ["screwdriver", "wrench", "pliers", "hammer", "drill-bit", "saw", "abrasive", "measuring", "painting", "plumbing", "fasteners", "tape", "electrical", "hand-tools", "masonry"]) {
    assert.ok(
      fs.existsSync(path.join(siteDirectory, "images", "products", `${illustration}.svg`)),
      `missing ${illustration} illustration`
    );
  }
});

test("email addresses and Brazilian phone numbers are normalized consistently", () => {
  const emailSource = app.match(/  function normalizeEmail\(value\) \{[\s\S]*?\n  \}/)?.[0];
  const phoneSource = app.match(/  function formatPhoneNumber\(value\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(emailSource, "email normalizer should exist");
  assert.ok(phoneSource, "phone formatter should exist");
  const normalizeEmail = vm.runInNewContext(`(${emailSource.trim()})`);
  const formatPhoneNumber = vm.runInNewContext(`(${phoneSource.trim()})`);

  assert.equal(normalizeEmail("  Felipe.Ino@GMAIL.COM  "), "felipe.ino@gmail.com");
  assert.equal(formatPhoneNumber("14991212375"), "(14) 99121-2375");
  assert.equal(formatPhoneNumber("(14) 3232-1234"), "(14) 3232-1234");
  assert.equal(formatPhoneNumber("+55 14 99121-2375"), "(14) 99121-2375");
  assert.equal(formatPhoneNumber("14"), "14");
  assert.equal(formatPhoneNumber(""), "");
});

test("account form exposes customer profile fields and email confirmation recovery", () => {
  assert.match(html, /id="profile-phone"/);
  assert.match(html, /id="profile-store-name"/);
  assert.match(html, /id="profile-cnpj"/);
  assert.match(html, /id="profile-city"/);
  assert.match(html, /id="profile-photo-input"/);
  assert.match(app, /auth\.resend/);
  assert.match(app, /emailRedirectTo:/);
  assert.match(app, /PASSWORD_RECOVERY/);
  assert.match(app, /profile-display-name/);
  assert.match(app, /profile-photo-input/);
});

test("CNPJ values are formatted and validated before account registration or profile updates", () => {
  const formatSource = app.match(/  function formatCnpj\(value\) \{[\s\S]*?\n  \}/)?.[0];
  const validateSource = app.match(/  function isValidCnpj\(value\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(formatSource, "CNPJ formatter should exist");
  assert.ok(validateSource, "CNPJ validator should exist");
  const formatCnpj = vm.runInNewContext(`(${formatSource.trim()})`);
  const isValidCnpj = vm.runInNewContext(`(${validateSource.trim()})`);

  assert.equal(formatCnpj("11222333000181"), "11.222.333/0001-81");
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11.222.333/0001-80"), false);
  assert.equal(isValidCnpj("00.000.000/0000-00"), false);
  assert.equal(formatCnpj("12abc34501de35"), "12.ABC.345/01DE-35");
  assert.equal(isValidCnpj("12.ABC.345/01DE-35"), true);
});

test("administrator can share the customer registration flow and customer name is secondary", () => {
  assert.match(html, /id="copy-signup-link"/);
  assert.match(html, /O cliente informa os dados da empresa, cria a própria senha/);
  assert.match(app, /navigator\.clipboard\.writeText\(signupUrl\)/);
  assert.match(app, /data: \{ display_name: displayName, store_name: storeName, cnpj:/);
  assert.match(html, /Nome do contato responsável[^<]*<span[^>]*>\(opcional\)/);
});

test("administrators can create approved customers through secure email invitations", () => {
  assert.match(html, /id="admin-customer-form"/);
  assert.match(html, /id="admin-customer-submit"/);
  assert.match(app, /functions\.invoke\("admin-create-customer"/);
  assert.match(app, /redirect_to:\s*new URL\(routeUrl\("senha"\)/);
  assert.match(app, /authLinkType === "invite"/);
  assert.match(html, /id="email-field"/);
  assert.match(app, /elements\["email-field"\]\.classList\.toggle\("hidden", isRecovery\)/);
  assert.match(adminCustomerFunction, /callerClient\.auth\.getUser\(accessToken\)/);
  assert.match(adminCustomerFunction, /adminProfile\?\.role !== "admin" \|\| adminProfile\.status !== "approved"/);
  assert.match(adminCustomerFunction, /admin\.inviteUserByEmail/);
  assert.match(adminCustomerFunction, /\.update\(\{ status: "approved" \}\)/);
  assert.match(adminCustomerFunction, /isValidCnpj\(cnpj\)/);
  assert.match(adminCustomerFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(html, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(app, /SUPABASE_SERVICE_ROLE_KEY/);
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
