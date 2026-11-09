
/* =====================================================
   LIGEIRINHO PDV
   Supabase + Produtos + Mesas + Pedidos + Realtime
   + Recuperação de senha + Abertura e fechamento de caixa
   + Histórico de caixa
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

    const primeiroDia = [
      hoje.getFullYear(),
      String(hoje.getMonth() + 1).padStart(2, "0"),
      "01"
    ].join("-");

    painel.innerHTML = `
      <h2>Histórico de caixa</h2>

      <label>Data inicial</label>
      <input id="historicoDataInicio" type="date">

      <label>Data final</label>
      <input id="historicoDataFim" type="date">

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

    document.querySelector("#historicoDataInicio").value = primeiroDia;
    document.querySelector("#historicoDataFim").value = dataHoje;

    document.querySelector("#buscarHistoricoCaixa").onclick =
      carregarHistoricoCaixa;

    document.querySelector("#voltarHistoricoCaixa").onclick =
      mostrarInicio;

    await carregarHistoricoCaixa();
  }

  async function carregarHistoricoCaixa() {
    if (!temPermissao("administrador", "caixa")) {
      mensagem("Você não tem permissão para consultar o histórico.");
      mostrarInicio();
      return;
    }

    const inicio = document.querySelector("#historicoDataInicio").value;
    const fim = document.querySelector("#historicoDataFim").value;
    const status = document.querySelector("#historicoStatus").value;

    const lista = document.querySelector("#listaHistoricoCaixa");
    const resumo = document.querySelector("#resumoHistoricoCaixa");

    if (!inicio || !fim || inicio > fim) {
      mensagem("Confira as datas informadas.");
      return;
    }

    lista.textContent = "Consultando caixas...";
    resumo.textContent = "";

    const inicioISO = new Date(inicio + "T00:00:00").toISOString();

    const fimISO = new Date(
      new Date(fim + "T00:00:00").getTime() + 86400000
    ).toISOString();

    let consulta = supabase
      .from("caixas")
      .select(`
        id,
        operador_id,
        fechado_por,
        valor_inicial,
        valor_esperado,
        valor_contado,
        diferenca,
        status,
        aberto_em,
        fechado_em,
        justificativa
      `)
      .gte("aberto_em", inicioISO)
      .lt("aberto_em", fimISO)
      .order("aberto_em", { ascending: false });

    if (status !== "todos") {
      consulta = consulta.eq("status", status);
    }

    if (
      temPermissao("caixa") &&
      !temPermissao("administrador")
    ) {
      consulta = consulta.eq("operador_id", usuarioAtual.id);
    }

    const { data: caixas, error } = await consulta;

    if (error) {
      lista.textContent = "Erro ao consultar o histórico.";
      erro("Não foi possível carregar o histórico.", error);
      return;
    }

    const registros = caixas || [];

    const ids = [
      ...new Set(
        registros
          .flatMap(c => [c.operador_id, c.fechado_por])
          .filter(Boolean)
      )
    ];

    const nomes = {};

    if (ids.length) {
      const { data: perfis, error: erroPerfis } = await supabase
        .from("perfis_usuarios")
        .select("id, nome")
        .in("id", ids);

      if (erroPerfis) {
        erro("Erro ao consultar os operadores.", erroPerfis);
        return;
      }

      (perfis || []).forEach(p => {
        nomes[p.id] = p.nome;
      });
    }

    const fechados = registros.filter(c => c.status === "fechado");

    const totalContado = fechados.reduce(
      (soma, c) => soma + Number(c.valor_contado || 0),
      0
    );

    const diferencaTotal = fechados.reduce(
      (soma, c) => soma + Number(c.diferenca || 0),
      0
    );

    resumo.innerHTML = `
      <p><strong>Caixas encontrados:</strong> ${registros.length}</p>
      <p><strong>Total contado:</strong> ${dinheiro(totalContado)}</p>
      <p><strong>Diferença acumulada:</strong> ${dinheiro(diferencaTotal)}</p>
    `;

    lista.innerHTML = "";

    if (!registros.length) {
      lista.textContent = "Nenhum caixa encontrado neste período.";
      return;
    }

    registros.forEach(caixa => {
      const card = document.createElement("div");
      card.className = "item-pedido";
      card.style.display = "block";
      card.style.marginBottom = "12px";

      const abertoPor =
        nomes[caixa.operador_id] || "Operador";

      const fechadoPor = caixa.fechado_por
        ? nomes[caixa.fechado_por] || "Operador"
        : "—";

      const abertura = caixa.aberto_em
        ? new Date(caixa.aberto_em).toLocaleString("pt-BR")
        : "—";

      const fechamento = caixa.fechado_em
        ? new Date(caixa.fechado_em).toLocaleString("pt-BR")
        : "Ainda aberto";

      card.innerHTML = `
        <h3>Caixa — ${escapar(caixa.status.toUpperCase())}</h3>

        <p><strong>Aberto por:</strong> ${escapar(abertoPor)}</p>
        <p><strong>Abertura:</strong> ${escapar(abertura)}</p>

        <p><strong>Valor inicial:</strong>
          ${dinheiro(caixa.valor_inicial)}</p>

        <p><strong>Valor esperado:</strong>
          ${dinheiro(caixa.valor_esperado)}</p>

        <p><strong>Valor contado:</strong>
          ${caixa.valor_contado == null
            ? "Não informado"
            : dinheiro(caixa.valor_contado)}</p>

        <p><strong>Diferença:</strong>
          ${caixa.diferenca == null
            ? "—"
            : dinheiro(caixa.diferenca)}</p>

        <p><strong>Fechado por:</strong>
          ${escapar(fechadoPor)}</p>

        <p><strong>Fechamento:</strong>
          ${escapar(fechamento)}</p>

        <p><strong>Justificativa:</strong>
          ${escapar(caixa.justificativa || "—")}</p>
      `;

      lista.appendChild(card);
    });
  }

  // =====================================================
  // SAIR
  // =====================================================

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
        ${categoriasProduto.map(categoria => `
          <option value="${escapar(categoria.valor)}">
            ${escapar(categoria.texto)}
          </option>
        `).join("")}
      </select>

      <label>Preço de venda</label>
      <input id="preco" type="number" min="0" step="0.01">

      <label>Custo</label>
      <input id="custo" type="number" min="0" step="0.01">

      <label>Estoque</label>
      <input id="estoque" type="number" min="0" step="0.01">

      <label>Estoque mínimo</label>
      <input id="estoqueMinimo" type="number" min="0" step="0.01">

      <button id="salvarProduto">Salvar produto</button>
      <button id="cancelar">Cancelar</button>
    `;

    document.querySelector("#codigo").value = produto?.codigo || "";
    document.querySelector("#nome").value = produto?.nome || "";
    document.querySelector("#categoria").value = produto?.categoria || "";
    document.querySelector("#preco").value = produto?.preco_venda ?? "";
    document.querySelector("#custo").value = produto?.custo ?? "";
    document.querySelector("#estoque").value = produto?.estoque ?? 0;
    document.querySelector("#estoqueMinimo").value =
      produto?.estoque_minimo ?? 0;

    document.querySelector("#salvarProduto").onclick =
      () => salvarProduto(produto?.id);

    document.querySelector("#cancelar").onclick = mostrarListaProdutos;
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

    if (!categoriasProduto.some(item => item.valor === categoria)) {
      mensagem("Selecione uma categoria válida.");
      return;
    }

    if ([preco, custo, estoque, estoqueMinimo].some(
      valor => !Number.isFinite(valor) || valor < 0
    )) {
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
      erro("Erro ao salvar produto.", resultado.error);
      return;
    }

    mensagem("Produto salvo com sucesso!");
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
    if (!temPermissao("administrador", "caixa")) {
      mensagem("Você não tem permissão para registrar pagamentos.");
      return;
    }

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
      .subscribe();
  }

  async function atualizarDepoisDeMudanca() {
    if (atualizacaoEmAndamento || !usuarioAtual) return;

    atualizacaoEmAndamento = true;

    try {
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
      }
    } catch (e) {
      console.error("Erro na atualização em tempo real:", e);
    } finally {
      atualizacaoEmAndamento = false;
    }
  }

  // =====================================================
  // EVENTO DE RECUPERAÇÃO DO SUPABASE
  // =====================================================

  supabase.auth.onAuthStateChange((evento) => {
    if (evento === "PASSWORD_RECOVERY") {
      modoRecuperacao = true;
      mostrarNovaSenha();
    }
  });

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

  const linkEhRecuperacao =
    window.location.hash.includes("type=recovery");

  if (linkEhRecuperacao || modoRecuperacao) {
    mostrarNovaSenha();
    return;
  }

  if (sessao.session) {
    await verificarUsuario();
  } else {
    mostrarLogin();
  }
});
