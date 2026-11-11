
/* =====================================================
   LIGEIRINHO PDV
   Cadastro de produtos + alertas automáticos de estoque
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

  // CLASSIFICAÇÃO DO ESTOQUE

  function calcularAlertasEstoque() {
    const ativos = produtos.filter(produto => produto.ativo);

    const zerados = ativos.filter(produto =>
      Number(produto.estoque || 0) <= 0
    );

    const baixos = ativos.filter(produto =>
      Number(produto.estoque || 0) > 0 &&
      Number(produto.estoque || 0) <=
        Number(produto.estoque_minimo || 0)
    );

    return {
      ativos,
      zerados,
      baixos,
      total: zerados.length + baixos.length
    };
  }

  function atualizarAvisosInicio() {
    const area = document.querySelector("#alertasEstoqueInicio");

    if (!area) return;

    const alertas = calcularAlertasEstoque();

    if (alertas.total === 0) {
      area.innerHTML = `
        <div style="
          padding: 12px;
          margin: 12px 0;
          border: 1px solid #2e9d61;
          border-radius: 8px;
          background: #eaf8ef;
          color: #176b39;
        ">
          <strong>Estoque em dia!</strong>
          <p style="margin: 5px 0 0">
            Nenhum produto ativo com estoque baixo ou zerado.
          </p>
        </div>
      `;
      return;
    }

    let conteudo = `
      <div style="
        padding: 12px;
        margin: 12px 0;
        border: 1px solid #d99b28;
        border-radius: 8px;
        background: #fff8e8;
        color: #49370d;
      ">
        <strong>⚠️ Atenção ao estoque</strong>
        <p style="margin: 8px 0">
          ${alertas.zerados.length} produto(s) zerado(s) |
          ${alertas.baixos.length} produto(s) com estoque baixo.
        </p>
    `;

    if (alertas.zerados.length) {
      conteudo += `
        <div style="
          padding: 8px;
          margin-top: 8px;
          border-radius: 6px;
          background: #fdeaea;
          color: #a32323;
        ">
          <strong>🔴 Estoque zerado</strong>
          <ul style="margin: 6px 0 0; padding-left: 20px">
            ${alertas.zerados.map(produto => `
              <li>
                ${escapar(produto.nome)}
                — saldo: ${escapar(produto.estoque)}
              </li>
            `).join("")}
          </ul>
        </div>
      `;
    }

    if (alertas.baixos.length) {
      conteudo += `
        <div style="
          padding: 8px;
          margin-top: 8px;
          border-radius: 6px;
          background: #fff0c9;
          color: #765000;
        ">
          <strong>🟡 Estoque baixo</strong>
          <ul style="margin: 6px 0 0; padding-left: 20px">
            ${alertas.baixos.map(produto => `
              <li>
                ${escapar(produto.nome)}
                — saldo: ${escapar(produto.estoque)}
                — mínimo: ${escapar(produto.estoque_minimo)}
              </li>
            `).join("")}
          </ul>
        </div>
      `;
    }

    if (temPermissao("administrador")) {
      conteudo += `
        <button id="abrirEstoqueAlertas">
          Abrir controle de estoque
        </button>
      `;
    }

    conteudo += "</div>";

    area.innerHTML = conteudo;

    const botao = document.querySelector("#abrirEstoqueAlertas");

    if (botao) {
      botao.onclick = mostrarEstoque;
    }
  }

  // INICIALIZAÇÃO

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

      supabase.auth.onAuthStateChange(async (evento, sessao) => {
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

      <p>
        <a href="#" id="esqueciSenha">Esqueci minha senha</a>
      </p>

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

  // RECUPERAÇÃO DE SENHA

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

      if (campoEmail) {
        campoEmail.value = email;
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      aviso.textContent = "Informe um endereço de e-mail válido.";
      return;
    }

    const botao = document.querySelector("#esqueciSenha");

    if (botao) {
      botao.style.pointerEvents = "none";
      botao.textContent = "Enviando...";
    }

    aviso.textContent = "";

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: URL_RECUPERACAO
      });

      if (error) throw error;

      aviso.textContent =
        "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha. Confira também a caixa de spam.";
    } catch (erro) {
      console.error("Erro ao solicitar recuperação:", erro);
      aviso.textContent =
        "Não foi possível solicitar a recuperação: " +
        (erro.message || "tente novamente mais tarde.");
    } finally {
      if (botao) {
        botao.style.pointerEvents = "";
        botao.textContent = "Esqueci minha senha";
      }
    }
  }

  function mostrarRedefinirSenha() {
    limpar();

    painel.innerHTML = `
      <h2>Redefinir senha</h2>
      <p>Digite sua nova senha abaixo.</p>

      <label for="novaSenha">Nova senha</label>
      <input id="novaSenha" type="password"
        autocomplete="new-password" placeholder="Nova senha">

      <label for="confirmarSenha">Confirme a nova senha</label>
      <input id="confirmarSenha" type="password"
        autocomplete="new-password" placeholder="Repita a nova senha">

      <button id="salvarNovaSenha">Salvar nova senha</button>
      <p id="mensagemRedefinicao"></p>
    `;

    document.querySelector("#salvarNovaSenha").onclick =
      salvarNovaSenha;
  }

  async function salvarNovaSenha() {
    const senha = document.querySelector("#novaSenha").value;
    const confirmacao = document.querySelector("#confirmarSenha").value;
    const botao = document.querySelector("#salvarNovaSenha");
    const aviso = document.querySelector("#mensagemRedefinicao");

    if (!senha || !confirmacao) {
      aviso.textContent = "Preencha os dois campos.";
      return;
    }

    if (senha.length < 6) {
      aviso.textContent = "A senha deve ter pelo menos 6 caracteres.";
      return;
    }

    if (senha !== confirmacao) {
      aviso.textContent = "As senhas não são iguais.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Salvando...";

    try {
      const { error } = await supabase.auth.updateUser({
        password: senha
      });

      if (error) throw error;

      aguardandoRedefinicao = false;

      await supabase.auth.signOut();

      mensagem("Senha alterada com sucesso. Entre com sua nova senha.");

      mostrarLogin();
    } catch (erro) {
      console.error("Erro ao redefinir senha:", erro);
      aviso.textContent =
        "Não foi possível alterar a senha: " +
        (erro.message || "tente novamente.");
      botao.disabled = false;
      botao.textContent = "Salvar nova senha";
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

      <div id="alertasEstoqueInicio"></div>

      <button id="mesas">Controle de mesas</button>
      ${temPermissao("administrador")
        ? '<button id="produtos">Produtos</button><button id="estoque">Estoque</button>' : ""}
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
      document.querySelector("#estoque").onclick = mostrarEstoque;
    }

    if (temPermissao("administrador", "caixa")) {
      document.querySelector("#contas").onclick =
        carregarContasAguardando;
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
    atualizarAvisosInicio();
  }

  function mostrarProdutos() {
    limpar();

    painel.innerHTML = `
      <h2>Produtos</h2>

      <button id="novo">Novo produto</button>
      <button id="voltar">Voltar</button>

      <label for="pesquisaProduto">Pesquisar produto</label>
      <input id="pesquisaProduto"
        placeholder="Digite nome ou código">

      <label for="filtroCategoria">Categoria</label>
      <select id="filtroCategoria">
        <option value="">Todas as categorias</option>
      </select>

      <label for="filtroStatus">Situação</label>
      <select id="filtroStatus">
        <option value="ativos">Produtos ativos</option>
        <option value="inativos">Produtos inativos</option>
        <option value="todos">Todos os produtos</option>
      </select>

      <div id="resumoProdutos"></div>
      <div id="lista"></div>
    `;

    document.querySelector("#novo").onclick = () => formularioProduto();
    document.querySelector("#voltar").onclick = mostrarInicio;

    const categorias = [
      ...new Set(
        produtos
          .map(p => p.categoria)
          .filter(Boolean)
      )
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));

    const filtroCategoria = document.querySelector("#filtroCategoria");

    categorias.forEach(categoria => {
      const opcao = document.createElement("option");
      opcao.value = categoria;
      opcao.textContent = categoria;
      filtroCategoria.appendChild(opcao);
    });

    document.querySelector("#pesquisaProduto").oninput =
      renderizarListaProdutos;

    filtroCategoria.onchange = renderizarListaProdutos;

    document.querySelector("#filtroStatus").onchange =
      renderizarListaProdutos;

    renderizarListaProdutos();
  }

  function renderizarListaProdutos() {
    const lista = document.querySelector("#lista");
    const resumo = document.querySelector("#resumoProdutos");

    if (!lista || !resumo) return;

    lista.innerHTML = "";

    const pesquisa = document.querySelector("#pesquisaProduto")
      .value.trim().toLocaleLowerCase("pt-BR");

    const categoria = document.querySelector("#filtroCategoria").value;
    const status = document.querySelector("#filtroStatus").value;

    let filtrados = [...produtos];

    if (status === "ativos") {
      filtrados = filtrados.filter(p => p.ativo);
    } else if (status === "inativos") {
      filtrados = filtrados.filter(p => !p.ativo);
    }

    if (categoria) {
      filtrados = filtrados.filter(p => p.categoria === categoria);
    }

    if (pesquisa) {
      filtrados = filtrados.filter(p => {
        const nome = String(p.nome || "").toLocaleLowerCase("pt-BR");
        const codigo = String(p.codigo || "").toLocaleLowerCase("pt-BR");

        return nome.includes(pesquisa) || codigo.includes(pesquisa);
      });
    }

    const ativos = produtos.filter(p => p.ativo).length;
    const inativos = produtos.filter(p => !p.ativo).length;

    resumo.textContent =
      `Total: ${produtos.length} | Ativos: ${ativos} | Inativos: ${inativos} | Encontrados: ${filtrados.length}`;

    if (!filtrados.length) {
      lista.textContent = "Nenhum produto encontrado.";
      return;
    }

    filtrados.forEach(produto => {
      const linha = document.createElement("div");
      linha.className = "item-pedido";

      const texto = document.createElement("div");

      texto.textContent =
        `${produto.nome} — ${dinheiro(produto.preco_venda)} — Custo: ${dinheiro(produto.custo)} — Estoque: ${produto.estoque} — Mínimo: ${produto.estoque_minimo} — ${produto.categoria} — ${produto.ativo ? "ATIVO" : "INATIVO"}`;

      const editar = document.createElement("button");
      editar.textContent = "Editar";
      editar.onclick = () => formularioProduto(produto);

      const alternar = document.createElement("button");
      alternar.textContent = produto.ativo
        ? "Desativar"
        : "Reativar";

      alternar.onclick = () => alterarStatusProduto(produto);

      linha.append(texto, editar, alternar);
      lista.appendChild(linha);
    });
  }

  async function verificarCodigoDuplicado(codigo, produtoAtual = null) {
    if (!codigo) return false;

    const codigoNormalizado = codigo.trim().toLocaleLowerCase("pt-BR");

    const duplicadoNaLista = produtos.some(p =>
      String(p.codigo || "").trim().toLocaleLowerCase("pt-BR") ===
        codigoNormalizado &&
      p.id !== produtoAtual?.id
    );

    if (duplicadoNaLista) return true;

    let consulta = supabase
      .from("produtos")
      .select("id")
      .ilike("codigo", codigo.trim());

    if (produtoAtual?.id) {
      consulta = consulta.neq("id", produtoAtual.id);
    }

    const { data, error } = await consulta.limit(1);

    if (error) throw error;

    return (data || []).length > 0;
  }

  async function alterarStatusProduto(produto) {
    if (!exigirAdministrador()) return;

    const novoStatus = !produto.ativo;

    const confirmacao = novoStatus
      ? `Deseja reativar o produto "${produto.nome}"?`
      : `Deseja desativar o produto "${produto.nome}"? Ele deixará de aparecer nos novos pedidos.`;

    if (!confirm(confirmacao)) return;

    try {
      const { error } = await supabase
        .from("produtos")
        .update({ ativo: novoStatus })
        .eq("id", produto.id);

      if (error) throw error;

      await carregarProdutos();
      mostrarProdutos();

      mensagem(
        novoStatus
          ? "Produto reativado."
          : "Produto desativado."
      );

    } catch (erro) {
      mostrarErro("Não foi possível alterar a situação do produto.", erro);
    }
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

      <label for="codigo">Código</label>
      <input id="codigo" autocomplete="off">

      <label for="nome">Nome</label>
      <input id="nome" autocomplete="off">

      <label for="categoria">Categoria</label>
      <select id="categoria">
        <option value="">Selecione</option>
        ${categorias.map(c =>
          `<option value="${escapar(c)}">${escapar(c)}</option>`
        ).join("")}
      </select>

      <label for="preco">Preço de venda</label>
      <input id="preco" type="number" min="0" step="0.01">

      <label for="custo">Custo</label>
      <input id="custo" type="number" min="0" step="0.01">

      <label for="estoque">
        ${produto ? "Estoque atual (alterado em Movimentações)" : "Estoque inicial"}
      </label>
      <input id="estoque" type="number" min="0" step="0.001"
        ${produto ? "readonly" : ""}>

      <label for="minimo">Estoque mínimo</label>
      <input id="minimo" type="number" min="0" step="0.001">

      ${produto ? `
        <p>Situação atual: ${produto.ativo ? "Ativo" : "Inativo"}</p>
      ` : ""}

      <button id="salvar">Salvar</button>
      <button id="cancelar">Voltar</button>

      <p id="avisoProduto"></p>
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
      estoque_minimo: Number(document.querySelector("#minimo").value || 0)
    };

    const estoqueInicial = Number(
      document.querySelector("#estoque").value || 0
    );

    const aviso = document.querySelector("#avisoProduto");
    const botao = document.querySelector("#salvar");

    if (!registro.nome || !registro.categoria ||
        !Number.isFinite(registro.preco_venda) ||
        registro.preco_venda < 0 ||
        !Number.isFinite(registro.custo) ||
        registro.custo < 0 ||
        !Number.isFinite(registro.estoque_minimo) ||
        registro.estoque_minimo < 0 ||
        (!produto &&
          (!Number.isFinite(estoqueInicial) || estoqueInicial < 0))) {
      aviso.textContent =
        "Confira nome, categoria, preço, custo e quantidades.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Salvando...";

    try {
      if (registro.codigo) {
        const duplicado = await verificarCodigoDuplicado(
          registro.codigo,
          produto
        );

        if (duplicado) {
          aviso.textContent =
            "Já existe outro produto cadastrado com esse código.";
          botao.disabled = false;
          botao.textContent = "Salvar";
          return;
        }
      }

      let resultado;

      if (produto) {
        resultado = await supabase
          .from("produtos")
          .update(registro)
          .eq("id", produto.id);
      } else {
        resultado = await supabase
          .from("produtos")
          .insert({
            ...registro,
            estoque: estoqueInicial,
            ativo: true
          });
      }

      if (resultado.error) throw resultado.error;

      await carregarProdutos();
      mostrarProdutos();

      mensagem(
        produto
          ? "Produto atualizado com sucesso."
          : "Produto cadastrado com sucesso."
      );

    } catch (erro) {
      mostrarErro("Não foi possível salvar o produto.", erro);

      if (document.querySelector("#salvar")) {
        botao.disabled = false;
        botao.textContent = "Salvar";
      }
    }
  }

  // ESTOQUE E MOVIMENTAÇÕES MANUAIS

  function exigirAdministrador() {
    if (!temPermissao("administrador")) {
      mensagem("Apenas o administrador pode acessar esta área.");
      mostrarInicio();
      return false;
    }

    return true;
  }

  function mostrarEstoque() {
    if (!exigirAdministrador()) return;

    limpar();

    const ativos = produtos.filter(p => p.ativo);
    const criticos = ativos.filter(p => Number(p.estoque) <= 0);
    const baixos = ativos.filter(p =>
      Number(p.estoque) > 0 &&
      Number(p.estoque) <= Number(p.estoque_minimo || 0)
    );

    painel.innerHTML = `
      <h2>Estoque</h2>
      <p>Produtos ativos: ${ativos.length}</p>
      <p>Estoque zerado: ${criticos.length}</p>
      <p>Estoque baixo: ${baixos.length}</p>

      <button id="registrarMovimento">Registrar movimentação</button>
      <button id="historicoMovimento">Histórico de movimentações</button>
      <button id="voltar">Voltar</button>

      <h3>Produtos com estoque baixo ou zerado</h3>
      <div id="listaEstoque"></div>
    `;

    document.querySelector("#registrarMovimento").onclick =
      mostrarFormularioMovimentacao;

    document.querySelector("#historicoMovimento").onclick =
      mostrarHistoricoMovimentacoes;

    document.querySelector("#voltar").onclick = mostrarInicio;

    const lista = document.querySelector("#listaEstoque");
    const alerta = [...criticos, ...baixos];

    if (!alerta.length) {
      lista.textContent = "Nenhum produto com estoque baixo ou zerado.";
      return;
    }

    alerta.forEach(produto => {
      const linha = document.createElement("p");

      linha.textContent =
        `${produto.nome} — saldo: ${produto.estoque} — mínimo: ${produto.estoque_minimo}`;

      lista.appendChild(linha);
    });
  }

  function mostrarFormularioMovimentacao() {
    if (!exigirAdministrador()) return;

    const ativos = produtos.filter(p => p.ativo);

    if (!ativos.length) {
      mensagem("Cadastre pelo menos um produto ativo antes de movimentar o estoque.");
      return;
    }

    limpar();

    painel.innerHTML = `
      <h2>Registrar movimentação</h2>

      <label for="movProduto">Produto</label>
      <select id="movProduto">
        <option value="">Selecione</option>
        ${ativos.map(p =>
          `<option value="${escapar(p.id)}">${escapar(p.nome)} — saldo: ${escapar(p.estoque)}</option>`
        ).join("")}
      </select>

      <label for="movTipo">Tipo</label>
      <select id="movTipo">
        <option value="entrada">Entrada</option>
        <option value="saida">Saída</option>
        <option value="ajuste">Ajuste de saldo</option>
      </select>

      <label id="movQuantidadeLabel" for="movQuantidade">Quantidade</label>
      <input id="movQuantidade" type="number" min="0.001" step="0.001">

      <label for="movMotivo">Motivo</label>
      <textarea id="movMotivo" rows="3"
        placeholder="Informe o motivo da movimentação"></textarea>

      <button id="salvarMovimento">Registrar</button>
      <button id="cancelarMovimento">Voltar ao estoque</button>

      <p id="avisoMovimento"></p>
    `;

    const tipo = document.querySelector("#movTipo");
    const quantidade = document.querySelector("#movQuantidade");
    const rotulo = document.querySelector("#movQuantidadeLabel");

    tipo.onchange = () => {
      const ajuste = tipo.value === "ajuste";

      rotulo.textContent = ajuste
        ? "Novo saldo contado"
        : "Quantidade";

      quantidade.min = ajuste ? "0" : "0.001";
      quantidade.value = "";
    };

    document.querySelector("#salvarMovimento").onclick =
      registrarMovimentacaoEstoque;

    document.querySelector("#cancelarMovimento").onclick =
      mostrarEstoque;
  }

  async function registrarMovimentacaoEstoque() {
    if (!exigirAdministrador()) return;

    const produtoId = document.querySelector("#movProduto").value;
    const tipo = document.querySelector("#movTipo").value;
    const quantidade = Number(
      document.querySelector("#movQuantidade").value
    );
    const motivo = document.querySelector("#movMotivo").value.trim();

    const aviso = document.querySelector("#avisoMovimento");
    const botao = document.querySelector("#salvarMovimento");

    if (!produtoId || !Number.isFinite(quantidade) ||
        (tipo === "ajuste" ? quantidade < 0 : quantidade <= 0) ||
        !motivo) {
      aviso.textContent =
        "Selecione o produto, informe uma quantidade válida e descreva o motivo.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Registrando...";

    try {
      const { data, error } = await supabase.rpc(
        "registrar_movimentacao_estoque",
        {
          p_produto_id: produtoId,
          p_tipo: tipo,
          p_quantidade: quantidade,
          p_motivo: motivo
        }
      );

      if (error) throw error;

      const resultado = Array.isArray(data) ? data[0] : data;

      await carregarProdutos();

      mensagem(
        `Movimentação registrada. Estoque: ${resultado?.estoque_anterior ?? "—"} → ${resultado?.estoque_novo ?? "—"}.`
      );

      mostrarEstoque();

    } catch (erro) {
      mostrarErro("Não foi possível registrar a movimentação.", erro);

      botao.disabled = false;
      botao.textContent = "Registrar";
    }
  }

  async function mostrarHistoricoMovimentacoes() {
    if (!exigirAdministrador()) return;

    limpar();

    painel.innerHTML = `
      <h2>Histórico de movimentações</h2>

      <button id="atualizarHistorico">Atualizar</button>
      <button id="voltarEstoque">Voltar ao estoque</button>

      <div id="listaHistorico">Carregando...</div>
    `;

    document.querySelector("#atualizarHistorico").onclick =
      mostrarHistoricoMovimentacoes;

    document.querySelector("#voltarEstoque").onclick =
      mostrarEstoque;

    try {
      const { data, error } = await supabase
        .from("movimentacoes_estoque")
        .select("id,produto_id,operador_id,pedido_id,tipo,quantidade,motivo,criado_em")
        .is("pedido_id", null)
        .order("criado_em", { ascending: false });

      if (error) throw error;

      const movimentos = data || [];

      const produtoIds = [
        ...new Set(movimentos.map(m => m.produto_id).filter(Boolean))
      ];

      const operadorIds = [
        ...new Set(movimentos.map(m => m.operador_id).filter(Boolean))
      ];

      const mapaProdutos = new Map();
      const mapaOperadores = new Map();

      if (produtoIds.length) {
        const resultadoProdutos = await supabase
          .from("produtos")
          .select("id,nome")
          .in("id", produtoIds);

        if (resultadoProdutos.error) {
          throw resultadoProdutos.error;
        }

        (resultadoProdutos.data || []).forEach(produto => {
          mapaProdutos.set(produto.id, produto.nome);
        });
      }

      if (operadorIds.length) {
        const resultadoOperadores = await supabase
          .from("perfis_usuarios")
          .select("id,nome")
          .in("id", operadorIds);

        if (resultadoOperadores.error) {
          throw resultadoOperadores.error;
        }

        (resultadoOperadores.data || []).forEach(operador => {
          mapaOperadores.set(operador.id, operador.nome);
        });
      }

      const lista = document.querySelector("#listaHistorico");

      lista.innerHTML = "";

      if (!movimentos.length) {
        lista.textContent =
          "Ainda não há movimentações manuais registradas.";
        return;
      }

      movimentos.forEach(movimento => {
        const linha = document.createElement("div");
        linha.className = "item-pedido";

        const dataMovimento = movimento.criado_em
          ? new Date(movimento.criado_em).toLocaleString("pt-BR")
          : "Data não informada";

        const produtoNome =
          mapaProdutos.get(movimento.produto_id) ||
          "Produto não encontrado";

        const operadorNome =
          mapaOperadores.get(movimento.operador_id) ||
          "Operador não identificado";

        const tipoNome = ({
          entrada: "Entrada",
          saida: "Saída",
          ajuste: "Ajuste"
        })[movimento.tipo] || movimento.tipo;

        linha.textContent =
          `${dataMovimento} — ${tipoNome} — ${produtoNome} — quantidade/diferença: ${movimento.quantidade} — ${movimento.motivo || "Sem motivo"} — Operador: ${operadorNome}`;

        lista.appendChild(linha);
      });

    } catch (erro) {
      mostrarErro(
        "Não foi possível carregar o histórico de movimentações.",
        erro
      );

      const lista = document.querySelector("#listaHistorico");

      if (lista) {
        lista.textContent = "Erro ao carregar o histórico.";
      }
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
          `<option value="${escapar(p.id)}">${escapar(p.nome)} — ${dinheiro(p.preco_venda)}</option>`
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
    const quantidade = Number(
      document.querySelector("#quantidade").value
    );
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

    const mesa = mesas.find(m => m.id === pedidoAtual.mesa_id);

    if (mesa) mostrarPedido(mesa);
  }

  async function solicitarFechamento() {
    if (!pedidoAtual?.id) {
      mensagem("Nenhum pedido selecionado.");
      return;
    }

    if (!confirm("Deseja solicitar o fechamento desta conta?")) return;

    try {
      const { error } = await supabase.rpc(
        "solicitar_fechamento_conta",
        {
          p_pedido_id: pedidoAtual.id
        }
      );

      if (error) throw error;

      await carregarMesas();

      mensagem("Conta enviada ao caixa.");

      mostrarMesas();

    } catch (erro) {
      mostrarErro(
        "Não foi possível solicitar o fechamento da conta.",
        erro
      );
    }
  }

  // CONTAS AGUARDANDO PAGAMENTO

  async function carregarContasAguardando() {
    try {
      const { data, error } = await supabase.rpc(
        "listar_contas_aguardando_pagamento"
      );

      if (error) throw error;

      mostrarContasAguardando(data || []);

    } catch (erro) {
      mostrarErro("Não foi possível carregar as contas.", erro);
    }
  }

  function mostrarContasAguardando(contas) {
    limpar();

    painel.innerHTML = `
      <h2>Contas aguardando pagamento</h2>
      <button id="atualizarContas">Atualizar</button>
      <button id="voltar">Voltar</button>
      <div id="listaContas"></div>
    `;

    document.querySelector("#atualizarContas").onclick =
      carregarContasAguardando;

    document.querySelector("#voltar").onclick = mostrarInicio;

    const lista = document.querySelector("#listaContas");

    if (!contas.length) {
      lista.textContent = "Não há contas aguardando pagamento.";
      return;
    }

    contas.forEach(conta => {
      const linha = document.createElement("div");
      linha.className = "item-pedido";

      const numeroMesa =
        conta.mesa_numero ?? conta.numero_mesa ?? conta.mesa ?? "—";

      const total =
        conta.valor_total ?? conta.total ?? conta.valor ?? 0;

      const garcom =
        conta.garcom_nome ?? conta.nome_garcom ?? conta.garcom ?? "";

      const descricao = document.createElement("p");

      descricao.textContent =
        `Mesa ${numeroMesa} — ${dinheiro(total)}` +
        (garcom ? ` — Garçom: ${garcom}` : "");

      const pagar = document.createElement("button");
      pagar.textContent = "Registrar pagamento";
      pagar.onclick = () => mostrarFormularioPagamento(conta);

      linha.append(descricao, pagar);
      lista.appendChild(linha);
    });
  }

  function mostrarFormularioPagamento(conta) {
    limpar();

    const pedidoId =
      conta.pedido_id ?? conta.id_pedido ?? conta.id;

    const total =
      Number(conta.valor_total ?? conta.total ?? conta.valor ?? 0);

    painel.innerHTML = `
      <h2>Registrar pagamento</h2>
      <p>Valor da conta: <strong>${dinheiro(total)}</strong></p>

      <label for="formaPagamento">Forma de pagamento</label>
      <select id="formaPagamento">
        <option value="dinheiro">Dinheiro</option>
        <option value="pix">Pix</option>
        <option value="debito">Débito</option>
        <option value="credito">Crédito</option>
      </select>

      <label for="valorPagamento">Valor a pagar</label>
      <input id="valorPagamento" type="number" min="0.01"
        step="0.01" value="${total.toFixed(2)}">

      <div id="campoRecebido">
        <label for="valorRecebido">Valor recebido em dinheiro</label>
        <input id="valorRecebido" type="number" min="0"
          step="0.01" value="${total.toFixed(2)}">
      </div>

      <button id="confirmarPagamento">Confirmar pagamento</button>
      <button id="voltarContas">Voltar</button>
      <p id="mensagemPagamento"></p>
    `;

    const forma = document.querySelector("#formaPagamento");
    const campoRecebido = document.querySelector("#campoRecebido");

    forma.onchange = () => {
      campoRecebido.style.display =
        forma.value === "dinheiro" ? "block" : "none";
    };

    document.querySelector("#confirmarPagamento").onclick =
      () => registrarPagamento(pedidoId);

    document.querySelector("#voltarContas").onclick =
      carregarContasAguardando;
  }

  async function registrarPagamento(pedidoId) {
    const forma = document.querySelector("#formaPagamento").value;
    const valor = Number(
      document.querySelector("#valorPagamento").value
    );

    const recebidoCampo = document.querySelector("#valorRecebido");

    const valorRecebido =
      forma === "dinheiro" ? Number(recebidoCampo.value) : null;

    const botao = document.querySelector("#confirmarPagamento");
    const aviso = document.querySelector("#mensagemPagamento");

    if (!pedidoId || !Number.isFinite(valor) || valor <= 0) {
      aviso.textContent = "Informe um valor de pagamento válido.";
      return;
    }

    if (forma === "dinheiro" &&
        (!Number.isFinite(valorRecebido) || valorRecebido < valor)) {
      aviso.textContent =
        "O valor recebido deve ser igual ou maior que o pagamento.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Registrando...";

    try {
      const { error } = await supabase.rpc("registrar_pagamento", {
        p_pedido_id: pedidoId,
        p_forma_pagamento: forma,
        p_valor: valor,
        p_valor_recebido: valorRecebido
      });

      if (error) throw error;

      mensagem("Pagamento registrado.");

      await carregarProdutos();
      await carregarMesas();
      await carregarContasAguardando();

    } catch (erro) {
      mostrarErro("Não foi possível registrar o pagamento.", erro);

      botao.disabled = false;
      botao.textContent = "Confirmar pagamento";
    }
  }

  // ATUALIZAÇÃO EM TEMPO REAL

  function iniciarRealtime() {
    if (canalRealtime) {
      supabase.removeChannel(canalRealtime);
      canalRealtime = null;
    }

    canalRealtime = supabase
      .channel("ligeirinho-atualizacoes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        async () => {
          try {
            await carregarMesas();

            if (document.querySelector("#gradeMesas")) {
              mostrarMesas();
            }

          } catch (erro) {
            console.error(
              "Erro ao atualizar mesas em tempo real:",
              erro
            );
          }
        }
      )
      .on(
        "postgres_changes",
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

          } catch (erro) {
            console.error(
              "Erro ao atualizar pedidos em tempo real:",
              erro
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "itens_pedido" },
        async () => {
          try {
            if (pedidoAtual?.id) {
              await atualizarPedidoAtual();
            }

          } catch (erro) {
            console.error(
              "Erro ao atualizar itens em tempo real:",
              erro
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "produtos" },
        async () => {
          try {
            await carregarProdutos();

            if (document.querySelector("#lista")) {
              renderizarListaProdutos();
            }

            if (document.querySelector("#listaEstoque")) {
              mostrarEstoque();
            }

          } catch (erro) {
            console.error(
              "Erro ao atualizar produtos em tempo real:",
              erro
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "movimentacoes_estoque" },
        async () => {
          try {
            await carregarProdutos();

            if (document.querySelector("#listaEstoque")) {
              mostrarEstoque();
            }

          } catch (erro) {
            console.error(
              "Erro ao atualizar estoque em tempo real:",
              erro
            );
          }
        }
      )
      .subscribe();
  }
})();
