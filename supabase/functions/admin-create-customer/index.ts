import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRedirectOrigins = new Set([
  "https://lfi-tools-catalogos.com.br",
  "https://www.lfi-tools-catalogos.com.br",
  "https://felipeino09.github.io",
  "http://localhost:8000",
]);
const allowedRedirectPaths = new Set(["/", "/docs/", "/Catalogo_LFI/", "/Catalogo_LFI/docs/"]);

function respond(body: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidCnpj(value: string) {
  const cnpj = value.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^(\w)\1{13}$/.test(cnpj)) return false;
  const calculateDigit = (base: string, weights: number[]) => {
    const remainder = [...base].reduce(
      (sum, character, index) => sum + (character.charCodeAt(0) - 48) * weights[index],
      0,
    ) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const firstDigit = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateDigit(
    `${cnpj.slice(0, 12)}${firstDigit}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return cnpj.endsWith(`${firstDigit}${secondDigit}`);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return respond({ error: "Método não permitido." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return respond({ error: "Entre como administrador para cadastrar clientes." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Configuração necessária não encontrada para a função admin-create-customer.");
    return respond({ error: "A função de cadastro ainda não foi configurada no Supabase." }, 500);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const accessToken = authorization.slice("Bearer ".length).trim();
    const { data: userData, error: userError } = await callerClient.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return respond({ error: "Sua sessão expirou. Entre novamente como administrador." }, 401);
    }

    const { data: adminProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role,status")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileError) {
      console.error("Não foi possível verificar a permissão de administrador:", profileError.message);
      return respond({ error: "Não foi possível verificar sua permissão. Tente novamente." }, 500);
    }
    if (adminProfile?.role !== "admin" || adminProfile.status !== "approved") {
      return respond({ error: "Somente administradores aprovados podem cadastrar clientes." }, 403);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return respond({ error: "Os dados enviados são inválidos." }, 400);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return respond({ error: "Os dados enviados são inválidos." }, 400);
    }
    const fields = payload as Record<string, unknown>;

    const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
    const email = text(fields.email).toLowerCase();
    const storeName = text(fields.store_name);
    const cnpj = text(fields.cnpj).toUpperCase().replace(/[^0-9A-Z]/g, "");
    const displayName = text(fields.display_name);
    const phone = text(fields.phone);
    const city = text(fields.city);
    const redirectTo = text(fields.redirect_to);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return respond({ error: "Informe um e-mail válido para o convite." }, 400);
    }
    if (!storeName || storeName.length > 120) {
      return respond({ error: "Informe o nome da empresa (até 120 caracteres)." }, 400);
    }
    if (!isValidCnpj(cnpj)) {
      return respond({ error: "Informe um CNPJ válido com 14 caracteres." }, 400);
    }
    if (displayName.length > 100 || phone.length > 16 || city.length > 100) {
      return respond({ error: "Confira o tamanho dos dados de contato informados." }, 400);
    }

    let redirectUrl: URL;
    try {
      redirectUrl = new URL(redirectTo);
    } catch {
      return respond({ error: "O endereço de retorno do convite é inválido." }, 400);
    }
    if (
      !allowedRedirectOrigins.has(redirectUrl.origin) ||
      !allowedRedirectPaths.has(redirectUrl.pathname) ||
      [...redirectUrl.searchParams].length !== 1 ||
      redirectUrl.searchParams.get("rota") !== "senha" ||
      redirectUrl.hash
    ) {
      return respond({ error: "O endereço de retorno do convite não está autorizado." }, 400);
    }

    const { data: invitation, error: invitationError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          display_name: displayName,
          store_name: storeName,
          cnpj,
          phone,
          city,
        },
        redirectTo: redirectUrl.href,
      },
    );
    if (invitationError || !invitation.user) {
      if (invitationError?.message.toLowerCase().includes("already")) {
        return respond({ error: "Já existe uma conta com esse e-mail." }, 409);
      }
      console.error("Não foi possível enviar o convite de cadastro:", invitationError?.message);
      return respond({ error: "Não foi possível criar a conta ou enviar o convite. Confira o e-mail e tente novamente." }, 400);
    }

    const { data: approvedProfile, error: approvalError } = await adminClient
      .from("profiles")
      .update({ status: "approved" })
      .eq("id", invitation.user.id)
      .eq("role", "customer")
      .select("id")
      .maybeSingle();
    if (approvalError || !approvedProfile) {
      console.error("Convite enviado, mas a aprovação automática falhou:", approvalError?.message ?? "Perfil não encontrado.");
      return respond({
        error: "O convite foi enviado, mas não foi possível aprovar a conta automaticamente. Aprove o cliente manualmente no painel.",
      }, 500);
    }

    return respond({ message: "Conta criada, aprovada e convite enviado por e-mail." }, 201);
  } catch (error) {
    console.error("Falha inesperada na função de cadastro administrativo:", error);
    return respond({ error: "Ocorreu um erro ao cadastrar o cliente. Tente novamente." }, 500);
  }
});
