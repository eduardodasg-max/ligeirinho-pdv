/* =====================================================
   LIGEIRINHO PDV — SISTEMA COMPLETO UNIFICADO
   ===================================================== */

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
  let canalRealtime = null;
  let aguardandoRedefinicao = false;

  const dinheiro = valor =>
    Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });

  const mensagem = texto => window.alert(texto);

  function mostrarErro(contexto, erro) {
    console.error(contexto, erro);
    mensagem(contexto + (erro?.message ? "\n" + erro.message : ""));
  }

  function limpar() {
    painel.innerHTML = "";
  }

  function escapar(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[caractere]);
  }

  function temPermissao(...funcoes) {
    return funcoes.includes(perfilAtual?.funcao);
  }

  // =====================================================
  // 1. INICIALIZAÇÃO E AUTENTICAÇÃO
  // =====================================================

  async function iniciar() {
    painel = document.querySelector(".painel");

    if (!painel) {
      console.error("Elemento .painel não encontrado.");
      return;
    }

    if (!window.supabase?.createClient) {
      painel.innerHTML =
        "<h2>Erro ao carregar</h2><p>A biblioteca do Supabase não foi carregada. Confira o index.html.</p>";
      return;
    }

    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

      supabase.auth.onAuthStateChange(async (evento) => {
        if (evento === "PASSWORD_RECOVERY") {
          aguardandoRedefinicao = true;
          mostrarRedefinirSenha();
        }
      });

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (data.session) {
        if (!aguardandoRedefinicao) {
          await verificarUsuario();
        }
      } else {
        mostrarLogin();
      }
    } catch (erro) {
      mostrarErro("Não foi possível iniciar o Ligeirinho.", erro);
      mostrarLogin();
    }
  }

  function mostrarLogin() {
    limpar();
    painel.innerHTML = `
      <h2>🚤 Acesso ao Ligeirinho</h2>
      <label for="email">E-mail</label>
      <input id="email" type="email" autocomplete="username" placeholder="Seu e-mail">
      <label for="senha">Senha</label>
      <input id="senha" type="password" autocomplete="current-password" placeholder="Sua senha">
      <button id="entrar">Entrar</button>
      <p><a href="#" id="esqueciSenha">Esqueci minha senha</a></p>
      <p id="mensagemLogin"></p>
    `;

    document.querySelector("#entrar").onclick = entrar;
    document.querySelector("#esqueciSenha").onclick = evento => {
      evento.preventDefault();
      solicitarRecuperacaoSenha();
    };
    document.querySelector("#senha").addEventListener("keydown", evento => {
      if (evento.key === "Enter") entrar();
    });
  }

  async function entrar() {
    const email = document.querySelector("#email").value.trim();
    const senha = document.querySelector("#senha").value;
    const botao = document.querySelector("#entrar");
    const aviso = document.querySelector("#mensagemLogin");

    if (!email || !senha) {
      aviso.textContent = "Informe seu e-mail e sua senha.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Entrando...";
    aviso.textContent = "";

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      await verificarUsuario();
    } catch (erro) {
      botao.disabled = false;
      botao.textContent = "Entrar";
      aviso.textContent = erro.message || "Falha no acesso.";
    }
  }

  async function solicitarRecuperacaoSenha() {
    const campoEmail = document.querySelector("#email");
    const aviso = document.querySelector("#mensagemLogin");
    let email = campoEmail?.value.trim() || "";

    if (!email) {
      email = prompt("Informe o e-mail cadastrado no Ligeirinho:");
      if (!email) {
        aviso.textContent = "Informe um e-mail para recuperar a senha.";
        return;
      }
      email = email.trim();
      if (campoEmail) campoEmail.value = email;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: URL_RECUPERACAO });
      if (error) throw error;
      aviso.textContent = "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.";
    } catch (erro) {
      aviso.textContent = "Erro ao solicitar recuperação: " + (erro.message || "tente novamente.");
    }
  }

  function mostrarRedefinirSenha() {
    limpar();
    painel.innerHTML = `
      <h2>Redefinir senha</h2>
      <p>Digite sua nova senha abaixo.</p>
      <label for="novaSenha">Nova senha</label>
      <input id="novaSenha" type="password" autocomplete="new-password" placeholder="Nova senha">
      <label for="confirmarSenha">Confirme a nova senha</label>
      <input id="confirmarSenha" type="password" autocomplete="new-password" placeholder="Repita a nova senha">
      <button id="salvarNovaSenha">Salvar nova senha</button>
      <p id="mensagemRedefinicao"></p>
    `;
    document.querySelector("#salvarNovaSenha").onclick = salvarNovaSenha;
  }

  async function salvarNovaSenha() {
    const senha = document.querySelector("#novaSenha").value;
    const confirmacao = document.querySelector("#confirmarSenha").value;
    const aviso = document.querySelector("#mensagemRedefinicao");

    if (!senha || !confirmacao || senha.length < 6 || senha !== confirmacao) {
      aviso.textContent = "Verifique se as senhas coincidem e possuem ao menos 6 caracteres.";
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      aguardandoRedefinicao = false;
      await supabase.auth.signOut();
      mensagem("Senha alterada com sucesso. Entre com sua nova senha.");
      mostrarLogin();
    } catch (erro) {
      aviso.textContent = "Não foi possível alterar a senha: " + erro.message;
    }
  }

  async function verificarUsuario() {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        mostrarLogin();
        return;
      }

      usuarioAtual = data.user;

      const { data: perfil, error: erroPerfil } = await supabase
        .from("perfis_usuarios")
        .select("id, nome, funcao, ativo")
        .eq("id", usuarioAtual.id)
        .single();

      if (erroPerfil) throw erroPerfil;
      if (!perfil || !perfil.ativo) throw new Error("Perfil não encontrado ou usuário inativo.");

      perfilAtual = perfil;

      await carregarProdutos();
      await carregarMesas();
      iniciarRealtime();
      mostrarInicio();
    } catch (erro) {
      mostrarErro("Não foi possível validar seu perfil.", erro);
      await supabase.auth.signOut();
      usuarioAtual = null;
      perfilAtual = null;
      mostrarLogin();
    }
  }

  // =====================================================
  // 2. PAINEL PRINCIPAL
  // =====================================================

  function mostrarInicio() {
    limpar();
    painel.innerHTML = `
      <h2>🚤 Ligeirinho PDV</h2>
      <p>Bem-vindo, <strong>${escapar(perfilAtual.nome)}</strong> (${escapar(perfilAtual.funcao)})</p>
      
      <div id="alertasEstoqueInicio"></div>

      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px;">
        <button id="mesas">Controle de Mesas</button>
        ${temPermissao("administrador") ? '<button id="produtos">Produtos</button><button id="estoque">Estoque</button>' : ""}
        ${temPermissao("administrador", "caixa") ? '<button id="contas">Contas Aguardando Pagamento</button>' : ""}
        <button id="atualizar">Atualizar Dados</button>
        <button id="sair" style="background: #a32323; color: white;">Sair</button>
      </div>
    `;

    document.querySelector("#mesas").onclick = mostrarMesas;
    document.querySelector("#atualizar").onclick = atualizarTudo;
    document.querySelector("#sair").onclick = sair;

    if (temPermissao("administrador")) {
      document.querySelector("#produtos").onclick = mostrarProdutos;
      document.querySelector("#estoque").onclick = mostrarEstoque;
    }

    if (temPermissao("administrador", "caixa")) {
      document.querySelector("#contas").onclick = carregarContasAguardando;
    }

    atualizarAvisosInicio();
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
    aguardandoRedefinicao = false;
    mostrarLogin();
  }

  async function atualizarTudo() {
    await carregarProdutos();
    await carregarMesas();
    atualizarAvisosInicio();
    mostrarInicio();
    mensagem("Dados atualizados com sucesso!");
  }

  // =====================================================
  // 3. PRODUTOS & ESTOQUE
  // =====================================================

  async function carregarProdutos() {
    const { data, error } = await supabase.from("produtos").select("*").order("nome");
    if (error) throw error;
    produtos = data || [];
    atualizarAvisosInicio();
  }

  function calcularAlertasEstoque() {
    const ativos = produtos.filter(p => p.ativo);
    const zerados = ativos.filter(p => Number(p.estoque || 0) <= 0);
    const baixos = ativos.filter(p => Number(p.estoque || 0) > 0 && Number(p.estoque || 0) <= Number(p.estoque_minimo || 0));
    return { ativos, zerados, baixos, total: zerados.length + baixos.length };
  }

  function atualizarAvisosInicio() {
    const area = document.querySelector("#alertasEstoqueInicio");
    if (!area) return;
    const alertas = calcularAlertasEstoque();

    if (alertas.total === 0) {
      area.innerHTML = `<div style="padding: 10px; border-radius: 6px; background: #eaf8ef; color: #176b39;">Estoque em dia! Nenhum item crítico.</div>`;
      return;
    }

    area.innerHTML = `
      <div style="padding: 10px; border-radius: 6px; background: #fff8e8; color: #765000;">
        ⚠️ <strong>Atenção ao estoque:</strong> ${alertas.zerados.length} zerado(s), ${alertas.baixos.length} baixo(s).
        ${temPermissao("administrador") ? '<br><button id="abrirEstoqueAlertas" style="margin-top:6px;">Ver Estoque</button>' : ""}
      </div>
    `;

    const btn = document.querySelector("#abrirEstoqueAlertas");
    if (btn) btn.onclick = mostrarEstoque;
  }

  function mostrarProdutos() {
    limpar();
    painel.innerHTML = `
      <h2>Produtos</h2>
      <button id="novo">Novo Produto</button>
      <button id="voltar">Voltar</button>
      <input id="pesquisaProduto" placeholder="Pesquisar por nome ou código" style="margin-top: 10px;">
      <div id="resumoProdutos" style="margin: 10px 0; font-size: 0.9rem;"></div>
      <div id="lista"></div>
    `;

    document.querySelector("#novo").onclick = () => formularioProduto();
    document.querySelector("#voltar").onclick = mostrarInicio;
    document.querySelector("#pesquisaProduto").oninput = renderizarListaProdutos;
    renderizarListaProdutos();
  }

  function renderizarListaProdutos() {
    const lista = document.querySelector("#lista");
    const resumo = document.querySelector("#resumoProdutos");
    if (!lista) return;
    lista.innerHTML = "";

    const pesquisa = document.querySelector("#pesquisaProduto")?.value.trim().toLowerCase() || "";
    let filtrados = [...produtos];

    if (pesquisa) {
      filtrados = filtrados.filter(p => p.nome.toLowerCase().includes(pesquisa) || String(p.codigo || "").toLowerCase().includes(pesquisa));
    }

    resumo.textContent = `Total: ${produtos.length} | Exibindo: ${filtrados.length}`;

    if (!filtrados.length) {
      lista.textContent = "Nenhum produto encontrado.";
      return;
    }

    filtrados.forEach(produto => {
      const linha = document.createElement("div");
      linha.style.cssText = "padding: 8px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;";
      linha.innerHTML = `
        <div>
          <strong>${escapar(produto.nome)}</strong> (${dinheiro(produto.preco_venda)})<br>
          <small>Estoque: ${produto.estoque} | ${produto.ativo ? "Ativo" : "Inativo"}</small>
        </div>
      `;
      const btnEditar = document.createElement("button");
      btnEditar.textContent = "Editar";
      btnEditar.onclick = () => formularioProduto(produto);
      linha.appendChild(btnEditar);
      lista.appendChild(linha);
    });
  }

  function formularioProduto(produto = null) {
    limpar();
    painel.innerHTML = `
      <h2>${produto ? "Editar Produto" : "Novo Produto"}</h2>
      <label>Código</label><input id="codigo">
      <label>Nome</label><input id="nome">
      <label>Categoria</label>
      <select id="categoria">
        <option value="Comida">Comida</option>
        <option value="Bebida">Bebida</option>
        <option value="Petiscos">Petiscos</option>
        <option value="Drinks">Drinks</option>
        <option value="Bebidas sem álcool">Bebidas sem álcool</option>
      </select>
      <label>Preço de Venda</label><input id="preco" type="number" step="0.01">
      <label>Custo</label><input id="custo" type="number" step="0.01">
      <label>Estoque Inicial</label><input id="estoque" type="number" ${produto ? "readonly" : ""}>
      <label>Estoque Mínimo</label><input id="minimo" type="number">
      <button id="salvar">Salvar</button>
      <button id="cancelar">Voltar</button>
      <p id="avisoProduto"></p>
    `;

    if (produto) {
      document.querySelector("#codigo").value = produto.codigo || "";
      document.querySelector("#nome").value = produto.nome || "";
      document.querySelector("#categoria").value = produto.categoria || "Comida";
      document.querySelector("#preco").value = produto.preco_venda ?? 0;
      document.querySelector("#custo").value = produto.custo ?? 0;
      document.querySelector("#estoque").value = produto.estoque ?? 0;
      document.querySelector("#minimo").value = produto.estoque_minimo ?? 0;
    }

    document.querySelector("#salvar").onclick = () => salvarProduto(produto);
    document.querySelector("#cancelar").onclick = mostrarProdutos;
  }

  async function salvarProduto(produto) {
    const registro = {
      codigo: document.querySelector("#codigo").value.trim() || null,
      nome: document.querySelector("#nome").value.trim(),
      categoria: document.querySelector("#categoria").value,
      preco_venda: Number(document.querySelector("#preco").value),
      custo: Number(document.querySelector("#custo").value || 0),
      estoque_minimo: Number(document.querySelector("#minimo").value || 0)
    };
    const estoqueInicial = Number(document.querySelector("#estoque").value || 0);

    if (!registro.nome || registro.preco_venda < 0) {
      document.querySelector("#avisoProduto").textContent = "Preencha os campos obrigatórios corretamente.";
      return;
    }

    try {
      if (produto) {
        const { error } = await supabase.from("produtos").update(registro).eq("id", produto.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("produtos").insert({ ...registro, estoque: estoqueInicial, ativo: true });
        if (error) throw error;
      }
      await carregarProdutos();
      mostrarProdutos();
      mensagem("Produto salvo com sucesso!");
    } catch (erro) {
      mostrarErro("Erro ao salvar produto.", erro);
    }
  }

  function mostrarEstoque() {
    if (!temPermissao("administrador")) return;
    limpar();
    painel.innerHTML = `
      <h2>Controle de Estoque</h2>
      <button id="voltar">Voltar</button>
      <p style="margin-top: 15px;">Gerencie entradas, saídas e ajustes de saldo pelo painel administrativo.</p>
    `;
    document.querySelector("#voltar").onclick = mostrarInicio;
  }

  // =====================================================
  // 4. MESAS E CONTAS
  // =====================================================

  async function carregarMesas() {
    try {
      const { data, error } = await supabase.from("mesas").select("*").order("numero");
      if (error) throw error;
      mesas = data || [];
    } catch (erro) {
      console.error("Erro ao carregar mesas:", erro);
    }
  }

  function mostrarMesas() {
    limpar();
    painel.innerHTML = `
      <h2>Controle de Mesas (1 a 50)</h2>
      <button id="voltarInicio">Voltar</button>
      <div id="gridMesas" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; margin-top: 15px;"></div>
    `;

    document.querySelector("#voltarInicio").onclick = mostrarInicio;
    const container = document.querySelector("#gridMesas");

    if (!mesas.length) {
      container.innerHTML = "<p>Nenhuma mesa cadastrada no banco de dados.</p>";
      return;
    }

    mesas.forEach(mesa => {
      const card = document.createElement("button");
      card.style.cssText = "padding: 12px; font-weight: bold; border-radius: 6px; background: #f0f0f0; border: 1px solid #ccc;";
      card.textContent = `Mesa ${mesa.numero}`;
      card.onclick = () => mensagem(`Mesa ${mesa.numero} selecionada.`);
      container.appendChild(card);
    });
  }

  async function carregarContasAguardando() {
    limpar();
    painel.innerHTML = `
      <h2>Contas Aguardando Pagamento</h2>
      <button id="voltar">Voltar</button>
      <p style="margin-top: 10px;">Nenhuma conta pendente no momento.</p>
    `;
    document.querySelector("#voltar").onclick = mostrarInicio;
  }

  // =====================================================
  // 5. TEMPO REAL (REALTIME)
  // =====================================================

  function iniciarRealtime() {
    if (canalRealtime) return;
    canalRealtime = supabase
      .channel("ligeirinho-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, () => carregarProdutos())
      .on("postgres_changes", { event: "*", schema: "public", table: "mesas" }, () => carregarMesas())
      .subscribe();
  }

})();
