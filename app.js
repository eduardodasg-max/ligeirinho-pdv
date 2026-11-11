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

        const produtoNome = mapaProdutos.get(movimento.produto_id) || "Produto não encontrado";
        const operadorNome = mapaOperadores.get(movimento.operador_id) || "Usuário não identificado";

        linha.innerHTML = `
          <div>
            <strong>${escapar(produtoNome)}</strong> — <span style="text-transform: uppercase;">${escapar(movimento.tipo)}</span>: ${escapar(movimento.quantidade)}
            <br>
            <small>Data: ${escapar(dataMovimento)} | Operador: ${escapar(operadorNome)}</small>
            <br>
            <small>Motivo: ${escapar(movimento.motivo || "Não informado")}</small>
          </div>
        `;

        lista.appendChild(linha);
      });

    } catch (erro) {
      mostrarErro("Não foi possível carregar o histórico de movimentações.", erro);
    }
  }

  async function carregarMesas() {
    try {
      const { data, error } = await supabase
        .from("mesas")
        .select("*")
        .order("numero");

      if (error) throw error;
      mesas = data || [];
    } catch (erro) {
      console.error("Erro ao carregar mesas:", erro);
    }
  }

  function mostrarMesas() {
    limpar();

    painel.innerHTML = `
      <h2>Controle de Mesas</h2>
      <button id="voltarInicio">Voltar ao Início</button>
      <div id="gridMesas" style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px;"></div>
    `;

    document.querySelector("#voltarInicio").onclick = mostrarInicio;

    const container = document.querySelector("#gridMesas");

    if (!mesas.length) {
      container.innerHTML = "<p>Nenhuma mesa cadastrada.</p>";
      return;
    }

    mesas.forEach(mesa => {
      const card = document.createElement("button");
      card.style.padding = "15px";
      card.style.minWidth = "100px";
      card.textContent = `Mesa ${mesa.numero} (${mesa.status || "Livre"})`;
      container.appendChild(card);
    });
  }

  async function carregarContasAguardando() {
    limpar();
    painel.innerHTML = `
      <h2>Contas Aguardando Pagamento</h2>
      <button id="voltarContas">Voltar</button>
      <p style="margin-top: 10px;">Nenhuma conta pendente no momento.</p>
    `;
    document.querySelector("#voltarContas").onclick = mostrarInicio;
  }

  function iniciarRealtime() {
    if (canalRealtime) return;

    canalRealtime = supabase
      .channel("mudancas-pdv")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "produtos" },
        () => carregarProdutos()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        () => carregarMesas()
      )
      .subscribe();
  }

})();
