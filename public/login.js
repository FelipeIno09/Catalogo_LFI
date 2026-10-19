let csrfToken = "";
let isRegistering = false;

const authForm = document.getElementById("auth-form");
const errorBox = document.getElementById("form-error");
const successBox = document.getElementById("form-success");
const submitButton = document.getElementById("submit-button");
const nextStep = new URLSearchParams(window.location.search).get("next");

function showMessage(box, message) {
  errorBox.classList.add("hidden");
  successBox.classList.add("hidden");
  box.textContent = message;
  box.classList.remove("hidden");
}

function renderMode() {
  document.getElementById("name-field").classList.toggle("hidden", !isRegistering);
  document.getElementById("password-hint").classList.toggle("hidden", !isRegistering);
  document.getElementById("mode-eyebrow").textContent = isRegistering ? "Cadastro de cliente" : "Acesso do cliente";
  document.getElementById("mode-title").textContent = isRegistering ? "Crie sua conta." : "Que bom ter você por aqui.";
  document.getElementById("mode-description").textContent = isRegistering
    ? "Cadastre-se para registrar pedidos para a FVB Materiais."
    : "Entre na sua conta para continuar com o pedido.";
  document.getElementById("password-input").autocomplete = isRegistering ? "new-password" : "current-password";
  submitButton.textContent = isRegistering ? "Criar conta" : "Entrar";
  document.getElementById("mode-switch").firstChild.textContent = isRegistering
    ? "Já tem uma conta? "
    : "Ainda não tem cadastro? ";
  document.getElementById("switch-mode").textContent = isRegistering ? "Entrar" : "Criar conta";
}

async function request(url, options = {}) {
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

function redirectUser(user) {
  if (nextStep === "checkout") {
    window.location.replace("/?checkout=1");
    return;
  }
  window.location.replace(user.role === "admin" ? "/admin.html" : "/");
}

document.getElementById("switch-mode").addEventListener("click", () => {
  isRegistering = !isRegistering;
  errorBox.classList.add("hidden");
  successBox.classList.add("hidden");
  renderMode();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.classList.add("hidden");
  successBox.classList.add("hidden");
  if (!authForm.reportValidity()) return;

  submitButton.disabled = true;
  submitButton.textContent = isRegistering ? "Criando conta..." : "Entrando...";
  const payload = {
    email: document.getElementById("email-input").value.trim(),
    password: document.getElementById("password-input").value
  };
  if (isRegistering) payload.name = document.getElementById("name-input").value.trim();

  try {
    const result = await request(isRegistering ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: payload
    });
    csrfToken = result.csrfToken;
    redirectUser(result.user);
  } catch (error) {
    showMessage(errorBox, error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = isRegistering ? "Criar conta" : "Entrar";
  }
});

async function initializeLogin() {
  renderMode();
  try {
    const session = await request("/api/auth/session");
    csrfToken = session.csrfToken;
    if (session.user) redirectUser(session.user);
  } catch (error) {
    showMessage(errorBox, error.message);
  }
}

initializeLogin();
