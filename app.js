/* ========================================================
   LIGEIRINHO PDV — APP.JS
   Caixa + Mesas + Produtos + Estoque + Pedidos + Pagamentos
   + Cadastro de garçons pelo administrador
   ========================================================= */

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

  const dinheiro = valor => Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

  const mensagem = texto => alert(texto);

  function escapar(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function limpar() {
    painel.innerHTML = "";
  }

  function erro(contexto, e) {
    console.error(contexto, e);
    mensagem(contexto + (e?.message ? "\n" + e.message : ""));
  }

  function temPermissao(...funcoes) {
    return funcoes.includes(perfilAtual?.funcao);
  }

  function exigirAdministrador() {
    if (!temPermissao("administrador")) {
      mensagem("Apenas o administrador pode acessar esta área.");
      mostrarInicio();
      return false;
    }
    return true;
  }

  function exigirCaixa() {
    if (!temPermissao("administrador", "caixa")) {
      mensagem("Apenas caixa ou administrador pode acessar esta área.");
      mostrarInicio();
      return false;
    }
    return true;
  }

  function aplicarEstilos() {
    if (document.querySelector("#estilosLigeirinho")) return;

    const estilo = document.createElement("style");
    estilo.id = "estilosLigeirinho";
    estilo.textContent = `
      .painel{color:#17324d}
      .painel h2,.painel h3{color:#123f68}
      .painel button{cursor:pointer;border:0;border-radius:9px;padding:10px 14px;margin:5px 5px 5px 0;background:#174f82;color:white;font-weight:600}
      .painel button:hover{filter:brightness(1.1)}
      .painel button:disabled{opacity:.55;cursor:not-allowed}
      .painel input,.painel select,.painel textarea{box-sizing:border-box;max-width:100%;padding:10px;margin:5px 0 12px;border:1px solid #b9c9d8;border-radius:7px}
      .painel label{display:block;font-weight:600;margin-top:7px}
      #gradeMesas{display:grid;grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:10px;margin-top:15px}
      #gradeMesas .mesa{min-height:82px;display:flex;flex-direction:column;justify-content:center;align-items:center;border:2px solid transparent;color:white;font-size:15px;font-weight:700}
      #gradeMesas .mesa-livre{background:#23864b;border-color:#176b39}
      #gradeMesas .mesa-ocupada{background:#c93636;border-color:#a32323}
      #gradeMesas .mesa-aguardando{background:#e4ad22;border-color:#bd8610;color:#302300}
      #gradeMesas .mesa-desconhecida{background:#64748b}
      .legenda-mesas{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}
      .legenda-mesas span{padding:7px 10px;border-radius:7px;font-weight:700}
      .legenda-livre{background:#e2f5e8;color:#176b39}
      .legenda-ocupada{background:#fdeaea;color:#a32323}
      .legenda-aguardando{background:#fff2cc;color:#765000}
      .item-pedido{padding:10px;margin:8px 0;border:1px solid #d6e0e8;border-radius:8px;background:#f8fbfd}
      .painel button#sair{background:#b83232}
      .relatorio-caixa{background:#fff;color:#17324d;padding:18px;border:1px solid #d6e0e8;border-radius:10px;margin:12px 0}
      .relatorio-caixa table{width:100%;border-collapse:collapse;margin:10px 0}
      .relatorio-caixa th,.relatorio-caixa td{padding:8px;border-bottom:1px solid #d6e0e8;text-align:left}
      .relatorio-caixa .valor-relatorio{font-weight:700}
      @media print{
        body *{visibility:hidden!important}
        #relatorioImpressao,#relatorioImpressao *{visibility:visible!important}
        #relatorioImpressao{position:absolute;left:0;top:0;width:100%;border:0}
        .botoes-relatorio{display:none!important}
      }
      @media(max-width:600px){#gradeMesas{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(estilo);
  }

  // INICIALIZAÇÃO E LOGIN

  async function iniciar() {
    painel = document.querySelector(".painel");

    if (!painel) {
      console.error("Elemento .painel não encontrado.");
      return;
    }

    aplicarEstilos();

    if (!window.supabase?.createClient) {
      painel.innerHTML = "<h2>Erro</h2><p>Biblioteca Supabase não carregada. Confira o index.html.</p>";
      return;
    }

    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

      supabase.auth.onAuthStateChange(evento => {
        if (evento === "PASSWORD_RECOVERY") {
          aguardandoRedefinicao = true;
          mostrarRedefinirSenha();
        }
      });

      const { data, error: e } = await supabase.auth.getSession();
      if (e) throw e;

      if (data.session) {
        if (!aguardandoRedefinicao) await verificarUsuario();
      } else {
        mostrarLogin();
      }
    } catch (e) {
      erro("Não foi possível iniciar o Ligeirinho.", e);
      mostrarLogin();
    }
  }

  function mostrarLogin() {
    limpar();
    painel.innerHTML = `
      <h2>Acesso ao Ligeirinho</h2>
      <label>E-mail</label>
      <input id="email" type="email" autocomplete="username" placeholder="Seu e-mail">
      <label>Senha</label>
      <input id="senha" type="password" autocomplete="current-password" placeholder="Sua senha">
      <button id="entrar">Entrar</button>
      <p><a href="#" id="esqueciSenha">Esqueci minha senha</a></p>
      <p id="mensagemLogin"></p>
    `;

    document.querySelector("#entrar").onclick = entrar;
    document.querySelector("#esqueciSenha").onclick = e => {
      e.preventDefault();
      solicitarRecuperacaoSenha();
    };
    document.querySelector("#senha").onkeydown = e => {
      if (e.key === "Enter") entrar();
    };
  }

  async function entrar() {
    const email = document.querySelector("#email").value.trim();
    const senha = document.querySelector("#senha").value;
    const botao = document.querySelector("#entrar");
    const aviso = document.querySelector("#mensagemLogin");

    if (!email || !senha) {
      aviso.textContent = "Informe e-mail e senha.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Entrando...";

    try {
      const { error: e } = await supabase.auth.signInWithPassword({
        email, password: senha
      });
      if (e) throw e;
      await verificarUsuario();
    } catch (e) {
      aviso.textContent = e.message || "Falha no acesso.";
      botao.disabled = false;
      botao.textContent = "Entrar";
    }
  }

  async function solicitarRecuperacaoSenha() {
    const campo = document.querySelector("#email");
    const aviso = document.querySelector("#mensagemLogin");
    let email = campo.value.trim();

    if (!email) {
      email = prompt("Informe seu e-mail cadastrado:");
      if (!email) return;
      email = email.trim();
      campo.value = email;
    }

    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      aviso.textContent = "Informe um e-mail válido.";
      return;
    }

    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: URL_RECUPERACAO
      });
      if (e) throw e;
      aviso.textContent = "Se o e-mail estiver cadastrado, você receberá o link de recuperação. Confira o spam.";
    } catch (e) {
      aviso.textContent = "Erro ao solicitar recuperação: " + e.message;
    }
  }

  function mostrarRedefinirSenha() {
    limpar();
    painel.innerHTML = `
      <h2>Redefinir senha</h2>
      <label>Nova senha</label>
      <input id="novaSenha" type="password">
      <label>Confirmar nova senha</label>
      <input id="confirmarSenha" type="password">
      <button id="salvarNovaSenha">Salvar nova senha</button>
      <p id="mensagemRedefinicao"></p>
    `;
    document.querySelector("#salvarNovaSenha").onclick = salvarNovaSenha;
  }

  async function salvarNovaSenha() {
    const senha = document.querySelector("#novaSenha").value;
    const confirmar = document.querySelector("#confirmarSenha").value;
    const aviso = document.querySelector("#mensagemRedefinicao");

    if (senha.length < 6) {
      aviso.textContent = "A senha deve ter pelo menos 6 caracteres.";
      return;
    }
    if (senha !== confirmar) {
      aviso.textContent = "As senhas não são iguais.";
      return;
    }

    try {
      const { error: e } = await supabase.auth.updateUser({ password: senha });
      if (e) throw e;
      aguardandoRedefinicao = false;
      await supabase.auth.signOut();
      mensagem("Senha alterada. Entre com a nova senha.");
      mostrarLogin();
    } catch (e) {
      aviso.textContent = "Não foi possível alterar a senha: " + e.message;
    }
  }

  async function verificarUsuario() {
    try {
      const { data, error: e } = await supabase.auth.getUser();
      if (e || !data.user) {
        mostrarLogin();
        return;
      }

      usuarioAtual = data.user;

      const resultado = await supabase.from("perfis_usuarios")
        .select("id,nome,funcao,ativo")
        .eq("id", usuarioAtual.id)
        .single();

      if (resultado.error) throw resultado.error;

      perfilAtual = resultado.data;

      if (!perfilAtual?.ativo ||
          !["administrador", "caixa", "garcom"].includes(perfilAtual.funcao)) {
        throw new Error("Perfil inexistente, inativo ou função inválida.");
      }

      await carregarProdutos();
      await carregarMesas();
      iniciarRealtime();
      mostrarInicio();
    } catch (e) {
      erro("Não foi possível validar seu perfil.", e);
      await supabase.auth.signOut();
      usuarioAtual = null;
      perfilAtual = null;
      mostrarLogin();
    }
  }

  // MENU PRINCIPAL

  function mostrarInicio() {
    limpar();
    painel.innerHTML = `
      <h2>🚤 Ligeirinho PDV</h2>
      <p>Bem-vindo, ${escapar(perfilAtual.nome)}</p>
      <p>Perfil: ${escapar(perfilAtual.funcao)}</p>
      <div id="alertasEstoqueInicio"></div>
      <button id="mesas">Controle de mesas</button>
      ${temPermissao("administrador") ? `
        <button id="produtos">Produtos</button>
        <button id="estoque">Estoque</button>
        <button id="funcionarios">Funcionários</button>
      ` : ""}
      ${temPermissao("administrador", "caixa") ? `
        <button id="caixa">Controle de caixa</button>
        <button id="contas">Contas aguardando pagamento</button>
      ` : ""}
      <button id="atualizar">Atualizar</button>
      <button id="sair">Sair</button>
    `;

    document.querySelector("#mesas").onclick = mostrarMesas;
    document.querySelector("#atualizar").onclick = atualizarTudo;
    document.querySelector("#sair").onclick = sair;

    if (temPermissao("administrador")) {
      document.querySelector("#produtos").onclick = mostrarProdutos;
      document.querySelector("#estoque").onclick = mostrarEstoque;
      document.querySelector("#funcionarios").onclick = mostrarFuncionarios;
    }

    if (temPermissao("administrador", "caixa")) {
      document.querySelector("#caixa").onclick = mostrarCaixa;
      document.querySelector("#contas").onclick = carregarContasAguardando;
    }

    atualizarAvisosEstoque();
  }

  // FUNCIONÁRIOS — CADASTRO DE GARÇONS PELO ADMINISTRADOR

  async function mostrarFuncionarios() {
    if (!exigirAdministrador()) return;
    limpar();
    painel.innerHTML = `
      <h2>Cadastro de funcionários</h2>
      <p>Somente o administrador pode cadastrar funcionários.</p>
      <div class="item-pedido">
        <h3>Novo garçom</h3>
        <label>Nome</label>
        <input id="funcNome" type="text" autocomplete="name" placeholder="Nome do garçom">
        <label>E-mail de acesso</label>
        <input id="funcEmail" type="email" autocomplete="email" placeholder="email@exemplo.com">
        <label>Senha inicial</label>
        <input id="funcSenha" type="password" autocomplete="new-password" minlength="8" placeholder="Mínimo de 8 caracteres">
        <button id="salvarFuncionario">Cadastrar garçom</button>
        <p id="avisoFuncionario" role="status"></p>
      </div>
      <h3>Funcionários cadastrados</h3>
      <div id="listaFuncionarios">Carregando...</div>
      <button id="voltarFuncionarios">Voltar</button>
    `;
    document.querySelector("#salvarFuncionario").onclick = salvarFuncionario;
    document.querySelector("#voltarFuncionarios").onclick = mostrarInicio;
    await carregarFuncionarios();
  }

  async function carregarFuncionarios() {
    if (!exigirAdministrador()) return;
    const lista = document.querySelector("#listaFuncionarios");
    if (!lista) return;

    lista.textContent = "Carregando funcionários...";
    try {
      const { data, error: e } = await supabase
        .from("perfis_usuarios")
        .select("id,nome,funcao,ativo,criado_em")
        .order("nome", { ascending: true });
      if (e) throw e;

      if (!data?.length) {
        lista.textContent = "Nenhum funcionário cadastrado.";
        return;
      }

      lista.innerHTML = data.map(f => `
        <div class="item-pedido">
          <strong>${escapar(f.nome || "Sem nome")}</strong><br>
          Função: ${escapar(f.funcao)}<br>
          Situação: ${f.ativo ? "Ativo" : "Inativo"}
        </div>
      `).join("");
    } catch (e) {
      lista.textContent = "Não foi possível carregar os funcionários: " + (e.message || e);
    }
  }

  async function salvarFuncionario() {
    if (!exigirAdministrador()) return;

    const nome = document.querySelector("#funcNome")?.value.trim();
    const email = document.querySelector("#funcEmail")?.value.trim().toLowerCase();
    const senha = document.querySelector("#funcSenha")?.value || "";
    const aviso = document.querySelector("#avisoFuncionario");
    const botao = document.querySelector("#salvarFuncionario");

    if (!nome || !email || !senha) {
      aviso.textContent = "Preencha nome, e-mail e senha.";
      return;
    }
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      aviso.textContent = "Informe um e-mail válido.";
      return;
    }
    if (senha.length < 8) {
      aviso.textContent = "A senha precisa ter pelo menos 8 caracteres.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Cadastrando...";
    aviso.textContent = "";

    try {
      const { data, error: e } = await supabase.functions.invoke(
        "gerenciar-funcionarios",
        { body: { acao: "criar", nome, email, senha } }
      );
      if (e) throw e;
      if (!data?.sucesso) throw new Error(data?.erro || "Falha ao cadastrar funcionário.");

      mensagem("Garçom cadastrado com sucesso. Ele já pode entrar com o e-mail e a senha informados.");
      document.querySelector("#funcNome").value = "";
      document.querySelector("#funcEmail").value = "";
      document.querySelector("#funcSenha").value = "";
      await carregarFuncionarios();
    } catch (e) {
      aviso.textContent = "Não foi possível cadastrar: " + (e.message || e);
    } finally {
      if (document.querySelector("#salvarFuncionario")) {
        botao.disabled = false;
        botao.textContent = "Cadastrar garçom";
      }
    }
  }

  async function alterarStatusFuncionario(id, ativo) {
    if (!exigirAdministrador()) return;

    if (!confirm(ativo ? "Ativar este funcionário?" : "Desativar este funcionário?")) return;

    try {
      const { data, error: e } = await supabase.functions.invoke(
        "gerenciar-funcionarios",
        { body: { acao: ativo ? "ativar" : "desativar", usuario_id: id } }
      );
      if (e) throw e;
      if (!data?.sucesso) throw new Error(data?.erro || "Falha ao alterar funcionário.");
      await carregarFuncionarios();
    } catch (e) {
      erro("Não foi possível alterar o funcionário.", e);
    }
  }

  async function sair() {
    try {
      if (canalRealtime) await supabase.removeChannel(canalRealtime);
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Erro ao sair:", e);
    }
    usuarioAtual = null;
    perfilAtual = null;
    pedidoAtual = null;
    mostrarLogin();
  }

  async function atualizarTudo() {
    try {
      await carregarProdutos();
      await carregarMesas();
      mostrarInicio();
    } catch (e) {
      erro("Não foi possível atualizar os dados.", e);
    }
  }

  // AVISOS DE ESTOQUE
  function atualizarAvisosEstoque() {
    const area = document.querySelector("#alertasEstoqueInicio");
    if (!area) return;

    const baixos = produtos.filter(p =>
      p.ativo && Number(p.estoque) <= Number(p.estoque_minimo)
    );

    area.innerHTML = baixos.length
      ? `<p style="color:#b83232;font-weight:bold">Atenção: ${baixos.length} produto(s) com estoque baixo.</p>`
      : "";
  }

  // PRODUTOS
  async function carregarProdutos() {
    const { data, error: e } = await supabase.from("produtos")
      .select("*")
      .order("nome", { ascending: true });

    if (e) throw e;
    produtos = data || [];
    atualizarAvisosEstoque();
  }

  async function mostrarProdutos() {
    if (!exigirAdministrador()) return;
    limpar();
    painel.innerHTML = `
      <h2>Produtos</h2>
      <button id="novoProduto">Cadastrar produto</button>
      <div id="listaProdutos">Carregando...</div>
      <button id="voltarProdutos">Voltar</button>
    `;
    document.querySelector("#novoProduto").onclick = formularioProduto;
    document.querySelector("#voltarProdutos").onclick = mostrarInicio;
    renderizarProdutos();
  }

  function renderizarProdutos() {
    const lista = document.querySelector("#listaProdutos");
    if (!lista) return;

    const ativos = produtos.filter(p => p.ativo);
    const inativos = produtos.filter(p => !p.ativo);

    lista.innerHTML = `
      <h3>Produtos ativos</h3>
      ${ativos.length ? ativos.map(p => `
        <div class="item-pedido">
          <strong>${escapar(p.nome)}</strong>
          <p>Categoria: ${escapar(p.categoria || "—")}</p>
          <p>Preço: ${dinheiro(p.preco_venda)}</p>
          <p>Estoque: ${Number(p.estoque || 0)}</p>
          <button data-editar="${p.id}">Editar</button>
          <button data-excluir="${p.id}">Excluir</button>
        </div>
      `).join("") : "<p>Nenhum produto ativo.</p>"}
      <h3>Produtos inativos</h3>
      ${inativos.length ? inativos.map(p => `
        <div class="item-pedido">
          <strong>${escapar(p.nome)}</strong>
          <p>Categoria: ${escapar(p.categoria || "—")}</p>
          <p>Preço: ${dinheiro(p.preco_venda)}</p>
          <button data-reativar="${p.id}">Reativar</button>
          <button data-excluir="${p.id}">Excluir</button>
        </div>
      `).join("") : "<p>Nenhum produto inativo.</p>"}
    `;

    lista.querySelectorAll("[data-editar]").forEach(b =>
      b.onclick = () => formularioProduto(b.dataset.editar)
    );
    lista.querySelectorAll("[data-excluir]").forEach(b =>
      b.onclick = () => excluirProduto(b.dataset.excluir)
    );
    lista.querySelectorAll("[data-reativar]").forEach(b =>
      b.onclick = () => alterarAtivoProduto(b.dataset.reativar, true)
    );
  }

  function formularioProduto(id = null) {
    if (!exigirAdministrador()) return;

    const produto = produtos.find(p => p.id === id);
    limpar();
    painel.innerHTML = `
      <h2>${produto ? "Editar produto" : "Novo produto"}</h2>
      <label>Nome</label>
      <input id="produtoNome" value="${escapar(produto?.nome || "")}">
      <label>Categoria</label>
      <select id="produtoCategoria">
        ${["comida","bebida","petiscos","drinks","bebidas sem álcool"].map(c =>
          `<option value="${c}" ${produto?.categoria === c ? "selected" : ""}>${c}</option>`
        ).join("")}
      </select>
      <label>Preço de venda</label>
      <input id="produtoPreco" type="number" min="0" step="0.01" value="${produto?.preco_venda ?? ""}">
      <label>Custo</label>
      <input id="produtoCusto" type="number" min="0" step="0.01" value="${produto?.custo ?? ""}">
      <label>Estoque</label>
      <input id="produtoEstoque" type="number" min="0" step="0.001" value="${produto?.estoque ?? 0}">
      <label>Estoque mínimo</label>
      <input id="produtoMinimo" type="number" min="0" step="0.001" value="${produto?.estoque_minimo ?? 0}">
      <button id="salvarProduto">Salvar</button>
      <button id="cancelarProduto">Cancelar</button>
    `;

    document.querySelector("#salvarProduto").onclick = () => salvarProduto(id);
    document.querySelector("#cancelarProduto").onclick = mostrarProdutos;
  }

  async function salvarProduto(id) {
    if (!exigirAdministrador()) return;

    const nome = document.querySelector("#produtoNome").value.trim();
    const categoria = document.querySelector("#produtoCategoria").value;
    const preco = Number(document.querySelector("#produtoPreco").value);
    const custo = Number(document.querySelector("#produtoCusto").value || 0);
    const estoque = Number(document.querySelector("#produtoEstoque").value || 0);
    const minimo = Number(document.querySelector("#produtoMinimo").value || 0);

    if (!nome || !Number.isFinite(preco) || preco < 0 ||
        custo < 0 || estoque < 0 || minimo < 0) {
      mensagem("Preencha os dados corretamente.");
      return;
    }

    const registro = {
      nome, categoria, preco_venda: preco, custo,
      estoque, estoque_minimo: minimo, ativo: true
    };

    try {
      const consulta = id
        ? await supabase.from("produtos").update(registro).eq("id", id)
        : await supabase.from("produtos").insert(registro);

      if (consulta.error) throw consulta.error;
      await carregarProdutos();
      mostrarProdutos();
      mensagem("Produto salvo com sucesso.");
    } catch (e) {
      erro("Não foi possível salvar o produto.", e);
    }
  }

  async function excluirProduto(id) {
    if (!exigirAdministrador()) return;
    if (!confirm("Deseja excluir este produto?")) return;

    try {
      const { error: e } = await supabase.from("produtos")
        .delete().eq("id", id);
      if (e) throw e;
      await carregarProdutos();
      renderizarProdutos();
      mensagem("Produto excluído.");
    } catch (e) {
      erro("Não foi possível excluir o produto. Se ele já foi usado em pedidos, talvez seja necessário inativá-lo.", e);
    }
  }

  async function alterarAtivoProduto(id, ativo) {
    if (!exigirAdministrador()) return;
    try {
      const { error: e } = await supabase.from("produtos")
        .update({ ativo }).eq("id", id);
      if (e) throw e;
      await carregarProdutos();
      renderizarProdutos();
    } catch (e) {
      erro("Não foi possível alterar o produto.", e);
    }
  }

  // ESTOQUE
  async function mostrarEstoque() {
    if (!exigirAdministrador()) return;
    limpar();
    painel.innerHTML = `
      <h2>Estoque</h2>
      <button id="entradaEstoque">Registrar entrada</button>
      <div id="listaEstoque"></div>
      <button id="voltarEstoque">Voltar</button>
    `;
    document.querySelector("#entradaEstoque").onclick = formularioEntradaEstoque;
    document.querySelector("#voltarEstoque").onclick = mostrarInicio;
    renderizarEstoque();
  }

  function renderizarEstoque() {
    const lista = document.querySelector("#listaEstoque");
    if (!lista) return;

    lista.innerHTML = produtos.map(p => `
      <div class="item-pedido">
        <strong>${escapar(p.nome)}</strong>
        <p>Estoque atual: ${Number(p.estoque || 0)}</p>
        <p>Estoque mínimo: ${Number(p.estoque_minimo || 0)}</p>
      </div>
    `).join("");
  }

  function formularioEntradaEstoque() {
    if (!exigirAdministrador()) return;

    limpar();
    painel.innerHTML = `
      <h2>Entrada de estoque</h2>
      <label>Produto</label>
      <select id="entradaProduto">
        <option value="">Selecione</option>
        ${produtos.filter(p => p.ativo).map(p =>
          `<option value="${p.id}">${escapar(p.nome)}</option>`
        ).join("")}
      </select>
      <label>Quantidade</label>
      <input id="entradaQuantidade" type="number" min="0.001" step="0.001">
      <label>Observação</label>
      <textarea id="entradaObservacao"></textarea>
      <button id="salvarEntrada">Registrar</button>
      <button id="cancelarEntrada">Cancelar</button>
    `;

    document.querySelector("#salvarEntrada").onclick = salvarEntradaEstoque;
    document.querySelector("#cancelarEntrada").onclick = mostrarEstoque;
  }

  async function salvarEntradaEstoque() {
    if (!exigirAdministrador()) return;

    const produto_id = document.querySelector("#entradaProduto").value;
    const quantidade = Number(document.querySelector("#entradaQuantidade").value);
    const observacao = document.querySelector("#entradaObservacao").value.trim();

    if (!produto_id || !Number.isFinite(quantidade) || quantidade <= 0) {
      mensagem("Selecione o produto e informe uma quantidade válida.");
      return;
    }

    try {
      const { error: e } = await supabase.rpc("movimentar_estoque", {
        p_produto_id: produto_id,
        p_tipo: "entrada",
        p_quantidade: quantidade,
        p_observacao: observacao || null
      });
      if (e) throw e;
      await carregarProdutos();
      mostrarEstoque();
      mensagem("Entrada registrada.");
    } catch (e) {
      erro("Não foi possível registrar a entrada.", e);
    }
  }

  // CAIXA — FUNÇÕES EXISTENTES PRESERVADAS
  async function mostrarCaixa() {
    if (!exigirCaixa()) return;
    limpar();
    painel.innerHTML = `
      <h2>Controle de caixa</h2>
      <div id="estadoCaixa">Carregando...</div>
      <button id="abrirCaixa">Abrir caixa</button>
      <button id="fecharCaixa">Fechar caixa</button>
      <button id="relatorioCaixa">Relatório de caixa</button>
      <button id="voltarCaixa">Voltar</button>
    `;

    document.querySelector("#abrirCaixa").onclick = abrirCaixa;
    document.querySelector("#fecharCaixa").onclick = fecharCaixa;
    document.querySelector("#relatorioCaixa").onclick = mostrarRelatorioCaixa;
    document.querySelector("#voltarCaixa").onclick = mostrarInicio;

    await atualizarEstadoCaixa();
  }

  async function atualizarEstadoCaixa() {
    const area = document.querySelector("#estadoCaixa");
    if (!area) return;

    try {
      const { data, error: e } = await supabase.from("caixas")
        .select("*")
        .is("fechado_em", null)
        .order("aberto_em", { ascending: false })
        .limit(1);

      if (e) throw e;

      if (!data?.length) {
        area.innerHTML = "<p>Nenhum caixa aberto.</p>";
        return;
      }

      const caixa = data[0];
      area.innerHTML = `
        <div class="item-pedido">
          <strong>Caixa aberto</strong>
          <p>Abertura: ${new Date(caixa.aberto_em).toLocaleString("pt-BR")}</p>
          <p>Valor inicial: ${dinheiro(caixa.valor_inicial)}</p>
        </div>
      `;
    } catch (e) {
      area.textContent = "Erro ao consultar caixa: " + (e.message || e);
    }
  }

  async function abrirCaixa() {
    if (!exigirCaixa()) return;

    const valor = Number(prompt("Informe o valor inicial do caixa:"));
    if (!Number.isFinite(valor) || valor < 0) {
      mensagem("Informe um valor válido.");
      return;
    }

    try {
      const { error: e } = await supabase.from("caixas").insert({
        operador_id: usuarioAtual.id,
        valor_inicial: valor
      });
      if (e) throw e;
      await atualizarEstadoCaixa();
      mensagem("Caixa aberto com sucesso.");
    } catch (e) {
      erro("Não foi possível abrir o caixa.", e);
    }
  }

  async function fecharCaixa() {
    if (!exigirCaixa()) return;

    try {
      const { data, error: e } = await supabase.from("caixas")
        .select("*")
        .is("fechado_em", null)
        .order("aberto_em", { ascending: false })
        .limit(1);

      if (e) throw e;
      if (!data?.length) {
        mensagem("Não existe caixa aberto.");
        return;
      }

      const caixa = data[0];
      if (!confirm("Deseja realmente fechar o caixa?")) return;

      const { error: erroFechar } = await supabase.from("caixas")
        .update({ fechado_em: new Date().toISOString() })
        .eq("id", caixa.id);

      if (erroFechar) throw erroFechar;

      await atualizarEstadoCaixa();
      mensagem("Caixa fechado.");
    } catch (e) {
      erro("Não foi possível fechar o caixa.", e);
    }
  }

  async function mostrarRelatorioCaixa() {
    if (!exigirCaixa()) return;

    limpar();
    painel.innerHTML = `
      <h2>Relatório de caixa</h2>
      <div id="relatorioImpressao" class="relatorio-caixa">Carregando relatório...</div>
      <div class="botoes-relatorio">
        <button id="imprimirRelatorio">Imprimir</button>
        <button id="compartilharRelatorio">Compartilhar</button>
        <button id="copiarRelatorio">Copiar relatório</button>
        <button id="voltarRelatorio">Voltar</button>
      </div>
    `;

    document.querySelector("#imprimirRelatorio").onclick = () => window.print();
    document.querySelector("#compartilharRelatorio").onclick = compartilharRelatorio;
    document.querySelector("#copiarRelatorio").onclick = copiarRelatorio;
    document.querySelector("#voltarRelatorio").onclick = mostrarCaixa;

    await carregarRelatorioCaixa();
  }

  let textoRelatorioAtual = "";

  async function carregarRelatorioCaixa() {
    const area = document.querySelector("#relatorioImpressao");
    if (!area) return;

    area.textContent = "Carregando relatório...";
    try {
      const { data: caixas, error: erroCaixas } = await supabase.from("caixas")
        .select("*")
        .order("aberto_em", { ascending: false })
        .limit(1);

      if (erroCaixas) throw erroCaixas;
      if (!caixas?.length) {
        area.textContent = "Nenhum caixa encontrado.";
        return;
      }

      const caixa = caixas[0];
      const { data: pagamentos, error: erroPagamentos } = await supabase.from("pagamentos")
        .select("*")
        .gte("criado_em", caixa.aberto_em)
        .order("criado_em", { ascending: true });

      if (erroPagamentos) throw erroPagamentos;

      const { data: movimentos, error: erroMovimentos } = await supabase.from("movimentacoes_caixa")
        .select("*")
        .eq("caixa_id", caixa.id)
        .order("criado_em", { ascending: true });

      if (erroMovimentos) throw erroMovimentos;

      const totalPagamentos = (pagamentos || []).reduce((s, p) => s + Number(p.valor || 0), 0);
      const totalEntradas = (movimentos || [])
        .filter(m => m.tipo === "entrada")
        .reduce((s, m) => s + Number(m.valor || 0), 0);
      const totalSaidas = (movimentos || [])
        .filter(m => m.tipo === "saida")
        .reduce((s, m) => s + Number(m.valor || 0), 0);
      const saldo = Number(caixa.valor_inicial || 0) + totalPagamentos + totalEntradas - totalSaidas;

      textoRelatorioAtual = [
        "LIGEIRINHO PDV - RELATÓRIO DE CAIXA",
        "Abertura: " + new Date(caixa.aberto_em).toLocaleString("pt-BR"),
        "Fechamento: " + (caixa.fechado_em ? new Date(caixa.fechado_em).toLocaleString("pt-BR") : "Caixa aberto"),
        "Valor inicial: " + dinheiro(caixa.valor_inicial),
        "Total em pagamentos: " + dinheiro(totalPagamentos),
        "Entradas: " + dinheiro(totalEntradas),
        "Saídas: " + dinheiro(totalSaidas),
        "Saldo calculado: " + dinheiro(saldo)
      ].join("\\n");

      area.innerHTML = `
        <h3>Ligeirinho PDV</h3>
        <p><strong>Relatório de caixa</strong></p>
        <p>Abertura: ${new Date(caixa.aberto_em).toLocaleString("pt-BR")}</p>
        <p>Fechamento: ${caixa.fechado_em ? new Date(caixa.fechado_em).toLocaleString("pt-BR") : "Caixa aberto"}</p>
        <hr>
        <p>Valor inicial: <strong>${dinheiro(caixa.valor_inicial)}</strong></p>
        <p>Total em pagamentos: <strong>${dinheiro(totalPagamentos)}</strong></p>
        <p>Entradas: <strong>${dinheiro(totalEntradas)}</strong></p>
        <p>Saídas: <strong>${dinheiro(totalSaidas)}</strong></p>
        <hr>
        <p class="valor-relatorio">Saldo calculado: ${dinheiro(saldo)}</p>
        <h3>Pagamentos registrados</h3>
        ${(pagamentos || []).length ? (pagamentos || []).map(p => `
          <div class="item-pedido">
            <p>${new Date(p.criado_em).toLocaleString("pt-BR")}</p>
            <p>Forma: ${escapar(p.forma_pagamento || "—")}</p>
            <p>Valor: ${dinheiro(p.valor)}</p>
          </div>
        `).join("") : "<p>Nenhum pagamento registrado neste período.</p>"}
        <h3>Movimentações de caixa</h3>
        ${(movimentos || []).length ? (movimentos || []).map(m => `
          <div class="item-pedido">
            <p>${new Date(m.criado_em).toLocaleString("pt-BR")}</p>
            <p>Tipo: ${escapar(m.tipo)}</p>
            <p>Descrição: ${escapar(m.descricao || "—")}</p>
            <p>Valor: ${dinheiro(m.valor)}</p>
          </div>
        `).join("") : "<p>Nenhuma movimentação adicional.</p>"}
      `;
    } catch (e) {
      area.textContent = "Não foi possível carregar o relatório: " + (e.message || e);
    }
  }

  async function compartilharRelatorio() {
    if (!textoRelatorioAtual) {
      mensagem("O relatório ainda não está disponível.");
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Relatório de caixa - Ligeirinho PDV",
          text: textoRelatorioAtual
        });
      } else {
        await navigator.clipboard.writeText(textoRelatorioAtual);
        mensagem("Compartilhamento não disponível neste navegador. Relatório copiado.");
      }
    } catch (e) {
      if (e.name !== "AbortError") erro("Não foi possível compartilhar o relatório.", e);
    }
  }

  async function copiarRelatorio() {
    if (!textoRelatorioAtual) {
      mensagem("O relatório ainda não está disponível.");
      return;
    }

    try {
      await navigator.clipboard.writeText(textoRelatorioAtual);
      mensagem("Relatório copiado.");
    } catch (e) {
      erro("Não foi possível copiar o relatório.", e);
    }
  }

  // MESAS
  async function carregarMesas() {
    const { data, error: e } = await supabase.from("mesas")
      .select("*")
      .order("numero", { ascending: true });

    if (e) throw e;
    mesas = data || [];
  }

  async function mostrarMesas() {
    try {
      await carregarMesas();
      limpar();
      painel.innerHTML = `
        <h2>Controle de mesas</h2>
        <div class="legenda-mesas">
          <span class="legenda-livre">Livre</span>
          <span class="legenda-ocupada">Ocupada</span>
          <span class="legenda-aguardando">Aguardando pagamento</span>
        </div>
        <div id="gradeMesas"></div>
        <button id="voltarMesas">Voltar</button>
      `;

      document.querySelector("#voltarMesas").onclick = mostrarInicio;

      const grade = document.querySelector("#gradeMesas");
      grade.innerHTML = mesas.map(mesa => {
        const classe = mesa.status === "livre" ? "mesa-livre"
          : mesa.status === "ocupada" ? "mesa-ocupada"
          : mesa.status === "aguardando_pagamento" ? "mesa-aguardando"
          : "mesa-desconhecida";

        return `
          <button class="mesa ${classe}" data-mesa="${mesa.id}">
            <span>Mesa ${escapar(mesa.numero)}</span>
            <small>${escapar(mesa.status)}</small>
          </button>
        `;
      }).join("");

      grade.querySelectorAll("[data-mesa]").forEach(botao => {
        botao.onclick = () => selecionarMesa(botao.dataset.mesa);
      });
    } catch (e) {
      erro("Não foi possível carregar as mesas.", e);
    }
  }

  async function selecionarMesa(mesaId) {
    const mesa = mesas.find(m => m.id === mesaId);
    if (!mesa) {
      mensagem("Mesa não encontrada.");
      return;
    }

    try {
      const { data, error: e } = await supabase.from("pedidos")
        .select("*")
        .eq("mesa_id", mesaId)
        .in("status", ["aberto", "aguardando_pagamento"])
        .order("aberto_em", { ascending: false })
        .limit(1);

      if (e) throw e;

      if (data?.length) {
        pedidoAtual = data[0];
        await mostrarPedido();
        return;
      }

      if (mesa.status === "livre") {
        await abrirPedido(mesa);
      } else {
        mensagem("Não foi encontrado um pedido aberto para esta mesa.");
      }
    } catch (e) {
      erro("Não foi possível abrir a mesa.", e);
    }
  }

  async function abrirPedido(mesa) {
    if (!temPermissao("administrador", "garcom")) {
      mensagem("Você não tem permissão para abrir mesas.");
      return;
    }

    try {
      const { data, error: e } = await supabase.from("pedidos")
        .insert({
          mesa_id: mesa.id,
          garcom_id: usuarioAtual.id,
          status: "aberto",
          valor_total: 0
        })
        .select()
        .single();

      if (e) throw e;

      pedidoAtual = data;
      await carregarMesas();
      await mostrarPedido();
    } catch (e) {
      erro("Não foi possível abrir o pedido.", e);
    }
  }
