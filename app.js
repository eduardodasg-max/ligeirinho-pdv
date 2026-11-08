
/* =====================================================
   LIGEIRINHO PDV
   Supabase + Produtos + Mesas + Pedidos
   ===================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const painel = document.querySelector(".painel");

  const SUPABASE_URL = "https://ewfxcsaxxsqixtmxruxz.supabase.co";
  const SUPABASE_KEY = "COLE_AQUI_SUA_PUBLISHABLE_KEY";

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  let usuarioAtual = null;
  let produtos = [];
  let mesaAtual = null;

  // Recuperar pedidos salvos neste aparelho
  let pedidos = {};

  try {
    pedidos = JSON.parse(
      localStorage.getItem("ligeirinho_pedidos")
    ) || {};
  } catch (erro) {
    pedidos = {};
  }

  function salvarPedidos() {
    localStorage.setItem(
      "ligeirinho_pedidos",
      JSON.stringify(pedidos)
    );
  }

  function mensagem(texto) {
    alert(texto);
  }

  // =====================================================
  // LOGIN
  // =====================================================

  function mostrarLogin() {
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    });

    if (error) {
      mensagem("Não foi possível entrar: " + error.message);
      return;
    }

    await verificarAdministrador();
  }

  // =====================================================
  // VERIFICAR PERMISSÃO
  // =====================================================

  async function verificarAdministrador() {
    const { data: resultado, error: erroLogin } =
      await supabase.auth.getUser();

    if (erroLogin || !resultado.user) {
      mostrarLogin();
      return;
    }

    usuarioAtual = resultado.user;

    const { data: perfil, error } = await supabase
      .from("perfis_usuarios")
      .select("nome, funcao, ativo")
      .eq("id", usuarioAtual.id)
      .single();

    if (error || !perfil || !perfil.ativo) {
      mensagem("Não foi possível validar seu perfil.");
      await supabase.auth.signOut();
      mostrarLogin();
      return;
    }

    if (perfil.funcao !== "administrador") {
      mensagem("Acesso permitido somente ao administrador.");
      await supabase.auth.signOut();
      mostrarLogin();
      return;
    }

    mostrarInicio(perfil.nome);
  }

  // =====================================================
  // TELA PRINCIPAL
  // =====================================================

  function mostrarInicio(nome) {
    painel.innerHTML = `
      <h2>Bem-vindo, ${nome}!</h2>
      <p>Área administrativa do Ligeirinho PDV.</p>

      <button id="botaoProdutos">Produtos</button>
      <button id="botaoMesas">Controle de Mesas</button>
      <button id="sair">Sair</button>
    `;

    document.querySelector("#botaoProdutos").onclick =
      carregarProdutos;

    document.querySelector("#botaoMesas").onclick =
      mostrarMesas;

    document.querySelector("#sair").onclick = async () => {
      await supabase.auth.signOut();
      usuarioAtual = null;
      mostrarLogin();
    };
  }

  // =====================================================
  // PRODUTOS
  // =====================================================

  async function carregarProdutos() {
    painel.innerHTML = `
      <h2>Produtos</h2>
      <p>Carregando produtos...</p>
    `;

    const { data, error } = await supabase
      .from("produtos")
      .select("*")
      .order("nome");

    if (error) {
      mensagem("Erro ao carregar produtos: " + error.message);
      mostrarInicio("Administrador");
      return;
    }

    produtos = data || [];
    mostrarListaProdutos();
  }

  function mostrarListaProdutos() {
    painel.innerHTML = `
      <h2>Cadastro de Produtos</h2>

      <button id="novoProduto">Novo produto</button>
      <button id="voltarInicio">Voltar</button>

      <div id="listaProdutos"></div>
    `;

    document.querySelector("#novoProduto").onclick =
      () => mostrarFormularioProduto();

    document.querySelector("#voltarInicio").onclick =
      () => mostrarInicio("Administrador");

    const lista = document.querySelector("#listaProdutos");

    if (produtos.length === 0) {
      lista.innerHTML = "<p>Nenhum produto cadastrado.</p>";
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
        `${produto.categoria} | R$ ${Number(produto.preco_venda).toFixed(2).replace(".", ",")} | Estoque: ${produto.estoque}`;

      info.appendChild(nome);
      info.appendChild(detalhes);

      const editar = document.createElement("button");
      editar.textContent = "Editar";
      editar.onclick = () => mostrarFormularioProduto(produto);

      item.appendChild(info);
      item.appendChild(editar);
      lista.appendChild(item);
    });
  }

  function mostrarFormularioProduto(produto = null) {
    const editando = Boolean(produto);

    painel.innerHTML = `
      <h2>${editando ? "Editar produto" : "Novo produto"}</h2>

      <label>Código</label>
      <input id="codigo" value="${produto?.codigo || ""}">

      <label>Nome</label>
      <input id="nome" value="${produto?.nome || ""}">

      <label>Categoria</label>
      <select id="categoria">
        <option value="">Selecione</option>
        <option>Comida</option>
        <option>Bebida</option>
        <option>Petiscos</option>
        <option>Drinks</option>
        <option>Bebidas sem álcool</option>
      </select>

      <label>Preço de venda</label>
      <input id="preco" type="number" min="0" step="0.01"
        value="${produto?.preco_venda ?? ""}">

      <label>Custo</label>
      <input id="custo" type="number" min="0" step="0.01"
        value="${produto?.custo ?? ""}">

      <label>Estoque</label>
      <input id="estoque" type="number" min="0" step="0.01"
        value="${produto?.estoque ?? 0}">

      <label>Estoque mínimo</label>
      <input id="estoqueMinimo" type="number" min="0" step="0.01"
        value="${produto?.estoque_minimo ?? 0}">

      <button id="salvarProduto">Salvar produto</button>
      <button id="cancelarProduto">Cancelar</button>
    `;

    if (produto?.categoria) {
      document.querySelector("#categoria").value =
        produto.categoria;
    }

    document.querySelector("#salvarProduto").onclick =
      () => salvarProduto(produto?.id);

    document.querySelector("#cancelarProduto").onclick =
      mostrarListaProdutos;
  }

  async function salvarProduto(id) {
    const nome = document.querySelector("#nome").value.trim();
    const categoria = document.querySelector("#categoria").value;
    const preco = Number(document.querySelector("#preco").value);
    const custo = Number(document.querySelector("#custo").value);
    const estoque = Number(document.querySelector("#estoque").value);
    const estoqueMinimo =
      Number(document.querySelector("#estoqueMinimo").value);

    if (!nome || !categoria) {
      mensagem("Preencha o nome e a categoria.");
      return;
    }

    if (
      !Number.isFinite(preco) || preco < 0 ||
      !Number.isFinite(custo) || custo < 0 ||
      !Number.isFinite(estoque) || estoque < 0 ||
      !Number.isFinite(estoqueMinimo) || estoqueMinimo < 0
    ) {
      mensagem("Confira os valores informados.");
      return;
    }

    const dados = {
      codigo: document.querySelector("#codigo").value.trim() || null,
      nome,
      categoria,
      preco_venda: preco,
      custo,
      estoque,
      estoque_minimo: estoqueMinimo,
      ativo: true
    };

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
      mensagem("Erro ao salvar: " + resultado.error.message);
      return;
    }

    mensagem("Produto salvo com sucesso!");
    await carregarProdutos();
  }

  // =====================================================
  // MESAS
  // =====================================================

  async function mostrarMesas() {
    painel.innerHTML = `
      <h2>Controle de Mesas</h2>
      <p>Selecione uma mesa.</p>
      <div id="mesas" class="mesas"></div>
      <button id="voltarInicio">Voltar</button>
    `;

    document.querySelector("#voltarInicio").onclick =
      () => mostrarInicio("Administrador");

    const area = document.querySelector("#mesas");

    for (let numero = 1; numero <= 50; numero++) {
      const botao = document.createElement("button");
      botao.textContent = numero;
      botao.className = "mesa";

      botao.onclick = () => {
        mesaAtual = numero;

        if (!pedidos[numero]) {
          pedidos[numero] = [];
        }

        mostrarPedido();
      };

      area.appendChild(botao);
    }
  }

  // =====================================================
  // PEDIDOS
  // =====================================================

  function mostrarPedido() {
    painel.innerHTML = `
      <h2>Mesa ${mesaAtual}</h2>

      <label>Produto</label>
      <select id="produto">
        <option value="">Selecione um produto</option>
        ${produtos
          .filter(p => p.ativo)
          .map(p => `
            <option value="${p.id}">
              ${p.nome} - R$ ${Number(p.preco_venda).toFixed(2).replace(".", ",")}
            </option>
          `).join("")}
      </select>

      <label>Quantidade</label>
      <input id="quantidade" type="number" min="1" step="1" value="1">

      <p id="preco">Preço: R$ 0,00</p>

      <button id="adicionar">Adicionar pedido</button>
      <button id="voltar">Voltar às mesas</button>

      <h3>Itens da mesa</h3>
      <div id="lista"></div>

      <h2 id="total">Total: R$ 0,00</h2>
    `;

    document.querySelector("#produto").onchange = atualizarPreco;
    document.querySelector("#quantidade").oninput = atualizarPreco;
    document.querySelector("#adicionar").onclick = adicionar;
    document.querySelector("#voltar").onclick = mostrarMesas;

    atualizarLista();
  }

  function atualizarPreco() {
    const id = document.querySelector("#produto").value;
    const qtd = Number(document.querySelector("#quantidade").value);
    const produto = produtos.find(p => p.id === id);

    document.querySelector("#preco").textContent =
      produto && qtd > 0
        ? `Preço: R$ ${(Number(produto.preco_venda) * qtd).toFixed(2).replace(".", ",")}`
        : "Preço: R$ 0,00";
  }

  function adicionar() {
    const id = document.querySelector("#produto").value;
    const qtd = Number(document.querySelector("#quantidade").value);
    const produto = produtos.find(p => p.id === id);

    if (!produto || !Number.isInteger(qtd) || qtd < 1) {
      mensagem("Selecione um produto e uma quantidade válida.");
      return;
    }

    const preco = Number(produto.preco_venda);

    pedidos[mesaAtual].push({
      produto_id: produto.id,
      nome: produto.nome,
      quantidade: qtd,
      preco,
      subtotal: preco * qtd
    });

    salvarPedidos();
    mostrarPedido();
  }

  function atualizarLista() {
    const lista = document.querySelector("#lista");
    const total = document.querySelector("#total");

    lista.innerHTML = "";
    let soma = 0;

    pedidos[mesaAtual].forEach((item, indice) => {
      soma += item.subtotal;

      const linha = document.createElement("div");
      linha.className = "item-pedido";

      const info = document.createElement("div");
      info.className = "item-info";

      const nome = document.createElement("span");
      nome.className = "item-nome";
      nome.textContent = `${item.quantidade}x ${item.nome}`;

      const valor = document.createElement("span");
      valor.className = "item-valor";
      valor.textContent =
        `R$ ${item.subtotal.toFixed(2).replace(".", ",")}`;

      info.appendChild(nome);
      info.appendChild(valor);

      const remover = document.createElement("button");
      remover.textContent = "Remover";

      remover.onclick = () => {
        const pedido = pedidos[mesaAtual][indice];

        if (pedido.quantidade > 1) {
          pedido.quantidade--;
          pedido.subtotal = pedido.preco * pedido.quantidade;
        } else {
          pedidos[mesaAtual].splice(indice, 1);
        }

        salvarPedidos();
        atualizarLista();
      };

      linha.appendChild(info);
      linha.appendChild(remover);
      lista.appendChild(linha);
    });

    total.textContent =
      `Total: R$ ${soma.toFixed(2).replace(".", ",")}`;
  }

  // =====================================================
  // INICIALIZAÇÃO
  // =====================================================

  const { data: sessao } = await supabase.auth.getSession();

  if (sessao.session) {
    await verificarAdministrador();
  } else {
    mostrarLogin();
  }
});
