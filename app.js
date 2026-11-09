/* =====================================================
   LIGEIRINHO PDV
   Reconstrução da aplicação
   ===================================================== */

(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", iniciar);

  const SUPABASE_URL = "https://ewfxcsaxxsqixtmxruxz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_1Cch1EDl59lNQFUiUIkmBQ_BXHuYjly";

  let supabase;
  let painel;
  let usuarioAtual = null;
  let perfilAtual = null;
  let produtos = [];
  let mesas = [];
  let pedidoAtual = null;
  let canalRealtime = null;

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
      supabase = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );

      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (data.session) {
        await verificarUsuario();
      } else {
        mostrarLogin();
      }
    } catch (erro) {
      mostrarErro("Não foi possível iniciar o Ligeirinho.", erro);
      mostrarLogin();
    }
  }

  // LOGIN

  function mostrarLogin() {
    limpar();

    painel.innerHTML = `
      <h2>Acesso ao Ligeirinho</h2>
      <label for="email">E-mail</label>
      <input id="email" type="email" autocomplete="username"
        placeholder="Seu e-mail">

      <label for="senha">Senha</label>
      <input id="senha" type="password"
        autocomplete="current-password" placeholder="Sua senha">

      <button id="entrar">Entrar</button>
      <p id="mensagemLogin"></p>
    `;

    document.querySelector("#entrar").onclick = entrar;

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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: senha
      });

      if (error) throw error;

      await verificarUsuario();
    } catch (erro) {
      botao.disabled = false;
      botao.textContent = "Entrar";
      aviso.textContent = erro.message || "Falha no acesso.";
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

      if (!perfil || !perfil.ativo) {
        throw new Error("Perfil não encontrado ou usuário inativo.");
      }

      if (!["administrador", "caixa", "garcom"].includes(perfil.funcao)) {
        throw new Error("Função de usuário não reconhecida.");
      }

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

  // PAINEL PRINCIPAL

  function mostrarInicio() {
    limpar();

    painel.innerHTML = `
      <h2>🚤 Ligeirinho PDV</h2>
      <p>Bem-vindo, ${escapar(perfilAtual.nome)}</p>
      <p>Perfil: ${escapar(perfilAtual.funcao)}</p>

      <button id="mesas">Controle de mesas</button>
      ${temPermissao("administrador")
        ? '<button id="produtos">Produtos</button>' : ""}
      ${temPermissao("administrador", "caixa")
        ? '<button id="contas">Contas aguardando pagamento</button>' : ""}
      <button id="atualizar">Atualizar</button>
      <button id="sair">Sair</button>
    `;

    document.querySelector("#mesas").onclick = mostrarMesas;
    document.querySelector("#atualizar").onclick = atualizarTudo;
    document.querySelector("#sair").onclick = sair;

    if (temPermissao("administrador")) {
      document.querySelector("#produtos").onclick = mostrarProdutos;
    }

    if (temPermissao("administrador", "caixa")) {
      document.querySelector("#contas").onclick =
        carregarContasAguardando;
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
    mostrarMesas();
  }

  // PRODUTOS

  async function carregarProdutos() {
    const { data, error } = await supabase
      .from("produtos")
      .select("*")
      .order("nome");

    if (error) throw error;

    produtos = data || [];
  }

  function mostrarProdutos() {
    limpar();

    painel.innerHTML = `
      <h2>Produtos</h2>
      <button id="novo">Novo produto</button>
      <button id="voltar">Voltar</button>
      <div id="lista"></div>
    `;

    document.querySelector("#novo").onclick = () => formularioProduto();
    document.querySelector("#voltar").onclick = mostrarInicio;

    const lista = document.querySelector("#lista");

    if (!produtos.length) {
      lista.textContent = "Nenhum produto cadastrado.";
      return;
    }

    produtos.forEach(produto => {
      const linha = document.createElement("div");
      linha.className = "item-pedido";

      const texto = document.createElement("span");
      texto.textContent =
        `${produto.nome} — ${dinheiro(produto.preco_venda)} — Estoque: ${produto.estoque}`;

      const editar = document.createElement("button");
      editar.textContent = "Editar";
      editar.onclick = () => formularioProduto(produto);

      linha.append(texto, editar);
      lista.appendChild(linha);
    });
  }

  function formularioProduto(produto = null) {
    limpar();

    const categorias = [
      "Comida",
      "Bebida",
      "Petiscos",
      "Drinks",
      "Bebidas sem álcool"
    ];

    painel.innerHTML = `
      <h2>${produto ? "Editar produto" : "Novo produto"}</h2>

      <label>Código</label>
      <input id="codigo">

      <label>Nome</label>
      <input id="nome">

      <label>Categoria</label>
      <select id="categoria">
        <option value="">Selecione</option>
        ${categorias.map(c =>
          `<option value="${escapar(c)}">${escapar(c)}</option>`
        ).join("")}
      </select>

      <label>Preço de venda</label>
      <input id="preco" type="number" min="0" step="0.01">

      <label>Custo</label>
      <input id="custo" type="number" min="0" step="0.01">

      <label>Estoque</label>
      <input id="estoque" type="number" min="0" step="0.001">

      <label>Estoque mínimo</label>
      <input id="minimo" type="number" min="0" step="0.001">

      <button id="salvar">Salvar</button>
      <button id="cancelar">Voltar</button>
    `;

    if (produto) {
      document.querySelector("#codigo").value = produto.codigo || "";
      document.querySelector("#nome").value = produto.nome || "";
      document.querySelector("#categoria").value = produto.categoria || "";
      document.querySelector("#preco").value = produto.preco_venda ?? 0;
      document.querySelector("#custo").value = produto.custo ?? 0;
      document.querySelector("#estoque").value = produto.estoque ?? 0;
      document.querySelector("#minimo").value = produto.estoque_minimo ?? 0;
    }

    document.querySelector("#salvar").onclick =
      () => salvarProduto(produto);

    document.querySelector("#cancelar").onclick = mostrarProdutos;
  }

  async function salvarProduto(produto) {
    const registro = {
      codigo: document.querySelector("#codigo").value.trim() || null,
      nome: document.querySelector("#nome").value.trim(),
      categoria: document.querySelector("#categoria").value,
      preco_venda: Number(document.querySelector("#preco").value),
      custo: Number(document.querySelector("#custo").value || 0),
      estoque: Number(document.querySelector("#estoque").value || 0),
      estoque_minimo: Number(document.querySelector("#minimo").value || 0),
      ativo: true
    };

    if (!registro.nome || !registro.categoria ||
        !Number.isFinite(registro.preco_venda) ||
        registro.preco_venda < 0) {
      mensagem("Confira o nome, a categoria e o preço.");
      return;
    }

    try {
      let consulta = supabase.from("produtos");

      const resultado = produto
        ? await consulta.update(registro).eq("id", produto.id)
        : await consulta.insert(registro);

      if (resultado.error) throw resultado.error;

      await carregarProdutos();
      mostrarProdutos();
      mensagem("Produto salvo.");
    } catch (erro) {
      mostrarErro("Não foi possível salvar o produto.", erro);
    }
  }

  // MESAS

  async function carregarMesas() {
    const { data, error } = await supabase
      .from("mesas")
      .select("*")
      .order("numero");

    if (error) throw error;

    mesas = data || [];
  }

  function mostrarMesas() {
    limpar();

    painel.innerHTML = `
      <h2>Controle de mesas</h2>
      <button id="voltar">Voltar</button>
      <div id="gradeMesas"></div>
    `;

    document.querySelector("#voltar").onclick = mostrarInicio;

    const grade = document.querySelector("#gradeMesas");

    mesas.forEach(mesa => {
      const botao = document.createElement("button");
      botao.className = "mesa";
      botao.textContent = `Mesa ${mesa.numero} — ${mesa.status}`;
      botao.onclick = () => selecionarMesa(mesa);
      grade.appendChild(botao);
    });
  }

  async function selecionarMesa(mesa) {
    if (mesa.status === "livre") {
      await abrirMesa(mesa);
      return;
    }

    const { data, error } = await supabase
      .from("pedidos")
      .select("*")
      .eq("mesa_id", mesa.id)
      .eq("status", "aberto")
      .maybeSingle();

    if (error) {
      mostrarErro("Erro ao consultar pedido.", error);
      return;
    }

    if (!data) {
      mensagem("Não foi encontrado pedido aberto nesta mesa.");
      return;
    }

    pedidoAtual = data;
    await carregarItensPedido();
    mostrarPedido(mesa);
  }

  async function abrirMesa(mesa) {
    try {
      const parametros = { p_mesa_id: mesa.id };

      if (temPermissao("administrador", "caixa")) {
        const garcom = prompt("Informe o ID do garçom responsável:");
        if (!garcom) return;
        parametros.p_garcom_id = garcom.trim();
      }

      const { error } = await supabase.rpc("abrir_mesa", parametros);
      if (error) throw error;

      await carregarMesas();

      const { data, error: erroPedido } = await supabase
        .from("pedidos")
        .select("*")
        .eq("mesa_id", mesa.id)
        .eq("status", "aberto")
        .single();

      if (erroPedido) throw erroPedido;

      pedidoAtual = data;
      await carregarItensPedido();

      const mesaAtual = mesas.find(m => m.id === mesa.id);
      mostrarPedido(mesaAtual || mesa);

    } catch (erro) {
      mostrarErro("Não foi possível abrir a mesa.", erro);
    }
  }

  // PEDIDOS E ITENS

  async function carregarItensPedido() {
    const { data, error } = await supabase
      .from("itens_pedido")
      .select("id, produto_id, quantidade, preco_unitario, subtotal, observacao, status_producao")
      .eq("pedido_id", pedidoAtual.id)
      .order("criado_em");

    if (error) throw error;

    pedidoAtual.itens = data || [];
  }

  function mostrarPedido(mesa) {
    limpar();

    painel.innerHTML = `
      <h2>Mesa ${mesa.numero}</h2>
      <p>Pedido: ${pedidoAtual.id}</p>
      <div id="itens"></div>

      <label>Produto</label>
      <select id="produto">
        <option value="">Selecione</option>
        ${produtos.filter(p => p.ativo).map(p =>
          `<option value="${p.id}">${escapar(p.nome)} — ${dinheiro(p.preco_venda)}</option>`
        ).join("")}
      </select>

      <label>Quantidade</label>
      <input id="quantidade" type="number" min="0.001"
        step="0.001" value="1">

      <label>Observação</label>
      <input id="observacao">

      <button id="adicionar">Adicionar item</button>
      <button id="fecharConta">Solicitar fechamento da conta</button>
      <button id="voltar">Voltar às mesas</button>
    `;

    document.querySelector("#adicionar").onclick = adicionarItem;
    document.querySelector("#fecharConta").onclick = solicitarFechamento;
    document.querySelector("#voltar").onclick = async () => {
      pedidoAtual = null;
      await carregarMesas();
      mostrarMesas();
    };

    mostrarItens();
  }

  function mostrarItens() {
    const area = document.querySelector("#itens");
    if (!area) return;

    area.innerHTML = "";

    const itens = pedidoAtual?.itens || [];

    if (!itens.length) {
      area.textContent = "Nenhum item neste pedido.";
      return;
    }

    itens.forEach(item => {
      const produto = produtos.find(p => p.id === item.produto_id);
      const linha = document.createElement("div");
      linha.className = "item-pedido";

      const nome = document.createElement("span");
      nome.textContent =
        `${produto?.nome || "Produto"} — ${item.quantidade} x ${dinheiro(item.preco_unitario)} = ${dinheiro(item.subtotal)}`;

      linha.appendChild(nome);

      if (item.status_producao === "pendente") {
        const remover = document.createElement("button");
        remover.textContent = "Remover";
        remover.onclick = () => removerItem(item.id);
        linha.appendChild(remover);
      }

      area.appendChild(linha);
    });

    const total = document.createElement("h3");
    total.textContent = "Total: " + dinheiro(pedidoAtual.valor_total);
    area.appendChild(total);
  }

  async function adicionarItem() {
    const produtoId = document.querySelector("#produto").value;
    const quantidade = Number(document.querySelector("#quantidade").value);
    const observacao = document.querySelector("#observacao").value.trim();

    if (!produtoId || !Number.isFinite(quantidade) || quantidade <= 0) {
      mensagem("Selecione um produto e informe uma quantidade válida.");
      return;
    }

    try {
      const { error } = await supabase.rpc("adicionar_item_pedido", {
        p_pedido_id: pedidoAtual.id,
        p_produto_id: produtoId,
        p_quantidade: quantidade,
        p_observacao: observacao || null
      });

      if (error) throw error;

      await atualizarPedidoAtual();
      mensagem("Item adicionado.");
    } catch (erro) {
      mostrarErro("Não foi possível adicionar o item.", erro);
    }
  }

  async function removerItem(itemId) {
    if (!confirm("Deseja remover este item?")) return;

    try {
      const { error } = await supabase.rpc("remover_item_pedido", {
        p_item_id: itemId
      });

      if (error) throw error;

      await atualizarPedidoAtual();
    } catch (erro) {
      mostrarErro("Não foi possível remover o item.", erro);
    }
  }

  async function atualizarPedidoAtual() {
    const { data, error } = await supabase
      .from("pedidos")
      .select("*")
      .eq("id", pedidoAtual.id)
      .single();

    if (error) throw error;

    pedidoAtual = data;
    await carregarItensPedido();
    await carregarMesas();

    const mesa = mesas.find(m => m.id === pedidoAtual.mesa_id);
    mostrarPedido(mesa);
  }

  async function solicitarFechamento() {
    if (!confirm("Solicitar fechamento desta conta?")) return;

    try {
      const { error } = await supabase.rpc(
        "solicitar_fechamento_conta",
        { p_pedido_id: pedidoAtual.id }
      );

      if (error) throw error;

      pedidoAtual = null;
      await carregarMesas();
      mostrarMesas();
      mensagem("Conta encaminhada para o caixa.");
    } catch (erro) {
      mostrarErro("Não foi possível solicitar o fechamento.", erro);
    }
  }

  // CONTAS E PAGAMENTOS

  async function carregarContasAguardando() {
    limpar();

    painel.innerHTML = `
      <h2>Contas aguardando pagamento</h2>
      <p>Carregando...</p>
      <button id="voltar">Voltar</button>
      <div id="listaContas"></div>
    `;

    document.querySelector("#voltar").onclick = mostrarInicio;

    try {
      const { data, error } = await supabase.rpc(
        "listar_contas_aguardando_pagamento"
      );

      if (error) throw error;

      const lista = document.querySelector("#listaContas");
      lista.innerHTML = "";

      if (!data?.length) {
        lista.textContent = "Nenhuma conta aguardando pagamento.";
        return;
      }

      data.forEach(conta => {
        const linha = document.createElement("div");
        linha.className = "item-pedido";

        const texto = document.createElement("span");
        texto.textContent =
          `Mesa ${conta.numero_mesa ?? conta.mesa_numero ?? "?"} — ${dinheiro(conta.valor_total)}`;

        const pagar = document.createElement("button");
        pagar.textContent = "Registrar pagamento";
        pagar.onclick = () => registrarPagamento(conta);

        linha.append(texto, pagar);
        lista.appendChild(linha);
      });

    } catch (erro) {
      mostrarErro("Erro ao carregar contas.", erro);
    }
  }

  async function registrarPagamento(conta) {
    const forma = prompt("Forma de pagamento: dinheiro, pix, debito ou credito");
    if (!forma) return;

    const valor = Number(prompt("Valor pago (use ponto para centavos):"));
    if (!Number.isFinite(valor) || valor <= 0) {
      mensagem("Valor inválido.");
      return;
    }

    let recebido = null;

    if (forma.toLowerCase() === "dinheiro") {
      recebido = Number(prompt("Valor recebido:"));
      if (!Number.isFinite(recebido) || recebido < valor) {
        mensagem("Valor recebido inválido.");
        return;
      }
    }

    try {
      const { error } = await supabase.rpc("registrar_pagamento", {
        p_pedido_id: conta.pedido_id,
        p_forma_pagamento: forma.toLowerCase(),
        p_valor: valor,
        p_valor_recebido: recebido
      });

      if (error) throw error;

      mensagem("Pagamento registrado.");
      await carregarContasAguardando();
      await carregarMesas();

    } catch (erro) {
      mostrarErro("Não foi possível registrar o pagamento.", erro);
    }
  }

  // ATUALIZAÇÃO EM TEMPO REAL

  function iniciarRealtime() {
    if (canalRealtime) {
      supabase.removeChannel(canalRealtime);
    }

    canalRealtime = supabase
      .channel("ligeirinho-atualizacoes")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "mesas"
      }, atualizarMesasRealtime)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "pedidos"
      }, atualizarMesasRealtime)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "itens_pedido"
      }, atualizarMesasRealtime)
      .subscribe();
  }

  async function atualizarMesasRealtime() {
    try {
      await carregarMesas();

      if (document.querySelector("#gradeMesas")) {
        mostrarMesas();
      }
    } catch (erro) {
      console.error("Erro na atualização em tempo real:", erro);
    }
  }

})();
