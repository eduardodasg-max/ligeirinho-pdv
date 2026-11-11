/* =====================================================
   LIGEIRINHO PDV
   Supabase + Produtos + Mesas + Pedidos + Realtime
   + Recuperação de senha + Abertura e fechamento de caixa
   + Histórico de caixa + Relatório de faturamento
   ===================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const painel = document.querySelector(".painel");

  const SUPABASE_URL = "https://ewfxcsaxxsqixtmxruxz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_1Cch1EDl59lNQFUiUIkmBQ_BXHuYjly";
  const URL_RECUPERACAO =
    "https://eduardodasg-max.github.io/ligeirinho-pdv/";

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
  let modoRecuperacao = false;

  const categoriasProduto = [
    { valor: "comida", texto: "Comida" },
    { valor: "bebida", texto: "Bebida" },
    { valor: "petisco", texto: "Petiscos" },
    { valor: "drink", texto: "Drinks" },
    { valor: "bebida sem alcool", texto: "Bebidas sem álcool" }
  ];

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

  function dataLocalISO(data = new Date()) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");

    return `${ano}-${mes}-${dia}`;
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

      <p>
        <a href="#" id="esqueciSenha">Esqueci minha senha</a>
      </p>
    `;

    document.querySelector("#entrar").onclick = entrar;

    document.querySelector("#esqueciSenha").onclick = evento => {
      evento.preventDefault();
      mostrarRecuperacaoSenha();
    };
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
  // RECUPERAÇÃO DE SENHA
  // =====================================================

  function mostrarRecuperacaoSenha() {
    limparPainel();

    painel.innerHTML = `
      <h2>Recuperar senha</h2>

      <p>
        Informe o e-mail cadastrado no Ligeirinho.
        Você receberá um link para criar uma nova senha.
      </p>

      <label>E-mail</label>
      <input
        id="emailRecuperacao"
        type="email"
        placeholder="Seu e-mail"
      >

      <button id="enviarRecuperacao">
        Enviar link de recuperação
      </button>

      <button id="voltarLogin">
        Voltar ao login
      </button>
    `;

    document.querySelector("#enviarRecuperacao").onclick =
      enviarEmailRecuperacao;

    document.querySelector("#voltarLogin").onclick = mostrarLogin;
  }

  async function enviarEmailRecuperacao() {
    const email = document
      .querySelector("#emailRecuperacao")
      .value.trim();

    if (!email) {
      mensagem("Informe seu e-mail.");
      return;
    }

    const botao = document.querySelector("#enviarRecuperacao");
    botao.disabled = true;
    botao.textContent = "Enviando...";

    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: URL_RECUPERACAO
      }
    );

    if (error) {
      botao.disabled = false;
      botao.textContent = "Enviar link de recuperação";
      erro("Não foi possível enviar o e-mail de recuperação.", error);
      return;
    }

    mensagem(
      "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha. Confira também a caixa de spam."
    );

    mostrarLogin();
  }

  function mostrarNovaSenha() {
    modoRecuperacao = true;
    limparPainel();

    painel.innerHTML = `
      <h2>Criar nova senha</h2>

      <p>Digite sua nova senha e confirme abaixo.</p>

      <label>Nova senha</label>
      <input
        id="novaSenha"
        type="password"
        placeholder="Digite a nova senha"
      >

      <label>Confirmar nova senha</label>
      <input
        id="confirmarSenha"
        type="password"
        placeholder="Digite novamente a nova senha"
      >

      <button id="salvarNovaSenha">
        Salvar nova senha
      </button>
    `;

    document.querySelector("#salvarNovaSenha").onclick =
      salvarNovaSenha;
  }

  async function salvarNovaSenha() {
    const senha = document.querySelector("#novaSenha").value;
    const confirmar = document.querySelector("#confirmarSenha").value;

    if (!senha || !confirmar) {
      mensagem("Preencha os dois campos de senha.");
      return;
    }

    if (senha.length < 6) {
      mensagem("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (senha !== confirmar) {
      mensagem("As senhas não são iguais.");
      return;
    }

    const botao = document.querySelector("#salvarNovaSenha");
    botao.disabled = true;
    botao.textContent = "Salvando...";

    const { error } = await supabase.auth.updateUser({
      password: senha
    });

    if (error) {
      botao.disabled = false;
      botao.textContent = "Salvar nova senha";
      erro("Não foi possível alterar a senha.", error);
      return;
    }

    mensagem("Senha alterada com sucesso! Faça login com sua nova senha.");

    modoRecuperacao = false;

    await supabase.auth.signOut();

    usuarioAtual = null;
    perfilAtual = null;

    mostrarLogin();
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
  // PRODUTOS E CONTROLE DE MESAS (COMANDAS)
  // =====================================================

  async function carregarProdutosSilencioso() {
    try {
      const { data } = await supabase.from("produtos").select("*").order("nome");
      produtos = data || [];
    } catch (e) {
      console.error("Erro ao carregar produtos:", e);
    }
  }

  async function carregarProdutos() {
    await carregarProdutosSilencioso();
    limparPainel();
    painel.innerHTML = `
      <h2>Produtos Cadastrados</h2>
      <button id="voltar">Voltar</button>
      <div style="margin-top: 15px;">
        ${produtos.map(p => `<p>${escapar(p.nome)} — ${dinheiro(p.preco_venda)}</p>`).join("") || "<p>Nenhum produto cadastrado.</p>"}
      </div>
    `;
    document.querySelector("#voltar").onclick = mostrarInicio;
  }

  async function carregarDadosMesas() {
    try {
      const { data: dadosMesas } = await supabase.from("mesas").select("*").order("numero");
      mesas = dadosMesas || [];

      const { data: dadosPedidos } = await supabase
        .from("pedidos")
        .select("*")
        .neq("status", "fechado");

      pedidosAbertos = dadosPedidos || [];
    } catch (e) {
      console.error("Erro ao carregar dados de mesas:", e);
    }
  }

  async function mostrarMesas() {
    await carregarDadosMesas();
    limparPainel();

    painel.innerHTML = `
      <h2>Controle de Mesas (1 a 50)</h2>
      <button id="voltar" style="margin-bottom: 15px;">Voltar ao Início</button>
      <div id="gridMesas" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px;"></div>
    `;

    document.querySelector("#voltar").onclick = mostrarInicio;
    const container = document.querySelector("#gridMesas");

    if (!mesas.length) {
      container.innerHTML = "<p>Nenhuma mesa cadastrada no banco de dados.</p>";
      return;
    }

    mesas.forEach(mesa => {
      const pedidoMesa = pedidosAbertos.find(p => p.mesa_id === mesa.id);
      const ocupada = !!pedidoMesa;

      const card = document.createElement("button");
      card.style.cssText = `
        padding: 12px 8px; 
        font-weight: bold; 
        border-radius: 8px; 
        background: ${ocupada ? "#fdeaea" : "#eaf8ef"}; 
        border: 2px solid ${ocupada ? "#d9534f" : "#2e9d61"}; 
        cursor: pointer; 
        color: ${ocupada ? "#a32323" : "#176b39"};
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      `;
      card.innerHTML = `
        <span>Mesa ${mesa.numero}</span>
        <small style="font-size: 0.75rem; font-weight: normal;">${ocupada ? "🔴 Ocupada" : "🟢 Livre"}</small>
      `;

      card.onclick = () => abrirMesaDetalhes(mesa, pedidoMesa);
      container.appendChild(card);
    });
  }

  async function abrirMesaDetalhes(mesa, pedidoExistente) {
    mesaAtual = mesa;
    pedidoAtual = pedidoExistente || null;
    limparPainel();

    if (!pedidoAtual) {
      painel.innerHTML = `
        <h2>Mesa ${mesa.numero}</h2>
        <p style="color: #2e9d32; font-weight: bold; margin: 15px 0;">🟢 Mesa Livre</p>
        <button id="btnAbrirComanda" style="background: #2e9d32; color: white; padding: 10px 20px;">Abrir Comanda</button>
        <br><br>
        <button id="voltarMesas">Voltar para o mapa</button>
      `;
      document.querySelector("#btnAbrirComanda").onclick = criarNovaComanda;
      document.querySelector("#voltarMesas").onclick = mostrarMesas;
      return;
    }

    try {
      const { data: itens, error } = await supabase
        .from("itens_pedido")
        .select("id, quantidade, preco_unitario, produtos(nome)")
        .eq("pedido_id", pedidoAtual.id);

      if (error) throw error;
      itensAtuais = itens || [];
    } catch (e) {
      erro("Erro ao carregar itens da comanda.", e);
      itensAtuais = [];
    }

    let totalGeral = 0;
    const linhasItens = itensAtuais.map(item => {
      const subtotal = Number(item.quantidade) * Number(item.preco_unitario);
      totalGeral += subtotal;
      return `
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 6px 0;">
          <span>${item.quantidade}x ${escapar(item.produtos?.nome || "Item")}</span>
          <strong>${dinheiro(subtotal)}</strong>
        </div>
      `;
    }).join("") || "<p>Nenhum item lançado ainda.</p>";

    painel.innerHTML = `
      <h2>Mesa ${mesa.numero}</h2>
      <p>Status: <strong>OCUPADA</strong></p>
      
      <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; margin: 15px 0; border: 1px solid #ddd;">
        <label>Adicionar Produto</label>
        <select id="selectProduto" style="width: 100%; margin: 5px 0 10px; padding: 6px;">
          <option value="">Selecione um produto...</option>
          ${produtos.filter(p => p.ativo).map(p => `<option value="${p.id}">${escapar(p.nome)} — ${dinheiro(p.preco_venda)}</option>`).join("")}
        </select>
        <div style="display: flex; gap: 10px;">
          <input type="number" id="qtdProduto" value="1" min="1" style="width: 80px; padding: 6px;">
          <button id="btnAddItem" style="flex: 1; background: #0056b3; color: white;">Lançar Produto</button>
        </div>
      </div>

      <h3>Itens Lançados</h3>
      <div style="max-height: 180px; overflow-y: auto; margin-bottom: 10px;">${linhasItens}</div>
      <h3 style="color: #a32323; text-align: right;">Total: ${dinheiro(totalGeral)}</h3>

      <button id="btnFecharConta" style="background: #e67e22; color: white; width: 100%; margin-top: 15px; padding: 10px;">Solicitar Fechamento da Conta</button>
      <br><br>
      <button id="voltarMesas">Voltar para o mapa</button>
    `;

    document.querySelector("#btnAddItem").onclick = adicionarItem;
    document.querySelector("#btnFecharConta").onclick = solicitarFechamentoConta;
    document.querySelector("#voltarMesas").onclick = mostrarMesas;
  }

  async function criarNovaComanda() {
    try {
      const { data, error } = await supabase
        .from("pedidos")
        .insert({
          mesa_id: mesaAtual.id,
          status: "aberto",
          usuario_id: usuarioAtual.id
        })
        .select()
        .single();

      if (error) throw error;
      
      await carregarDadosMesas();
      abrirMesaDetalhes(mesaAtual, data);
    } catch (e) {
      erro("Não foi possível abrir a comanda.", e);
    }
  }

  async function adicionarItem() {
    const produtoId = document.querySelector("#selectProduto").value;
    const qtd = Number(document.querySelector("#qtdProduto").value);

    if (!produtoId || qtd < 1) {
      mensagem("Selecione um produto e uma quantidade válida.");
      return;
    }

    const prod = produtos.find(p => p.id === produtoId);

    try {
      const { error } = await supabase.from("itens_pedido").insert({
        pedido_id: pedidoAtual.id,
        produto_id: produtoId,
        quantidade: qtd,
        preco_unitario: prod.preco_venda
      });

      if (error) throw error;
      abrirMesaDetalhes(mesaAtual, pedidoAtual);
    } catch (e) {
      erro("Erro ao lançar item no pedido.", e);
    }
  }

  async function solicitarFechamentoConta() {
    if (!confirm("Deseja solicitar o fechamento da conta desta mesa?")) return;

    try {
      const { error } = await supabase
        .from("pedidos")
        .update({ status: "aguardando_pagamento" })
        .eq("id", pedidoAtual.id);

      if (error) throw error;
      mensagem("Conta enviada para a fila de pagamento!");
      mostrarMesas();
    } catch (e) {
      erro("Erro ao solicitar fechamento.", e);
    }
  }

  async function carregarContasAguardando() {
    limparPainel();
    painel.innerHTML = `
      <h2>Contas Aguardando Pagamento</h2>
      <button id="voltar">Voltar</button>
      <p style="margin-top: 15px;">Carregando contas pendentes...</p>
    `;
    document.querySelector("#voltar").onclick = mostrarInicio;

    try {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, status, mesas(numero)")
        .eq("status", "aguardando_pagamento");

      if (error) throw error;

      if (!data || data.length === 0) {
        painel.innerHTML = `
          <h2>Contas Aguardando Pagamento</h2>
          <button id="voltar" style="margin-bottom: 15px;">Voltar</button>
          <p>Nenhuma conta pendente no momento.</p>
        `;
        document.querySelector("#voltar").onclick = mostrarInicio;
        return;
      }

      let html = `
        <h2>Contas Aguardando Pagamento</h2>
        <button id="voltar" style="margin-bottom: 15px;">Voltar</button>
        <div style="display: flex; flex-direction: column; gap: 10px;">
      `;

      data.forEach(p => {
        html += `
          <div class="item-pedido" style="padding: 12px; border: 1px solid #ccc; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
            <span><strong>Mesa ${p.mesas?.numero || "?"}</strong> — Aguardando Caixa</span>
            <button onclick="alert('Módulo de recebimento do caixa ativo!')">Receber</button>
          </div>
        `;
      });

      html += `</div>`;
      painel.innerHTML = html;
      document.querySelector("#voltar").onclick = mostrarInicio;
    } catch (e) {
      erro("Erro ao carregar contas.", e);
    }
  }

  function iniciarRealtime() {
    if (canalRealtime) return;
    canalRealtime = supabase
      .channel("ligeirinho-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, () => carregarProdutosSilencioso())
      .on("postgres_changes", { event: "*", schema: "public", table: "mesas" }, () => carregarDadosMesas())
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => carregarDadosMesas())
      .subscribe();
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

      ${temPermissao("administrador", "caixa")
        ? '<button id="botaoAbrirCaixa">Abrir caixa</button>'
        : ""}

      ${temPermissao("administrador", "caixa")
        ? '<button id="botaoFecharCaixa">Fechar caixa</button>'
        : ""}

      ${temPermissao("administrador", "caixa")
        ? '<button id="botaoHistoricoCaixa">Histórico de caixa</button>'
        : ""}

      ${temPermissao("administrador")
        ? '<button id="botaoRelatorios">Relatórios</button>'
        : ""}

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

    if (temPermissao("administrador", "caixa")) {
      document.querySelector("#botaoAbrirCaixa").onclick =
        mostrarAberturaCaixa;

      document.querySelector("#botaoFecharCaixa").onclick =
        mostrarFechamentoCaixa;

      document.querySelector("#botaoHistoricoCaixa").onclick =
        mostrarHistoricoCaixa;
    }

    if (temPermissao("administrador")) {
      document.querySelector("#botaoRelatorios").onclick =
        mostrarRelatorios;

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
    mostrarLogin();
  }

  // =====================================================
  // RELATÓRIO DE FATURAMENTO
  // =====================================================

  function mostrarRelatorios() {
    if (!temPermissao("administrador")) {
      mensagem("Somente o administrador pode acessar os relatórios.");
      mostrarInicio();
      return;
    }

    limparPainel();

    const hoje = new Date();
    const dataHoje = dataLocalISO(hoje);
    const mesAtual = dataHoje.slice(0, 7);

    painel.innerHTML = `
      <h2>Relatório de faturamento</h2>

      <label>Período do relatório</label>
      <select id="relatorioPeriodo">
        <option value="mes">Mês atual</option>
        <option value="dia">Um dia</option>
        <option value="ano">Um ano</option>
        <option value="personalizado">Período personalizado</option>
        <option value="todos">Todo o histórico</option>
      </select>

      <div id="filtroRelatorioDia" style="display:none;">
        <label>Data</label>
        <input id="relatorioDia" type="date">
      </div>

      <div id="filtroRelatorioMes" style="display:none;">
        <label>Mês</label>
        <input id="relatorioMes" type="month">
      </div>

      <div id="filtroRelatorioAno" style="display:none;">
        <label>Ano</label>
        <input
          id="relatorioAno"
          type="number"
          min="2000"
          max="2100"
          step="1"
          placeholder="Ex.: 2026"
        >
      </div>

      <div id="filtroRelatorioPersonalizado" style="display:none;">
        <label>Data inicial</label>
        <input id="relatorioDataInicio" type="date">

        <label>Data final</label>
        <input id="relatorioDataFim" type="date">
      </div>

      <button id="consultarRelatorio">Consultar relatório</button>

      <div id="resultadoRelatorio">
        <p>Selecione o período e consulte o faturamento.</p>
      </div>

      <button id="voltarRelatorios">Voltar</button>
    `;

    document.querySelector("#relatorioDia").value = dataHoje;
    document.querySelector("#relatorioMes").value = mesAtual;
    document.querySelector("#relatorioAno").value = hoje.getFullYear();

    document.querySelector("#relatorioDataInicio").value =
      `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;

    document.querySelector("#relatorioDataFim").value = dataHoje;

    document.querySelector("#relatorioPeriodo").onchange =
      atualizarCamposRelatorio;

    document.querySelector("#consultarRelatorio").onclick =
      carregarRelatorioFaturamento;

    document.querySelector("#voltarRelatorios").onclick = mostrarInicio;

    atualizarCamposRelatorio();

    carregarRelatorioFaturamento();
  }

  function atualizarCamposRelatorio() {
    const periodo =
      document.querySelector("#relatorioPeriodo").value;

    document.querySelector("#filtroRelatorioDia").style.display =
      periodo === "dia" ? "block" : "none";

    document.querySelector("#filtroRelatorioMes").style.display =
      periodo === "mes" ? "block" : "none";

    document.querySelector("#filtroRelatorioAno").style.display =
      periodo === "ano" ? "block" : "none";

    document.querySelector("#filtroRelatorioPersonalizado").style.display =
      periodo === "personalizado" ? "block" : "none";
  }

  function obterDatasRelatorio() {
    const periodo =
      document.querySelector("#relatorioPeriodo").value;

    let inicio = null;
    let fim = null;

    if (periodo === "dia") {
      const dia = document.querySelector("#relatorioDia").value;

      if (!dia) {
        mensagem("Selecione uma data.");
        return null;
      }

      inicio = dia;
      fim = dia;
    }

    if (periodo === "mes") {
      const mesSelecionado =
        document.querySelector("#relatorioMes").value;

      if (!/^\d{4}-\d{2}$/.test(mesSelecionado)) {
        mensagem("Selecione um mês válido.");
        return null;
      }

      const [ano, mes] = mesSelecionado.split("-").map(Number);

      if (mes < 1 || mes > 12) {
        mensagem("Selecione um mês válido.");
        return null;
      }

      const ultimoDia = new Date(ano, mes, 0).getDate();

      inicio =
        `${ano}-${String(mes).padStart(2, "0")}-01`;

      fim =
        `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
    }

    if (periodo === "ano") {
      const ano = Number(
        document.querySelector("#relatorioAno").value
      );

      if (
        !Number.isInteger(ano) ||
        ano < 2000 ||
        ano > 2100
      ) {
        mensagem("Informe um ano válido entre 2000 e 2100.");
        return null;
      }

      inicio = `${ano}-01-01`;
      fim = `${ano}-12-31`;
    }

    if (periodo === "personalizado") {
      inicio =
        document.querySelector("#relatorioDataInicio").value;

      fim =
        document.querySelector("#relatorioDataFim").value;

      if (!inicio || !fim || inicio > fim) {
        mensagem("Confira as datas informadas.");
        return null;
      }
    }

    return { inicio, fim };
  }

  async function carregarRelatorioFaturamento() {
    if (!temPermissao("administrador")) {
      mensagem("Somente o administrador pode consultar o faturamento.");
      mostrarInicio();
      return;
    }

    const datas = obterDatasRelatorio();

    if (!datas) return;

    const resultado =
      document.querySelector("#resultadoRelatorio");

    const botao =
      document.querySelector("#consultarRelatorio");

    resultado.innerHTML = "<p>Consultando faturamento...</p>";

    botao.disabled = true;
    botao.textContent = "Consultando...";

    const { data, error } = await supabase.rpc(
      "relatorio_faturamento",
      {
        p_data_inicio: datas.inicio,
        p_data_fim: datas.fim
      }
    );

    botao.disabled = false;
    botao.textContent = "Consultar relatório";

    if (error) {
      console.error("Erro no relatório de faturamento:", error);

      resultado.innerHTML = `
        <p>Não foi possível carregar o relatório.</p>
        <p>${escapar(error.message || "Erro desconhecido.")}</p>
      `;

      return;
    }

    if (!data || typeof data !== "object") {
      resultado.innerHTML =
        "<p>O relatório não retornou dados válidos.</p>";
      return;
    }

    mostrarResultadoRelatorio(data);
  }

  function mostrarResultadoRelatorio(data) {
    if (!temPermissao("administrador")) {
      mensagem("Acesso permitido somente ao administrador.");
      mostrarInicio();
      return;
    }

    const resultado =
      document.querySelector("#resultadoRelatorio");

    if (!resultado) return;

    const total = Number(data.total_faturado || 0);
    const vendas = Number(data.quantidade_vendas || 0);
    const ticket = Number(data.ticket_medio || 0);

    const formas = Array.isArray(data.formas_pagamento)
      ? data.formas_pagamento
      : [];

    const linhasFormas = formas.length
      ? formas.map(forma => `
          <div class="item-pedido" style="display:block; margin-bottom:10px;">
            <strong>${escapar(forma.forma_pagamento || "Não informado")}</strong>
            <p>Quantidade: ${Number(forma.quantidade || 0)}</p>
            <p>Total: ${dinheiro(forma.total)}</p>
          </div>
        `).join("")
      : "<p>Nenhum pagamento encontrado neste período.</p>";

    resultado.innerHTML = `
      <h3>Resumo do faturamento</h3>

      <div class="item-pedido" style="display:block; margin-bottom:10px;">
        <p><strong>Faturamento total</strong></p>
        <h2>${dinheiro(total)}</h2>
      </div>

      <div class="item-pedido" style="display:block; margin-bottom:10px;">
        <p><strong>Quantidade de vendas</strong></p>
        <h2>${vendas}</h2>
      </div>

      <div class="item-pedido" style="display:block; margin-bottom:10px;">
        <p><strong>Ticket médio</strong></p>
        <h2>${dinheiro(ticket)}</h2>
      </div>

      <h3>Faturamento por forma de pagamento</h3>

      ${linhasFormas}
    `;
  }

  // =====================================================
  // ABERTURA DO CAIXA
  // =====================================================

  function mostrarAberturaCaixa() {
    limparPainel();

    painel.innerHTML = `
      <h2>Abrir caixa</h2>

      <p>Informe o valor inicial em dinheiro.</p>

      <label>Valor inicial</label>
      <input
        id="valorInicialCaixa"
        type="number"
        min="0"
        step="0.01"
        value="0"
      >

      <button id="confirmarAberturaCaixa">
        Abrir caixa
      </button>

      <button id="cancelarAberturaCaixa">
        Voltar
      </button>
    `;

    document.querySelector("#confirmarAberturaCaixa").onclick =
      abrirCaixa;

    document.querySelector("#cancelarAberturaCaixa").onclick =
      mostrarInicio;
  }

  async function abrirCaixa() {
    const campo = document.querySelector("#valorInicialCaixa");
    const valor = Number(campo.value);

    if (!Number.isFinite(valor) || valor < 0) {
      mensagem("Informe um valor válido, igual ou maior que zero.");
      return;
    }

    const botao = document.querySelector("#confirmarAberturaCaixa");

    botao.disabled = true;
    botao.textContent = "Abrindo...";

    const { data, error } = await supabase.rpc("abrir_caixa", {
      p_valor_inicial: valor
    });

    if (error) {
      botao.disabled = false;
      botao.textContent = "Abrir caixa";
      erro("Não foi possível abrir o caixa.", error);
      return;
    }

    console.log("Caixa aberto:", data);

    mensagem("Caixa aberto com sucesso!");

    mostrarInicio();
  }

  // =====================================================
  // FECHAMENTO DO CAIXA
  // =====================================================

  async function mostrarFechamentoCaixa() {
    if (!temPermissao("administrador", "caixa")) {
      mensagem("Você não tem permissão para fechar caixa.");
      return;
    }

    limparPainel();

    painel.innerHTML = `
      <h2>Fechar caixa</h2>
      <p>Carregando caixas abertos...</p>
      <button id="voltarFechamento">Voltar</button>
    `;

    document.querySelector("#voltarFechamento").onclick = mostrarInicio;

    let consulta = supabase
      .from("caixas")
      .select("id, operador_id, valor_inicial, valor_esperado, aberto_em, status")
      .eq("status", "aberto")
      .order("aberto_em", { ascending: true });

    if (temPermissao("caixa") && !temPermissao("administrador")) {
      consulta = consulta.eq("operador_id", usuarioAtual.id);
    }

    const { data: caixas, error } = await consulta;

    if (error) {
      erro("Não foi possível consultar os caixas abertos.", error);
      mostrarInicio();
      return;
    }

    if (!caixas || caixas.length === 0) {
      limparPainel();

      painel.innerHTML = `
        <h2>Fechar caixa</h2>
        <p>Não há caixa aberto disponível para você.</p>
        <button id="voltarFechamento">Voltar</button>
      `;

      document.querySelector("#voltarFechamento").onclick = mostrarInicio;
      return;
    }

    const idsOperadores = [
      ...new Set(caixas.map(c => c.operador_id).filter(Boolean))
    ];

    const nomesOperadores = {};

    if (idsOperadores.length > 0) {
      const { data: perfis, error: erroPerfis } = await supabase
        .from("perfis_usuarios")
        .select("id, nome")
        .in("id", idsOperadores);

      if (erroPerfis) {
        erro("Não foi possível identificar os operadores dos caixas.", erroPerfis);
        mostrarInicio();
        return;
      }

      (perfis || []).forEach(perfil => {
        nomesOperadores[perfil.id] = perfil.nome;
      });
    }

    mostrarSelecaoCaixa(caixas, nomesOperadores);
  }

  function mostrarSelecaoCaixa(caixas, nomesOperadores) {
    limparPainel();

    painel.innerHTML = `
      <h2>Selecionar caixa aberto</h2>
      <p>Escolha o caixa que deseja conferir.</p>
      <div id="listaCaixasAbertos"></div>
      <button id="voltarFechamento">Voltar</button>
    `;

    const lista = document.querySelector("#listaCaixasAbertos");

    caixas.forEach(caixa => {
      const botao = document.createElement("button");

      botao.type = "button";
      botao.className = "item-pedido";
      botao.style.display = "block";
      botao.style.width = "100%";
      botao.style.marginBottom = "10px";

      const operador =
        nomesOperadores[caixa.operador_id] || "Operador";

      const abertura = caixa.aberto_em
        ? new Date(caixa.aberto_em).toLocaleString("pt-BR")
        : "Horário não informado";

      botao.textContent =
        `${operador} | Inicial: ${dinheiro(caixa.valor_inicial)} | ` +
        `Esperado: ${dinheiro(caixa.valor_esperado)} | ` +
        `Abertura: ${abertura}`;

      botao.onclick = () => {
        mostrarConferenciaCaixa(
          caixa,
          operador,
          caixas,
          nomesOperadores
        );
      };

      lista.appendChild(botao);
    });

    document.querySelector("#voltarFechamento").onclick = mostrarInicio;
  }

  function mostrarConferenciaCaixa(
    caixa,
    operador,
    caixas,
    nomesOperadores
  ) {
    limparPainel();

    const esperado = Number(caixa.valor_esperado || 0);

    painel.innerHTML = `
      <h2>Conferência do caixa</h2>

      <p>
        <strong>Operador que abriu:</strong>
        ${escapar(operador)}
      </p>

      <p>
        <strong>Valor inicial:</strong>
        ${dinheiro(caixa.valor_inicial)}
      </p>

      <p>
        <strong>Valor esperado:</strong>
        ${dinheiro(esperado)}
      </p>

      <label>Valor contado</label>
      <input
        id="valorContadoCaixa"
        type="number"
        min="0"
        step="0.01"
        placeholder="Informe o dinheiro contado"
      >

      <label>Justificativa da diferença (se houver)</label>
      <textarea
        id="justificativaFechamento"
        rows="3"
        placeholder="Explique a diferença, se houver"
      ></textarea>

      <p id="previaDiferenca"></p>

      <button id="confirmarFechamentoCaixa">
        Confirmar fechamento
      </button>

      <button id="voltarSelecaoCaixa">
        Voltar à lista
      </button>
    `;

    const campoContado =
      document.querySelector("#valorContadoCaixa");

    const campoJustificativa =
      document.querySelector("#justificativaFechamento");

    const previa = document.querySelector("#previaDiferenca");

    campoContado.oninput = () => {
      if (campoContado.value === "") {
        previa.textContent = "";
        return;
      }

      const contado = Number(campoContado.value);

      if (!Number.isFinite(contado) || contado < 0) {
        previa.textContent = "Informe um valor válido.";
        return;
      }

      const diferenca = contado - esperado;

      previa.textContent =
        "Diferença: " + dinheiro(diferenca);

      if (diferenca !== 0) {
        previa.textContent +=
          " — será necessário informar uma justificativa.";
      }
    };

    document.querySelector("#confirmarFechamentoCaixa").onclick =
      () => confirmarFechamentoCaixa(caixa, esperado);

    document.querySelector("#voltarSelecaoCaixa").onclick =
      () => mostrarSelecaoCaixa(caixas, nomesOperadores);
  }

  async function confirmarFechamentoCaixa(caixa, esperado) {
    const campoContado =
      document.querySelector("#valorContadoCaixa");

    const campoJustificativa =
      document.querySelector("#justificativaFechamento");

    const valorDigitado = campoContado.value.trim();
    const valorContado = Number(valorDigitado);
    const justificativa = campoJustificativa.value.trim();

    if (
      valorDigitado === "" ||
      !Number.isFinite(valorContado) ||
      valorContado < 0
    ) {
      mensagem(
        "Informe um valor contado válido, igual ou maior que zero."
      );
      return;
    }

    const diferenca = valorContado - esperado;

    if (diferenca !== 0 && !justificativa) {
      mensagem(
        "Informe uma justificativa para a diferença do caixa."
      );

      campoJustificativa.focus();
      return;
    }

    const confirmou = confirm(
      "Confirma o fechamento deste caixa?\n\n" +
      "Valor esperado: " + dinheiro(esperado) + "\n" +
      "Valor contado: " + dinheiro(valorContado) + "\n" +
      "Diferença: " + dinheiro(diferenca)
    );

    if (!confirmou) {
      return;
    }

    const botao =
      document.querySelector("#confirmarFechamentoCaixa");

    botao.disabled = true;
    botao.textContent = "Fechando caixa...";

    const { data, error } = await supabase.rpc("fechar_caixa", {
      p_valor_contado: valorContado,
      p_justificativa: justificativa || null,
      p_caixa_id: caixa.id
    });

    if (error) {
      botao.disabled = false;
      botao.textContent = "Confirmar fechamento";

      erro("Não foi possível fechar o caixa.", error);
      return;
    }

    const resultado = Array.isArray(data) ? data[0] : data;

    if (!resultado) {
      mensagem(
        "A função foi executada, mas não retornou os dados do fechamento. Confira o relatório do caixa."
      );

      mostrarInicio();
      return;
    }

    mensagem(
      "Caixa fechado com sucesso!\n\n" +
      "Valor esperado: " + dinheiro(resultado.valor_esperado) + "\n" +
      "Valor contado: " + dinheiro(resultado.valor_contado) + "\n" +
      "Diferença: " + dinheiro(resultado.diferenca)
    );

    mostrarInicio();
  }

  // =====================================================
  // HISTÓRICO DE CAIXA
  // =====================================================

  async function mostrarHistoricoCaixa() {
    if (!temPermissao("administrador", "caixa")) {
      mensagem("Você não tem permissão para consultar o histórico.");
      return;
    }

    limparPainel();

    const hoje = new Date();

    const dataHoje = [
      hoje.getFullYear(),
      String(hoje.getMonth() + 1).padStart(2, "0"),
      String(hoje.getDate()).padStart(2, "0")
    ].join("-");

    const mesAtual = dataHoje.slice(0, 7);
    const anoAtual = hoje.getFullYear();

    painel.innerHTML = `
      <h2>Histórico de caixa</h2>

      <label>Período</label>
      <select id="historicoPeriodo">
        <option value="todos">Todo o histórico</option>
        <option value="mes">Escolher mês</option>
        <option value="ano">Escolher ano</option>
        <option value="personalizado">Intervalo personalizado</option>
      </select>

      <div id="filtroHistoricoMes" style="display:none;">
        <label>Mês</label>
        <input id="historicoMes" type="month">
      </div>

      <div id="filtroHistoricoAno" style="display:none;">
        <label>Ano</label>
        <input
          id="historicoAno"
          type="number"
          min="2000"
          max="2100"
          step="1"
          placeholder="Ex.: 2026"
        >
      </div>

      <div id="filtroHistoricoDatas" style="display:none;">
        <label>Data inicial</label>
        <input id="historicoDataInicio" type="date">

        <label>Data final</label>
        <input id="historicoDataFim" type="date">
      </div>

      <label>Status</label>
      <select id="historicoStatus">
        <option value="todos">Todos</option>
        <option value="aberto">Abertos</option>
        <option value="fechado">Fechados</option>
      </select>

      <button id="buscarHistoricoCaixa">Consultar</button>

      <div id="resumoHistoricoCaixa"></div>
      <div id="listaHistoricoCaixa"></div>

      <button id="voltarHistoricoCaixa">Voltar</button>
    `;

    document.querySelector("#historicoMes").value = mesAtual;
    document.querySelector("#historicoAno").value = anoAtual;

    document.querySelector("#historicoDataInicio").value =
      `${anoAtual}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;

    document.querySelector("#historicoDataFim").value = dataHoje;

    document.querySelector("#historicoPeriodo").onchange =
      atualizarCamposPeriodoHistorico;

    document.querySelector("#buscarHistoricoCaixa").onclick =
      carregarHistoricoCaixa;

    document.querySelector("#voltarHistoricoCaixa").onclick =
      mostrarInicio;

    atualizarCamposPeriodoHistorico();

    await carregarHistoricoCaixa();
  }

  function atualizarCamposPeriodoHistorico() {
    const periodo =
      document.querySelector("#historicoPeriodo").value;

    document.querySelector("#filtroHistoricoMes").style.display =
      periodo === "mes" ? "block" : "none";

    document.querySelector("#filtroHistoricoAno").style.display =
      periodo === "ano" ? "block" : "none";

    document.querySelector("#filtroHistoricoDatas").style.display =
      periodo === "personalizado" ? "block" : "none";
  }

  async function carregarHistoricoCaixa() {
    if (!temPermissao("administrador", "caixa")) {
      mensagem("Você não tem permissão para consultar o histórico.");
      mostrarInicio();
      return;
    }

    const periodo =
      document.querySelector("#historicoPeriodo").value;

    const status =
      document.querySelector("#historicoStatus").value;

    let inicio = null;
    let fim = null;

    if (periodo === "mes") {
      const mesSelecionado =
        document.querySelector("#historicoMes").value;

      if (!/^\d{4}-\d{2}$/.test(mesSelecionado)) {
        mensagem("Selecione um mês válido.");
        return;
      }

      const [ano, mes] = mesSelecionado.split("-").map(Number);
      const ultimoDia = new Date(ano, mes, 0).getDate();

      inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      fim = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
    } else if (periodo === "ano") {
      const ano = Number(document.querySelector("#historicoAno").value);
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
        mensagem("Informe um ano válido.");
        return;
      }
      inicio = `${ano}-01-01`;
      fim = `${ano}-12-31`;
    } else if (periodo === "personalizado") {
      inicio = document.querySelector("#historicoDataInicio").value;
      fim = document.querySelector("#historicoDataFim").value;
      if (!inicio || !fim || inicio > fim) {
        mensagem("Confira as datas do intervalo personalizado.");
        return;
      }
    }

    const listaDiv = document.querySelector("#listaHistoricoCaixa");
    const resumoDiv = document.querySelector("#resumoHistoricoCaixa");

    listaDiv.innerHTML = "<p>Carregando histórico...</p>";
    resumoDiv.innerHTML = "";

    let query = supabase
      .from("caixas")
      .select("*")
      .order("aberto_em", { ascending: false });

    if (status !== "todos") {
      query = query.eq("status", status);
    }

    if (inicio && fim) {
      query = query.gte("aberto_em", `${inicio}T00:00:00`).lte("aberto_em", `${fim}T23:59:59`);
    }

    const { data: caixas, error } = await query;

    if (error) {
      erro("Não foi possível carregar o histórico de caixa.", error);
      listaDiv.innerHTML = "<p>Erro ao carregar dados.</p>";
      return;
    }

    if (!caixas || caixas.length === 0) {
      listaDiv.innerHTML = "<p>Nenhum registro encontrado para o filtro selecionado.</p>";
      return;
    }

    listaDiv.innerHTML = "";
    caixas.forEach(c => {
      const card = document.createElement("div");
      card.className = "item-pedido";
      card.style.cssText = "display: block; margin-bottom: 10px; padding: 10px; border: 1px solid #ccc;";
      card.innerHTML = `
        <p><strong>Status:</strong> ${escapar(c.status).toUpperCase()}</p>
        <p><strong>Abertura:</strong> ${c.aberto_em ? new Date(c.aberto_em).toLocaleString("pt-BR") : "—"}</p>
        <p><strong>Valor Inicial:</strong> ${dinheiro(c.valor_inicial)}</p>
        <p><strong>Valor Esperado:</strong> ${dinheiro(c.valor_esperado)}</p>
        <p><strong>Valor Contado:</strong> ${c.valor_contado !== null ? dinheiro(c.valor_contado) : "—"}</p>
        <p><strong>Diferença:</strong> ${c.diferenca !== null ? dinheiro(c.diferenca) : "—"}</p>
      `;
      listaDiv.appendChild(card);
    });
  }

  // =====================================================
  // INICIALIZAÇÃO DO APP
  // =====================================================

  supabase.auth.onAuthStateChange(async (evento) => {
    if (evento === "PASSWORD_RECOVERY") {
      mostrarNovaSenha();
      return;
    }
  });

  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData.session) {
    if (!modoRecuperacao) {
      await verificarUsuario();
    }
  } else {
    mostrarLogin();
  }
});
