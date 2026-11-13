/* =========================================================
   LIGEIRINHO PDV — APP.JS
   Caixa + Mesas + Produtos + Estoque + Pedidos + Pagamentos
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
    }

    if (temPermissao("administrador", "caixa")) {
      document.querySelector("#caixa").onclick = mostrarCaixa;
      document.querySelector("#contas").onclick = carregarContasAguardando;
    }

    atualizarAvisosEstoque();
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
    mostrarInicio();
  }

  // ALERTAS DE ESTOQUE

  function calcularAlertasEstoque() {
    const ativos = produtos.filter(p => p.ativo);
    const zerados = ativos.filter(p => Number(p.estoque || 0) <= 0);
    const baixos = ativos.filter(p =>
      Number(p.estoque || 0) > 0 &&
      Number(p.estoque || 0) <= Number(p.estoque_minimo || 0)
    );
    return { ativos, zerados, baixos };
  }

  function atualizarAvisosEstoque() {
    const area = document.querySelector("#alertasEstoqueInicio");
    if (!area) return;

    const a = calcularAlertasEstoque();
    if (!a.zerados.length && !a.baixos.length) {
      area.innerHTML = "<p>✅ Estoque em dia. Nenhum produto baixo ou zerado.</p>";
      return;
    }

    area.innerHTML = `
      <div class="item-pedido">
        <strong>⚠️ Atenção ao estoque</strong>
        <p>${a.zerados.length} produto(s) zerado(s) e ${a.baixos.length} com estoque baixo.</p>
        ${a.zerados.map(p => `<p>🔴 ${escapar(p.nome)} — zerado</p>`).join("")}
        ${a.baixos.map(p => `<p>🟡 ${escapar(p.nome)} — saldo ${p.estoque}</p>`).join("")}
        ${temPermissao("administrador") ? '<button id="abrirAlertasEstoque">Abrir estoque</button>' : ""}
      </div>
    `;

    const botao = document.querySelector("#abrirAlertasEstoque");
    if (botao) botao.onclick = mostrarEstoque;
  }

  // PRODUTOS

  async function carregarProdutos() {
    const { data, error: e } = await supabase.from("produtos")
      .select("*").order("nome");
    if (e) throw e;
    produtos = data || [];
    atualizarAvisosEstoque();
  }

  function mostrarProdutos() {
    limpar();
    painel.innerHTML = `
      <h2>Produtos</h2>
      <button id="novo">Novo produto</button>
      <button id="voltar">Voltar</button>
      <label>Pesquisar</label>
      <input id="pesquisaProduto" placeholder="Nome ou código">
      <label>Categoria</label>
      <select id="filtroCategoria">
        <option value="">Todas</option>
        ${[...new Set(produtos.map(p => p.categoria).filter(Boolean))]
          .map(c => `<option value="${escapar(c)}">${escapar(c)}</option>`).join("")}
      </select>
      <label>Situação</label>
      <select id="filtroStatus">
        <option value="ativos">Ativos</option>
        <option value="inativos">Inativos</option>
        <option value="todos">Todos</option>
      </select>
      <div id="resumoProdutos"></div>
      <div id="listaProdutos"></div>
    `;

    document.querySelector("#novo").onclick = () => formularioProduto();
    document.querySelector("#voltar").onclick = mostrarInicio;
    ["pesquisaProduto", "filtroCategoria", "filtroStatus"].forEach(id => {
      document.querySelector("#" + id).oninput = renderizarProdutos;
      document.querySelector("#" + id).onchange = renderizarProdutos;
    });
    renderizarProdutos();
  }

  function renderizarProdutos() {
    const lista = document.querySelector("#listaProdutos");
    if (!lista) return;

    const busca = document.querySelector("#pesquisaProduto").value.toLowerCase();
    const categoria = document.querySelector("#filtroCategoria").value;
    const status = document.querySelector("#filtroStatus").value;

    let filtrados = produtos.filter(p => {
      if (status === "ativos" && !p.ativo) return false;
      if (status === "inativos" && p.ativo) return false;
      if (categoria && p.categoria !== categoria) return false;
      return String(p.nome || "").toLowerCase().includes(busca) ||
        String(p.codigo || "").toLowerCase().includes(busca);
    });

    document.querySelector("#resumoProdutos").textContent =
      `Total: ${produtos.length} | Encontrados: ${filtrados.length}`;

    lista.innerHTML = "";
    if (!filtrados.length) {
      lista.textContent = "Nenhum produto encontrado.";
      return;
    }

    filtrados.forEach(p => {
      const linha = document.createElement("div");
      linha.className = "item-pedido";
      const texto = document.createElement("p");
      texto.textContent =
        `${p.nome} — ${dinheiro(p.preco_venda)} — Custo: ${dinheiro(p.custo)} — Estoque: ${p.estoque} — Mínimo: ${p.estoque_minimo} — ${p.categoria} — ${p.ativo ? "ATIVO" : "INATIVO"}`;
      const editar = document.createElement("button");
      editar.textContent = "Editar";
      editar.onclick = () => formularioProduto(p);
      const statusBotao = document.createElement("button");
      statusBotao.textContent = p.ativo ? "Desativar" : "Reativar";
      statusBotao.onclick = () => alterarStatusProduto(p);
      linha.append(texto, editar, statusBotao);
      lista.appendChild(linha);
    });
  }

  async function verificarCodigoDuplicado(codigo, atual) {
    if (!codigo) return false;
    let consulta = supabase.from("produtos").select("id").ilike("codigo", codigo);
    if (atual?.id) consulta = consulta.neq("id", atual.id);
    const { data, error: e } = await consulta.limit(1);
    if (e) throw e;
    return (data || []).length > 0;
  }

  async function alterarStatusProduto(p) {
    if (!exigirAdministrador()) return;
    if (!confirm(`Deseja ${p.ativo ? "desativar" : "reativar"} ${p.nome}?`)) return;
    try {
      const { error: e } = await supabase.from("produtos")
        .update({ ativo: !p.ativo }).eq("id", p.id);
      if (e) throw e;
      await carregarProdutos();
      mostrarProdutos();
    } catch (e) {
      erro("Não foi possível alterar o produto.", e);
    }
  }

  function formularioProduto(p = null) {
    if (!exigirAdministrador()) return;
    limpar();
    const categorias = ["Comida", "Bebida", "Petiscos", "Drinks", "Bebidas sem álcool"];

    painel.innerHTML = `
      <h2>${p ? "Editar produto" : "Novo produto"}</h2>
      <label>Código</label><input id="codigo">
      <label>Nome</label><input id="nome">
      <label>Categoria</label>
      <select id="categoria">
        <option value="">Selecione</option>
        ${categorias.map(c => `<option value="${escapar(c)}">${escapar(c)}</option>`).join("")}
      </select>
      <label>Preço de venda</label><input id="preco" type="number" min="0" step="0.01">
      <label>Custo</label><input id="custo" type="number" min="0" step="0.01">
      <label>${p ? "Estoque atual (use movimentações para alterar)" : "Estoque inicial"}</label>
      <input id="estoque" type="number" min="0" step="0.001" ${p ? "readonly" : ""}>
      <label>Estoque mínimo</label><input id="minimo" type="number" min="0" step="0.001">
      <button id="salvar">Salvar produto</button>
      <button id="cancelar">Voltar</button>
      <p id="avisoProduto"></p>
    `;

    if (p) {
      document.querySelector("#codigo").value = p.codigo || "";
      document.querySelector("#nome").value = p.nome || "";
      document.querySelector("#categoria").value = p.categoria || "";
      document.querySelector("#preco").value = p.preco_venda ?? 0;
      document.querySelector("#custo").value = p.custo ?? 0;
      document.querySelector("#estoque").value = p.estoque ?? 0;
      document.querySelector("#minimo").value = p.estoque_minimo ?? 0;
    }

    document.querySelector("#salvar").onclick = () => salvarProduto(p);
    document.querySelector("#cancelar").onclick = mostrarProdutos;
  }

  async function salvarProduto(p) {
    const registro = {
      codigo: document.querySelector("#codigo").value.trim() || null,
      nome: document.querySelector("#nome").value.trim(),
      categoria: document.querySelector("#categoria").value,
      preco_venda: Number(document.querySelector("#preco").value),
      custo: Number(document.querySelector("#custo").value || 0),
      estoque_minimo: Number(document.querySelector("#minimo").value || 0)
    };
    const inicial = Number(document.querySelector("#estoque").value || 0);
    const aviso = document.querySelector("#avisoProduto");

    if (!registro.nome || !registro.categoria ||
        !Number.isFinite(registro.preco_venda) || registro.preco_venda < 0 ||
        !Number.isFinite(registro.custo) || registro.custo < 0 ||
        !Number.isFinite(registro.estoque_minimo) || registro.estoque_minimo < 0 ||
        (!p && (!Number.isFinite(inicial) || inicial < 0))) {
      aviso.textContent = "Confira os campos e valores.";
      return;
    }

    try {
      if (registro.codigo && await verificarCodigoDuplicado(registro.codigo, p)) {
        aviso.textContent = "Já existe produto com esse código.";
        return;
      }

      let resultado;
      if (p) {
        resultado = await supabase.from("produtos").update(registro).eq("id", p.id);
      } else {
        resultado = await supabase.from("produtos").insert({
          ...registro, estoque: inicial, ativo: true
        });
      }
      if (resultado.error) throw resultado.error;
      await carregarProdutos();
      mostrarProdutos();
      mensagem("Produto salvo com sucesso.");
    } catch (e) {
      erro("Não foi possível salvar o produto.", e);
    }
  }

  // ESTOQUE E MOVIMENTAÇÕES

  function mostrarEstoque() {
    if (!exigirAdministrador()) return;
    const ativos = produtos.filter(p => p.ativo);
    const zerados = ativos.filter(p => Number(p.estoque) <= 0);
    const baixos = ativos.filter(p =>
      Number(p.estoque) > 0 && Number(p.estoque) <= Number(p.estoque_minimo || 0)
    );

    limpar();
    painel.innerHTML = `
      <h2>Estoque</h2>
      <p>Produtos ativos: ${ativos.length}</p>
      <p>Estoque zerado: ${zerados.length}</p>
      <p>Estoque baixo: ${baixos.length}</p>
      <button id="movimentar">Registrar movimentação</button>
      <button id="historico">Histórico</button>
      <button id="voltar">Voltar</button>
      <h3>Produtos com estoque baixo ou zerado</h3>
      <div id="listaEstoque"></div>
    `;
    document.querySelector("#movimentar").onclick = formularioMovimentacaoEstoque;
    document.querySelector("#historico").onclick = historicoEstoque;
    document.querySelector("#voltar").onclick = mostrarInicio;

    const lista = document.querySelector("#listaEstoque");
    [...zerados, ...baixos].forEach(p => {
      const item = document.createElement("p");
      item.textContent = `${p.nome} — saldo: ${p.estoque} — mínimo: ${p.estoque_minimo}`;
      lista.appendChild(item);
    });
    if (!zerados.length && !baixos.length) lista.textContent = "Estoque em dia.";
  }

  function formularioMovimentacaoEstoque() {
    if (!exigirAdministrador()) return;
    const ativos = produtos.filter(p => p.ativo);
    if (!ativos.length) {
      mensagem("Não há produtos ativos.");
      return;
    }

    limpar();
    painel.innerHTML = `
      <h2>Movimentação de estoque</h2>
      <label>Produto</label>
      <select id="movProduto">
        <option value="">Selecione</option>
        ${ativos.map(p => `<option value="${p.id}">${escapar(p.nome)} — saldo ${p.estoque}</option>`).join("")}
      </select>
      <label>Tipo</label>
      <select id="movTipo">
        <option value="entrada">Entrada</option>
        <option value="saida">Saída</option>
        <option value="ajuste">Ajuste de saldo</option>
      </select>
      <label id="rotuloQuantidade">Quantidade</label>
      <input id="movQuantidade" type="number" min="0.001" step="0.001">
      <label>Motivo</label>
      <textarea id="movMotivo" rows="3"></textarea>
      <button id="salvarMovimento">Registrar</button>
      <button id="voltar">Voltar</button>
      <p id="avisoMovimento"></p>
    `;

    const tipo = document.querySelector("#movTipo");
    tipo.onchange = () => {
      document.querySelector("#rotuloQuantidade").textContent =
        tipo.value === "ajuste" ? "Novo saldo contado" : "Quantidade";
      document.querySelector("#movQuantidade").min =
        tipo.value === "ajuste" ? "0" : "0.001";
    };
    document.querySelector("#salvarMovimento").onclick = registrarMovimentacaoEstoque;
    document.querySelector("#voltar").onclick = mostrarEstoque;
  }

  async function registrarMovimentacaoEstoque() {
    if (!exigirAdministrador()) return;

    const produtoId = document.querySelector("#movProduto").value;
    const tipo = document.querySelector("#movTipo").value;
    const quantidade = Number(document.querySelector("#movQuantidade").value);
    const motivo = document.querySelector("#movMotivo").value.trim();
    const aviso = document.querySelector("#avisoMovimento");

    if (!produtoId || !Number.isFinite(quantidade) || quantidade < 0 ||
        (tipo !== "ajuste" && quantidade <= 0) || !motivo) {
      aviso.textContent = "Informe produto, quantidade válida e motivo.";
      return;
    }

    try {
      const { error: e } = await supabase.rpc("registrar_movimentacao_estoque", {
        p_produto_id: produtoId,
        p_tipo: tipo,
        p_quantidade: quantidade,
        p_motivo: motivo
      });
      if (e) throw e;
      await carregarProdutos();
      mensagem("Movimentação registrada.");
      mostrarEstoque();
    } catch (e) {
      erro("Não foi possível movimentar o estoque.", e);
    }
  }

  async function historicoEstoque() {
    if (!exigirAdministrador()) return;
    limpar();
    painel.innerHTML = `
      <h2>Histórico de estoque</h2>
      <button id="voltar">Voltar ao estoque</button>
      <div id="listaHistorico">Carregando...</div>
    `;
    document.querySelector("#voltar").onclick = mostrarEstoque;

    try {
      const { data, error: e } = await supabase.from("movimentacoes_estoque")
        .select("id,produto_id,operador_id,pedido_id,tipo,quantidade,motivo,criado_em")
        .is("pedido_id", null)
        .order("criado_em", { ascending: false });
      if (e) throw e;

      const movimentos = data || [];
      const produtoIds = [...new Set(movimentos.map(m => m.produto_id).filter(Boolean))];
      const operadorIds = [...new Set(movimentos.map(m => m.operador_id).filter(Boolean))];

      const nomesProdutos = {};
      const nomesOperadores = {};

      if (produtoIds.length) {
        const r = await supabase.from("produtos").select("id,nome").in("id", produtoIds);
        if (r.error) throw r.error;
        (r.data || []).forEach(p => nomesProdutos[p.id] = p.nome);
      }

      if (operadorIds.length) {
        const r = await supabase.from("perfis_usuarios").select("id,nome").in("id", operadorIds);
        if (r.error) throw r.error;
        (r.data || []).forEach(p => nomesOperadores[p.id] = p.nome);
      }

      const lista = document.querySelector("#listaHistorico");
      lista.innerHTML = "";

      if (!movimentos.length) {
        lista.textContent = "Nenhuma movimentação registrada.";
        return;
      }

      movimentos.forEach(m => {
        const item = document.createElement("div");
        item.className = "item-pedido";
        item.textContent =
          `${new Date(m.criado_em).toLocaleString("pt-BR")} — ${m.tipo} — ${nomesProdutos[m.produto_id] || "Produto"} — quantidade: ${m.quantidade} — ${m.motivo || ""} — Operador: ${nomesOperadores[m.operador_id] || "Não identificado"}`;
        lista.appendChild(item);
      });
    } catch (e) {
      erro("Não foi possível carregar o histórico.", e);
    }
  }

  // CAIXA

  async function buscarCaixaAberto() {
    const { data, error: e } = await supabase.from("caixas")
      .select("*")
      .eq("status", "aberto")
      .order("aberto_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e) throw e;
    return data;
  }

  async function mostrarCaixa() {
    if (!exigirCaixa()) return;
    limpar();
    painel.innerHTML = `
      <h2>Controle de caixa</h2>
      <div id="resumoCaixa">Consultando...</div>
      <div id="acoesCaixa"></div>
      <button id="historicoCaixa">Histórico de caixas</button>
      <button id="voltar">Voltar</button>
    `;
    document.querySelector("#voltar").onclick = mostrarInicio;
    document.querySelector("#historicoCaixa").onclick = historicoCaixa;

    try {
      const caixa = await buscarCaixaAberto();
      const resumo = document.querySelector("#resumoCaixa");
      const acoes = document.querySelector("#acoesCaixa");

      if (!caixa) {
        resumo.innerHTML = "<p><strong>Nenhum caixa aberto.</strong></p>";
        acoes.innerHTML = `
          <label>Valor inicial do caixa (R$)</label>
          <input id="valorInicial" type="number" min="0" step="0.01" value="0">
          <button id="abrirCaixa">Abrir caixa</button>
        `;
        document.querySelector("#abrirCaixa").onclick = abrirCaixa;
        return;
      }

      const inicial = Number(caixa.valor_inicial || 0);
      const esperado = Number(caixa.valor_esperado ?? inicial);

      resumo.innerHTML = `
        <div class="item-pedido">
          <strong>CAIXA ABERTO</strong>
          <p>Operador: ${escapar(perfilAtual.nome)}</p>
          <p>Abertura: ${caixa.aberto_em ? new Date(caixa.aberto_em).toLocaleString("pt-BR") : "—"}</p>
          <p>Valor inicial: <strong>${dinheiro(inicial)}</strong></p>
          <p>Saldo esperado: <strong>${dinheiro(esperado)}</strong></p>
        </div>
      `;

      acoes.innerHTML = `
        <h3>Movimentação de caixa</h3>
        <label>Tipo</label>
        <select id="tipoMovCaixa">
          <option value="suprimento">Suprimento</option>
          <option value="sangria">Sangria</option>
        </select>
        <label>Valor (R$)</label>
        <input id="valorMovCaixa" type="number" min="0.01" step="0.01">
        <label>Descrição / motivo</label>
        <input id="descricaoMovCaixa" maxlength="250" placeholder="Informe o motivo">
        <button id="registrarMovCaixa">Registrar movimentação</button>
        <hr>
        <h3>Fechamento</h3>
        <label>Valor contado no caixa (R$)</label>
        <input id="valorContado" type="number" min="0" step="0.01">
        <label>Justificativa da diferença</label>
        <textarea id="justificativaFechamento" rows="3"></textarea>
        <button id="fecharCaixa">Fechar caixa</button>
      `;

      document.querySelector("#registrarMovCaixa").onclick = registrarMovimentacaoCaixa;
      document.querySelector("#fecharCaixa").onclick = fecharCaixa;
    } catch (e) {
      erro("Não foi possível consultar o caixa.", e);
    }
  }

  async function abrirCaixa() {
    if (!exigirCaixa()) return;
    const valor = Number(document.querySelector("#valorInicial").value);

    if (!Number.isFinite(valor) || valor < 0) {
      mensagem("Informe um valor inicial válido.");
      return;
    }

    try {
      const { error: e } = await supabase.rpc("abrir_caixa", {
        p_valor_inicial: valor
      });
      if (e) throw e;
      mensagem("Caixa aberto com sucesso.");
      await mostrarCaixa();
    } catch (e) {
      erro("Não foi possível abrir o caixa.", e);
    }
  }

  async function registrarMovimentacaoCaixa() {
    if (!exigirCaixa()) return;

    const tipo = document.querySelector("#tipoMovCaixa").value;
    const valor = Number(document.querySelector("#valorMovCaixa").value);
    const descricao = document.querySelector("#descricaoMovCaixa").value.trim();

    if (!Number.isFinite(valor) || valor <= 0 || !descricao) {
      mensagem("Informe valor maior que zero e descrição.");
      return;
    }

    try {
      const { error: e } = await supabase.rpc("registrar_movimentacao_caixa", {
        p_tipo: tipo,
        p_valor: valor,
        p_descricao: descricao
      });
      if (e) throw e;
      mensagem(tipo === "sangria" ? "Sangria registrada." : "Suprimento registrado.");
      await mostrarCaixa();
    } catch (e) {
      erro("Não foi possível registrar a movimentação.", e);
    }
  }

  async function fecharCaixa() {
    if (!exigirCaixa()) return;

    const contado = Number(document.querySelector("#valorContado").value);
    const justificativa = document.querySelector("#justificativaFechamento").value.trim();

    if (!Number.isFinite(contado) || contado < 0) {
      mensagem("Informe o valor contado.");
      return;
    }

    try {
      const caixa = await buscarCaixaAberto();
      if (!caixa) throw new Error("Não existe caixa aberto.");

      const esperado = Number(caixa.valor_esperado ?? caixa.valor_inicial ?? 0);
      const diferenca = Number((contado - esperado).toFixed(2));

      if (Math.abs(diferenca) >= 0.01 && !justificativa) {
        mensagem("A justificativa é obrigatória quando existe diferença.");
        return;
      }

      if (!confirm(
        `Confirma o fechamento?\nEsperado: ${dinheiro(esperado)}\nContado: ${dinheiro(contado)}\nDiferença: ${dinheiro(diferenca)}`
      )) return;

      const { data, error: e } = await supabase.rpc("fechar_caixa", {
        p_valor_contado: contado,
        p_justificativa: justificativa || null,
        p_caixa_id: caixa.id
      });
      if (e) throw e;

      mensagem("Caixa fechado com sucesso.");
      await mostrarCaixa();
    } catch (e) {
      erro("Não foi possível fechar o caixa.", e);
    }
  }

  async function historicoCaixa() {
    if (!exigirCaixa()) return;
    limpar();
    painel.innerHTML = `
      <h2>Histórico de caixas</h2>
      <button id="atualizar">Atualizar histórico</button>
      <button id="voltar">Voltar ao caixa</button>
      <div id="listaCaixas">Carregando...</div>
    `;
    document.querySelector("#atualizar").onclick = historicoCaixa;
    document.querySelector("#voltar").onclick = mostrarCaixa;

    try {
      const { data, error: e } = await supabase.from("caixas")
        .select("*")
        .order("aberto_em", { ascending: false })
        .limit(100);
      if (e) throw e;

      const caixas = data || [];
      const ids = [...new Set(caixas.map(c => c.operador_id).filter(Boolean))];
      const nomes = {};

      if (ids.length) {
        const r = await supabase.from("perfis_usuarios")
          .select("id,nome").in("id", ids);
        if (r.error) throw r.error;
        (r.data || []).forEach(p => nomes[p.id] = p.nome);
      }

      const lista = document.querySelector("#listaCaixas");
      lista.innerHTML = "";

      if (!caixas.length) {
        lista.textContent = "Nenhum caixa registrado.";
        return;
      }

      caixas.forEach(c => {
        const item = document.createElement("div");
        item.className = "item-pedido";
        item.innerHTML = `
          <strong>${escapar(String(c.status || "").toUpperCase())}</strong>
          <p>Operador: ${escapar(nomes[c.operador_id] || "Não identificado")}</p>
          <p>Abertura: ${c.aberto_em ? new Date(c.aberto_em).toLocaleString("pt-BR") : "—"}</p>
          <p>Fechamento: ${c.fechado_em ? new Date(c.fechado_em).toLocaleString("pt-BR") : "Em aberto"}</p>
          <p>Inicial: ${dinheiro(c.valor_inicial)}</p>
          <p>Esperado: ${dinheiro(c.valor_esperado)}</p>
          <p>Contado: ${c.valor_contado == null ? "—" : dinheiro(c.valor_contado)}</p>
          <p>Diferença: ${c.diferenca == null ? "—" : dinheiro(c.diferenca)}</p>
          <p>Justificativa: ${escapar(c.justificativa || "—")}</p>
        `;
        lista.appendChild(item);
      });
    } catch (e) {
      erro("Não foi possível carregar o histórico de caixas.", e);
    }
  }

  // MESAS

  async function carregarMesas() {
    const { data, error: e } = await supabase.from("mesas")
      .select("*").order("numero");
    if (e) throw e;
    mesas = data || [];
  }

  function mostrarMesas() {
    limpar();
    painel.innerHTML = `
      <h2>Controle de mesas</h2>
      <button id="voltar">Voltar</button>
      <div class="legenda-mesas">
        <span class="legenda-livre">● Livre</span>
        <span class="legenda-ocupada">● Ocupada</span>
        <span class="legenda-aguardando">● Aguardando pagamento</span>
      </div>
      <div id="gradeMesas"></div>
    `;
    document.querySelector("#voltar").onclick = mostrarInicio;

    const grade = document.querySelector("#gradeMesas");

    mesas.forEach(mesa => {
      const botao = document.createElement("button");
      const status = String(mesa.status || "").toLowerCase();

      const classe = status === "livre" ? "mesa-livre" :
        status === "ocupada" ? "mesa-ocupada" :
        status === "aguardando_pagamento" ? "mesa-aguardando" :
        "mesa-desconhecida";

      botao.className = "mesa " + classe;
      const nomeStatus = status === "aguardando_pagamento"
        ? "Aguardando pagamento"
        : (mesa.status || "Status não definido");

      botao.textContent = `Mesa ${mesa.numero} — ${nomeStatus}`;
      botao.onclick = () => selecionarMesa(mesa);
      grade.appendChild(botao);
    });
  }

  async function selecionarMesa(mesa) {
    if (mesa.status === "livre") {
      await abrirMesa(mesa);
      return;
    }

    const { data, error: e } = await supabase.from("pedidos")
      .select("*")
      .eq("mesa_id", mesa.id)
      .eq("status", "aberto")
      .maybeSingle();

    if (e) {
      erro("Erro ao consultar pedido.", e);
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
      const { error: e } = await supabase.rpc("abrir_mesa", {
        p_mesa_id: mesa.id,
        p_garcom_id: usuarioAtual.id
      });
      if (e) throw e;

      await carregarMesas();

      const { data, error: ep } = await supabase.from("pedidos")
        .select("*")
        .eq("mesa_id", mesa.id)
        .eq("status", "aberto")
        .single();
      if (ep) throw ep;

      pedidoAtual = data;
      await carregarItensPedido();
      mostrarPedido(mesas.find(m => m.id === mesa.id) || mesa);
    } catch (e) {
      erro("Não foi possível abrir a mesa.", e);
    }
  }

  // PEDIDOS E ITENS — itens_pedido É VENDA, NÃO É PERDA

  async function carregarItensPedido() {
    const { data, error: e } = await supabase.from("itens_pedido")
      .select("id,produto_id,quantidade,preco_unitario,subtotal,observacao,status_producao")
      .eq("pedido_id", pedidoAtual.id)
      .order("criado_em");
    if (e) throw e;
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
      <input id="quantidade" type="number" min="0.001" step="0.001" value="1">
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
    let total = 0;

    if (!itens.length) {
      area.textContent = "Nenhum item neste pedido.";
    }

    itens.forEach(item => {
      const produto = produtos.find(p => p.id === item.produto_id);
      const linha = document.createElement("div");
      linha.className = "item-pedido";
      const subtotal = Number(item.subtotal || 0);
      total += subtotal;

      const texto = document.createElement("p");
      texto.textContent =
        `${produto?.nome || "Produto"} — ${item.quantidade} x ${dinheiro(item.preco_unitario)} = ${dinheiro(subtotal)}` +
        (item.observacao ? ` — ${item.observacao}` : "");

      linha.appendChild(texto);

      if (temPermissao("administrador", "garcom")) {
        const remover = document.createElement("button");
        remover.textContent = "Remover item";
        remover.onclick = () => removerItem(item.id);
        linha.appendChild(remover);
      }

      area.appendChild(linha);
    });

    const totalEl = document.createElement("h3");
    totalEl.textContent = "Total dos itens: " + dinheiro(total);
    area.appendChild(totalEl);
  }

  async function adicionarItem() {
    const produtoId = document.querySelector("#produto").value;
    const quantidade = Number(document.querySelector("#quantidade").value);
    const observacao = document.querySelector("#observacao").value.trim();

    if (!produtoId || !Number.isFinite(quantidade) || quantidade <= 0) {
      mensagem("Selecione um produto e informe quantidade válida.");
      return;
    }

    try {
      const { error: e } = await supabase.rpc("adicionar_item_pedido", {
        p_pedido_id: pedidoAtual.id,
        p_produto_id: produtoId,
        p_quantidade: quantidade,
        p_observacao: observacao || null
      });
      if (e) throw e;

      await atualizarPedidoAtual();
      mensagem("Item adicionado.");
    } catch (e) {
      erro("Não foi possível adicionar o item.", e);
    }
  }

  async function removerItem(itemId) {
    if (!confirm("Deseja remover este item?")) return;
    try {
      const { error: e } = await supabase.rpc("remover_item_pedido", {
        p_item_id: itemId
      });
      if (e) throw e;
      await atualizarPedidoAtual();
    } catch (e) {
      erro("Não foi possível remover o item.", e);
    }
  }

  async function atualizarPedidoAtual() {
    const { data, error: e } = await supabase.from("pedidos")
      .select("*").eq("id", pedidoAtual.id).single();
    if (e) throw e;
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
      const { error: e } = await supabase.rpc("solicitar_fechamento_conta", {
        p_pedido_id: pedidoAtual.id
      });
      if (e) throw e;

      await carregarMesas();
      pedidoAtual = null;
      mensagem("Conta enviada ao caixa.");
      mostrarMesas();
    } catch (e) {
      erro("Não foi possível solicitar o fechamento.", e);
    }
  }

  // CONTAS AGUARDANDO PAGAMENTO

  async function carregarContasAguardando() {
    if (!exigirCaixa()) return;
    try {
      const { data, error: e } = await supabase.rpc("listar_contas_aguardando_pagamento");
      if (e) throw e;
      mostrarContasAguardando(data || []);
    } catch (e) {
      erro("Não foi possível carregar as contas.", e);
    }
  }

  function mostrarContasAguardando(contas) {
    limpar();
    painel.innerHTML = `
      <h2>Contas aguardando pagamento</h2>
      <button id="atualizar">Atualizar</button>
      <button id="voltar">Voltar</button>
      <div id="listaContas"></div>
    `;
    document.querySelector("#atualizar").onclick = carregarContasAguardando;
    document.querySelector("#voltar").onclick = mostrarInicio;

    const lista = document.querySelector("#listaContas");

    if (!contas.length) {
      lista.textContent = "Não há contas aguardando pagamento.";
      return;
    }

    contas.forEach(conta => {
      const item = document.createElement("div");
      item.className = "item-pedido";

      const mesa = conta.mesa_numero ?? conta.numero_mesa ?? conta.mesa ?? "—";
      const total = Number(conta.valor_total ?? conta.total ?? conta.valor ?? 0);
      const garcom = conta.garcom_nome ?? conta.nome_garcom ?? conta.garcom ?? "";

      const texto = document.createElement("p");
      texto.textContent = `Mesa ${mesa} — ${dinheiro(total)}` +
        (garcom ? ` — Garçom: ${garcom}` : "");

      const pagar = document.createElement("button");
      pagar.textContent = "Registrar pagamento";
      pagar.onclick = () => mostrarFormularioPagamento(conta);

      item.append(texto, pagar);
      lista.appendChild(item);
    });
  }

  function mostrarFormularioPagamento(conta) {
    if (!exigirCaixa()) return;

    const pedidoId = conta.pedido_id ?? conta.id_pedido ?? conta.id;
    const total = Number(conta.valor_total ?? conta.total ?? conta.valor ?? 0);

    limpar();
    painel.innerHTML = `
      <h2>Registrar pagamento</h2>
      <p>Valor da conta: <strong>${dinheiro(total)}</strong></p>
      <label>Forma de pagamento</label>
      <select id="formaPagamento">
        <option value="dinheiro">Dinheiro</option>
        <option value="pix">Pix</option>
        <option value="debito">Débito</option>
        <option value="credito">Crédito</option>
      </select>
      <label>Valor a pagar</label>
      <input id="valorPagamento" type="number" min="0.01" step="0.01" value="${total.toFixed(2)}">
      <div id="campoRecebido">
        <label>Valor recebido em dinheiro</label>
        <input id="valorRecebido" type="number" min="0" step="0.01" value="${total.toFixed(2)}">
      </div>
      <button id="confirmarPagamento">Confirmar pagamento</button>
      <button id="voltar">Voltar</button>
      <p id="mensagemPagamento"></p>
    `;

    const forma = document.querySelector("#formaPagamento");
    forma.onchange = () => {
      document.querySelector("#campoRecebido").style.display =
        forma.value === "dinheiro" ? "block" : "none";
    };

    document.querySelector("#confirmarPagamento").onclick =
      () => registrarPagamento(pedidoId);
    document.querySelector("#voltar").onclick = carregarContasAguardando;
  }

  async function registrarPagamento(pedidoId) {
    if (!exigirCaixa()) return;

    const forma = document.querySelector("#formaPagamento").value;
    const valor = Number(document.querySelector("#valorPagamento").value);
    const recebido = forma === "dinheiro"
      ? Number(document.querySelector("#valorRecebido").value)
      : null;

    const aviso = document.querySelector("#mensagemPagamento");

    if (!pedidoId || !Number.isFinite(valor) || valor <= 0) {
      aviso.textContent = "Informe um valor válido.";
      return;
    }

    if (forma === "dinheiro" &&
        (!Number.isFinite(recebido) || recebido < valor)) {
      aviso.textContent = "O valor recebido deve ser igual ou maior que o pagamento.";
      return;
    }

    try {
      const { error: e } = await supabase.rpc("registrar_pagamento", {
        p_pedido_id: pedidoId,
        p_forma_pagamento: forma,
        p_valor: valor,
        p_valor_recebido: recebido
      });
      if (e) throw e;

      mensagem("Pagamento registrado.");
      await carregarProdutos();
      await carregarMesas();
      await carregarContasAguardando();
    } catch (e) {
      erro("Não foi possível registrar o pagamento.", e);
    }
  }

  // ATUALIZAÇÃO EM TEMPO REAL

  function iniciarRealtime() {
    if (canalRealtime) {
      supabase.removeChannel(canalRealtime);
      canalRealtime = null;
    }

    canalRealtime = supabase.channel("ligeirinho-atualizacoes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        async () => {
          try {
            await carregarMesas();
            if (document.querySelector("#gradeMesas")) mostrarMesas();
          } catch (e) {
            console.error("Erro ao atualizar mesas:", e);
          }
        }
      )
      .on("postgres_changes",
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
          } catch (e) {
            console.error("Erro ao atualizar pedidos:", e);
          }
        }
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "itens_pedido" },
        async () => {
          try {
            if (pedidoAtual?.id) await atualizarPedidoAtual();
          } catch (e) {
            console.error("Erro ao atualizar itens:", e);
          }
        }
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "produtos" },
        async () => {
          try {
            await carregarProdutos();
            if (document.querySelector("#listaProdutos")) renderizarProdutos();
            if (document.querySelector("#listaEstoque")) mostrarEstoque();
          } catch (e) {
            console.error("Erro ao atualizar produtos:", e);
          }
        }
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "movimentacoes_estoque" },
        async () => {
          try {
            await carregarProdutos();
            if (document.querySelector("#listaEstoque")) mostrarEstoque();
          } catch (e) {
            console.error("Erro ao atualizar estoque:", e);
          }
        }
      )
      .subscribe();
  }

})();
