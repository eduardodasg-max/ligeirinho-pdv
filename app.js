/* ========================================================
   LIGEIRINHO PDV — APP.JS
   Caixa + Mesas + Produtos + Estoque + Pedidos + Pagamentos
   + Cadastro de garçons pelo administrador
   ========================================================= */

(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", iniciar);

  const SUPABASE_URL = "https://ewfxcsaxxsqixtmxruxz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_1Cch1EDl59lNQFUiUIkmBQ_BXHuYjly";
  const URL_RECUPERACAO = "https://eduardodasg-max.github.io/ligeirinho-pdv/";

  let supabase;
  let painel;
  let usuarioAtual = null;
  let perfilAtual = null;
  let produtos = [];
  let mesas = [];
  let pedidoAtual = null;
  let mesaSelecionada = null;
  let canalRealtime = null;
  let aguardandoRedefinicao = false;

  const dinheiro = valor => Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

  const mensagem = texto => alert(texto);

  function escapar(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function limpar() {
    painel.innerHTML = "";
  }

  function erro(contexto, e) {
    console.error(contexto, e);
    mensagem(contexto + (e?.message ? "\n" + e.message : ""));
  }

  function temPermissao(...funcoes) {
    return funcoes.includes(perfilAtual?.funcao);
  }

  function exigirAdministrador() {
    if (!temPermissao("administrador")) {
      mensagem("Apenas o administrador pode acessar esta área.");
      mostrarInicio();
      return false;
    }
    return true;
  }

  function exigirCaixa() {
    if (!temPermissao("administrador", "caixa")) {
      mensagem("Apenas caixa ou administrador pode acessar esta área.");
      mostrarInicio();
      return false;
    }
    return true;
  }

  function aplicarEstilos() {
    if (document.querySelector("#estilosLigeirinho")) return;

    const estilo = document.createElement("style");
    estilo.id = "estilosLigeirinho";
    estilo.textContent = `
      .painel{color:#17324d}
      .painel h2,.painel h3{color:#123f68}
      .painel button{cursor:pointer;border:0;border-radius:9px;padding:10px 14px;margin:5px 5px 5px 0;background:#174f82;color:white;font-weight:600}
      .painel button:hover{filter:brightness(1.1)}
      .painel button:disabled{opacity:.55;cursor:not-allowed}
      .painel input,.painel select,.painel textarea{box-sizing:border-box;max-width:100%;padding:10px;margin:5px 0 12px;border:1px solid #b9c9d8;border-radius:7px}
      .painel label{display:block;font-weight:600;margin-top:7px}
      #gradeMesas{display:grid;grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:10px;margin-top:15px}
      #gradeMesas .mesa{min-height:82px;display:flex;flex-direction:column;justify-content:center;align-items:center;border:2px solid transparent;color:white;font-size:15px;font-weight:700}
      #gradeMesas .mesa-livre{background:#23864b;border-color:#176b39}
      #gradeMesas .mesa-ocupada{background:#c93636;border-color:#a32323}
      #gradeMesas .mesa-aguardando{background:#e4ad22;border-color:#bd8610;color:#302300}
      #gradeMesas .mesa-desconhecida{background:#64748b}
      .legenda-mesas{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}
      .legenda-mesas span{padding:7px 10px;border-radius:7px;font-weight:700}
      .legenda-livre{background:#e2f5e8;color:#176b39}
      .legenda-ocupada{background:#fdeaea;color:#a32323}
      .legenda-aguardando{background:#fff2cc;color:#765000}
      .item-pedido{padding:10px;margin:8px 0;border:1px solid #d6e0e8;border-radius:8px;background:#f8fbfd}
      .categorias-pedido,.produtos-categoria-pedido{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:9px;margin:10px 0}
      .categorias-pedido .categoria-card-pedido{min-height:82px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;background:#174f82;border:2px solid #d5e3ef;font-size:15px}
      .categorias-pedido .categoria-card-pedido span{font-size:24px}
      .categorias-pedido .categoria-ativa-pedido{background:#0d3558;border-color:#e0ad2b;box-shadow:0 0 0 2px #e0ad2b}
      .produtos-categoria-pedido .produto-card-pedido{min-height:88px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#f0f6fb;color:#17324d;border:1px solid #b9c9d8;text-align:center}
      .produtos-categoria-pedido .produto-card-pedido small{font-weight:400}
      .produtos-categoria-pedido .produto-card-pedido span,.resultado-produto-pedido span{font-weight:700}
      .produtos-categoria-pedido .produto-selecionado-pedido{border:2px solid #23864b;background:#e2f5e8}
      #resultadosProdutosPedido .resultado-produto-pedido{display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;text-align:left;background:#f0f6fb;color:#17324d;border:1px solid #b9c9d8;margin:5px 0}
      #confirmarItem:disabled{opacity:.45;cursor:not-allowed}
      @media(max-width:600px){.categorias-pedido,.produtos-categoria-pedido{grid-template-columns:repeat(2,minmax(0,1fr))}}

      .painel button#sair{background:#b83232}
      .relatorio-caixa{background:#fff;color:#17324d;padding:18px;border:1px solid #d6e0e8;border-radius:10px;margin:12px 0}
      .relatorio-caixa table{width:100%;border-collapse:collapse;margin:10px 0}
      .relatorio-caixa th,.relatorio-caixa td{padding:8px;border-bottom:1px solid #d6e0e8;text-align:left}
      .relatorio-caixa .valor-relatorio{font-weight:700}
      @media print{
        body *{visibility:hidden!important}
        #relatorioImpressao,#relatorioImpressao *{visibility:visible!important}
        #relatorioImpressao{position:absolute;left:0;top:0;width:100%;border:0}
        .botoes-relatorio{display:none!important}
      }
      @media(max-width:600px){#gradeMesas{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(estilo);
  }

  // INICIALIZAÇÃO E LOGIN

  async function iniciar() {
    painel = document.querySelector(".painel");

    if (!painel) {
      console.error("Elemento .painel não encontrado.");
      return;
    }

    aplicarEstilos();

    if (!window.supabase?.createClient) {
      painel.innerHTML = "<h2>Erro</h2><p>Biblioteca Supabase não carregada. Confira o index.html.</p>";
      return;
    }

    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

      supabase.auth.onAuthStateChange(evento => {
        if (evento === "PASSWORD_RECOVERY") {
          aguardandoRedefinicao = true;
          mostrarRedefinirSenha();
        }
      });

      const { data, error: e } = await supabase.auth.getSession();
      if (e) throw e;

      if (data.session) {
        if (!aguardandoRedefinicao) await verificarUsuario();
      } else {
        mostrarLogin();
      }
    } catch (e) {
      erro("Não foi possível iniciar o Ligeirinho.", e);
      mostrarLogin();
    }
  }

  function mostrarLogin() {
    limpar();
    painel.innerHTML = `
      <h2>Acesso ao Ligeirinho</h2>
      <label>E-mail</label>
      <input id="email" type="email" autocomplete="username" placeholder="Seu e-mail">
      <label>Senha</label>
      <input id="senha" type="password" autocomplete="current-password" placeholder="Sua senha">
      <button id="entrar">Entrar</button>
      <p><a href="#" id="esqueciSenha">Esqueci minha senha</a></p>
      <p id="mensagemLogin"></p>
    `;

    document.querySelector("#entrar").onclick = entrar;
    document.querySelector("#esqueciSenha").onclick = e => {
      e.preventDefault();
      solicitarRecuperacaoSenha();
    };
    document.querySelector("#senha").onkeydown = e => {
      if (e.key === "Enter") entrar();
    };
  }

  async function entrar() {
    const email = document.querySelector("#email").value.trim();
    const senha = document.querySelector("#senha").value;
    const botao = document.querySelector("#entrar");
    const aviso = document.querySelector("#mensagemLogin");

    if (!email || !senha) {
      aviso.textContent = "Informe e-mail e senha.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Entrando...";

    try {
      const { error: e } = await supabase.auth.signInWithPassword({
        email, password: senha
      });
      if (e) throw e;
      await verificarUsuario();
    } catch (e) {
      aviso.textContent = e.message || "Falha no acesso.";
      botao.disabled = false;
      botao.textContent = "Entrar";
    }
  }

  async function solicitarRecuperacaoSenha() {
    const campo = document.querySelector("#email");
    const aviso = document.querySelector("#mensagemLogin");
    let email = campo.value.trim();

    if (!email) {
      email = prompt("Informe seu e-mail cadastrado:");
      if (!email) return;
      email = email.trim();
      campo.value = email;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      aviso.textContent = "Informe um e-mail válido.";
      return;
    }

    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: URL_RECUPERACAO
      });
      if (e) throw e;
      aviso.textContent = "Se o e-mail estiver cadastrado, você receberá o link de recuperação. Confira o spam.";
    } catch (e) {
      aviso.textContent = "Erro ao solicitar recuperação: " + e.message;
    }
  }

  function mostrarRedefinirSenha() {
    limpar();
    painel.innerHTML = `
      <h2>Redefinir senha</h2>
      <label>Nova senha</label>
      <input id="novaSenha" type="password">
      <label>Confirmar nova senha</label>
      <input id="confirmarSenha" type="password">
      <button id="salvarNovaSenha">Salvar nova senha</button>
      <p id="mensagemRedefinicao"></p>
    `;
    document.querySelector("#salvarNovaSenha").onclick = salvarNovaSenha;
  }

  async function salvarNovaSenha() {
    const senha = document.querySelector("#novaSenha").value;
    const confirmar = document.querySelector("#confirmarSenha").value;
    const aviso = document.querySelector("#mensagemRedefinicao");

    if (senha.length < 6) {
      aviso.textContent = "A senha deve ter pelo menos 6 caracteres.";
      return;
    }
    if (senha !== confirmar) {
      aviso.textContent = "As senhas não são iguais.";
      return;
    }

    try {
      const { error: e } = await supabase.auth.updateUser({ password: senha });
      if (e) throw e;
      aguardandoRedefinicao = false;
      await supabase.auth.signOut();
      mensagem("Senha alterada. Entre com a nova senha.");
      mostrarLogin();
    } catch (e) {
      aviso.textContent = "Não foi possível alterar a senha: " + e.message;
    }
  }

  async function verificarUsuario() {
    try {
      const { data, error: e } = await supabase.auth.getUser();
      if (e || !data.user) {
        mostrarLogin();
        return;
      }

      usuarioAtual = data.user;

      const resultado = await supabase.from("perfis_usuarios")
        .select("id,nome,funcao,ativo")
        .eq("id", usuarioAtual.id)
        .single();

      if (resultado.error) throw resultado.error;

      perfilAtual = resultado.data;

      if (!perfilAtual?.ativo ||
          !["administrador", "caixa", "garcom"].includes(perfilAtual.funcao)) {
        throw new Error("Perfil inexistente, inativo ou função inválida.");
      }

      await carregarProdutos();
      await carregarMesas();
      iniciarRealtime();
      mostrarInicio();
    } catch (e) {
      erro("Não foi possível validar seu perfil.", e);
      await supabase.auth.signOut();
      usuarioAtual = null;
      perfilAtual = null;
      mostrarLogin();
    }
  }

  // MENU PRINCIPAL

  function mostrarInicio() {
    limpar();
    painel.innerHTML = `
      <h2>🚤 Ligeirinho PDV</h2>
      <p>Bem-vindo, ${escapar(perfilAtual.nome)}</p>
      <p>Perfil: ${escapar(perfilAtual.funcao)}</p>
      <div id="alertasEstoqueInicio"></div>
      <button id="mesas">Controle de mesas</button>
      ${temPermissao("administrador") ? `
        <button id="produtos">Produtos</button>
        <button id="estoque">Estoque</button>
        <button id="funcionarios">Funcionários</button>
      ` : ""}
      ${temPermissao("administrador", "caixa") ? `
        <button id="caixa">Controle de caixa</button>
      ` : ""}
      <button id="atualizar">Atualizar</button>
      <button id="sair">Sair</button>
    `;

    document.querySelector("#mesas").onclick = mostrarMesas;
    document.querySelector("#atualizar").onclick = atualizarTudo;
    document.querySelector("#sair").onclick = sair;

    if (temPermissao("administrador")) {
      document.querySelector("#produtos").onclick = mostrarProdutos;
      document.querySelector("#estoque").onclick = mostrarEstoque;
      document.querySelector("#funcionarios").onclick = mostrarFuncionarios;
    }

    if (temPermissao("administrador", "caixa")) {
      document.querySelector("#caixa").onclick = mostrarCaixa;
    }

    atualizarAvisosEstoque();
  }

  // FUNCIONÁRIOS — CADASTRO DE GARÇONS PELO ADMINISTRADOR

  async function mostrarFuncionarios() {
    if (!exigirAdministrador()) return;
    limpar();
    painel.innerHTML = `
      <h2>Cadastro de funcionários</h2>
      <p>Somente o administrador pode cadastrar funcionários.</p>
      <div class="item-pedido">
        <h3>Novo funcionário</h3>
        <label>Tipo de acesso</label>
        <select id="funcFuncao">
          <option value="garcom">Garçom</option>
          <option value="cozinha">Cozinha</option>
        </select>
        <label>Nome</label>
        <input id="funcNome" type="text" autocomplete="name" placeholder="Nome do funcionário">
        <label>E-mail de acesso</label>
        <input id="funcEmail" type="email" autocomplete="email" placeholder="email@exemplo.com">
        <label>Senha inicial</label>
        <input id="funcSenha" type="password" autocomplete="new-password" minlength="8" placeholder="Mínimo de 8 caracteres">
        <button id="salvarFuncionario">Cadastrar funcionário</button>
        <p id="avisoFuncionario" role="status"></p>
      </div>
      <h3>Funcionários cadastrados</h3>
      <div id="listaFuncionarios">Carregando...</div>
      <button id="voltarFuncionarios">Voltar</button>
    `;
    document.querySelector("#salvarFuncionario").onclick = salvarFuncionario;
    document.querySelector("#voltarFuncionarios").onclick = mostrarInicio;
    await carregarFuncionarios();
  }

  async function carregarFuncionarios() {
    if (!exigirAdministrador()) return;
    const lista = document.querySelector("#listaFuncionarios");
    if (!lista) return;

    lista.textContent = "Carregando funcionários...";
    try {
      const { data, error: e } = await supabase
        .from("perfis_usuarios")
        .select("id,nome,funcao,ativo,criado_em")
        .order("nome", { ascending: true });
      if (e) throw e;

      if (!data?.length) {
        lista.textContent = "Nenhum funcionário cadastrado.";
        return;
      }

      lista.innerHTML = data.map(f => `
        <div class="item-pedido">
          <strong>${escapar(f.nome || "Sem nome")}</strong><br>
          Função: ${escapar(f.funcao)}<br>
          Situação: ${f.ativo ? "Ativo" : "Inativo"}
        </div>
      `).join("");
    } catch (e) {
      lista.textContent = "Não foi possível carregar os funcionários: " + (e.message || e);
    }
  }

  async function salvarFuncionario() {
    if (!exigirAdministrador()) return;

    const nome = document.querySelector("#funcNome")?.value.trim();
    const email = document.querySelector("#funcEmail")?.value.trim().toLowerCase();
    const senha = document.querySelector("#funcSenha")?.value || "";
    const funcao = document.querySelector("#funcFuncao")?.value || "garcom";
    const aviso = document.querySelector("#avisoFuncionario");
    const botao = document.querySelector("#salvarFuncionario");

    if (!nome || !email || !senha) {
      aviso.textContent = "Preencha nome, e-mail e senha.";
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      aviso.textContent = "Informe um e-mail válido.";
      return;
    }
    if (senha.length < 8) {
      aviso.textContent = "A senha precisa ter pelo menos 8 caracteres.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Cadastrando...";
    aviso.textContent = "";

    try {
      const { data, error: e } = await supabase.functions.invoke(
        "gerenciar-funcionarios",
        { body: { acao: "criar", nome, email, senha, funcao } }
      );
      if (e) throw e;
      if (!data?.sucesso) throw new Error(data?.erro || "Falha ao cadastrar funcionário.");

      mensagem((funcao === "cozinha" ? "Funcionário da cozinha" : "Garçom") + " cadastrado com sucesso. Ele já pode entrar com o e-mail e a senha informados.");
      document.querySelector("#funcNome").value = "";
      document.querySelector("#funcEmail").value = "";
      document.querySelector("#funcSenha").value = "";
      await carregarFuncionarios();
    } catch (e) {
      aviso.textContent = "Não foi possível cadastrar: " + (e.message || e);
    } finally {
      if (document.querySelector("#salvarFuncionario")) {
        botao.disabled = false;
        botao.textContent = "Cadastrar funcionário";
      }
    }
  }

  async function sair() {
    if (canalRealtime) {
      await supabase.removeChannel(canalRealtime);
      canalRealtime = null;
    }
    await supabase.auth.signOut();
    usuarioAtual = null;
    perfilAtual = null;
    pedidoAtual = null;
    produtos = [];
    mesas = [];
    mostrarLogin();
  }

  async function atualizarTudo() {
    await carregarProdutos();
    await carregarMesas();
    mostrarInicio();
  }

  // ALERTAS DE ESTOQUE

  function calcularAlertasEstoque() {
    const ativos = produtos.filter(p => p.ativo);
    const zerados = ativos.filter(p => Number(p.estoque || 0) <= 0);
    const baixos = ativos.filter(p =>
      Number(p.estoque || 0) > 0 &&
      Number(p.estoque || 0) <= Number(p.estoque_minimo || 0)
    );
    return { ativos, zerados, baixos };
  }

  function atualizarAvisosEstoque() {
    const area = document.querySelector("#alertasEstoqueInicio");
    if (!area) return;

    const a = calcularAlertasEstoque();
    if (!a.zerados.length && !a.baixos.length) {
      area.innerHTML = "<p>✅ Estoque em dia. Nenhum produto baixo ou zerado.</p>";
      return;
    }

    area.innerHTML = `
      <div class="item-pedido">
        <strong>⚠️ Atenção ao estoque</strong>
        <p>${a.zerados.length} produto(s) zerado(s) e ${a.baixos.length} com estoque baixo.</p>
        ${a.zerados.map(p => `<p>🔴 ${escapar(p.nome)} — zerado</p>`).join("")}
        ${a.baixos.map(p => `<p>🟡 ${escapar(p.nome)} — saldo ${p.estoque}</p>`).join("")}
        ${temPermissao("administrador") ? '<button id="abrirAlertasEstoque">Abrir estoque</button>' : ""}
      </div>
    `;

    const botao = document.querySelector("#abrirAlertasEstoque");
    if (botao) botao.onclick = mostrarEstoque;
  }

  // PRODUTOS

  async function carregarProdutos() {
    const { data, error: e } = await supabase.from("produtos")
      .select("*").order("nome");
    if (e) throw e;
    produtos = data || [];
    atualizarAvisosEstoque();
  }

  function mostrarProdutos() {
    limpar();
    painel.innerHTML = `
      <h2>Produtos</h2>
      <button id="novo">Novo produto</button>
      <button id="voltar">Voltar</button>
      <label>Pesquisar</label>
      <input id="pesquisaProduto" placeholder="Nome ou código">
      <label>Categoria</label>
      <select id="filtroCategoria">
        <option value="">Todas</option>
        ${[...new Set(produtos.map(p => p.categoria).filter(Boolean))]
          .map(c => `<option value="${escapar(c)}">${escapar(c)}</option>`).join("")}
      </select>
      <label>Situação</label>
      <select id="filtroStatus">
        <option value="ativos">Ativos</option>
        <option value="inativos">Inativos</option>
        <option value="todos">Todos</option>
      </select>
      <div id="resumoProdutos"></div>
      <div id="listaProdutos"></div>
    `;

    document.querySelector("#novo").onclick = () => formularioProduto();
    document.querySelector("#voltar").onclick = mostrarInicio;
    ["pesquisaProduto", "filtroCategoria", "filtroStatus"].forEach(id => {
      document.querySelector("#" + id).oninput = renderizarProdutos;
      document.querySelector("#" + id).onchange = renderizarProdutos;
    });
    renderizarProdutos();
  }

  function renderizarProdutos() {
    const lista = document.querySelector("#listaProdutos");
    if (!lista) return;

    const busca = document.querySelector("#pesquisaProduto").value.toLowerCase();
    const categoria = document.querySelector("#filtroCategoria").value;
    const status = document.querySelector("#filtroStatus").value;

    let filtrados = produtos.filter(p => {
      if (status === "ativos" && !p.ativo) return false;
      if (status === "inativos" && p.ativo) return false;
      if (categoria && p.categoria !== categoria) return false;
      return String(p.nome || "").toLowerCase().includes(busca) ||
        String(p.codigo || "").toLowerCase().includes(busca);
    });

    document.querySelector("#resumoProdutos").textContent =
      `Total: ${produtos.length} | Encontrados: ${filtrados.length}`;

    lista.innerHTML = "";
    if (!filtrados.length) {
      lista.textContent = "Nenhum produto encontrado.";
      return;
    }

    filtrados.forEach(p => {
      const linha = document.createElement("div");
      linha.className = "item-pedido";
      const texto = document.createElement("p");
      texto.textContent =
        `${p.nome} — ${dinheiro(p.preco_venda)} — Custo: ${dinheiro(p.custo)} — Estoque: ${p.estoque} — Mínimo: ${p.estoque_minimo} — ${p.categoria} — ${p.ativo ? "ATIVO" : "INATIVO"}`;
      const editar = document.createElement("button");
      editar.textContent = "Editar";
      editar.onclick = () => formularioProduto(p);
      const statusBotao = document.createElement("button");
      statusBotao.textContent = p.ativo ? "Desativar" : "Reativar";
      statusBotao.onclick = () => alterarStatusProduto(p);

      const excluir = document.createElement("button");
      excluir.textContent = "Excluir";
      excluir.style.background = "#b83232";
      excluir.onclick = () => excluirProduto(p);

      linha.append(texto, editar, statusBotao, excluir);
      lista.appendChild(linha);
    });
  }

  async function verificarCodigoDuplicado(codigo, atual) {
    if (!codigo) return false;
    let consulta = supabase.from("produtos").select("id").ilike("codigo", codigo);
    if (atual?.id) consulta = consulta.neq("id", atual.id);
    const { data, error: e } = await consulta.limit(1);
    if (e) throw e;
    return (data || []).length > 0;
  }

  async function alterarStatusProduto(p) {
    if (!exigirAdministrador()) return;
    if (!confirm(`Deseja ${p.ativo ? "desativar" : "reativar"} ${p.nome}?`)) return;

    try {
      const { data, error: e } = await supabase.from("produtos")
        .update({ ativo: !p.ativo })
        .eq("id", p.id)
        .select("id")
        .maybeSingle();

      if (e) throw e;
      if (!data) throw new Error("O banco não confirmou a alteração. Verifique as permissões RLS.");

      await carregarProdutos();
      mostrarProdutos();
    } catch (e) {
      erro("Não foi possível alterar o produto.", e);
    }
  }

  // EXCLUSÃO SEGURA DE PRODUTOS

  async function excluirProduto(p) {
    if (!exigirAdministrador()) return;

    if (!p?.id) {
      mensagem("Não foi possível identificar o produto.");
      return;
    }

    const nome = p.nome || "este produto";

    if (!confirm(
      `Deseja excluir "${nome}"?\n\n` +
      "O sistema verificará se existe histórico de venda, perda ou movimentação de estoque. " +
      "Se houver histórico, o produto será desativado para preservar os registros. " +
      "Se não houver histórico, será excluído definitivamente."
    )) return;

    try {
      const verificacoes = await Promise.all([
        supabase.from("itens_pedido")
          .select("produto_id")
          .eq("produto_id", p.id)
          .limit(1),

        supabase.from("itens_perdidos")
          .select("produto_id")
          .eq("produto_id", p.id)
          .limit(1),

        supabase.from("movimentacoes_estoque")
          .select("produto_id")
          .eq("produto_id", p.id)
          .limit(1)
      ]);

      const erroConsulta = verificacoes.find(r => r.error);
      if (erroConsulta) throw erroConsulta.error;

      const possuiHistorico = verificacoes.some(
        r => Array.isArray(r.data) && r.data.length > 0
      );

      if (possuiHistorico) {
        const { data, error: erroAtualizacao } = await supabase
          .from("produtos")
          .update({ ativo: false })
          .eq("id", p.id)
          .select("id")
          .maybeSingle();

        if (erroAtualizacao) throw erroAtualizacao;
        if (!data) {
          throw new Error("O banco não confirmou a desativação do produto. Verifique as permissões RLS.");
        }

        mensagem(
          `O produto "${nome}" possui histórico de vendas, perdas ou estoque. ` +
          "Para preservar os registros, ele foi desativado."
        );
      } else {
        const { data, error: erroExclusao } = await supabase
          .from("produtos")
          .delete()
          .eq("id", p.id)
          .select("id")
          .maybeSingle();

        if (erroExclusao) throw erroExclusao;
        if (!data) {
          throw new Error("O banco não confirmou a exclusão. Verifique as permissões RLS ou se existe alguma referência ao produto.");
        }

        mensagem(`Produto "${nome}" excluído com sucesso.`);
      }

      await carregarProdutos();
      mostrarProdutos();

    } catch (e) {
      console.error("Erro ao excluir produto:", e);

      const detalhes = [
        e?.message,
        e?.details,
        e?.hint,
        e?.code
      ].filter(Boolean).join(" | ");

      mensagem(
        "Não foi possível concluir a operação do produto.\n" +
        (detalhes || String(e))
      );
    }
  }

  function formularioProduto(p = null) {
    if (!exigirAdministrador()) return;
    limpar();

    const categorias = [
      { valor: "comida", rotulo: "Comidas" },
      { valor: "almoco", rotulo: "Almoço" },
      { valor: "petiscos", rotulo: "Petiscos" },
      { valor: "cervejas", rotulo: "Cervejas" },
      { valor: "bebida", rotulo: "Bebidas" },
      { valor: "drinks", rotulo: "Drinks" },
      { valor: "bebidas sem álcool", rotulo: "Bebidas sem álcool" }
    ];

    painel.innerHTML = `
      <h2>${p ? "Editar produto" : "Novo produto"}</h2>
      <label>Código</label><input id="codigo" autocomplete="off">
      <label>Nome</label><input id="nome" autocomplete="off">
      <label>Categoria</label>
      <select id="categoria">
        <option value="">Selecione</option>
        ${categorias.map(c => `<option value="${escapar(c.valor)}">${escapar(c.rotulo)}</option>`).join("")}
      </select>
      <label>Preço de venda</label><input id="preco" type="number" min="0" step="0.01">
      <label>Custo</label><input id="custo" type="number" min="0" step="0.01">
      <label>${p ? "Estoque atual (use movimentações para alterar)" : "Estoque inicial"}</label>
      <input id="estoque" type="number" min="0" step="0.001" ${p ? "readonly" : ""}>
      <label>Estoque mínimo</label><input id="minimo" type="number" min="0" step="0.001">
      <button id="salvar">Salvar produto</button>
      <button id="cancelar">Voltar</button>
      <p id="avisoProduto"></p>
    `;

    if (p) {
      document.querySelector("#codigo").value = p.codigo || "";
      document.querySelector("#nome").value = p.nome || "";
      document.querySelector("#categoria").value = p.categoria || "";
      document.querySelector("#preco").value = p.preco_venda ?? 0;
      document.querySelector("#custo").value = p.custo ?? 0;
      document.querySelector("#estoque").value = p.estoque ?? 0;
      document.querySelector("#minimo").value = p.estoque_minimo ?? 0;
    }

    document.querySelector("#salvar").onclick = () => salvarProduto(p);
    document.querySelector("#cancelar").onclick = mostrarProdutos;
  }

  async function salvarProduto(p) {
    if (!exigirAdministrador()) return;

    const campo = id => document.querySelector(id);
    const aviso = campo("#avisoProduto");
    const botao = campo("#salvar");
    if (!aviso || !botao) return;

    const precoTexto = campo("#preco").value.trim();
    const custoTexto = campo("#custo").value.trim();
    const minimoTexto = campo("#minimo").value.trim();
    const estoqueTexto = campo("#estoque").value.trim();

    const registro = {
      codigo: campo("#codigo").value.trim() || null,
      nome: campo("#nome").value.trim(),
      categoria: campo("#categoria").value,
      preco_venda: precoTexto === "" ? NaN : Number(precoTexto),
      custo: custoTexto === "" ? 0 : Number(custoTexto),
      estoque_minimo: minimoTexto === "" ? 0 : Number(minimoTexto)
    };

    const inicial = estoqueTexto === "" ? 0 : Number(estoqueTexto);

    if (!registro.nome) {
      aviso.textContent = "Informe o nome do produto.";
      return;
    }

    if (!["comida", "almoco", "bebida", "cervejas", "petiscos", "drinks", "bebidas sem álcool"].includes(registro.categoria)) {
      aviso.textContent = "Selecione uma categoria válida.";
      return;
    }

    if (!Number.isFinite(registro.preco_venda) || registro.preco_venda < 0 ||
        !Number.isFinite(registro.custo) || registro.custo < 0 ||
        !Number.isFinite(registro.estoque_minimo) || registro.estoque_minimo < 0 ||
        (!p && (!Number.isFinite(inicial) || inicial < 0))) {
      aviso.textContent = "Informe valores numéricos válidos. O preço de venda é obrigatório.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Salvando...";
    aviso.textContent = "";

    try {
      if (registro.codigo && await verificarCodigoDuplicado(registro.codigo, p)) {
        aviso.textContent = "Já existe produto com esse código.";
        return;
      }

      let resultado;

      if (p) {
        resultado = await supabase.from("produtos")
          .update(registro)
          .eq("id", p.id)
          .select("id")
          .maybeSingle();
      } else {
        resultado = await supabase.from("produtos")
          .insert({ ...registro, estoque: inicial, ativo: true })
          .select("id")
          .single();
      }

      if (resultado.error) throw resultado.error;

      if (!resultado.data) {
        throw new Error("O Supabase não confirmou a gravação. Verifique as permissões RLS da tabela produtos.");
      }

      await carregarProdutos();
      mostrarProdutos();
      mensagem(p ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso.");
    } catch (e) {
      console.error("Erro detalhado ao salvar produto:", e);
      const detalhes = [e?.message, e?.details, e?.hint, e?.code]
        .filter(Boolean).join(" | ");
      aviso.textContent = "Não foi possível salvar o produto: " + (detalhes || String(e));
    } finally {
      if (campo("#salvar")) {
        botao.disabled = false;
        botao.textContent = "Salvar produto";
      }
    }
  }

  // ESTOQUE E MOVIMENTAÇÕES

  function mostrarEstoque() {
    if (!exigirAdministrador()) return;

    const ativos = produtos.filter(p => p.ativo);
    const zerados = ativos.filter(p => Number(p.estoque) <= 0);
    const baixos = ativos.filter(p =>
      Number(p.estoque) > 0 && Number(p.estoque) <= Number(p.estoque_minimo || 0)
    );

    limpar();
    painel.innerHTML = `
      <h2>Estoque</h2>
      <p>Produtos ativos: ${ativos.length}</p>
      <p>Estoque zerado: ${zerados.length}</p>
      <p>Estoque baixo: ${baixos.length}</p>
      <button id="movimentar">Registrar movimentação</button>
      <button id="historico">Histórico</button>
      <button id="voltar">Voltar</button>
      <h3>Produtos com estoque baixo ou zerado</h3>
      <div id="listaEstoque"></div>
    `;

    document.querySelector("#movimentar").onclick = formularioMovimentacaoEstoque;
    document.querySelector("#historico").onclick = historicoEstoque;
    document.querySelector("#voltar").onclick = mostrarInicio;

    const lista = document.querySelector("#listaEstoque");
    [...zerados, ...baixos].forEach(p => {
      const item = document.createElement("p");
      item.textContent = `${p.nome} — saldo: ${p.estoque} — mínimo: ${p.estoque_minimo}`;
      lista.appendChild(item);
    });

    if (!zerados.length && !baixos.length) lista.textContent = "Estoque em dia.";
  }

  function formularioMovimentacaoEstoque() {
    if (!exigirAdministrador()) return;

    const ativos = produtos.filter(p => p.ativo);
    if (!ativos.length) {
      mensagem("Não há produtos ativos.");
      return;
    }

    limpar();
    painel.innerHTML = `
      <h2>Movimentação de estoque</h2>
      <label>Produto</label>
      <select id="movProduto">
        <option value="">Selecione</option>
        ${ativos.map(p => `<option value="${p.id}">${escapar(p.nome)} — saldo ${p.estoque}</option>`).join("")}
      </select>
      <label>Tipo</label>
      <select id="movTipo">
        <option value="entrada">Entrada</option>
        <option value="saida">Saída</option>
        <option value="ajuste">Ajuste de saldo</option>
      </select>
      <label id="rotuloQuantidade">Quantidade</label>
      <input id="movQuantidade" type="number" min="0.001" step="0.001">
      <label>Motivo</label>
      <textarea id="movMotivo" rows="3"></textarea>
      <button id="salvarMovimento">Registrar</button>
      <button id="voltar">Voltar</button>
      <p id="avisoMovimento"></p>
    `;

    const tipo = document.querySelector("#movTipo");
    tipo.onchange = () => {
      document.querySelector("#rotuloQuantidade").textContent =
        tipo.value === "ajuste" ? "Novo saldo contado" : "Quantidade";
      document.querySelector("#movQuantidade").min =
        tipo.value === "ajuste" ? "0" : "0.001";
    };

    document.querySelector("#salvarMovimento").onclick = registrarMovimentacaoEstoque;
    document.querySelector("#voltar").onclick = mostrarEstoque;
  }

  async function registrarMovimentacaoEstoque() {
    if (!exigirAdministrador()) return;

    const produtoId = document.querySelector("#movProduto").value;
    const tipo = document.querySelector("#movTipo").value;
    const quantidade = Number(document.querySelector("#movQuantidade").value);
    const motivo = document.querySelector("#movMotivo").value.trim();
    const aviso = document.querySelector("#avisoMovimento");

    if (!produtoId || !Number.isFinite(quantidade) || quantidade < 0 ||
        (tipo !== "ajuste" && quantidade <= 0) || !motivo) {
      aviso.textContent = "Informe produto, quantidade válida e motivo.";
      return;
    }

    try {
      const { error: e } = await supabase.rpc("registrar_movimentacao_estoque", {
        p_produto_id: produtoId,
        p_tipo: tipo,
        p_quantidade: quantidade,
        p_motivo: motivo
      });

      if (e) throw e;

      await carregarProdutos();
      mensagem("Movimentação registrada.");
      mostrarEstoque();
    } catch (e) {
      erro("Não foi possível movimentar o estoque.", e);
    }
  }

  async function historicoEstoque() {
    if (!exigirAdministrador()) return;

    limpar();
    painel.innerHTML = `
      <h2>Histórico de estoque</h2>
      <button id="voltar">Voltar ao estoque</button>
      <div id="listaHistorico">Carregando...</div>
    `;

    document.querySelector("#voltar").onclick = mostrarEstoque;

    try {
      const { data, error: e } = await supabase.from("movimentacoes_estoque")
        .select("id,produto_id,operador_id,pedido_id,tipo,quantidade,motivo,criado_em")
        .is("pedido_id", null)
        .order("criado_em", { ascending: false });

      if (e) throw e;

      const movimentos = data || [];
      const produtoIds = [...new Set(movimentos.map(m => m.produto_id).filter(Boolean))];
      const operadorIds = [...new Set(movimentos.map(m => m.operador_id).filter(Boolean))];

      const nomesProdutos = {};
      const nomesOperadores = {};

      if (produtoIds.length) {
        const r = await supabase.from("produtos").select("id,nome").in("id", produtoIds);
        if (r.error) throw r.error;
        (r.data || []).forEach(p => nomesProdutos[p.id] = p.nome);
      }

      if (operadorIds.length) {
        const r = await supabase.from("perfis_usuarios").select("id,nome").in("id", operadorIds);
        if (r.error) throw r.error;
        (r.data || []).forEach(p => nomesOperadores[p.id] = p.nome);
      }

      const lista = document.querySelector("#listaHistorico");
      lista.innerHTML = "";

      if (!movimentos.length) {
        lista.textContent = "Nenhuma movimentação registrada.";
        return;
      }

      movimentos.forEach(m => {
        const item = document.createElement("div");
        item.className = "item-pedido";
        item.textContent =
          `${new Date(m.criado_em).toLocaleString("pt-BR")} — ${m.tipo} — ${nomesProdutos[m.produto_id] || "Produto"} — quantidade: ${m.quantidade} — ${m.motivo || ""} — Operador: ${nomesOperadores[m.operador_id] || "Não identificado"}`;
        lista.appendChild(item);
      });
    } catch (e) {
      erro("Não foi possível carregar o histórico.", e);
    }
  }

  // CAIXA

  async function buscarCaixaAberto() {
    const { data, error: e } = await supabase.from("caixas")
      .select("*")
      .eq("status", "aberto")
      .order("aberto_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (e) throw e;
    return data;
  }

  async function mostrarCaixa() {
    if (!exigirCaixa()) return;

    limpar();
    painel.innerHTML = `
      <h2>Controle de caixa</h2>
      <div id="resumoCaixa">Consultando...</div>
      <div id="acoesCaixa"></div>
      <button id="historicoCaixa">Histórico de caixas</button>
      <button id="voltar">Voltar</button>
    `;

    document.querySelector("#voltar").onclick = mostrarInicio;
    document.querySelector("#historicoCaixa").onclick = historicoCaixa;

    try {
      const caixa = await buscarCaixaAberto();
      const resumo = document.querySelector("#resumoCaixa");
      const acoes = document.querySelector("#acoesCaixa");

      if (!caixa) {
        resumo.innerHTML = "<p><strong>Nenhum caixa aberto.</strong></p>";
        acoes.innerHTML = `
          <label>Valor inicial do caixa (R$)</label>
          <input id="valorInicial" type="number" min="0" step="0.01" value="0">
          <button id="abrirCaixa">Abrir caixa</button>
        `;
        document.querySelector("#abrirCaixa").onclick = abrirCaixa;
        return;
      }

      const inicial = Number(caixa.valor_inicial || 0);
      const esperado = Number(caixa.valor_esperado ?? inicial);

      resumo.innerHTML = `
        <div class="item-pedido">
          <strong>CAIXA ABERTO</strong>
          <p>Operador: ${escapar(perfilAtual.nome)}</p>
          <p>Abertura: ${caixa.aberto_em ? new Date(caixa.aberto_em).toLocaleString("pt-BR") : "—"}</p>
          <p>Valor inicial: <strong>${dinheiro(inicial)}</strong></p>
          <p>Saldo esperado: <strong>${dinheiro(esperado)}</strong></p>
        </div>
      `;

      acoes.innerHTML = `
        <h3>Movimentação de caixa</h3>
        <label>Tipo</label>
        <select id="tipoMovCaixa">
          <option value="suprimento">Suprimento</option>
          <option value="sangria">Sangria</option>
        </select>
        <label>Valor (R$)</label>
        <input id="valorMovCaixa" type="number" min="0.01" step="0.01">
        <label>Descrição / motivo</label>
        <input id="descricaoMovCaixa" maxlength="250" placeholder="Informe o motivo">
        <button id="registrarMovCaixa">Registrar movimentação</button>
        <hr>
        <h3>Fechamento</h3>
        <label>Valor contado no caixa (R$)</label>
        <input id="valorContado" type="number" min="0" step="0.01">
        <label>Justificativa da diferença</label>
        <textarea id="justificativaFechamento" rows="3"></textarea>
        <button id="fecharCaixa">Fechar caixa</button>
        <button id="relatorioCaixaAtual">Relatório deste caixa</button>
      `;

      document.querySelector("#registrarMovCaixa").onclick = registrarMovimentacaoCaixa;
      document.querySelector("#fecharCaixa").onclick = fecharCaixa;
      document.querySelector("#relatorioCaixaAtual").onclick = () => relatorioCaixa(caixa.id);
    } catch (e) {
      erro("Não foi possível consultar o caixa.", e);
    }
  }

  async function abrirCaixa() {
    if (!exigirCaixa()) return;

    const valor = Number(document.querySelector("#valorInicial").value);

    if (!Number.isFinite(valor) || valor < 0) {
      mensagem("Informe um valor inicial válido.");
      return;
    }

    try {
      const { error: e } = await supabase.rpc("abrir_caixa", {
        p_valor_inicial: valor
      });

      if (e) throw e;

      mensagem("Caixa aberto com sucesso.");
      await mostrarCaixa();
    } catch (e) {
      erro("Não foi possível abrir o caixa.", e);
    }
  }

  async function registrarMovimentacaoCaixa() {
    if (!exigirCaixa()) return;

    const tipo = document.querySelector("#tipoMovCaixa").value;
    const valor = Number(document.querySelector("#valorMovCaixa").value);
    const descricao = document.querySelector("#descricaoMovCaixa").value.trim();

    if (!Number.isFinite(valor) || valor <= 0 || !descricao) {
      mensagem("Informe valor maior que zero e descrição.");
      return;
    }

    try {
      const { error: e } = await supabase.rpc("registrar_movimentacao_caixa", {
        p_tipo: tipo,
        p_valor: valor,
        p_descricao: descricao
      });

      if (e) throw e;

      mensagem(tipo === "sangria" ? "Sangria registrada." : "Suprimento registrado.");
      await mostrarCaixa();
    } catch (e) {
      erro("Não foi possível registrar a movimentação.", e);
    }
  }

  async function fecharCaixa() {
    if (!exigirCaixa()) return;

    const contado = Number(document.querySelector("#valorContado").value);
    const justificativa = document.querySelector("#justificativaFechamento").value.trim();

    if (!Number.isFinite(contado) || contado < 0) {
      mensagem("Informe o valor contado.");
      return;
    }

    try {
      const caixa = await buscarCaixaAberto();
      if (!caixa) throw new Error("Não existe caixa aberto.");

      const esperado = Number(caixa.valor_esperado ?? caixa.valor_inicial ?? 0);
      const diferenca = Number((contado - esperado).toFixed(2));

      if (Math.abs(diferenca) >= 0.01 && !justificativa) {
        mensagem("A justificativa é obrigatória quando existe diferença.");
        return;
      }

      if (!confirm(
        `Confirma o fechamento?\nEsperado: ${dinheiro(esperado)}\nContado: ${dinheiro(contado)}\nDiferença: ${dinheiro(diferenca)}`
      )) return;

      const { error: e } = await supabase.rpc("fechar_caixa", {
        p_valor_contado: contado,
        p_justificativa: justificativa || null,
        p_caixa_id: caixa.id
      });

      if (e) throw e;

      mensagem("Caixa fechado com sucesso.");
      await mostrarCaixa();
    } catch (e) {
      erro("Não foi possível fechar o caixa.", e);
    }
  }

  async function historicoCaixa() {
    if (!exigirCaixa()) return;

    limpar();
    painel.innerHTML = `
      <h2>Histórico de caixas</h2>
      <button id="atualizar">Atualizar histórico</button>
      <button id="voltar">Voltar ao caixa</button>
      <div id="listaCaixas">Carregando...</div>
    `;

    document.querySelector("#atualizar").onclick = historicoCaixa;
    document.querySelector("#voltar").onclick = mostrarCaixa;

    try {
      const { data, error: e } = await supabase.from("caixas")
        .select("*")
        .order("aberto_em", { ascending: false })
        .limit(100);

      if (e) throw e;

      const caixas = data || [];
      const ids = [...new Set(caixas.map(c => c.operador_id).filter(Boolean))];
      const nomes = {};

      if (ids.length) {
        const r = await supabase.from("perfis_usuarios")
          .select("id,nome").in("id", ids);
        if (r.error) throw r.error;
        (r.data || []).forEach(p => nomes[p.id] = p.nome);
      }

      const lista = document.querySelector("#listaCaixas");
      lista.innerHTML = "";

      if (!caixas.length) {
        lista.textContent = "Nenhum caixa registrado.";
        return;
      }

      caixas.forEach(c => {
        const item = document.createElement("div");
        item.className = "item-pedido";
        item.innerHTML = `
          <strong>${escapar(String(c.status || "").toUpperCase())}</strong>
          <p>Operador: ${escapar(nomes[c.operador_id] || "Não identificado")}</p>
          <p>Abertura: ${c.aberto_em ? new Date(c.aberto_em).toLocaleString("pt-BR") : "—"}</p>
          <p>Fechamento: ${c.fechado_em ? new Date(c.fechado_em).toLocaleString("pt-BR") : "Em aberto"}</p>
          <p>Inicial: ${dinheiro(c.valor_inicial)}</p>
          <p>Esperado: ${dinheiro(c.valor_esperado)}</p>
          <p>Contado: ${c.valor_contado == null ? "—" : dinheiro(c.valor_contado)}</p>
          <p>Diferença: ${c.diferenca == null ? "—" : dinheiro(c.diferenca)}</p>
          <p>Justificativa: ${escapar(c.justificativa || "—")}</p>
        `;
        const botaoRelatorio = document.createElement("button");
        botaoRelatorio.textContent = "Ver relatório completo";
        botaoRelatorio.onclick = () => relatorioCaixa(c.id, true);
        item.appendChild(botaoRelatorio);
        lista.appendChild(item);
      });
    } catch (e) {
      erro("Não foi possível carregar o histórico de caixas.", e);
    }
  }

  // RELATÓRIO DE CAIXA

  async function relatorioCaixa(caixaId, voltarParaHistorico = false) {
    if (!exigirCaixa()) return;

    if (!caixaId) {
      mensagem("Não foi possível identificar o caixa.");
      return;
    }

    limpar();
    painel.innerHTML = `
      <h2>Relatório de caixa</h2>
      <p id="statusRelatorio">Carregando informações...</p>
      <div id="relatorioImpressao"></div>
      <div class="botoes-relatorio">
        <button id="imprimirRelatorio" disabled>Imprimir relatório</button>
        <button id="voltarRelatorio">Voltar</button>
      </div>
    `;

    document.querySelector("#voltarRelatorio").onclick = () => {
      if (voltarParaHistorico) historicoCaixa();
      else mostrarCaixa();
    };

    try {
      const { data: caixa, error: erroCaixa } = await supabase
        .from("caixas")
        .select("*")
        .eq("id", caixaId)
        .single();

      if (erroCaixa) throw erroCaixa;
      if (!caixa) throw new Error("Caixa não encontrado.");

      const [resultadoPagamentos, resultadoMovimentos] = await Promise.all([
        supabase.from("pagamentos")
          .select("id,pedido_id,forma_pagamento,valor,valor_recebido,troco,pago_em,caixa_id")
          .eq("caixa_id", caixaId)
          .order("pago_em", { ascending: true }),

        supabase.from("movimentacoes_caixa")
          .select("id,caixa_id,operador_id,tipo,valor,descricao,criado_em")
          .eq("caixa_id", caixaId)
          .order("criado_em", { ascending: true })
      ]);

      if (resultadoPagamentos.error) throw resultadoPagamentos.error;
      if (resultadoMovimentos.error) throw resultadoMovimentos.error;

      const pagamentos = resultadoPagamentos.data || [];
      const movimentos = resultadoMovimentos.data || [];

      const totalPorForma = {};

      pagamentos.forEach(p => {
        const forma = String(p.forma_pagamento || "não informado");
        totalPorForma[forma] = (totalPorForma[forma] || 0) + Number(p.valor || 0);
      });

      const totalPagamentos = pagamentos.reduce(
        (soma, p) => soma + Number(p.valor || 0), 0
      );

      const totalSuprimentos = movimentos
        .filter(m => String(m.tipo || "").toLowerCase() === "suprimento")
        .reduce((soma, m) => soma + Number(m.valor || 0), 0);

      const totalSangrias = movimentos
        .filter(m => String(m.tipo || "").toLowerCase() === "sangria")
        .reduce((soma, m) => soma + Number(m.valor || 0), 0);

      const valorInicial = Number(caixa.valor_inicial || 0);

      const saldoCalculado = Number(
        (valorInicial + totalPagamentos + totalSuprimentos - totalSangrias).toFixed(2)
      );

      const saldoEsperado = caixa.valor_esperado == null
        ? saldoCalculado
        : Number(caixa.valor_esperado);

      const valorContado = caixa.valor_contado == null
        ? null
        : Number(caixa.valor_contado);

      const diferenca = caixa.diferenca == null
        ? (valorContado == null
          ? null
          : Number((valorContado - saldoEsperado).toFixed(2)))
        : Number(caixa.diferenca);

      let nomeOperador = "Não identificado";

      if (caixa.operador_id) {
        const resultadoOperador = await supabase.from("perfis_usuarios")
          .select("nome")
          .eq("id", caixa.operador_id)
          .maybeSingle();

        if (resultadoOperador.error) throw resultadoOperador.error;

        nomeOperador = resultadoOperador.data?.nome || nomeOperador;
      }

      const formas = Object.entries(totalPorForma);

      const formasHtml = formas.length
        ? formas.map(([forma, valor]) => `
            <tr>
              <td>${escapar(forma.toUpperCase())}</td>
              <td class="valor-relatorio">${dinheiro(valor)}</td>
            </tr>
          `).join("")
        : '<tr><td colspan="2">Nenhum pagamento registrado neste caixa.</td></tr>';

      const pagamentosHtml = pagamentos.length
        ? pagamentos.map(p => `
            <tr>
              <td>${p.pago_em ? new Date(p.pago_em).toLocaleString("pt-BR") : "—"}</td>
              <td>${escapar(String(p.forma_pagamento || "—").toUpperCase())}</td>
              <td>${dinheiro(p.valor)}</td>
              <td>${dinheiro(p.valor_recebido)}</td>
              <td>${dinheiro(p.troco)}</td>
              <td>${escapar(p.pedido_id || "—")}</td>
            </tr>
          `).join("")
        : '<tr><td colspan="6">Nenhum pagamento registrado neste caixa.</td></tr>';

      const movimentosHtml = movimentos.length
        ? movimentos.map(m => `
            <tr>
              <td>${m.criado_em ? new Date(m.criado_em).toLocaleString("pt-BR") : "—"}</td>
              <td>${escapar(String(m.tipo || "—").toUpperCase())}</td>
              <td>${dinheiro(m.valor)}</td>
              <td>${escapar(m.descricao || "—")}</td>
            </tr>
          `).join("")
        : '<tr><td colspan="4">Nenhuma movimentação de caixa registrada.</td></tr>';

      const diferencaCalculo = Number((saldoEsperado - saldoCalculado).toFixed(2));

      document.querySelector("#relatorioImpressao").innerHTML = `
        <div class="relatorio-caixa">
          <h2>🚤 Ligeirinho PDV — Relatório de Caixa</h2>

          <p><strong>Situação:</strong> ${escapar(String(caixa.status || "").toUpperCase())}</p>
          <p><strong>Operador da abertura:</strong> ${escapar(nomeOperador)}</p>
          <p><strong>Abertura:</strong> ${caixa.aberto_em ? new Date(caixa.aberto_em).toLocaleString("pt-BR") : "—"}</p>
          <p><strong>Fechamento:</strong> ${caixa.fechado_em ? new Date(caixa.fechado_em).toLocaleString("pt-BR") : "Caixa ainda aberto"}</p>

          <h3>Resumo financeiro</h3>
          <table>
            <tbody>
              <tr><td>Valor inicial</td><td class="valor-relatorio">${dinheiro(valorInicial)}</td></tr>
              <tr><td>Total de pagamentos deste caixa</td><td class="valor-relatorio">${dinheiro(totalPagamentos)}</td></tr>
              <tr><td>Suprimentos</td><td class="valor-relatorio">${dinheiro(totalSuprimentos)}</td></tr>
              <tr><td>Sangrias</td><td class="valor-relatorio">${dinheiro(totalSangrias)}</td></tr>
              <tr><td><strong>Saldo calculado</strong></td><td class="valor-relatorio">${dinheiro(saldoCalculado)}</td></tr>
              <tr><td><strong>Saldo esperado registrado no caixa</strong></td><td class="valor-relatorio">${dinheiro(saldoEsperado)}</td></tr>
              <tr><td>Diferença entre cálculo e saldo registrado</td><td class="valor-relatorio">${dinheiro(diferencaCalculo)}</td></tr>
              <tr><td>Valor contado no fechamento</td><td class="valor-relatorio">${valorContado == null ? "Ainda não fechado" : dinheiro(valorContado)}</td></tr>
              <tr><td>Diferença do fechamento</td><td class="valor-relatorio">${diferenca == null ? "—" : dinheiro(diferenca)}</td></tr>
            </tbody>
          </table>

          <h3>Pagamentos por forma</h3>
          <table>
            <thead><tr><th>Forma de pagamento</th><th>Total</th></tr></thead>
            <tbody>${formasHtml}</tbody>
          </table>

          <h3>Detalhamento dos pagamentos</h3>
          <table>
            <thead>
              <tr>
                <th>Data do pagamento</th>
                <th>Forma</th>
                <th>Valor</th>
                <th>Recebido</th>
                <th>Troco</th>
                <th>Pedido</th>
              </tr>
            </thead>
            <tbody>${pagamentosHtml}</tbody>
          </table>

          <h3>Suprimentos e sangrias</h3>
          <table>
            <thead><tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Descrição</th></tr></thead>
            <tbody>${movimentosHtml}</tbody>
          </table>

          <p><strong>Justificativa da diferença:</strong> ${escapar(caixa.justificativa || "—")}</p>
          <p><small>Relatório gerado em ${new Date().toLocaleString("pt-BR")}</small></p>
        </div>
      `;

      document.querySelector("#statusRelatorio").textContent =
        "Relatório carregado. Confira os valores antes de imprimir.";

      document.querySelector("#imprimirRelatorio").disabled = false;
      document.querySelector("#imprimirRelatorio").onclick = () => window.print();

    } catch (e) {
      erro("Não foi possível gerar o relatório do caixa.", e);

      const status = document.querySelector("#statusRelatorio");
      if (status) {
        status.textContent =
          "Falha ao carregar o relatório. Confira as permissões e os dados das tabelas.";
      }
    }
  }

  // MESAS

  async function carregarMesas() {
    const { data, error: e } = await supabase.from("mesas")
      .select("*").order("numero");

    if (e) throw e;
    mesas = data || [];
  }

  function mostrarMesas() {
    limpar();
    painel.innerHTML = `
      <h2>Controle de mesas</h2>
      <button id="voltar">Voltar</button>
      <div class="legenda-mesas">
        <span class="legenda-livre">● Livre</span>
        <span class="legenda-ocupada">● Ocupada</span>
        <span class="legenda-aguardando">● Aguardando pagamento</span>
      </div>
      <div id="gradeMesas"></div>
    `;

    document.querySelector("#voltar").onclick = mostrarInicio;

    const grade = document.querySelector("#gradeMesas");

    mesas.forEach(m => {
      const botao = document.createElement("button");
      botao.className = "mesa";

      if (m.status === "livre") {
        botao.classList.add("mesa-livre");
      } else if (m.status === "ocupada") {
        botao.classList.add("mesa-ocupada");
      } else if (m.status === "aguardando_pagamento") {
        botao.classList.add("mesa-aguardando");
      } else {
        botao.classList.add("mesa-desconhecida");
      }

      botao.innerHTML = `
        <strong>Mesa ${escapar(m.numero)}</strong>
        <span>${escapar(String(m.status || "").replace("_", " "))}</span>
      `;

      botao.onclick = () => selecionarMesa(m);
      grade.appendChild(botao);
    });
  }

  async function selecionarMesa(mesa) {
    if (!mesa?.id) return;

    if (mesa.status === "livre") {
      await abrirMesa(mesa);
      return;
    }

    const { data, error: e } = await supabase.from("pedidos")
      .select("*")
      .eq("mesa_id", mesa.id)
      .in("status", ["aberto", "aguardando_pagamento"])
      .order("aberto_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (e) {
      erro("Não foi possível consultar o pedido da mesa.", e);
      return;
    }

    if (!data) {
      mensagem("Não foi encontrado pedido aberto para esta mesa.");
      await carregarMesas();
      mostrarMesas();
      return;
    }

    pedidoAtual = data;
    mesaSelecionada = mesa;
    await mostrarPedido();
  }

  async function abrirMesa(mesa) {
    if (!mesa?.id) return;

    // Selecionar uma mesa livre não cria pedido nem altera seu status.
    // O pedido será criado junto com o primeiro produto.
    mesaSelecionada = mesa;
    pedidoAtual = null;
    await mostrarPedido();
  }

  async function mostrarPedido() {
    if (!pedidoAtual?.id && !mesaSelecionada?.id) return;

    limpar();

    painel.innerHTML = `
      <h2>Pedido da mesa</h2>
      <div id="dadosPedido">Carregando pedido...</div>
      <div id="listaItensPedido"></div>
      <div id="totalPedido"></div>
      <div id="acoesPedido"></div>
      <button id="voltarMesas">Voltar às mesas</button>
    `;

    document.querySelector("#voltarMesas").onclick = async () => {
      pedidoAtual = null;
      mesaSelecionada = null;
      await carregarMesas();
      mostrarMesas();
    };

    await atualizarPedidoAtual();
  }

  async function atualizarPedidoAtual() {
    if (!pedidoAtual?.id) {
      if (!mesaSelecionada?.id) return;

      const dados = document.querySelector("#dadosPedido");
      const lista = document.querySelector("#listaItensPedido");
      const total = document.querySelector("#totalPedido");
      const acoes = document.querySelector("#acoesPedido");

      if (!dados || !lista || !total || !acoes) return;

      dados.innerHTML = `
        <p><strong>Mesa:</strong> ${escapar(mesaSelecionada.numero ?? "—")}</p>
        <p><strong>Status:</strong> Livre — aguardando o primeiro produto.</p>
      `;
      lista.textContent = "Nenhum produto adicionado ainda.";
      total.innerHTML = "<p>Consumo: R$ 0,00</p>";

      acoes.innerHTML = "";
      if (temPermissao("administrador", "garcom")) {
        const adicionar = document.createElement("button");
        adicionar.textContent = "Adicionar primeiro produto";
        adicionar.onclick = formularioAdicionarItem;
        acoes.appendChild(adicionar);
      }
      return;
    }

    const { data: pedido, error: erroPedido } = await supabase.from("pedidos")
      .select("*")
      .eq("id", pedidoAtual.id)
      .single();

    if (erroPedido) throw erroPedido;
    if (!pedido) return;

    pedidoAtual = pedido;

    const { data: itens, error: erroItens } = await supabase.from("itens_pedido")
      .select("id,pedido_id,produto_id,quantidade,preco_unitario,subtotal,observacao")
      .eq("pedido_id", pedido.id)
      .order("id");

    if (erroItens) throw erroItens;

    const itensPedido = itens || [];
    const produtosIds = [...new Set(itensPedido.map(i => i.produto_id).filter(Boolean))];
    const nomesProdutos = {};

    if (produtosIds.length) {
      const resultadoProdutos = await supabase.from("produtos")
        .select("id,nome")
        .in("id", produtosIds);

      if (resultadoProdutos.error) throw resultadoProdutos.error;

      (resultadoProdutos.data || []).forEach(p => {
        nomesProdutos[p.id] = p.nome;
      });
    }

    const mesa = mesas.find(m => m.id === pedido.mesa_id) || mesaSelecionada;
    const dados = document.querySelector("#dadosPedido");
    const lista = document.querySelector("#listaItensPedido");
    const total = document.querySelector("#totalPedido");
    const acoes = document.querySelector("#acoesPedido");

    if (!dados || !lista || !total || !acoes) return;

    dados.innerHTML = `
      <p><strong>Mesa:</strong> ${escapar(mesa?.numero ?? "—")}</p>
      <p><strong>Status:</strong> ${escapar(pedido.status)}</p>
      <p><strong>Aberto em:</strong> ${pedido.aberto_em ? new Date(pedido.aberto_em).toLocaleString("pt-BR") : "—"}</p>
    `;

    lista.innerHTML = "";

    if (!itensPedido.length) {
      lista.textContent = "Nenhum item neste pedido.";
    } else {
      itensPedido.forEach(item => {
        const linha = document.createElement("div");
        linha.className = "item-pedido";

        const nomeProduto = nomesProdutos[item.produto_id] || "Produto";
        linha.innerHTML = `
          <strong>${escapar(nomeProduto)}</strong>
          <p>Quantidade: ${escapar(item.quantidade)}</p>
          <p>Valor unitário: ${dinheiro(item.preco_unitario)}</p>
          <p>Subtotal: ${dinheiro(item.subtotal)}</p>
          <p>Observação: ${escapar(item.observacao || "—")}</p>
        `;

        if (pedido.status === "aberto") {
          const remover = document.createElement("button");
          remover.textContent = "Remover item";
          remover.onclick = () => removerItemPedido(item.id);
          linha.appendChild(remover);
        }

        lista.appendChild(linha);
      });
    }

    const valorConsumo = Number(pedido.valor_consumo ?? pedido.valor_total ?? 0);
    const valorDesconto = Number(pedido.valor_desconto || 0);
    const taxaPercentual = Number(pedido.taxa_servico_percentual ?? 15);
    const valorTaxa = Number(pedido.valor_taxa_servico || 0);
    const valorTotal = Number(pedido.valor_total || 0);

    total.innerHTML = `
      <div class="resumo-financeiro">
        <p>Consumo: <strong>${dinheiro(valorConsumo)}</strong></p>
        <p>Desconto (${pedido.tipo_desconto === "fixo" ? "valor fixo" : "percentual"}): <strong>- ${dinheiro(valorDesconto)}</strong></p>
        <p>Taxa de serviço (${escapar(taxaPercentual)}%): <strong>${dinheiro(valorTaxa)}</strong></p>
        <h3>Total da conta: ${dinheiro(valorTotal)}</h3>
      </div>
    `;

    acoes.innerHTML = "";

    if (pedido.status === "aberto") {
      if (temPermissao("administrador", "garcom")) {
        const adicionar = document.createElement("button");
        adicionar.textContent = "Adicionar produto";
        adicionar.onclick = formularioAdicionarItem;
        acoes.appendChild(adicionar);
      }

      if (temPermissao("administrador", "garcom")) {
        const fechar = document.createElement("button");
        fechar.textContent = "Solicitar fechamento da conta";
        fechar.onclick = solicitarFechamentoConta;
        acoes.appendChild(fechar);
      }
    }

    // MESA AMARELA: aguardando pagamento.
    // Somente caixa e administrador podem imprimir ou receber.

    if (pedido.status === "aguardando_pagamento") {
      if (temPermissao("administrador", "caixa")) {
        const condicoes = document.createElement("button");
        condicoes.textContent = "Editar taxa e desconto";
        condicoes.onclick = () => formularioCondicoesConta(pedido);
        acoes.appendChild(condicoes);

        const imprimir = document.createElement("button");
        imprimir.textContent = "Imprimir conta";
        imprimir.onclick = () => imprimirContaAtual(pedido);
        acoes.appendChild(imprimir);

        const receber = document.createElement("button");
        receber.textContent = "Receber mesa";
        receber.onclick = () => registrarPagamento(pedido);
        acoes.appendChild(receber);
      } else {
        const aviso = document.createElement("p");
        aviso.textContent = "Aguardando recebimento pelo caixa ou administrador.";
        acoes.appendChild(aviso);
      }
    }
  }

  // EDIÇÃO DA TAXA DE SERVIÇO E DO DESCONTO
  // Somente administrador e caixa podem alterar os valores da conta.

  function formularioCondicoesConta(pedido) {
    if (!temPermissao("administrador", "caixa")) {
      mensagem("Somente caixa ou administrador pode alterar a taxa e o desconto.");
      return;
    }

    if (!pedido?.id) {
      mensagem("Não foi possível identificar a conta.");
      return;
    }

    const taxaAtual = Number(pedido.taxa_servico_percentual ?? 15);
    const tipoAtual = pedido.tipo_desconto || "percentual";
    const descontoAtual = Number(pedido.desconto_valor || 0);

    const area = document.querySelector("#acoesPedido");
    if (!area) return;

    area.innerHTML = `
      <h3>Taxa de serviço e desconto</h3>
      <p>A taxa padrão é de 15%. O desconto é aplicado antes da taxa.</p>

      <label for="taxaServicoConta">Taxa de serviço (%)</label>
      <input id="taxaServicoConta" type="number" min="0" max="100" step="0.01" value="${taxaAtual}">

      <label for="tipoDescontoConta">Tipo de desconto</label>
      <select id="tipoDescontoConta">
        <option value="percentual" ${tipoAtual === "percentual" ? "selected" : ""}>Percentual (%)</option>
        <option value="fixo" ${tipoAtual === "fixo" ? "selected" : ""}>Valor fixo (R$)</option>
      </select>

      <label for="valorDescontoConta">Desconto</label>
      <input id="valorDescontoConta" type="number" min="0" step="0.01" value="${descontoAtual}">

      <button id="salvarCondicoesConta">Salvar alterações</button>
      <button id="cancelarCondicoesConta">Cancelar</button>
    `;

    document.querySelector("#cancelarCondicoesConta").onclick = atualizarPedidoAtual;

    document.querySelector("#salvarCondicoesConta").onclick = async () => {
      const taxa = Number(document.querySelector("#taxaServicoConta").value);
      const tipo = document.querySelector("#tipoDescontoConta").value;
      const desconto = Number(document.querySelector("#valorDescontoConta").value);

      if (!Number.isFinite(taxa) || taxa < 0 || taxa > 100) {
        mensagem("Informe uma taxa entre 0 e 100%.");
        return;
      }

      if (!Number.isFinite(desconto) || desconto < 0) {
        mensagem("Informe um desconto válido.");
        return;
      }

      if (tipo === "percentual" && desconto > 100) {
        mensagem("O desconto percentual não pode ultrapassar 100%.");
        return;
      }

      const botao = document.querySelector("#salvarCondicoesConta");
      botao.disabled = true;
      botao.textContent = "Salvando...";

      try {
        const { error: e } = await supabase.rpc("atualizar_condicoes_conta", {
          p_pedido_id: pedido.id,
          p_taxa_servico_percentual: taxa,
          p_tipo_desconto: tipo,
          p_desconto_valor: desconto
        });

        if (e) throw e;

        await atualizarPedidoAtual();
        mensagem("Taxa e desconto atualizados com sucesso.");
      } catch (e) {
        botao.disabled = false;
        botao.textContent = "Salvar alterações";
        erro("Não foi possível atualizar a taxa e o desconto.", e);
      }
    };
  }

  // IMPRESSÃO DA CONTA DA MESA

  function imprimirContaAtual(pedido) {
    if (!temPermissao("administrador", "caixa")) {
      mensagem("Somente caixa ou administrador pode imprimir esta conta.");
      return;
    }

    if (!pedido?.id) {
      mensagem("Não foi possível identificar a conta para impressão.");
      return;
    }

    const dados = document.querySelector("#dadosPedido");
    const lista = document.querySelector("#listaItensPedido");
    const total = document.querySelector("#totalPedido");

    if (!dados || !lista || !total) {
      mensagem("Os dados da conta não estão disponíveis para impressão.");
      return;
    }

    const janela = window.open("", "_blank", "width=800,height=700");

    if (!janela) {
      mensagem("O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente novamente.");
      return;
    }

    const conteudo = `
      <main class="conta">
        <header>
          <h1>🚤 Ligeirinho PDV</h1>
          <h2>Conta da mesa</h2>
        </header>

        ${dados.innerHTML}

        <hr>

        <h3>Itens consumidos</h3>
        ${lista.innerHTML}

        <hr>

        ${total.innerHTML}

        <p class="rodape">Documento para conferência e recebimento.</p>
      </main>
    `;

    janela.document.open();
    janela.document.write(`<!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Conta da mesa - Ligeirinho PDV</title>
        <style>
          *{box-sizing:border-box}
          body{
            font-family:Arial,sans-serif;
            color:#172b3d;
            margin:0;
            padding:24px;
          }
          .conta{
            max-width:700px;
            margin:0 auto;
          }
          header{
            text-align:center;
            margin-bottom:22px;
          }
          h1{
            font-size:24px;
            margin:0 0 6px;
          }
          h2{
            font-size:19px;
            margin:0;
          }
          h3{
            font-size:16px;
          }
          .item-pedido{
            padding:10px 0;
            border-bottom:1px solid #ddd;
            break-inside:avoid;
          }
          .item-pedido p{
            margin:5px 0;
            font-size:13px;
          }
          hr{
            border:0;
            border-top:1px solid #bbb;
            margin:16px 0;
          }
          .rodape{
            text-align:center;
            font-size:11px;
            color:#555;
            margin-top:28px;
          }
          button{
            display:none!important;
          }
          @media print{
            body{padding:0}
            .conta{max-width:none}
          }
        </style>
      </head>
      <body>
        ${conteudo}
        <script>
          window.onload = () => {
            window.focus();
            window.print();
          };
        <\/script>
      </body>
      </html>`);

    janela.document.close();
  }

  function formularioAdicionarItem() {
    if (!temPermissao("administrador", "garcom")) {
      mensagem("Você não tem permissão para adicionar itens.");
      return;
    }

    const ativos = produtos.filter(p => p.ativo);
    if (!ativos.length) {
      mensagem("Não há produtos ativos cadastrados.");
      return;
    }

    const area = document.querySelector("#acoesPedido");
    if (!area) return;

    area.innerHTML =
      "<h3>Cardápio — adicionar produto</h3>" +
      "<label for=\"buscaProdutoPedido\">Pesquisar produto por nome ou código</label>" +
      "<input id=\"buscaProdutoPedido\" type=\"search\" placeholder=\"Comece a digitar o nome ou código...\" autocomplete=\"off\" style=\"width:100%;\">" +
      "<div id=\"resultadosProdutosPedido\"></div>" +
      "<h3>Categorias</h3>" +
      "<div id=\"categoriasPedido\" class=\"categorias-pedido\"></div>" +
      "<div id=\"tituloCategoriaPedido\"></div>" +
      "<div id=\"produtosCategoriaPedido\" class=\"produtos-categoria-pedido\"></div>" +
      "<div class=\"item-pedido\" id=\"selecaoProdutoPedido\">" +
        "<p id=\"produtoSelecionadoPedido\">Selecione um produto no cardápio.</p>" +
        "<input id=\"produtoPedido\" type=\"hidden\" value=\"\">" +
        "<label for=\"quantidadePedido\">Quantidade</label>" +
        "<input id=\"quantidadePedido\" type=\"number\" min=\"0.001\" step=\"0.001\" value=\"1\">" +
        "<label for=\"observacaoPedido\">Observação</label>" +
        "<textarea id=\"observacaoPedido\" rows=\"2\" style=\"width:100%;\"></textarea>" +
        "<button id=\"confirmarItem\" disabled>Adicionar ao pedido</button>" +
      "</div>" +
      "<button id=\"cancelarItem\">Voltar ao pedido</button>";

    const categorias = [
      { id: "petiscos", nome: "Petiscos", icone: "🍟" },
      { id: "cervejas", nome: "Cervejas", icone: "🍺" },
      { id: "bebida", nome: "Bebidas", icone: "🥤" },
      { id: "comida", nome: "Comidas", icone: "🍽️" },
      { id: "almoco", nome: "Almoço", icone: "🍛" },
      { id: "drinks", nome: "Drinks", icone: "🍹" },
      { id: "bebidas sem alcool", nome: "Bebidas sem álcool", icone: "🧃" }
    ];

    const normalizar = valor => String(valor || "")
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    const categoriaProduto = produto => {
      const categoria = normalizar(produto.categoria);
      if (categoria.includes("petisco")) return "petiscos";
      if (categoria.includes("cerveja")) return "cervejas";
      if (categoria.includes("almoco")) return "almoco";
      if (categoria.includes("drink")) return "drinks";
      if (categoria.includes("sem alcool")) return "bebidas sem álcool";
      if (categoria === "comida" || categoria === "comidas") return "comida";
      if (categoria === "bebida" || categoria === "bebidas") return "bebida";
      return categoria;
    };

    const campoBusca = document.querySelector("#buscaProdutoPedido");
    const resultados = document.querySelector("#resultadosProdutosPedido");
    const gradeCategorias = document.querySelector("#categoriasPedido");
    const tituloCategoria = document.querySelector("#tituloCategoriaPedido");
    const gradeProdutos = document.querySelector("#produtosCategoriaPedido");
    const campoProduto = document.querySelector("#produtoPedido");
    const produtoSelecionado = document.querySelector("#produtoSelecionadoPedido");
    const botaoAdicionar = document.querySelector("#confirmarItem");

    const selecionarProduto = produto => {
      campoProduto.value = produto.id;
      produtoSelecionado.textContent = "Selecionado: " + produto.nome + " — " + dinheiro(produto.preco_venda);
      botaoAdicionar.disabled = false;
      resultados.innerHTML = "";
      gradeProdutos.querySelectorAll(".produto-card-pedido").forEach(b => {
        b.classList.toggle("produto-selecionado-pedido", b.dataset.produtoId === produto.id);
      });
    };

    const desenharProdutos = lista => {
      if (!lista.length) {
        gradeProdutos.innerHTML = "<p>Nenhum produto ativo nesta categoria.</p>";
        return;
      }

      gradeProdutos.innerHTML = lista.map(p =>
        "<button type=\"button\" class=\"produto-card-pedido\" data-produto-id=\"" + escapar(p.id) + "\">" +
          "<strong>" + escapar(p.nome) + "</strong>" +
          (p.codigo ? "<small>Código: " + escapar(p.codigo) + "</small>" : "") +
          "<span>" + dinheiro(p.preco_venda) + "</span>" +
        "</button>"
      ).join("");

      gradeProdutos.querySelectorAll("[data-produto-id]").forEach(botao => {
        botao.onclick = () => {
          const produto = ativos.find(p => p.id === botao.dataset.produtoId);
          if (produto) selecionarProduto(produto);
        };
      });
    };

    gradeCategorias.innerHTML = categorias.map(c =>
      "<button type=\"button\" class=\"categoria-card-pedido\" data-categoria=\"" + escapar(c.id) + "\">" +
        "<span>" + c.icone + "</span><strong>" + escapar(c.nome) + "</strong>" +
      "</button>"
    ).join("");

    gradeCategorias.querySelectorAll("[data-categoria]").forEach(botao => {
      botao.onclick = () => {
        const categoriaAtiva = botao.dataset.categoria;
        campoBusca.value = "";
        campoProduto.value = "";
        botaoAdicionar.disabled = true;
        produtoSelecionado.textContent = "Selecione um produto no cardápio.";
        resultados.innerHTML = "";
        gradeCategorias.querySelectorAll(".categoria-card-pedido").forEach(b => {
          b.classList.toggle("categoria-ativa-pedido", b === botao);
        });
        const categoria = categorias.find(c => c.id === categoriaAtiva);
        tituloCategoria.textContent = categoria ? categoria.nome : "Produtos";
        desenharProdutos(ativos.filter(p => categoriaProduto(p) === categoriaAtiva));
      };
    });

    campoBusca.oninput = () => {
      const termo = normalizar(campoBusca.value);
      campoProduto.value = "";
      botaoAdicionar.disabled = true;
      produtoSelecionado.textContent = "Selecione um produto no cardápio.";
      tituloCategoria.textContent = "";
      gradeProdutos.innerHTML = "";
      gradeCategorias.querySelectorAll(".categoria-card-pedido").forEach(b => {
        b.classList.remove("categoria-ativa-pedido");
      });

      if (!termo) {
        resultados.innerHTML = "";
        return;
      }

      const encontrados = ativos.filter(p =>
        normalizar(p.nome).includes(termo) ||
        normalizar(p.codigo).includes(termo)
      ).slice(0, 30);

      resultados.innerHTML = encontrados.length
        ? encontrados.map(p =>
            "<button type=\"button\" class=\"resultado-produto-pedido\" data-produto-id=\"" + escapar(p.id) + "\">" +
              "<strong>" + (p.codigo ? escapar(p.codigo) + " — " : "") + escapar(p.nome) + "</strong>" +
              "<span>" + dinheiro(p.preco_venda) + "</span>" +
            "</button>"
          ).join("")
        : "<p>Nenhum produto encontrado.</p>";

      resultados.querySelectorAll("[data-produto-id]").forEach(botao => {
        botao.onclick = () => {
          const produto = ativos.find(p => p.id === botao.dataset.produtoId);
          if (produto) selecionarProduto(produto);
        };
      });
    };

    document.querySelector("#confirmarItem").onclick = adicionarItemPedido;
    document.querySelector("#cancelarItem").onclick = atualizarPedidoAtual;
    campoBusca.focus();
  }

  async function adicionarItemPedido() {
    if (!temPermissao("administrador", "garcom")) {
      mensagem("Você não tem permissão para adicionar itens.");
      return;
    }

    const produtoId = document.querySelector("#produtoPedido").value;
    const quantidade = Number(document.querySelector("#quantidadePedido").value);
    const observacao = document.querySelector("#observacaoPedido").value.trim();

    if (!produtoId || !Number.isFinite(quantidade) || quantidade <= 0) {
      mensagem("Selecione um produto e informe uma quantidade válida.");
      return;
    }

    try {
      if (!pedidoAtual?.id) {
        if (!mesaSelecionada?.id) {
          throw new Error("Selecione uma mesa antes de adicionar o primeiro produto.");
        }

        const { data: pedidoId, error: erroPrimeiroItem } = await supabase.rpc(
          "adicionar_primeiro_item_mesa",
          {
            p_mesa_id: mesaSelecionada.id,
            p_produto_id: produtoId,
            p_quantidade: quantidade,
            p_observacao: observacao || null
          }
        );

        if (erroPrimeiroItem) throw erroPrimeiroItem;

        const idCriado = typeof pedidoId === "string" ? pedidoId : pedidoId?.id;
        if (!idCriado) {
          throw new Error("O primeiro produto foi enviado, mas o banco não retornou o pedido.");
        }

        const { data: pedidoCriado, error: erroPedidoCriado } = await supabase
          .from("pedidos")
          .select("*")
          .eq("id", idCriado)
          .single();

        if (erroPedidoCriado) throw erroPedidoCriado;
        pedidoAtual = pedidoCriado;
      } else {
        const { error: e } = await supabase.rpc("adicionar_item_pedido", {
          p_pedido_id: pedidoAtual.id,
          p_produto_id: produtoId,
          p_quantidade: quantidade,
          p_observacao: observacao || null
        });

        if (e) throw e;
      }

      await carregarProdutos();
      await carregarMesas();
      await atualizarPedidoAtual();
      mensagem("Produto adicionado ao pedido.");
    } catch (e) {
      erro("Não foi possível adicionar o produto.", e);
    }
  }

  async function removerItemPedido(itemId) {
    if (!temPermissao("administrador", "garcom")) {
      mensagem("Você não tem permissão para remover itens.");
      return;
    }

    if (!confirm("Deseja remover este item do pedido?")) return;

    try {
      const { error: e } = await supabase.rpc("remover_item_pedido", {
        p_item_id: itemId
      });

      if (e) throw e;

      await carregarProdutos();
      await carregarMesas();
      await atualizarPedidoAtual();
      mensagem("Item removido.");
    } catch (e) {
      erro("Não foi possível remover o item.", e);
    }
  }

  async function solicitarFechamentoConta() {
    if (!temPermissao("administrador", "garcom")) {
      mensagem("Você não tem permissão para solicitar o fechamento.");
      return;
    }

    if (!pedidoAtual?.id) return;

    if (!confirm("Deseja enviar esta conta para o caixa?")) return;

    try {
      const { error: e } = await supabase.rpc("solicitar_fechamento_conta", {
        p_pedido_id: pedidoAtual.id
      });

      if (e) throw e;

      await carregarMesas();
      await atualizarPedidoAtual();
      mensagem("Conta enviada ao caixa. O pagamento será registrado pelo caixa ou administrador.");
    } catch (e) {
      erro("Não foi possível solicitar o fechamento da conta.", e);
    }
  }

  async function registrarPagamento(pedido) {
    if (!temPermissao("administrador", "caixa")) {
      mensagem("Somente caixa ou administrador pode registrar pagamentos.");
      return;
    }

    const total = Number(pedido.valor_total || 0);

    limpar();
    painel.innerHTML = `
      <h2>Registrar pagamento</h2>
      <p>Total da conta: <strong>${dinheiro(total)}</strong></p>
      <label>Forma de pagamento</label>
      <select id="formaPagamento">
        <option value="dinheiro">Dinheiro</option>
        <option value="pix">PIX</option>
        <option value="credito">Cartão de crédito</option>
        <option value="debito">Cartão de débito</option>
      </select>
      <label>Valor recebido</label>
      <input id="valorRecebido" type="number" min="0" step="0.01" value="${total.toFixed(2)}">
      <button id="confirmarPagamento">Confirmar pagamento</button>
      <button id="cancelarPagamento">Voltar</button>
    `;

    document.querySelector("#cancelarPagamento").onclick = mostrarPedido;
    document.querySelector("#confirmarPagamento").onclick = async () => {
      const forma = document.querySelector("#formaPagamento").value;
      const recebido = Number(document.querySelector("#valorRecebido").value);

      if (!Number.isFinite(recebido) || recebido < total) {
        mensagem("O valor recebido não pode ser menor que o total da conta.");
        return;
      }

      try {
        const { error: e } = await supabase.rpc("registrar_pagamento", {
          p_pedido_id: pedido.id,
          p_forma_pagamento: forma,
          p_valor: total,
          p_valor_recebido: recebido
        });

        if (e) throw e;

        pedidoAtual = null;
        await carregarMesas();
        await carregarProdutos();
        mensagem("Pagamento registrado com sucesso.");
        mostrarMesas();
      } catch (e) {
        erro("Não foi possível registrar o pagamento.", e);
      }
    };
  }

  // TEMPO REAL

  function iniciarRealtime() {
    if (canalRealtime) {
      supabase.removeChannel(canalRealtime);
      canalRealtime = null;
    }

    canalRealtime = supabase.channel("ligeirinho-atualizacoes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        async () => {
          try {
            await carregarMesas();
            if (document.querySelector("#gradeMesas")) mostrarMesas();
          } catch (e) {
            console.error("Erro ao atualizar mesas:", e);
          }
        }
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        async payload => {
          try {
            await carregarMesas();

            if (pedidoAtual?.id &&
                (payload.new?.id === pedidoAtual.id ||
                 payload.old?.id === pedidoAtual.id)) {
              await atualizarPedidoAtual();
            } else if (document.querySelector("#gradeMesas")) {
              mostrarMesas();
            }
          } catch (e) {
            console.error("Erro ao atualizar pedidos:", e);
          }
        }
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "itens_pedido" },
        async () => {
          try {
            if (pedidoAtual?.id) await atualizarPedidoAtual();
          } catch (e) {
            console.error("Erro ao atualizar itens:", e);
          }
        }
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "produtos" },
        async () => {
          try {
            await carregarProdutos();
            if (document.querySelector("#listaProdutos")) renderizarProdutos();
            if (document.querySelector("#listaEstoque")) mostrarEstoque();
          } catch (e) {
            console.error("Erro ao atualizar produtos:", e);
          }
        }
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "movimentacoes_estoque" },
        async () => {
          try {
            await carregarProdutos();
            if (document.querySelector("#listaEstoque")) mostrarEstoque();
          } catch (e) {
            console.error("Erro ao atualizar estoque:", e);
          }
        }
      )
      .subscribe();
  }

})();
