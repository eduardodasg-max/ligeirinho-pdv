/* =====================================================
   LIGEIRINHO PDV
   Reconstrução da aplicação
   ===================================================== */

(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", iniciar);

  const SUPABASE_URL = "https://ewfxcsaxxsqixtmxruxz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_1Cch1EDl59lNQFUiUIkmBQ_BXHuYjly";
  const URL_RECUPERACAO = "https://eduardas g-max.github.io/ligeirinho-pdv/";

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

  const escapar = valor =>
    String(valor ?? "").replace(/[&<>"']/g, caractere => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[caractere]);

  function mostrarErro(mensagem, erro) {
    console.error(mensagem, erro);
    alert(`${mensagem}\n${erro?.message || ""}`);
  }

  function temPermissao(...funcoes) {
    return funcoes.includes(perfilAtual?.funcao);
  }

  async function iniciar() {
    painel = document.getElementById("app");

    if (!painel) {
      console.error("Elemento #app não encontrado.");
      return;
    }

    if (!window.supabase) {
      painel.innerHTML = "<p>Não foi possível carregar o Supabase.</p>";
      return;
    }

    supabase = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      mostrarErro("Erro ao verificar sessão.", error);
      return;
    }

    if (data.session) {
      await carregarPerfil();
    } else {
      mostrarLogin();
    }

    supabase.auth.onAuthStateChange(async (evento, sessao) => {
      if (evento === "PASSWORD_RECOVERY") {
        aguardandoRedefinicao = true;
        mostrarRedefinirSenha();
        return;
      }

      if (evento === "SIGNED_OUT") {
        usuarioAtual = null;
        perfilAtual = null;
        mostrarLogin();
        return;
      }

      if (evento === "SIGNED_IN" && sessao) {
        await carregarPerfil();
      }
    });
  }

  function mostrarLogin() {
    painel.innerHTML = `
      <section class="tela-login">
        <h1>Ligeirinho PDV</h1>
        <p>Entre para acessar o sistema.</p>

        <form id="formLogin">
          <label for="email">E-mail</label>
          <input id="email" type="email" required autocomplete="email">

          <label for="senha">Senha</label>
          <input id="senha" type="password" required autocomplete="current-password">

          <button type="submit">Entrar</button>
          <button type="button" id="esqueciSenha">Esqueci minha senha</button>
        </form>

        <p id="mensagemLogin"></p>
      </section>
    `;

    document.getElementById("formLogin").addEventListener("submit", entrar);
    document.getElementById("esqueciSenha").addEventListener("click", recuperarSenha);
  }

  async function entrar(evento) {
    evento.preventDefault();

    const email = document.getElementById("email").value.trim();
    const senha = document.getElementById("senha").value;
    const mensagem = document.getElementById("mensagemLogin");

    mensagem.textContent = "Entrando...";

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    });

    if (error) {
      mensagem.textContent = error.message;
      return;
    }

    await carregarPerfil();
  }

  async function recuperarSenha() {
    const email = document.getElementById("email").value.trim();

    if (!email) {
      alert("Informe seu e-mail primeiro.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: URL_RECUPERACAO
    });

    if (error) {
      mostrarErro("Não foi possível enviar o e-mail.", error);
      return;
    }

    alert("Enviamos um link para redefinir sua senha.");
  }

  function mostrarRedefinirSenha() {
    painel.innerHTML = `
      <section class="tela-login">
        <h1>Redefinir senha</h1>

        <form id="formNovaSenha">
          <label for="novaSenha">Nova senha</label>
          <input id="novaSenha" type="password" minlength="6" required>

          <label for="confirmarSenha">Confirmar nova senha</label>
          <input id="confirmarSenha" type="password" minlength="6" required>

          <button type="submit">Salvar nova senha</button>
        </form>

        <p id="mensagemSenha"></p>
      </section>
    `;

    document.getElementById("formNovaSenha")
      .addEventListener("submit", salvarNovaSenha);
  }

  async function salvarNovaSenha(evento) {
    evento.preventDefault();

    const senha = document.getElementById("novaSenha").value;
    const confirmacao = document.getElementById("confirmarSenha").value;
    const mensagem = document.getElementById("mensagemSenha");

    if (senha !== confirmacao) {
      mensagem.textContent = "As senhas não coincidem.";
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: senha
    });

    if (error) {
      mensagem.textContent = error.message;
      return;
    }

    aguardandoRedefinicao = false;
    alert("Senha alterada com sucesso.");
    await carregarPerfil();
  }

  async function carregarPerfil() {
    const { data: usuarioData, error: erroUsuario } =
      await supabase.auth.getUser();

    if (erroUsuario || !usuarioData.user) {
      mostrarLogin();
      return;
    }

    usuarioAtual = usuarioData.user;

    const { data, error } = await supabase
      .from("perfis_usuarios")
      .select("*")
      .eq("id", usuarioAtual.id)
      .eq("ativo", true)
      .single();

    if (error || !data) {
      mostrarErro("Não foi possível carregar seu perfil.", error);
      return;
    }

    perfilAtual = data;

    if (aguardandoRedefinicao) {
      mostrarRedefinirSenha();
      return;
    }

    await carregarAplicacao();
  }

  async function carregarAplicacao() {
    painel.innerHTML = `
      <header class="topo">
        <div>
          <h1>Ligeirinho PDV</h1>
          <p>${escapar(perfilAtual.nome)} — ${escapar(perfilAtual.funcao)}</p>
        </div>

        <button id="sair">Sair</button>
      </header>

      <nav class="menu">
        <button data-tela="mesas">Mesas</button>
        <button data-tela="produtos">Produtos</button>
        ${temPermissao("administrador", "caixa")
          ? '<button data-tela="caixa">Caixa</button>'
          : ""}
        ${temPermissao("administrador")
          ? '<button data-tela="perdas">Perdas</button>'
          : ""}
      </nav>

      <main id="conteudo"></main>
    `;

    document.getElementById("sair").addEventListener("click", sair);

    painel.querySelectorAll("[data-tela]").forEach(botao => {
      botao.addEventListener("click", () => abrirTela(botao.dataset.tela));
    });

    await carregarMesas();
    abrirTela("mesas");
    configurarRealtime();
  }

  async function sair() {
    if (canalRealtime) {
      await supabase.removeChannel(canalRealtime);
      canalRealtime = null;
    }

    await supabase.auth.signOut();
  }

  function conteudo() {
    return document.getElementById("conteudo");
  }

  async function abrirTela(tela) {
    if (tela === "mesas") {
      await carregarMesas();
      mostrarMesas();
      return;
    }

    if (tela === "produtos") {
      await carregarProdutos();
      mostrarProdutos();
      return;
    }

    if (tela === "caixa" && temPermissao("administrador", "caixa")) {
      await mostrarCaixa();
      return;
    }

    if (tela === "perdas" && temPermissao("administrador")) {
      await mostrarPerdas();
      return;
    }

    mostrarMesas();
  }

  async function carregarMesas() {
    const { data, error } = await supabase
      .from("mesas")
      .select("*")
      .order("numero");

    if (error) {
      mostrarErro("Não foi possível carregar as mesas.", error);
      return;
    }

    mesas = data || [];
  }

  function mostrarMesas() {
    const area = conteudo();

    if (!area) return;

    area.innerHTML = `
      <section>
        <h2>Controle de mesas</h2>
        <div class="grade-mesas">
          ${mesas.map(mesa => `
            <button
              class="mesa mesa-${escapar(mesa.status)}"
              data-mesa="${mesa.id}"
            >
              <strong>Mesa ${escapar(mesa.numero)}</strong>
              <span>${escapar(mesa.status)}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `;

    area.querySelectorAll("[data-mesa]").forEach(botao => {
      botao.addEventListener("click", () => {
        const mesa = mesas.find(item => item.id === botao.dataset.mesa);
        if (mesa) selecionarMesa(mesa);
      });
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
      .single();

    if (error) {
      mostrarErro("Não foi possível localizar o pedido aberto.", error);
      return;
    }

    pedidoAtual = data;
    await carregarItensPedido();
    mostrarPedido(mesa);
  }

  async function abrirMesa(mesa) {
    try {
      // O banco vincula o pedido automaticamente ao usuário autenticado.
      // Administrador, caixa e garçom não precisam informar outro responsável.
      const { error } = await supabase.rpc("abrir_mesa", {
        p_mesa_id: mesa.id
      });

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

  let itensPedido = [];

  async function carregarItensPedido() {
    if (!pedidoAtual) {
      itensPedido = [];
      return;
    }

    const { data, error } = await supabase
      .from("itens_pedido")
      .select(`
        *,
        produtos (
          nome,
          categoria
        )
      `)
      .eq("pedido_id", pedidoAtual.id)
      .order("criado_em");

    if (error) {
      mostrarErro("Não foi possível carregar os itens.", error);
      return;
    }

    itensPedido = data || [];
  }

  function mostrarPedido(mesa) {
    const area = conteudo();

    if (!area || !pedidoAtual) return;

    area.innerHTML = `
      <section>
        <button id="voltarMesas">Voltar às mesas</button>

        <h2>Mesa ${escapar(mesa.numero)}</h2>
        <p>Pedido aberto</p>

        ${temPermissao("administrador", "caixa", "garcom") ? `
          <div class="adicionar-produto">
            <h3>Adicionar produto</h3>

            <label for="produtoPedido">Produto</label>
            <select id="produtoPedido">
              <option value="">Selecione um produto</option>
              ${produtos.filter(p => p.ativo).map(produto => `
                <option value="${produto.id}">
                  ${escapar(produto.nome)} — ${dinheiro(produto.preco_venda)}
                </option>
              `).join("")}
            </select>

            <label for="quantidadePedido">Quantidade</label>
            <input id="quantidadePedido" type="number" min="0.001" step="0.001" value="1">

            <label for="observacaoPedido">Observação</label>
            <input id="observacaoPedido" type="text">

            <button id="adicionarItem">Adicionar</button>
          </div>
        ` : ""}

        <h3>Itens do pedido</h3>

        <div class="lista-itens">
          ${itensPedido.length ? itensPedido.map(item => `
            <article class="item-pedido">
              <div>
                <strong>${escapar(item.produtos?.nome || "Produto")}</strong>
                <span>${item.quantidade} × ${dinheiro(item.preco_unitario)}</span>
                ${item.observacao
                  ? `<small>${escapar(item.observacao)}</small>`
                  : ""}
              </div>
              <strong>${dinheiro(item.subtotal)}</strong>
            </article>
          `).join("") : "<p>Nenhum produto lançado.</p>"}
        </div>

        <h3>Total: ${dinheiro(pedidoAtual.valor_total)}</h3>

        <button id="solicitarFechamento">Solicitar fechamento da conta</button>
      </section>
    `;

    document.getElementById("voltarMesas")
      .addEventListener("click", async () => {
        pedidoAtual = null;
        await carregarMesas();
        mostrarMesas();
      });

    const adicionar = document.getElementById("adicionarItem");

    if (adicionar) {
      adicionar.addEventListener("click", adicionarItem);
    }

    document.getElementById("solicitarFechamento")
      .addEventListener("click", solicitarFechamento);
  }

  async function carregarProdutos() {
    const { data, error } = await supabase
      .from("produtos")
      .select("*")
      .order("nome");

    if (error) {
      mostrarErro("Não foi possível carregar os produtos.", error);
      return;
    }

    produtos = data || [];
  }

  function mostrarProdutos() {
    const area = conteudo();

    if (!area) return;

    area.innerHTML = `
      <section>
        <h2>Produtos</h2>

        ${temPermissao("administrador") ? `
          <form id="formProduto">
            <label for="nomeProduto">Nome</label>
            <input id="nomeProduto" required>

            <label for="categoriaProduto">Categoria</label>
            <select id="categoriaProduto">
              <option value="comida">Comida</option>
              <option value="bebida">Bebida</option>
              <option value="petiscos">Petiscos</option>
              <option value="drinks">Drinks</option>
              <option value="bebidas sem álcool">Bebidas sem álcool</option>
            </select>

            <label for="precoProduto">Preço de venda</label>
            <input id="precoProduto" type="number" min="0" step="0.01" required>

            <label for="custoProduto">Custo</label>
            <input id="custoProduto" type="number" min="0" step="0.01" value="0">

            <label for="estoqueProduto">Estoque</label>
            <input id="estoqueProduto" type="number" min="0" step="0.001" value="0">

            <label for="estoqueMinimo">Estoque mínimo</label>
            <input id="estoqueMinimo" type="number" min="0" step="0.001" value="0">

            <button type="submit">Cadastrar produto</button>
          </form>
        ` : ""}

        <div class="lista-produtos">
          ${produtos.map(produto => `
            <article>
              <strong>${escapar(produto.nome)}</strong>
              <span>${escapar(produto.categoria)}</span>
              <span>${dinheiro(produto.preco_venda)}</span>
              <span>Estoque: ${produto.estoque}</span>
            </article>
          `).join("")}
        </div>
      </section>
    `;

    const form = document.getElementById("formProduto");

    if (form) {
      form.addEventListener("submit", cadastrarProduto);
    }
  }

  async function cadastrarProduto(evento) {
    evento.preventDefault();

    if (!temPermissao("administrador")) {
      alert("Somente o administrador pode cadastrar produtos.");
      return;
    }

    const novoProduto = {
      nome: document.getElementById("nomeProduto").value.trim(),
      categoria: document.getElementById("categoriaProduto").value,
      preco_venda: Number(document.getElementById("precoProduto").value),
      custo: Number(document.getElementById("custoProduto").value || 0),
      estoque: Number(document.getElementById("estoqueProduto").value || 0),
      estoque_minimo: Number(document.getElementById("estoqueMinimo").value || 0),
      ativo: true
    };

    const { error } = await supabase
      .from("produtos")
      .insert(novoProduto);

    if (error) {
      mostrarErro("Não foi possível cadastrar o produto.", error);
      return;
    }

    alert("Produto cadastrado.");
    await carregarProdutos();
    mostrarProdutos();
  }

  async function adicionarItem() {
    try {
      const produtoId = document.getElementById("produtoPedido").value;
      const quantidade = Number(
        document.getElementById("quantidadePedido").value
      );
      const observacao = document.getElementById("observacaoPedido").value.trim();

      if (!produtoId) {
        alert("Selecione um produto.");
        return;
      }

      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        alert("Informe uma quantidade válida.");
        return;
      }

      const { error } = await supabase.rpc("adicionar_item_pedido", {
        p_pedido_id: pedidoAtual.id,
        p_produto_id: produtoId,
        p_quantidade: quantidade,
        p_observacao: observacao || null
      });

      if (error) throw error;

      const { data, error: erroPedido } = await supabase
        .from("pedidos")
        .select("*")
        .eq("id", pedidoAtual.id)
        .single();

      if (erroPedido) throw erroPedido;

      pedidoAtual = data;
      await carregarItensPedido();

      const mesa = mesas.find(m => m.id === pedidoAtual.mesa_id);

      if (mesa) {
        mostrarPedido(mesa);
      }

    } catch (erro) {
      mostrarErro("Não foi possível adicionar o produto.", erro);
    }
  }

  async function solicitarFechamento() {
    try {
      const { error } = await supabase.rpc("solicitar_fechamento_conta", {
        p_pedido_id: pedidoAtual.id
      });

      if (error) throw error;

      alert("Solicitação de fechamento enviada.");

      pedidoAtual = null;
      await carregarMesas();
      mostrarMesas();

    } catch (erro) {
      mostrarErro("Não foi possível solicitar o fechamento.", erro);
    }
  }

  async function mostrarCaixa() {
    const area = conteudo();

    if (!area) return;

    const { data: caixas, error } = await supabase
      .from("caixas")
      .select("*")
      .order("aberto_em", { ascending: false });

    if (error) {
      mostrarErro("Não foi possível carregar o caixa.", error);
      return;
    }

    const caixaAberto = (caixas || []).find(c => !c.fechado_em);

    area.innerHTML = `
      <section>
        <h2>Controle de caixa</h2>

        ${caixaAberto ? `
          <p>Caixa aberto</p>
          <p>Valor inicial: ${dinheiro(caixaAberto.valor_inicial)}</p>

          <button id="movimentacaoCaixa">Registrar movimentação</button>
          <button id="fecharCaixa">Fechar caixa</button>
        ` : `
          <p>Nenhum caixa aberto por você.</p>

          <form id="formAbrirCaixa">
            <label for="valorInicial">Valor inicial</label>
            <input id="valorInicial" type="number" min="0" step="0.01" value="0" required>
            <button type="submit">Abrir caixa</button>
          </form>
        `}

        <button id="contasPendentes">Contas aguardando pagamento</button>
        <div id="areaContas"></div>
      </section>
    `;

    const formAbrir = document.getElementById("formAbrirCaixa");

    if (formAbrir) {
      formAbrir.addEventListener("submit", abrirCaixa);
    }

    const botaoMovimentacao = document.getElementById("movimentacaoCaixa");

    if (botaoMovimentacao) {
      botaoMovimentacao.addEventListener("click", registrarMovimentacao);
    }

    const botaoFechar = document.getElementById("fecharCaixa");

    if (botaoFechar) {
      botaoFechar.addEventListener("click", fecharCaixa);
    }

    document.getElementById("contasPendentes")
      .addEventListener("click", listarContasPendentes);
  }

  async function abrirCaixa(evento) {
    evento.preventDefault();

    const valor = Number(document.getElementById("valorInicial").value);

    if (!Number.isFinite(valor) || valor < 0) {
      alert("Informe um valor inicial válido.");
      return;
    }

    const { error } = await supabase.rpc("abrir_caixa", {
      p_valor_inicial: valor
    });

    if (error) {
      mostrarErro("Não foi possível abrir o caixa.", error);
      return;
    }

    alert("Caixa aberto.");
    await mostrarCaixa();
  }

  async function registrarMovimentacao() {
    const tipo = prompt("Digite suprimento ou sangria:");

    if (!["suprimento", "sangria"].includes(tipo)) {
      alert("Tipo inválido.");
      return;
    }

    const valor = Number(prompt("Informe o valor:"));

    if (!Number.isFinite(valor) || valor <= 0) {
      alert("Valor inválido.");
      return;
    }

    const descricao = prompt("Informe a descrição da movimentação:");

    if (!descricao?.trim()) {
      alert("A descrição é obrigatória.");
      return;
    }

    const { error } = await supabase.rpc("registrar_movimentacao_caixa", {
      p_tipo: tipo,
      p_valor: valor,
      p_descricao: descricao.trim()
    });

    if (error) {
      mostrarErro("Não foi possível registrar a movimentação.", error);
      return;
    }

    alert("Movimentação registrada.");
    await mostrarCaixa();
  }

  async function fecharCaixa() {
    const valor = Number(prompt("Informe o valor contado no caixa:"));

    if (!Number.isFinite(valor) || valor < 0) {
      alert("Valor contado inválido.");
      return;
    }

    const justificativa = prompt("Justificativa (se houver):") || "";

    const { error } = await supabase.rpc("fechar_caixa", {
      p_valor_contado: valor,
      p_justificativa: justificativa
    });

    if (error) {
      mostrarErro("Não foi possível fechar o caixa.", error);
      return;
    }

    alert("Caixa fechado.");
    await mostrarCaixa();
  }

  async function listarContasPendentes() {
    const area = document.getElementById("areaContas");

    const { data, error } = await supabase.rpc(
      "listar_contas_aguardando_pagamento"
    );

    if (error) {
      mostrarErro("Não foi possível carregar as contas.", error);
      return;
    }

    area.innerHTML = `
      <h3>Contas aguardando pagamento</h3>

      ${(data || []).map(conta => `
        <article>
          <strong>Mesa ${escapar(conta.numero_mesa ?? conta.mesa_numero ?? "")}</strong>
          <span>${dinheiro(conta.valor_total)}</span>
          <button data-pagar="${conta.pedido_id ?? conta.id}">Registrar pagamento</button>
        </article>
      `).join("") || "<p>Nenhuma conta pendente.</p>"}
    `;

    area.querySelectorAll("[data-pagar]").forEach(botao => {
      botao.addEventListener("click", () => registrarPagamento(botao.dataset.pagar));
    });
  }

  async function registrarPagamento(pedidoId) {
    const forma = prompt("Forma de pagamento: dinheiro, pix, debito ou credito:");

    if (!["dinheiro", "pix", "debito", "credito"].includes(forma)) {
      alert("Forma de pagamento inválida.");
      return;
    }

    const valor = Number(prompt("Valor do pagamento:"));

    if (!Number.isFinite(valor) || valor <= 0) {
      alert("Valor inválido.");
      return;
    }

    let recebido = null;

    if (forma === "dinheiro") {
      recebido = Number(prompt("Valor recebido:"));

      if (!Number.isFinite(recebido) || recebido < valor) {
        alert("Valor recebido insuficiente.");
        return;
      }
    }

    const { error } = await supabase.rpc("registrar_pagamento", {
      p_pedido_id: pedidoId,
      p_forma_pagamento: forma,
      p_valor: valor,
      p_valor_recebido: recebido
    });

    if (error) {
      mostrarErro("Não foi possível registrar o pagamento.", error);
      return;
    }

    alert("Pagamento registrado.");
    await listarContasPendentes();
    await carregarMesas();
  }

  async function mostrarPerdas() {
    const area = conteudo();

    if (!area || !temPermissao("administrador")) return;

    const { data, error } = await supabase
      .from("itens_perdidos")
      .select(`
        *,
        produtos (nome)
      `)
      .order("criado_em", { ascending: false });

    if (error) {
      mostrarErro("Não foi possível carregar as perdas.", error);
      return;
    }

    area.innerHTML = `
      <section>
        <h2>Controle de perdas</h2>

        <form id="formPerda">
          <label for="produtoPerda">Produto</label>
          <select id="produtoPerda" required>
            <option value="">Selecione</option>
            ${produtos.map(p => `
              <option value="${p.id}">${escapar(p.nome)}</option>
            `).join("")}
          </select>

          <label for="quantidadePerda">Quantidade</label>
          <input id="quantidadePerda" type="number" min="0.001" step="0.001" required>

          <label for="motivoPerda">Motivo</label>
          <select id="motivoPerda" required>
            <option value="quebra">Quebra</option>
            <option value="vencimento">Vencimento</option>
            <option value="erro de preparo">Erro de preparo</option>
            <option value="derramamento">Derramamento</option>
            <option value="perda de validade">Perda de validade</option>
            <option value="outros">Outros</option>
          </select>

          <label for="observacaoPerda">Observação</label>
          <input id="observacaoPerda" type="text">

          <button type="submit">Registrar perda</button>
        </form>

        <h3>Histórico de perdas</h3>

        ${(data || []).map(item => `
          <article>
            <strong>${escapar(item.produtos?.nome || "Produto")}</strong>
            <span>Quantidade: ${item.quantidade}</span>
            <span>Prejuízo: ${dinheiro(item.subtotal)}</span>
            <span>${escapar(item.motivo || item.observacao || "")}</span>
          </article>
        `).join("")}
      </section>
    `;

    document.getElementById("formPerda")
      .addEventListener("submit", registrarPerda);
  }

  async function registrarPerda(evento) {
    evento.preventDefault();

    if (!temPermissao("administrador")) {
      alert("Somente o administrador pode registrar perdas.");
      return;
    }

    const produtoId = document.getElementById("produtoPerda").value;
    const quantidade = Number(document.getElementById("quantidadePerda").value);
    const motivo = document.getElementById("motivoPerda").value;
    const observacao = document.getElementById("observacaoPerda").value.trim();

    const produto = produtos.find(p => p.id === produtoId);

    if (!produto) {
      alert("Produto não encontrado.");
      return;
    }

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      alert("Quantidade inválida.");
      return;
    }

    const custo = Number(produto.custo || 0);

    const { error } = await supabase
      .from("itens_perdidos")
      .insert({
        produto_id: produtoId,
        quantidade,
        preco_unitario: custo,
        subtotal: Number((custo * quantidade).toFixed(2)),
        observacao: [motivo, observacao].filter(Boolean).join(" — ")
      });

    if (error) {
      mostrarErro("Não foi possível registrar a perda.", error);
      return;
    }

    alert("Perda registrada.");
    await carregarProdutos();
    await mostrarPerdas();
  }

  function configurarRealtime() {
    if (canalRealtime) {
      supabase.removeChannel(canalRealtime);
    }

    canalRealtime = supabase
      .channel("ligeirinho-atualizacoes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        async () => {
          await carregarMesas();

          if (conteudo()?.querySelector(".grade-mesas")) {
            mostrarMesas();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        async payload => {
          if (
            pedidoAtual &&
            payload.new?.id === pedidoAtual.id &&
            payload.new?.status === "aberto"
          ) {
            pedidoAtual = payload.new;
            await carregarItensPedido();

            const mesa = mesas.find(m => m.id === pedidoAtual.mesa_id);

            if (mesa && conteudo()?.querySelector(".lista-itens")) {
              mostrarPedido(mesa);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "itens_pedido" },
        async payload => {
          if (
            pedidoAtual &&
            (
              payload.new?.pedido_id === pedidoAtual.id ||
              payload.old?.pedido_id === pedidoAtual.id
            )
          ) {
            await carregarItensPedido();

            const mesa = mesas.find(m => m.id === pedidoAtual.mesa_id);

            if (mesa && conteudo()?.querySelector(".lista-itens")) {
              const { data } = await supabase
                .from("pedidos")
                .select("*")
                .eq("id", pedidoAtual.id)
                .single();

              if (data) {
                pedidoAtual = data;
                mostrarPedido(mesa);
              }
            }
          }
        }
      )
      .subscribe();
  }
})();
