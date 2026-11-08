```javascript
/* =====================================================
   LIGEIRINHO PDV
   Supabase + Produtos + Mesas + Pedidos + Realtime
   ===================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const painel = document.querySelector(".painel");

  const SUPABASE_URL = "https://ewfxcsaxxsqixtmxruxz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_1Cch1EDl59lNQFUiUIkmBQ_BXHuYjly";

  if (!window.supabase || !painel) {
    alert("Não foi possível iniciar o Ligeirinho.");
    return;
  }

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  let usuarioAtual = null;
  let perfilAtual = null;
  let produtos = [];
  let mesas = [];
  let pedidosAbertos = [];
  let mesaAtual = null;
  let pedidoAtual = null;
  let itensAtuais = [];
  let canalRealtime = null;

  const dinheiro = valor =>
    Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });

  function mensagem(texto) {
    alert(texto);
  }

  function erro(texto, detalhe) {
    console.error(texto, detalhe);
    mensagem(texto + (detalhe?.message ? "\n" + detalhe.message : ""));
  }

  function limparPainel() {
    painel.innerHTML = "";
  }

  function escapar(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, caractere => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[caractere]);
  }

  // =====================================================
  // LOGIN
  // =====================================================

  function mostrarLogin() {
    limparPainel();

    painel.innerHTML = `
      <h2>Acesso ao Ligeirinho</h2>

      <label>E-mail</label>
      <input id="email" type="email" placeholder="Seu e-mail">

      <label>Senha</label>
      <input id="senha" type="password" placeholder="Sua senha">

      <button id="entrar">Entrar</button>
    `;

    document.querySelector("#entrar").onclick = entrar;
  }

  async function entrar() {
    const email = document.querySelector("#email").value.trim();
    const senha = document.querySelector("#senha").value;

    if (!email || !senha) {
      mensagem("Informe seu e-mail e sua senha.");
      return;
    }

    const botao = document.querySelector("#entrar");
    botao.disabled = true;
    botao.textContent = "Entrando...";

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    });

    if (error) {
      botao.disabled = false;
      botao.textContent = "Entrar";
      erro("Não foi possível entrar.", error);
      return;
    }

    await verificarUsuario();
  }

  // =====================================================
  // PERFIL E PERMISSÕES
  // =====================================================

  function temPermissao(...funcoes) {
    return funcoes.includes(perfilAtual?.funcao);
  }

  async function verificarUsuario() {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      mostrarLogin();
      return;
    }

    usuarioAtual = data.user;

    const { data: perfil, error: erroPerfil } = await supabase
      .from("perfis_usuarios")
      .select("nome, funcao, ativo")
      .eq("id", usuarioAtual.id)
      .single();

    if (erroPerfil || !perfil || !perfil.ativo) {
      mensagem("Perfil não encontrado ou usuário inativo.");
      await supabase.auth.signOut();
      mostrarLogin();
      return;
    }

    if (!["administrador", "caixa", "garcom"].includes(perfil.funcao)) {
      mensagem("Função de usuário não reconhecida.");
      await supabase.auth.signOut();
      mostrarLogin();
      return;
    }

    perfilAtual = perfil;

    await carregarProdutosSilencioso();
    await carregarDadosMesas();
    iniciarRealtime();
    mostrarInicio();
  }

  // =====================================================
  // TELA PRINCIPAL
  // =====================================================

  function mostrarInicio() {
    limparPainel();

    const nome = escapar(perfilAtual?.nome || "Equipe");
    const funcao = escapar(perfilAtual?.funcao || "");

    painel.innerHTML = `
      <h2>Bem-vindo, ${nome}!</h2>
      <p>Perfil: ${funcao}</p>

      <button id="botaoMesas">Controle de Mesas</button>

      ${temPermissao("administrador")
        ? '<button id="botaoProdutos">Produtos</button>'
        : ""}

      ${temPermissao("administrador", "caixa")
        ? '<button id="botaoContas">Contas aguardando pagamento</button>'
        : ""}

      <button id="atualizar">Atualizar dados</button>
      <button id="sair">Sair</button>
    `;

    document.querySelector("#botaoMesas").onclick = mostrarMesas;

    if (temPermissao("administrador")) {
      document.querySelector("#botaoProdutos").onclick = carregarProdutos;
    }

    if (temPermissao("administrador", "caixa")) {
      document.querySelector("#botaoContas").onclick =
        carregarContasAguardando;
    }

    document.querySelector("#atualizar").onclick = async () => {
      await carregarDadosMesas();
      mensagem("Dados atualizados.");
      mostrarMesas();
    };

    document.querySelector("#sair").onclick = sair;
  }

  async function sair() {
    if (canalRealtime) {
      await supabase.removeChannel(canalRealtime);
      canalRealtime = null;
    }

    await supabase.auth.signOut();

    usuarioAtual = null;
    perfilAtual = null;
    produtos = [];
    mesas = [];
    pedidosAbertos = [];

    mostrarLogin();
  }

  // =====================================================
  // PRODUTOS
  // =====================================================

  async function carregarProdutosSilencioso() {
    const { data, error } = await supabase
      .from("produtos")
      .select("*")
      .order("nome");

    if (error) {
      erro("Erro ao carregar produtos.", error);
      return;
    }

    produtos = data || [];
  }

  async function carregarProdutos() {
    limparPainel();

    painel.innerHTML = `
      <h2>Produtos</h2>
      <p>Carregando...</p>
    `;

    await carregarProdutosSilencioso();
    mostrarListaProdutos();
  }

  function mostrarListaProdutos() {
    limparPainel();

    painel.innerHTML = `
      <h2>Cadastro de Produtos</h2>
      <button id="novoProduto">Novo produto</button>
      <button id="voltar">Voltar</button>
      <div id="listaProdutos"></div>
    `;

    document.querySelector("#novoProduto").onclick =
      () => mostrarFormularioProduto();

    document.querySelector("#voltar").onclick = mostrarInicio;

    const lista = document.querySelector("#listaProdutos");

    if (!produtos.length) {
      lista.textContent = "Nenhum produto cadastrado.";
      return;
    }

    produtos.forEach(produto => {
      const item = document.createElement("div");
      item.className = "item-pedido";

      const info = document.createElement("div");
      info.className = "item-info";

      const nome = document.createElement("strong");
      nome.textContent = produto.nome;

      const detalhes = document.createElement("span");
      detalhes.textContent =
        `${produto.categoria} | ${dinheiro(produto.preco_venda)} | Estoque: ${produto.estoque}`;

      info.append(nome, detalhes);

      const editar = document.createElement("button");
      editar.textContent = "Editar";
      editar.onclick = () => mostrarFormularioProduto(produto);

      item.append(info, editar);
      lista.appendChild(item);
    });
  }

  function mostrarFormularioProduto(produto = null) {
    const editando = Boolean(produto);

    limparPainel();

    painel.innerHTML = `
      <h2>${editando ? "Editar produto" : "Novo produto"}</h2>

      <label>Código</label>
      <input id="codigo">

      <label>Nome</label>
      <input id="nome">

      <label>Categoria</label>
      <select id="categoria">
        <option value="">Selecione</option>
        <option>Comida</option>
        <option>Bebida</option>
        <option>Petiscos</
