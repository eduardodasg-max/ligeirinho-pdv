
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
  let atualizacaoEmAndamento = false;

  const categoriasProdutos = [
    { valor: "comida", nome: "Comida" },
    { valor: "bebida", nome: "Bebida" },
    { valor: "petiscos", nome: "Petiscos" },
    { valor: "drinks", nome: "Drinks" },
    { valor: "bebidas sem álcool", nome: "Bebidas sem álcool" }
  ];

  let filtroProdutos = "ativos";
  let pesquisaProdutos = "";

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

  function voltarInicio() {
    mostrarInicio();
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
    mesaAtual = null;
    pedidoAtual = null;
    itensAtuais = [];

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
    if (!temPermissao("administrador")) {
      mensagem("Somente o administrador pode acessar os produtos.");
      return;
    }

    limparPainel();

    painel.innerHTML = `
      <h2>Produtos</h2>
      <p>Carregando...</p>
    `;

    await carregarProdutosSilencioso();
    mostrarListaProdutos();
  }

  function mostrarListaProdutos() {
    if (!temPermissao("administrador")) {
      mostrarInicio();
      return;
    }

    limparPainel();

    painel.innerHTML = `
      <h2>Cadastro de Produtos</h2>

      <button id="novoProduto">Novo produto</button>

      <label>Pesquisar produto</label>
      <input
        id="pesquisaProduto"
        type="search"
        placeholder="Digite o nome ou código"
        value="${escapar(pesquisaProdutos)}"
      >

      <label>Mostrar</label>
      <select id="filtroProdutos">
        <option value="ativos">Produtos ativos</option>
        <option value="inativos">Produtos inativos</option>
        <option value="todos">Todos os produtos</option>
      </select>

      <div id="listaProdutos"></div>

      <button id="voltar">Voltar</button>
    `;

    const pesquisa = document.querySelector("#pesquisaProduto");
    const filtro = document.querySelector("#filtroProdutos");

    filtro.value = filtroProdutos;

    document.querySelector("#novoProduto").onclick =
      () => mostrarFormularioProduto();

    document.querySelector("#voltar").onclick = mostrarInicio;

    pesquisa.oninput = () => {
      pesquisaProdutos = pesquisa.value;
      renderizarListaProdutos();
    };

    filtro.onchange = () => {
      filtroProdutos = filtro.value;
      renderizarListaProdutos();
    };

    renderizarListaProdutos();
  }

  function renderizarListaProdutos() {
    const lista = document.querySelector("#listaProdutos");

    if (!lista) return;

    lista.innerHTML = "";

    let encontrados = produtos.filter(produto => {
      if (filtroProdutos === "ativos" && !produto.ativo) return false;
      if (filtroProdutos === "inativos" && produto.ativo) return false;

      const termo = pesquisaProdutos.trim().toLowerCase();

      if (!termo) return true;

      return (
        String(produto.nome || "").toLowerCase().includes(termo) ||
        String(produto.codigo || "").toLowerCase().includes(termo)
      );
    });

    if (!encontrados.length) {
      lista.textContent = "Nenhum produto encontrado.";
      return;
    }

    encontrados.forEach(produto => {
      const item = document.createElement("div");
      item.className = "item-pedido";

      const info = document.createElement("div");
      info.className = "item-info";

      const nome = document.createElement("strong");
      nome.textContent = produto.nome;

      const detalhes = document.createElement("span");

      detalhes.textContent =
        `${produto.codigo ? "Código: " + produto.codigo + " | " : ""}` +
        `${produto.categoria} | ` +
        `Venda: ${dinheiro(produto.preco_venda)} | ` +
        `Estoque: ${produto.estoque}`;

      const situacao = document.createElement("span");
      situacao.textContent = produto.ativo ? "Ativo" : "Inativo";

      info.append(nome, detalhes, situacao);

      const editar = document.createElement("button");
      editar.textContent = "Editar";
      editar.onclick = () => mostrarFormularioProduto(produto);

      const alternar = document.createElement("button");
      alternar.textContent = produto.ativo ? "Desativar" : "Reativar";
      alternar.onclick = () => alternarProduto(produto);

      item.append(info, editar, alternar);
      lista.appendChild(item);
    });
  }

  function mostrarFormularioProduto(produto = null) {
    if (!temPermissao("administrador")) {
      mensagem("Somente o administrador pode cadastrar produtos.");
      return;
    }

    const editando = Boolean(produto);

    limparPainel();

    const categoriaExistente = produto?.categoria || "";

    let opcoesCategoria = categoriasProdutos.map(categoria => `
      <option value="${escapar(categoria.valor)}">
        ${escapar(categoria.nome)}
      </option>
    `).join("");

    const categoriaNormalizada = categoriaExistente.trim().toLowerCase();

    const categoriaConhecida = categoriasProdutos.some(
      categoria => categoria.valor === categoriaNormalizada
    );

    if (editando && categoriaExistente && !categoriaConhecida) {
      opcoesCategoria += `
        <option value="${escapar(categoriaExistente)}">
          ${escapar(categoriaExistente)}
        </option>
      `;
    }

    painel.innerHTML = `
      <h2>${editando ? "Editar produto" : "Novo produto"}</h2>

      <label>Código (opcional)</label>
      <input id="codigo" maxlength="100" placeholder="Código do produto">

      <label>Nome do produto</label>
      <input id="nome" maxlength="150" placeholder="Ex.: Água mineral">

      <label>Categoria</label>
      <select id="categoria">
        <option value="">Selecione uma categoria</option>
        ${opcoesCategoria}
      </select>

      <label>Preço de venda (R$)</label>
      <input id="preco" type="number" min="0" step="0.01"
        placeholder="0,00">

      <label>Custo de compra (R$)</label>
      <input id="custo" type="number" min="0" step="0.01"
        placeholder="0,00">

      ${editando ? `
        <label>Estoque atual</label>
        <input id="estoque" type="number" value="${Number(produto.estoque || 0)}" disabled>
        <p>O estoque não é alterado na edição do produto.</p>
      ` : `
        <label>Estoque inicial</label>
        <input id="estoque" type="number" min="0" step="0.001" value="0">
      `}

      <label>Estoque mínimo</label>
      <input id="estoqueMinimo" type="number" min="0" step="0.001"
        placeholder="0">

      <button id="salvarProduto">Salvar produto</button>
      <button id="cancelar">Cancelar</button>
    `;

    document.querySelector("#codigo").value = produto?.codigo || "";
    document.querySelector("#nome").value = produto?.nome || "";

    document.querySelector("#categoria").value =
      categoriaConhecida
        ? categoriaNormalizada
        : categoriaExistente;

    document.querySelector("#preco").value =
      produto?.preco_venda ?? "";

    document.querySelector("#custo").value =
      produto?.custo ?? "";

    if (!editando) {
      document.querySelector("#estoque").value = 0;
    }

    document.querySelector("#estoqueMinimo").value =
      produto?.estoque_minimo ?? 0;

    document.querySelector("#salvarProduto").onclick =
      () => salvarProduto(produto?.id);

    document.querySelector("#cancelar").onclick =
      mostrarListaProdutos;
  }

  async function salvarProduto(id) {
    if (!temPermissao("administrador")) {
      mensagem("Somente o administrador pode salvar produtos.");
      return;
    }

    const codigo = document.querySelector("#codigo").value.trim();
    const nome = document.querySelector("#nome").value.trim();
    const categoria = document.querySelector("#categoria").value;

    const precoTexto = document.querySelector("#preco").value;
    const custoTexto = document.querySelector("#custo").value;
    const estoqueMinimoTexto =
      document.querySelector("#estoqueMinimo").value;

    const preco = Number(precoTexto);
    const custo = Number(custoTexto);
    const estoqueMinimo = Number(estoqueMinimoTexto);

    if (!nome || !categoria) {
      mensagem("Preencha o nome e a categoria do produto.");
      return;
    }

    if (
      precoTexto === "" ||
      custoTexto === "" ||
      estoqueMinimoTexto === ""
    ) {
      mensagem("Preencha o preço, custo e estoque mínimo.");
      return;
    }

    if (
      [preco, custo, estoqueMinimo].some(
        valor => !Number.isFinite(valor) || valor < 0
      )
    ) {
      mensagem("Confira os valores informados. Não são permitidos valores negativos.");
      return;
    }

    const dados = {
      codigo: codigo || null,
      nome,
      categoria,
      preco_venda: preco,
      custo,
      estoque_minimo: estoqueMinimo
    };

    if (!id) {
      const estoqueTexto = document.querySelector("#estoque").value;
      const estoque = Number(estoqueTexto);

      if (
        estoqueTexto === "" ||
        !Number.isFinite(estoque) ||
        estoque < 0
      ) {
        mensagem("Informe um estoque inicial válido.");
        return;
      }

      dados.estoque = estoque;
      dados.ativo = true;
    }

    const botao = document.querySelector("#salvarProduto");
    botao.disabled = true;
    botao.textContent = "Salvando...";

    let resultado;

    if (id) {
      resultado = await supabase
        .from("produtos")
        .update(dados)
        .eq("id", id);
    } else {
      resultado = await supabase
        .from("produtos")
        .insert(dados);
    }

    if (resultado.error) {
      botao.disabled = false;
      botao.textContent = "Salvar produto";

      if (resultado.error.code === "23505") {
        mensagem("Este código já está cadastrado em outro produto. Informe outro código.");
        return;
      }

      erro("Erro ao salvar produto.", resultado.error);
      return;
    }

    mensagem(
      id
        ? "Produto atualizado com sucesso!"
        : "Produto cadastrado com sucesso!"
    );

    await carregarProdutosSilencioso();
    mostrarListaProdutos();
  }

  async function alternarProduto(produto) {
    if (!temPermissao("administrador")) {
      mensagem("Somente o administrador pode alterar produtos.");
      return;
    }

    const novaSituacao = !produto.ativo;

    const confirmacao = novaSituacao
      ? `Deseja reativar o produto "${produto.nome}"?`
      : `Deseja desativar o produto "${produto.nome}"?`;

    if (!confirm(confirmacao)) return;

    const { error } = await supabase
      .from("produtos")
      .update({ ativo: novaSituacao })
      .eq("id", produto.id);

    if (error) {
      erro("Não foi possível alterar a situação do produto.", error);
      return;
    }

    mensagem(
      novaSituacao
        ? "Produto reativado com sucesso!"
        : "Produto desativado com sucesso!"
    );

    await carregarProdutosSilencioso();
    mostrarListaProdutos();
  }

  // =====================================================
  // DADOS DAS MESAS E PEDIDOS
  // =====================================================

  async function carregarDadosMesas() {
    const [resultadoMesas, resultadoPedidos] = await Promise.all([
      supabase
        .from("mesas")
        .select("id, numero, status")
        .order("numero"),

      supabase
        .from("pedidos")
        .select("id, mesa_id, garcom_id, status, valor_total, aberto_em, conta_solicitada_em")
        .eq("status", "aberto")
    ]);

    if (resultadoMesas.error) {
      erro("Erro ao carregar mesas.", resultadoMesas.error);
      return;
    }

    if (resultadoPedidos.error) {
      erro("Erro ao carregar pedidos.", resultadoPedidos.error);
      return;
    }

    mesas = resultadoMesas.data || [];
    pedidosAbertos = resultadoPedidos.data || [];
  }

  function pedidoDaMesa(mesaId) {
    return pedidosAbertos.find(p => p.mesa_id === mesaId);
  }

  // =====================================================
  // MESAS
  // =====================================================

  async function mostrarMesas() {
    await carregarDadosMesas();

    limparPainel();

    painel.innerHTML = `
      <h2>Controle de Mesas</h2>
      <p>Selecione uma mesa.</p>
      <div id="mesas" class="mesas"></div>
      <button id="voltar">Voltar</button>
    `;

    document.querySelector("#voltar").onclick = mostrarInicio;

    const area = document.querySelector("#mesas");

    mesas.forEach(mesa => {
      const pedido = pedidoDaMesa(mesa.id);
      const botao = document.createElement("button");

      botao.className = "mesa";
      botao.textContent = `Mesa ${mesa.numero}`;

      const status = document.createElement("small");
      status.textContent = mesa.status || "livre";

      botao.appendChild(document.createElement("br"));
      botao.appendChild(status);

      if (mesa.status === "ocupada") {
        botao.classList.add("ocupada");
      } else if (mesa.status === "aguardando_pagamento") {
        botao.classList.add("aguardando");
      } else {
        botao.classList.add("livre");
      }

      botao.onclick = () => selecionarMesa(mesa, pedido);

      area.appendChild(botao);
    });

    if (!mesas.length) {
      area.textContent = "Nenhuma mesa encontrada no banco de dados.";
    }
  }

  async function selecionarMesa(mesa, pedido) {
    mesaAtual = mesa;
    pedidoAtual = pedido || null;

    if (!pedidoAtual && mesa.status !== "livre") {
      mensagem("Esta mesa não está livre e não possui pedido aberto localizado.");
      await mostrarMesas();
      return;
    }

    if (!pedidoAtual) {
      await abrirMesa(mesa);
      return;
    }

    await carregarItensPedido();
    mostrarPedido();
  }

  // =====================================================
  // ABRIR MESA
  // =====================================================

  async function abrirMesa(mesa) {
    if (mesa.status !== "livre") {
      mensagem("Esta mesa não está livre.");
      return;
    }

    const { data, error } = await supabase.rpc(
      "abrir_mesa",
      {
        p_mesa_id: mesa.id
      }
    );

    if (error) {
      erro("Não foi possível abrir a mesa.", error);
      return;
    }

    await carregarDadosMesas();

    pedidoAtual = pedidosAbertos.find(p => p.mesa_id === mesa.id);

    if (!pedidoAtual && data) {
      pedidoAtual = Array.isArray(data) ? data[0] : data;
    }

    if (!pedidoAtual) {
      mensagem("Mesa aberta. Atualizando os dados...");
      await mostrarMesas();
      return;
    }

    mesaAtual = mesa;
    await carregarItensPedido();
    mostrarPedido();
  }

  // =====================================================
  // ITENS DO PEDIDO
  // =====================================================

  async function carregarItensPedido() {
    if (!pedidoAtual) {
      itensAtuais = [];
      return;
    }

    const { data, error } = await supabase
      .from("itens_pedido")
      .select("id, pedido_id, produto_id, quantidade, preco_unitario, subtotal, observacao, status_producao")
      .eq("pedido_id", pedidoAtual.id)
      .order("criado_em");

    if (error) {
      erro("Erro ao carregar itens do pedido.", error);
      return;
    }

    itensAtuais = data || [];
  }

  // =====================================================
  // TELA DO PEDIDO
  // =====================================================

  function mostrarPedido() {
    if (!mesaAtual || !pedidoAtual) {
      mostrarMesas();
      return;
    }

    limparPainel();

    const podeAdicionar = temPermissao(
      "administrador", "caixa", "garcom"
    );

    painel.innerHTML = `
      <h2>Mesa ${mesaAtual.numero}</h2>
      <p>Pedido aberto</p>

      ${podeAdicionar ? `
        <label>Produto</label>
        <select id="produto">
          <option value="">Selecione um produto</option>
          ${produtos.filter(p => p.ativo).map(p => `
            <option value="${escapar(p.id)}">
              ${escapar(p.nome)} - ${dinheiro(p.preco_venda)}
            </option>
          `).join("")}
        </select>

        <label>Quantidade</label>
        <input id="quantidade" type="number" min="0.001"
          step="0.001" value="1">

        <label>Observação</label>
        <input id="observacao" placeholder="Ex.: sem cebola">

        <button id="adicionar">Adicionar item</button>
      ` : ""}

      <h3>Itens da mesa</h3>
      <div id="lista"></div>

      <h2 id="total"></h2>

      <button id="solicitarConta">Solicitar fechamento da conta</button>
      <button id="voltar">Voltar às mesas</button>
    `;

    if (podeAdicionar) {
      document.querySelector("#adicionar").onclick = adicionarItem;
    }

    document.querySelector("#solicitarConta").onclick =
      solicitarFechamento;

    document.querySelector("#voltar").onclick = mostrarMesas;

    atualizarListaItens();
  }

  function atualizarListaItens() {
    const lista = document.querySelector("#lista");
    const total = document.querySelector("#total");

    if (!lista || !total) return;

    lista.innerHTML = "";

    let soma = 0;

    itensAtuais.forEach(item => {
      const produto = produtos.find(p => p.id === item.produto_id);
      const nome = produto?.nome || "Produto";

      soma += Number(item.subtotal || 0);

      const linha = document.createElement("div");
      linha.className = "item-pedido";

      const info = document.createElement("div");
      info.className = "item-info";

      const nomeItem = document.createElement("span");
      nomeItem.className = "item-nome";
      nomeItem.textContent = `${item.quantidade}x ${nome}`;

      const valor = document.createElement("span");
      valor.className = "item-valor";
      valor.textContent = dinheiro(item.subtotal);

      info.append(nomeItem, valor);
      linha.appendChild(info);

      const podeRemover =
        temPermissao("administrador", "caixa") ||
        (
          temPermissao("garcom") &&
          pedidoAtual.garcom_id === usuarioAtual.id
        );

      if (podeRemover && item.status_producao === "pendente") {
        const remover = document.createElement("button");
        remover.textContent = "Remover";
        remover.onclick = () => removerItem(item.id);
        linha.appendChild(remover);
      }

      lista.appendChild(linha);
    });

    total.textContent = "Total: " + dinheiro(soma);
  }

  // =====================================================
  // ADICIONAR ITEM
  // =====================================================

  async function adicionarItem() {
    const produtoId = document.querySelector("#produto").value;
    const quantidade = Number(
      document.querySelector("#quantidade").value
    );
    const observacao =
      document.querySelector("#observacao").value.trim();

    if (!produtoId || !Number.isFinite(quantidade) || quantidade <= 0) {
      mensagem("Selecione um produto e informe uma quantidade válida.");
      return;
    }

    const { error } = await supabase.rpc(
      "adicionar_item_pedido",
      {
        p_pedido_id: pedidoAtual.id,
        p_produto_id: produtoId,
        p_quantidade: quantidade,
        p_observacao: observacao || null
      }
    );

    if (error) {
      erro("Não foi possível adicionar o item.", error);
      return;
    }

    await carregarDadosMesas();
    pedidoAtual = pedidoDaMesa(mesaAtual.id);
    await carregarItensPedido();
    mostrarPedido();
  }

  // =====================================================
  // REMOVER ITEM
  // =====================================================

  async function removerItem(itemId) {
    if (!confirm("Deseja remover este item do pedido?")) return;

    const { error } = await supabase.rpc(
      "remover_item_pedido",
      { p_item_id: itemId }
    );

    if (error) {
      erro("Não foi possível remover o item.", error);
      return;
    }

    await carregarDadosMesas();
    pedidoAtual = pedidoDaMesa(mesaAtual.id);
    await carregarItensPedido();
    mostrarPedido();
  }

  // =====================================================
  // SOLICITAR FECHAMENTO DA CONTA
  // =====================================================

  async function solicitarFechamento() {
    if (!confirm("Solicitar o fechamento desta conta?")) return;

    const { error } = await supabase.rpc(
      "solicitar_fechamento_conta",
      { p_pedido_id: pedidoAtual.id }
    );

    if (error) {
      erro("Não foi possível solicitar o fechamento.", error);
      return;
    }

    mensagem("Conta enviada para o caixa.");
    await carregarDadosMesas();
    mostrarMesas();
  }

  // =====================================================
  // CONTAS AGUARDANDO PAGAMENTO
  // =====================================================

  async function carregarContasAguardando() {
    limparPainel();

    painel.innerHTML = `
      <h2>Contas aguardando pagamento</h2>
      <p>Carregando...</p>
    `;

    const { data, error } = await supabase.rpc(
      "listar_contas_aguardando_pagamento"
    );

    if (error) {
      erro("Erro ao carregar contas.", error);
      mostrarInicio();
      return;
    }

    mostrarListaContas(data || []);
  }

  function mostrarListaContas(contas) {
    limparPainel();

    painel.innerHTML = `
      <h2>Contas aguardando pagamento</h2>
      <div id="listaContas"></div>
      <button id="atualizar">Atualizar</button>
      <button id="voltar">Voltar</button>
    `;

    document.querySelector("#atualizar").onclick =
      carregarContasAguardando;

    document.querySelector("#voltar").onclick = mostrarInicio;

    const lista = document.querySelector("#listaContas");

    if (!contas.length) {
      lista.textContent = "Nenhuma conta aguardando pagamento.";
      return;
    }

    contas.forEach(conta => {
      const item = document.createElement("div");
      item.className = "item-pedido";

      const info = document.createElement("div");
      info.className = "item-info";

      const titulo = document.createElement("strong");
      titulo.textContent =
        `Mesa ${conta.numero_mesa ?? conta.mesa_numero ?? ""}`;

      const valor = document.createElement("span");
      valor.textContent = dinheiro(conta.valor_total);

      info.append(titulo, valor);

      const pagar = document.createElement("button");
      pagar.textContent = "Registrar pagamento";
      pagar.onclick = () => mostrarPagamento(conta);

      item.append(info, pagar);
      lista.appendChild(item);
    });
  }

  // =====================================================
  // PAGAMENTO
  // =====================================================

  function mostrarPagamento(conta) {
    limparPainel();

    painel.innerHTML = `
      <h2>Registrar pagamento</h2>
      <p>Valor da conta: <strong>${dinheiro(conta.valor_total)}</strong></p>

      <label>Forma de pagamento</label>
      <select id="forma">
        <option value="dinheiro">Dinheiro</option>
        <option value="pix">Pix</option>
        <option value="debito">Débito</option>
        <option value="credito">Crédito</option>
      </select>

      <label>Valor do pagamento</label>
      <input id="valor" type="number" min="0.01" step="0.01"
        value="${Number(conta.valor_total || 0)}">

      <div id="campoRecebido">
        <label>Valor recebido em dinheiro</label>
        <input id="recebido" type="number" min="0" step="0.01">
      </div>

      <button id="confirmar">Confirmar pagamento</button>
      <button id="voltar">Voltar</button>
    `;

    const forma = document.querySelector("#forma");
    const campoRecebido = document.querySelector("#campoRecebido");

    forma.onchange = () => {
      campoRecebido.style.display =
        forma.value === "dinheiro" ? "block" : "none";
    };

    forma.onchange();

    document.querySelector("#confirmar").onclick =
      () => registrarPagamento(conta);

    document.querySelector("#voltar").onclick =
      carregarContasAguardando;
  }

  async function registrarPagamento(conta) {
    const forma = document.querySelector("#forma").value;
    const valor = Number(document.querySelector("#valor").value);
    const recebido = forma === "dinheiro"
      ? Number(document.querySelector("#recebido").value)
      : null;

    if (!Number.isFinite(valor) || valor <= 0) {
      mensagem("Informe um valor de pagamento válido.");
      return;
    }

    if (
      forma === "dinheiro" &&
      (!Number.isFinite(recebido) || recebido < valor)
    ) {
      mensagem("O valor recebido precisa ser igual ou maior que o pagamento.");
      return;
    }

    const { data, error } = await supabase.rpc(
      "registrar_pagamento",
      {
        p_pedido_id: conta.pedido_id,
        p_forma_pagamento: forma,
        p_valor: valor,
        p_valor_recebido: recebido
      }
    );

    if (error) {
      erro(
        "Não foi possível registrar o pagamento. Confira se existe um caixa aberto para este operador.",
        error
      );
      return;
    }

    if (data && typeof data === "object" && data.troco !== undefined) {
      mensagem("Pagamento registrado. Troco: " + dinheiro(data.troco));
    } else {
      mensagem("Pagamento registrado com sucesso!");
    }

    await carregarDadosMesas();
    await carregarContasAguardando();
  }

  // =====================================================
  // ATUALIZAÇÃO EM TEMPO REAL
  // =====================================================

  function iniciarRealtime() {
    if (canalRealtime) {
      supabase.removeChannel(canalRealtime);
    }

    canalRealtime = supabase
      .channel("ligeirinho-atualizacoes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        atualizarDepoisDeMudanca
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        atualizarDepoisDeMudanca
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "itens_pedido" },
        atualizarDepoisDeMudanca
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "produtos" },
        atualizarDepoisDeMudanca
      )
      .subscribe();
  }

  async function atualizarDepoisDeMudanca() {
    if (atualizacaoEmAndamento || !usuarioAtual) return;

    atualizacaoEmAndamento = true;

    try {
      await carregarProdutosSilencioso();
      await carregarDadosMesas();

      if (mesaAtual && pedidoAtual) {
        const pedidoAtualizado = pedidoDaMesa(mesaAtual.id);

        if (!pedidoAtualizado) {
          pedidoAtual = null;
          itensAtuais = [];
          mensagem("O pedido desta mesa foi encerrado ou alterado.");
          mostrarMesas();
        } else {
          pedidoAtual = pedidoAtualizado;
          await carregarItensPedido();

          if (document.querySelector("#lista")) {
            atualizarListaItens();
          }
        }
      } else if (document.querySelector("#mesas")) {
        mostrarMesas();
      } else if (document.querySelector("#listaContas")) {
        carregarContasAguardando();
      } else if (document.querySelector("#listaProdutos")) {
        renderizarListaProdutos();
      }
    } catch (e) {
      console.error("Erro na atualização em tempo real:", e);
    } finally {
      atualizacaoEmAndamento = false;
    }
  }

  // =====================================================
  // INICIALIZAÇÃO
  // =====================================================

  const { data: sessao, error: erroSessao } =
    await supabase.auth.getSession();

  if (erroSessao) {
    erro("Erro ao verificar sessão.", erroSessao);
    mostrarLogin();
    return;
  }

  if (sessao.session) {
    await verificarUsuario();
  } else {
    mostrarLogin();
  }
});
