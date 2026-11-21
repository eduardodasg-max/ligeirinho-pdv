import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return responder({ sucesso: false, erro: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Configuração ausente:", {
      SUPABASE_URL: Boolean(supabaseUrl),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceRoleKey),
    });
    return responder({
      sucesso: false,
      erro: "Configuração do servidor incompleta. Verifique os segredos da Edge Function.",
    }, 500);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return responder({ sucesso: false, erro: "Usuário não autenticado." }, 401);
  }

  try {
    const usuarioClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await usuarioClient.auth.getUser();
    if (authError || !authData.user) {
      return responder({ sucesso: false, erro: "Sessão inválida ou expirada." }, 401);
    }

    const { data: perfil, error: perfilError } = await usuarioClient
      .from("perfis_usuarios")
      .select("id,funcao,ativo")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (perfilError || !perfil || perfil.ativo !== true || perfil.funcao !== "administrador") {
      return responder({ sucesso: false, erro: "Apenas um administrador ativo pode cadastrar funcionários." }, 403);
    }

    const body = await req.json();
    const acao = String(body?.acao || "");

    if (acao !== "criar") {
      return responder({ sucesso: false, erro: "Ação não reconhecida." }, 400);
    }

    const nome = String(body?.nome || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const senha = String(body?.senha || "");
    const funcao = String(body?.funcao || "garcom").trim().toLowerCase();

    if (!nome || !email || !senha) {
      return responder({ sucesso: false, erro: "Nome, e-mail e senha são obrigatórios." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return responder({ sucesso: false, erro: "E-mail inválido." }, 400);
    }
    if (senha.length < 8) {
      return responder({ sucesso: false, erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    }
    if (!["garcom", "cozinha"].includes(funcao)) {
      return responder({ sucesso: false, erro: "Função inválida. Escolha garçom ou cozinha." }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: novoUsuario, error: criarError } = await adminClient.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (criarError || !novoUsuario.user) {
      return responder({
        sucesso: false,
        erro: criarError?.message || "Não foi possível criar o usuário.",
      }, 400);
    }

    const { error: inserirPerfilError } = await adminClient
      .from("perfis_usuarios")
      .insert({
        id: novoUsuario.user.id,
        nome,
        funcao,
        ativo: true,
      });

    if (inserirPerfilError) {
      await adminClient.auth.admin.deleteUser(novoUsuario.user.id);
      return responder({
        sucesso: false,
        erro: "Não foi possível criar o perfil do funcionário: " + inserirPerfilError.message,
      }, 500);
    }

    return responder({
      sucesso: true,
      funcionario: {
        id: novoUsuario.user.id,
        nome,
        email,
        funcao,
      },
    });
  } catch (error) {
    console.error("Erro em gerenciar-funcionarios:", error);
    return responder({
      sucesso: false,
      erro: error instanceof Error ? error.message : "Erro interno ao cadastrar funcionário.",
    }, 500);
  }
});
