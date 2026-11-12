/* =====================================================
   LIGEIRINHO PDV - Código Consolidado e Atualizado
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
  let pedidosAbertos = [];
  let mesaAtual = null;
  let pedidoAtual = null;
  let canalRealtime = null;
  let aguardandoRedefinicao = false;
  let atualizacaoEmAndamento = false;

  // UTILITÁRIOS
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
    if (painel) painel.innerHTML = "";
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

  // ALERTAS DE ESTOQUE
  function calcularAlertasEstoque() {
    const ativos = produtos.filter(produto => produto.ativo);
    const zerados = ativos.filter(produto => Number(produto.estoque || 0) <= 0);
    const baixos = ativos.filter(produto =>
      Number(produto.estoque || 0) > 0 &&
      Number(produto.estoque || 0) <= Number(produto.estoque_minimo || 0)
    );
    return { ativos, zerados, baixos, total: zerados.length + baixos.length };
  }

  function atualizarAvisosInicio() {
    const area = document.querySelector("#alertasEstoqueInicio");
    if (!area) return;
    const alertas = calcularAlertasEstoque();

    if (alertas.total === 0) {
      area.innerHTML = `
        <div style="padding: 12px; margin: 12px 0; border: 1px solid #2e9d61; border-radius: 8px; background: #eaf8ef; color: #176b39;">
          <strong>Estoque em dia!</strong>
          <p style="margin: 5px 0 0">Nenhum produto ativo com estoque baixo ou zerado.</p>
        </div>
      `;
      return;
    }

    let conteudo = `
      <div style="padding: 12px; margin: 12px 0; border: 1px solid #d99b28; border-radius: 8px; background: #fff8e8; color: #49370d;">
        <strong>⚠️ Atenção ao estoque</strong>
        <p style="margin: 8px 0">${alertas.zerados.length} produto(s) zerado(s) | ${alertas.baixos.length} produto(s) com estoque baixo.</p>
    `;

    if (alertas.zerados.length) {
      conteudo += `
        <div style="padding: 8px; margin-top: 8px; border-radius: 6px; background: #fdeaea; color: #a32323;">
          <strong>🔴 Estoque zerado</strong>
          <ul style="margin: 6px 0 0; padding-left: 20px">
            ${alertas.zerados.map(p => `<li>${escapar(p.nome)} — saldo: ${escapar(p.estoque)}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    if (alertas.baixos.length) {
      conteudo += `
        <div style="padding: 8px; margin-top: 8px; border-radius: 6px; background: #fff0c9; color: #765000;">
          <strong>🟡 Estoque baixo</strong>
          <ul style="margin: 6px 0 0; padding-left: 20px">
            ${alertas.baixos.map(p => `<li>${escapar(p.nome)} — saldo: ${escapar(p.estoque)} — mínimo: ${escapar(p.estoque_minimo)}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    if (temPermissao("administrador")) {
      conteudo += `<button id="abrirEstoqueAlertas" style="margin-top: 10px;">Abrir controle de estoque</button>`;
    }
    conteudo += "</div>";

    area.innerHTML = conteudo;
    const botao = document.querySelector("#abrirEstoqueAlertas");
    if (botao) botao.onclick = mostrarEstoque;
  }

  // INICIALIZAÇÃO E AUTENTICAÇÃO
  async function iniciar() {
    painel = document.querySelector(".painel");
    if (!painel) {
      console.error("Elemento .painel não encontrado.");
      return;
    }

    if (!window.supabase?.createClient) {
      painel.innerHTML = "<h2>Erro ao carregar</h2><p>A biblioteca do Supabase não foi carregada. Confira o index.html.</p>";
      return;
    }

    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      
      supabase.auth.onAuthStateChange(async (evento) => {
        if (evento === "PASSWORD_RECOVERY") {
          aguardandoRedefinicao = true;
          mostrarRedefinirSenha();
        }
      });

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const linkEhRecuperacao = window.location.hash.includes("type=recovery");
      if (linkEhRecuperacao || aguardandoRedefinicao) {
        mostrarRedefinirSenha();
        return;
      }

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

  function mostrarLogin() {
    limpar();
    painel.innerHTML = `
      <h2>Acesso ao Ligeirinho</h2>
      <label for="email">E-mail</label>
      <input id="email" type="email" autocomplete="username" placeholder="Seu e-mail">
      <label for="senha">Senha</label>
      <input id="senha" type="password" autocomplete="current-password" placeholder="Sua senha">
      <button id="entrar">Entrar</button>
      <p><a href="#" id="esqueciSenha">Esqueci minha senha</a></p>
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
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      await verificarUsuario();
    } catch (erro) {
      botao.disabled = false;
      botao.textContent = "Entrar";
      aviso.textContent = erro.message || "Falha no acesso.";
    }
  }

  async function solicitarRecuperacaoSenha() {
    const campoEmail = document.querySelector("#email");
    const aviso = document.querySelector("#mensagemLogin");
    let email = campoEmail?.value.trim() || "";

    if (!email) {
      email = prompt("Informe o e-mail cadastrado no Ligeirinho:");
      if (!email) {
        if (aviso) aviso.textContent = "Informe um e-mail para recuperar a senha.";
        return;
      }
      email = email.trim();
      if (campoEmail) campoEmail.value = email;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (aviso) aviso.textContent = "Informe um endereço de e-mail válido.";
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: URL_RECUPERACAO });
      if (error) throw error;
      mensagem("Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.");
    } catch (erro) {
      mostrarErro("Não foi possível solicitar a recuperação.", erro);
    }
  }

  function mostrarRedefinirSenha() {
    limpar();
    painel.innerHTML = `
      <h2>Redefinir senha</h2>
      <p>Digite sua nova senha abaixo.</p>
      <label for="novaSenha">Nova senha</label>
      <input id="novaSenha" type="password" autocomplete="new-password" placeholder="Nova senha">
      <label for="confirmarSenha">Confirme a nova senha</label>
      <input id="confirmarSenha" type="password" autocomplete="new-password" placeholder="Repita a nova senha">
      <button id="salvarNovaSenha">Salvar nova senha</button>
      <p id="mensagemRedefinicao"></p>
    `;
    document.querySelector("#salvarNovaSenha").onclick = salvarNovaSenha;
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
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      aguardandoRedefinicao = false;
      await supabase.auth.signOut();
      mensagem("Senha alterada com sucesso. Entre com sua nova senha.");
      mostrarLogin();
    } catch (erro) {
      aviso.textContent = "Erro ao alterar a senha: " + erro.message;
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

      if (erroPerfil || !perfil || !perfil.ativo) {
        throw new Error("Perfil não encontrado ou usuário inativo.");
      }

      if (!["administrador", "caixa", "garcom"].includes(perfil.funcao)) {
        throw new Error("Função de usuário não reconhecida.");
      }

      perfilAtual = perfil;
      await carregarProdutosSilencioso();
      await carregarDadosMesas();
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
      <p>Bem-vindo, ${escapar(perfilAtual?.nome)}</p>
      <p>Perfil: ${escapar(perfilAtual?.funcao)}</p>
      <div id="alertasEstoqueInicio"></div>
      <button id="mesas">Controle de mesas</button>
      ${temPermissao("administrador") ? '<button id="produtos">Produtos</button><button id="estoque">Estoque</button>' : ""}
      ${temPermissao("administrador", "caixa") ? '<button id="contas">Contas aguardando pagamento</button>' : ""}
      <button id="atualizar">Atualizar dados</button>
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
      document.querySelector("#contas").onclick = carregarContasAguardando;
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
    pedidosAbertos = [];
    aguardandoRedefinicao = false;
    mostrarLogin();
  }

  async function atualizarTudo() {
    await carregarProdutosSilencioso();
    await carregarDadosMesas();
    atualizarAvisosInicio();
    mensagem("Dados atualizados.");
    mostrarInicio();
  }

  // GESTÃO DE PRODUTOS
  async function carregarProdutosSilencioso() {
    const { data, error } = await supabase.from("produtos").select("*").order("nome");
    if (error) {
      console.error("Erro ao carregar produtos:", error);
      return;
    }
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
      <input id="pesquisaProduto" placeholder="Digite nome ou código">
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
      <div id="resumoProdutos" style="margin: 10px 0;"></div>
      <div id="lista"></div>
    `;

    document.querySelector("#novo").onclick = () => formularioProduto();
    document.querySelector("#voltar").onclick = mostrarInicio;

    const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const filtroCategoria = document.querySelector("#filtroCategoria");
    categorias.forEach(cat => {
      const op = document.createElement("option");
      op.value = cat;
      op.textContent = cat;
      filtroCategoria.appendChild(op);
    });

    document.querySelector("#pesquisaProduto").oninput = renderizarListaProdutos;
    filtroCategoria.onchange = renderizarListaProdutos;
    document.querySelector("#filtroStatus").onchange = renderizarListaProdutos;

    renderizarListaProdutos();
  }

  function renderizarListaProdutos() {
    const lista = document.querySelector("#lista");
    const resumo = document.querySelector("#resumoProdutos");
    if (!lista || !resumo) return;
    lista.innerHTML = "";

    const pesquisa = document.querySelector("#pesquisaProduto").value.trim().toLocaleLowerCase("pt-BR");
    const categoria = document.querySelector("#filtroCategoria").value;
    const status = document.querySelector("#filtroStatus").value;

    let filtrados = [...produtos];
    if (status === "ativos") filtrados = filtrados.filter(p => p.ativo);
    else if (status === "inativos") filtrados = filtrados.filter(p => !p.ativo);

    if (categoria) filtrados = filtrados.filter(p => p.categoria === categoria);
    if (pesquisa) {
      filtrados = filtrados.filter(p =>
        String(p.nome || "").toLocaleLowerCase("pt-BR").includes(pesquisa) ||
        String(p.codigo || "").toLocaleLowerCase("pt-BR").includes(pesquisa)
      );
    }

    const ativos = produtos.filter(p => p.ativo).length;
    const inativos = produtos.filter(p => !p.ativo).length;
    resumo.textContent = `Total: ${produtos.length} | Ativos: ${ativos} | Inativos: ${inativos} | Encontrados: ${filtrados.length}`;

    if (!filtrados.length) {
      lista.textContent = "Nenhum produto encontrado.";
      return;
    }

    filtrados.forEach(produto => {
      const linha = document.createElement("div");
      linha.className = "item-pedido";
      linha.style.marginBottom = "8px";
      
      const texto = document.createElement("div");
      texto.textContent = `${produto.nome} — ${dinheiro(produto.preco_venda)} — Custo: ${dinheiro(produto.custo)} — Estoque: ${produto.estoque} — Mín: ${produto.estoque_minimo} — [${produto.ativo ? "ATIVO" : "INATIVO"}]`;

      const editar = document.createElement("button");
      editar.textContent = "Editar";
      editar.onclick = () => formularioProduto(produto);

      const alternar = document.createElement("button");
      alternar.textContent = produto.ativo ? "Desativar" : "Reativar";
      alternar.onclick = () => alterarStatusProduto(produto);

      linha.append(texto, editar, alternar);
      lista.appendChild(linha);
    });
  }

  async function verificarCodigoDuplicado(codigo, produtoAtual = null) {
    if (!codigo) return false;
    const codigoNorm = codigo.trim().toLocaleLowerCase("pt-BR");
    const duplicadoLocal = produtos.some(p => String(p.codigo || "").trim().toLocaleLowerCase("pt-BR") === codigoNorm && p.id !== produtoAtual?.id);
    if (duplicadoLocal) return true;

    let consulta = supabase.from("produtos").select("id").ilike("codigo", codigo.trim());
    if (produtoAtual?.id) consulta = consulta.neq("id", produtoAtual.id);
    
    const { data, error } = await consulta.limit(1);
    if (error) throw error;
    return (data || []).length > 0;
  }

  async function alterarStatusProduto(produto) {
    if (!exigirAdministrador()) return;
    const novoStatus = !produto.ativo;
    if (!confirm(`Deseja ${novoStatus ? "reativar" : "desativar"} o produto "${produto.nome}"?`)) return;

    try {
      const { error } = await supabase.from("produtos").update({ ativo: novoStatus }).eq("id", produto.id);
      if (error) throw error;
      await carregarProdutosSilencioso();
      mostrarProdutos();
      mensagem(novoStatus ? "Produto reativado." : "Produto desativado.");
    } catch (erro) {
      mostrarErro("Não foi possível alterar o status do produto.", erro);
    }
  }

  function formularioProduto(produto = null) {
    limpar();
    const categorias = ["Comida", "Bebida", "Petiscos", "Drinks", "Bebidas sem álcool"];

    painel.innerHTML = `
      <h2>${produto ? "Editar produto" : "Novo produto"}</h2>
      <label for="codigo">Código</label>
      <input id="codigo" autocomplete="off">
      <label for="nome">Nome</label>
      <input id="nome" autocomplete="off">
      <label for="categoria">Categoria</label>
      <select id="categoria">
        <option value="">Selecione</option>
        ${categorias.map(c => `<option value="${escapar(c)}">${escapar(c)}</option>`).join("")}
      </select>
      <label for="preco">Preço de venda</label>
      <input id="preco" type="number" min="0" step="0.01">
      <label for="custo">Custo</label>
      <input id="custo" type="number" min="0" step="0.01">
      <label for="estoque">${produto ? "Estoque atual (alterado via Movimentações)" : "Estoque inicial"}</label>
      <input id="estoque" type="number" min="0" step="0.001" ${produto ? "readonly" : ""}>
      <label for="minimo">Estoque mínimo</label>
      <input id="minimo" type="number" min="0" step="0.001">
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

    document.querySelector("#salvar").onclick = () => salvarProduto(produto);
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
    const estoqueInicial = Number(document.querySelector("#estoque").value || 0);
    const aviso = document.querySelector("#avisoProduto");
    const botao = document.querySelector("#salvar");

    if (!registro.nome || !registro.categoria || !Number.isFinite(registro.preco_venda) || registro.preco_venda < 0 || (!produto && estoqueInicial < 0)) {
      aviso.textContent = "Confira nome, categoria, preço e quantidades informadas.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Salvando...";

    try {
      if (registro.codigo) {
        const duplicado = await verificarCodigoDuplicado(registro.codigo, produto);
        if (duplicado) {
          aviso.textContent = "Já existe outro produto cadastrado com esse código.";
          botao.disabled = false;
          botao.textContent = "Salvar";
          return;
        }
      }

      let res;
      if (produto) {
        res = await supabase.from("produtos").update(registro).eq("id", produto.id);
      } else {
        res = await supabase.from("produtos").insert({ ...registro, estoque: estoqueInicial, ativo: true });
      }

      if (res.error) throw res.error;
      await carregarProdutosSilencioso();
      mostrarProdutos();
      mensagem(produto ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso.");
    } catch (erro) {
      mostrarErro("Não foi possível salvar o produto.", erro);
      botao.disabled = false;
      botao.textContent = "Salvar";
    }
  }

  // MOVIMENTAÇÕES DE ESTOQUE
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
    const baixos = ativos.filter(p => Number(p.estoque) > 0 && Number(p.estoque) <= Number(p.estoque_minimo || 0));

    painel.innerHTML = `
      <h2>Controle de Estoque</h2>
      <p>Produtos ativos: ${ativos.length} | Zerados: ${criticos.length} | Baixos: ${baixos.length}</p>
      <button id="registrarMovimento">Registrar movimentação</button>
      <button id="historicoMovimento">Histórico de movimentações</button>
      <button id="voltar">Voltar</button>
      <h3>Produtos em Alerta</h3>
      <div id="listaEstoque"></div>
    `;

    document.querySelector("#registrarMovimento").onclick = mostrarFormularioMovimentacao;
    document.querySelector("#historicoMovimento").onclick = mostrarHistoricoMovimentacoes;
    document.querySelector("#voltar").onclick = mostrarInicio;

    const lista = document.querySelector("#listaEstoque");
    const alertas = [...criticos, ...baixos];
    if (!alertas.length) {
      lista.textContent = "Nenhum produto com estoque baixo ou zerado.";
      return;
    }

    alertas.forEach(p => {
      const item = document.createElement("p");
      item.textContent = `${p.nome} — Saldo: ${p.estoque} — Mínimo: ${p.estoque_minimo}`;
      lista.appendChild(item);
    });
  }

  function mostrarFormularioMovimentacao() {
    if (!exigirAdministrador()) return;
    const ativos = produtos.filter(p => p.ativo);
    if (!ativos.length) {
      mensagem("Cadastre produtos ativos antes de realizar movimentações.");
      return;
    }

    limpar();
    painel.innerHTML = `
      <h2>Registrar Movimentação de Estoque</h2>
      <label for="movProduto">Produto</label>
      <select id="movProduto">
        <option value="">Selecione</option>
        ${ativos.map(p => `<option value="${escapar(p.id)}">${escapar(p.nome)} — Saldo: ${escapar(p.estoque)}</option>`).join("")}
      </select>
      <label for="movTipo">Tipo de Operação</label>
      <select id="movTipo">
        <option value="entrada">Entrada</option>
        <option value="saida">Saída</option>
        <option value="ajuste">Ajuste de Saldo</option>
      </select>
      <label id="movQuantidadeLabel" for="movQuantidade">Quantidade</label>
      <input id="movQuantidade" type="number" min="0.001" step="0.001">
      <label for="movMotivo">Motivo</label>
      <textarea id="movMotivo" rows="3" placeholder="Informe o motivo da alteração"></textarea>
      <button id="salvarMovimento">Registrar</button>
      <button id="cancelarMovimento">Voltar ao Estoque</button>
      <p id="avisoMovimento"></p>
    `;

    const tipo = document.querySelector("#movTipo");
    const quantidade = document.querySelector("#movQuantidade");
    const rotulo = document.querySelector("#movQuantidadeLabel");

    tipo.onchange = () => {
      const ajuste = tipo.value === "ajuste";
      rotulo.textContent = ajuste ? "Novo saldo contado" : "Quantidade";
      quantidade.min = ajuste ? "0" : "0.001";
      quantidade.value = "";
    };

    document.querySelector("#salvarMovimento").onclick = registrarMovimentacaoEstoque;
    document.querySelector("#cancelarMovimento").onclick = mostrarEstoque;
  }

  async function registrarMovimentacaoEstoque() {
    if (!exigirAdministrador()) return;
    const produtoId = document.querySelector("#movProduto").value;
    const tipo = document.querySelector("#movTipo").value;
    const quantidade = Number(document.querySelector("#movQuantidade").value);
    const motivo = document.querySelector("#movMotivo").value.trim();
    const aviso = document.querySelector("#avisoMovimento");
    const botao = document.querySelector("#salvarMovimento");

    if (!produtoId || !Number.isFinite(quantidade) || (tipo === "ajuste" ? quantidade < 0 : quantidade <= 0) || !motivo) {
      aviso.textContent = "Preencha todos os campos com dados válidos.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Registrando...";

    try {
      const { data, error } = await supabase.rpc("registrar_movimentacao_estoque", {
        p_produto_id: produtoId,
        p_tipo: tipo,
        p_quantidade: quantidade,
        p_motivo: motivo
      });
      if (error) throw error;

      const res = Array.isArray(data) ? data[0] : data;
      await carregarProdutosSilencioso();
      mensagem(`Movimentação registrada com sucesso! Saldo: ${res?.estoque_anterior ?? "—"} → ${res?.estoque_novo ?? "—"}.`);
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
      <h2>Histórico de Movimentações</h2>
      <button id="atualizarHist">Atualizar</button>
      <button id="voltarEstoque">Voltar ao Estoque</button>
      <div id="listaHistorico">Carregando...</div>
    `;

    document.querySelector("#atualizarHist").onclick = mostrarHistoricoMovimentacoes;
    document.querySelector("#voltarEstoque").onclick = mostrarEstoque;

    try {
      const { data, error } = await supabase
        .from("movimentacoes_estoque")
        .select("id, produto_id, operador_id, pedido_id, tipo, quantidade, motivo, criado_em")
        .is("pedido_id", null)
        .order("criado_em", { ascending: false });

      if (error) throw error;
      const movimentos = data || [];

      const pIds = [...new Set(movimentos.map(m => m.produto_id).filter(Boolean))];
      const uIds = [...new Set(movimentos.map(m => m.operador_id).filter(Boolean))];

      const mapaProdutos = new Map();
      const mapaOperadores = new Map();

      if (pIds.length) {
        const { data: dProd } = await supabase.from("produtos").select("id, nome").in("id", pIds);
        (dProd || []).forEach(p => mapaProdutos.set(p.id, p.nome));
      }
      if (uIds.length) {
        const { data: dOp } = await supabase.from("perfis_usuarios").select("id, nome").in("id", uIds);
        (dOp || []).forEach(u => mapaOperadores.set(u.id, u.nome));
      }

      const lista = document.querySelector("#listaHistorico");
      lista.innerHTML = "";

      if (!movimentos.length) {
        lista.textContent = "Sem histórico de movimentações manuais.";
        return;
      }

      movimentos.forEach(m => {
        const item = document.createElement("div");
        item.className = "item-pedido";
        const dt = m.criado_em ? new Date(m.criado_em).toLocaleString("pt-BR") : "—";
        const pNome = mapaProdutos.get(m.produto_id) || "Produto N/I";
        const oNome = mapaOperadores.get(m.operador_id) || "Operador N/I";

        item.innerHTML = `
          <div>
            <strong>${escapar(pNome)}</strong> — <span style="text-transform:uppercase;">${escapar(m.tipo)}</span>: ${escapar(m.quantidade)}
            <br><small>Data: ${escapar(dt)} | Operador: ${escapar(oNome)}</small>
            <br><small>Motivo: ${escapar(m.motivo || "Não informado")}</small>
          </div>
        `;
        lista.appendChild(item);
      });
    } catch (erro) {
      mostrarErro("Não foi possível carregar o histórico.", erro);
    }
  }

  // MESAS E PEDIDOS
  async function carregarDadosMesas() {
    try {
      const [rMesas, rPedidos] = await Promise.all([
        supabase.from("mesas").select("id, numero, status").order("numero"),
        supabase.from("pedidos").select("id, mesa_id, garcom_id, status, valor_total, aberto_em, conta_solicitada_em").eq("status", "aberto")
      ]);

      if (rMesas.error) throw rMesas.error;
      if (rPedidos.error) throw rPedidos.error;

      mesas = rMesas.data || [];
      pedidosAbertos = rPedidos.data || [];
    } catch (erro) {
      console.error("Erro ao carregar dados de mesas:", erro);
    }
  }

  function pedidoDaMesa(mesaId) {
    return pedidosAbertos.find(p => p.mesa_id === mesaId);
  }

  async function mostrarMesas() {
    await carregarDadosMesas();
    limpar();
    painel.innerHTML = `
      <h2>Controle de Mesas</h2>
      <button id="voltar">Voltar ao Início</button>
      <div id="gridMesas" style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px;"></div>
    `;

    document.querySelector("#voltar").onclick = mostrarInicio;
    const container = document.querySelector("#gridMesas");

    if (!mesas.length) {
      container.innerHTML = "<p>Nenhuma mesa cadastrada.</p>";
      return;
    }

    mesas.forEach(mesa => {
      const pedido = pedidoDaMesa(mesa.id);
      const btn = document.createElement("button");
      btn.className = `mesa ${mesa.status || "livre"}`;
      btn.style.padding = "15px";
      btn.style.minWidth = "110px";
      btn.innerHTML = `<strong>Mesa ${mesa.numero}</strong><br><small>${mesa.status || "livre"}</small>`;
      btn.onclick = () => selecionarMesa(mesa, pedido);
      container.appendChild(btn);
    });
  }

  async function selecionarMesa(mesa, pedido) {
    mesaAtual = mesa;
    pedidoAtual = pedido || null;

    if (!pedidoAtual && mesa.status !== "livre") {
      mensagem("Mesa ocupada sem pedido aberto localizado. Atualizando...");
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

  async function abrirMesa(mesa) {
    if (mesa.status !== "livre") {
      mensagem("Esta mesa não está disponível para abertura.");
      return;
    }

    try {
      const { data, error } = await supabase.rpc("abrir_mesa", {
        p_mesa_id: mesa.id,
        p_garcom_id: usuarioAtual.id
      });
      if (error) throw error;

      await carregarDadosMesas();
      pedidoAtual = pedidoDaMesa(mesa.id) || (Array.isArray(data) ? data[0] : data);

      if (!pedidoAtual) {
        await mostrarMesas();
        return;
      }

      await carregarItensPedido();
      mostrarPedido();
    } catch (erro) {
      mostrarErro("Não foi possível abrir a mesa.", erro);
    }
  }

  async function carregarItensPedido() {
    if (!pedidoAtual?.id) return;
    try {
      const { data, error } = await supabase
        .from("itens_pedido")
        .select("id, pedido_id, produto_id, quantidade, preco_unitario, subtotal, observacao, status_producao")
        .eq("pedido_id", pedidoAtual.id)
        .order("criado_em");

      if (error) throw error;
      pedidoAtual.itens = data || [];
    } catch (erro) {
      console.error("Erro ao carregar itens do pedido:", erro);
    }
  }

  function mostrarPedido() {
    if (!mesaAtual || !pedidoAtual) {
      mostrarMesas();
      return;
    }

    limpar();
    painel.innerHTML = `
      <h2>Mesa ${mesaAtual.numero}</h2>
      <p><small>Pedido ID: ${pedidoAtual.id}</small></p>
      
      <label for="produto">Adicionar Produto</label>
      <select id="produto">
        <option value="">Selecione um produto</option>
        ${produtos.filter(p => p.ativo).map(p => `<option value="${escapar(p.id)}">${escapar(p.nome)} - ${dinheiro(p.preco_venda)}</option>`).join("")}
      </select>
      <label for="quantidade">Quantidade</label>
      <input id="quantidade" type="number" min="0.001" step="0.001" value="1">
      <label for="observacao">Observação</label>
      <input id="observacao" placeholder="Ex.: Sem cebola">
      <button id="adicionar">Adicionar Item</button>

      <h3>Itens do Pedido</h3>
      <div id="listaItens"></div>
      <h3 id="totalPedido"></h3>
      
      <button id="solicitarConta">Solicitar Fechamento da Conta</button>
      <button id="voltarMesas">Voltar às Mesas</button>
    `;

    document.querySelector("#adicionar").onclick = adicionarItem;
    document.querySelector("#solicitarConta").onclick = solicitarFechamento;
    document.querySelector("#voltarMesas").onclick = mostrarMesas;

    renderizarItensPedido();
  }

  function renderizarItensPedido() {
    const container = document.querySelector("#listaItens");
    const totalElem = document.querySelector("#totalPedido");
    if (!container || !totalElem) return;

    container.innerHTML = "";
    const itens = pedidoAtual.itens || [];
    let valorTotal = 0;

    if (!itens.length) {
      container.textContent = "Nenhum item adicionado ao pedido.";
      totalElem.textContent = "Total: " + dinheiro(0);
      return;
    }

    itens.forEach(item => {
      valorTotal += Number(item.subtotal || 0);
      const prod = produtos.find(p => p.id === item.produto_id);
      const linha = document.createElement("div");
      linha.className = "item-pedido";
      linha.style.display = "flex";
      linha.style.justifyContent = "space-between";
      linha.style.marginBottom = "5px";

      const info = document.createElement("span");
      info.textContent = `${item.quantidade}x ${prod?.nome || "Produto"} — ${dinheiro(item.subtotal)}`;
      linha.appendChild(info);

      const podeRemover = temPermissao("administrador", "caixa") || (temPermissao("garcom") && pedidoAtual.garcom_id === usuarioAtual.id);
      if (podeRemover && item.status_producao === "pendente") {
        const btnRemover = document.createElement("button");
        btnRemover.textContent = "Remover";
        btnRemover.onclick = () => removerItem(item.id);
        linha.appendChild(btnRemover);
      }

      container.appendChild(linha);
    });

    totalElem.textContent = "Total: " + dinheiro(valorTotal);
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

      await carregarDadosMesas();
      pedidoAtual = pedidoDaMesa(mesaAtual.id);
      await carregarItensPedido();
      mostrarPedido();
    } catch (erro) {
      mostrarErro("Não foi possível adicionar o item.", erro);
    }
  }

  async function removerItem(itemId) {
    if (!confirm("Deseja remover este item?")) return;
    try {
      const { error } = await supabase.rpc("remover_item_pedido", { p_item_id: itemId });
      if (error) throw error;

      await carregarDadosMesas();
      pedidoAtual = pedidoDaMesa(mesaAtual.id);
      await carregarItensPedido();
      mostrarPedido();
    } catch (erro) {
      mostrarErro("Não foi possível remover o item.", erro);
    }
  }

  async function solicitarFechamento() {
    if (!confirm("Confirmar solicitação de fechamento da conta?")) return;
    try {
      const { error } = await supabase.rpc("solicitar_fechamento_conta", { p_pedido_id: pedidoAtual.id });
      if (error) throw error;

      mensagem("Conta enviada ao caixa!");
      await carregarDadosMesas();
      mostrarMesas();
    } catch (erro) {
      mostrarErro("Não foi possível solicitar o fechamento da conta.", erro);
    }
  }

  // CAIXA E PAGAMENTOS
  async function carregarContasAguardando() {
    limpar();
    painel.innerHTML = `<h2>Contas Aguardando Pagamento</h2><p>Carregando...</p>`;

    try {
      const { data, error } = await supabase.rpc("listar_contas_aguardando_pagamento");
      if (error) throw error;

      mostrarListaContas(data || []);
    } catch (erro) {
      mostrarErro("Não foi possível carregar as contas.", erro);
      mostrarInicio();
    }
  }

  function mostrarListaContas(contas) {
    limpar();
    painel.innerHTML = `
      <h2>Contas Aguardando Pagamento</h2>
      <button id="atualizarContas">Atualizar</button>
      <button id="voltarInicio">Voltar ao Início</button>
      <div id="listaContas" style="margin-top: 15px;"></div>
    `;

    document.querySelector("#atualizarContas").onclick = carregarContasAguardando;
    document.querySelector("#voltarInicio").onclick = mostrarInicio;

    const lista = document.querySelector("#listaContas");
    if (!contas.length) {
      lista.textContent = "Nenhuma conta pendente de pagamento no momento.";
      return;
    }

    contas.forEach(conta => {
      const item = document.createElement("div");
      item.className = "item-pedido";
      item.style.marginBottom = "10px";

      const nMesa = conta.numero_mesa ?? conta.mesa_numero ?? conta.mesa ?? "—";
      const total = Number(conta.valor_total ?? conta.total ?? conta.valor ?? 0);
      const garcom = conta.garcom_nome ?? conta.nome_garcom ?? conta.garcom ?? "";

      item.innerHTML = `
        <p><strong>Mesa ${nMesa}</strong> — Total: ${dinheiro(total)} ${garcom ? `| Garçom: ${garcom}` : ""}</p>
      `;

      const btnPagar = document.createElement("button");
      btnPagar.textContent = "Registrar Pagamento";
      btnPagar.onclick = () => formularioPagamento(conta);

      item.appendChild(btnPagar);
      lista.appendChild(item);
    });
  }

  function formularioPagamento(conta) {
    limpar();
    const pedidoId = conta.pedido_id ?? conta.id_pedido ?? conta.id;
    const total = Number(conta.valor_total ?? conta.total ?? conta.valor ?? 0);

    painel.innerHTML = `
      <h2>Registrar Pagamento</h2>
      <p>Valor total da conta: <strong>${dinheiro(total)}</strong></p>
      
      <label for="formaPagamento">Forma de Pagamento</label>
      <select id="formaPagamento">
        <option value="dinheiro">Dinheiro</option>
        <option value="pix">Pix</option>
        <option value="debito">Débito</option>
        <option value="credito">Crédito</option>
      </select>

      <label for="valorPagamento">Valor Pago</label>
      <input id="valorPagamento" type="number" min="0.01" step="0.01" value="${total.toFixed(2)}">

      <div id="campoRecebido">
        <label for="valorRecebido">Valor Entregue (Dinheiro)</label>
        <input id="valorRecebido" type="number" min="0" step="0.01" value="${total.toFixed(2)}">
      </div>

      <button id="confirmar">Confirmar Pagamento</button>
      <button id="cancelar">Voltar</button>
      <p id="avisoPagamento"></p>
    `;

    const forma = document.querySelector("#formaPagamento");
    const campoRecebido = document.querySelector("#campoRecebido");

    forma.onchange = () => {
      campoRecebido.style.display = forma.value === "dinheiro" ? "block" : "none";
    };

    document.querySelector("#confirmar").onclick = () => processarPagamento(pedidoId);
    document.querySelector("#cancelar").onclick = carregarContasAguardando;
  }

  async function processarPagamento(pedidoId) {
    const forma = document.querySelector("#formaPagamento").value;
    const valor = Number(document.querySelector("#valorPagamento").value);
    const recebido = forma === "dinheiro" ? Number(document.querySelector("#valorRecebido").value) : null;
    const aviso = document.querySelector("#avisoPagamento");
    const botao = document.querySelector("#confirmar");

    if (!pedidoId || !Number.isFinite(valor) || valor <= 0) {
      aviso.textContent = "Informe um valor de pagamento válido.";
      return;
    }

    if (forma === "dinheiro" && (!Number.isFinite(recebido) || recebido < valor)) {
      aviso.textContent = "O valor entregue em dinheiro precisa ser maior ou igual ao valor pago.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Processando...";

    try {
      const { data, error } = await supabase.rpc("registrar_pagamento", {
        p_pedido_id: pedidoId,
        p_forma_pagamento: forma,
        p_valor: valor,
        p_valor_recebido: recebido
      });

      if (error) throw error;

      if (data && typeof data === "object" && data.troco !== undefined) {
        mensagem("Pagamento confirmado. Troco: " + dinheiro(data.troco));
      } else {
        mensagem("Pagamento registrado com sucesso!");
      }

      await carregarProdutosSilencioso();
      await carregarDadosMesas();
      carregarContasAguardando();
    } catch (erro) {
      mostrarErro("Não foi possível registrar o pagamento.", erro);
      botao.disabled = false;
      botao.textContent = "Confirmar Pagamento";
    }
  }

  // ATUALIZAÇÃO EM TEMPO REAL (REALTIME)
  function iniciarRealtime() {
    if (canalRealtime) {
      supabase.removeChannel(canalRealtime);
    }

    canalRealtime = supabase
      .channel("ligeirinho-atualizacoes-geral")
      .on("postgres_changes", { event: "*", schema: "public", table: "mesas" }, tratarEventoRealtime)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, tratarEventoRealtime)
      .on("postgres_changes", { event: "*", schema: "public", table: "itens_pedido" }, tratarEventoRealtime)
      .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, tratarEventoRealtime)
      .on("postgres_changes", { event: "*", schema: "public", table: "movimentacoes_estoque" }, tratarEventoRealtime)
      .subscribe();
  }

  async function tratarEventoRealtime() {
    if (atualizacaoEmAndamento || !usuarioAtual) return;
    atualizacaoEmAndamento = true;

    try {
      await carregarProdutosSilencioso();
      await carregarDadosMesas();

      if (mesaAtual && pedidoAtual) {
        const atualizado = pedidoDaMesa(mesaAtual.id);
        if (!atualizado) {
          pedidoAtual = null;
          mensagem("O pedido desta mesa foi encerrado.");
          mostrarMesas();
        } else {
          pedidoAtual = atualizado;
          await carregarItensPedido();
          if (document.querySelector("#listaItens")) renderizarItensPedido();
        }
      } else if (document.querySelector("#gridMesas")) {
        mostrarMesas();
      } else if (document.querySelector("#listaContas")) {
        carregarContasAguardando();
      } else if (document.querySelector("#lista")) {
        renderizarListaProdutos();
      }
    } catch (e) {
      console.error("Erro no processamento do Realtime:", e);
    } finally {
      atualizacaoEmAndamento = false;
    }
  }
})();
