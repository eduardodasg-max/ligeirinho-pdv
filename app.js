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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

      const excluir = document.createElement("button");
      excluir.textContent = "Excluir";
      excluir.style.background = "#b83232";
      excluir.onclick = () => excluirProduto(p);

      linha.append(texto, editar, statusBotao, excluir);
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
      const { data, error: e } = await supabase.from("produtos")
        .update({ ativo: !p.ativo })
        .eq("id", p.id)
        .select("id")
        .maybeSingle();

      if (e) throw e;
      if (!data) throw new Error("O banco não confirmou a alteração. Verifique as permissões RLS.");

      await carregarProdutos();
      mostrarProdutos();
    } catch (e) {
      erro("Não foi possível alterar o produto.", e);
    }
  }

  // EXCLUSÃO SEGURA DE PRODUTOS

  async function excluirProduto(p) {
    if (!exigirAdministrador()) return;

    if (!p?.id) {
      mensagem("Não foi possível identificar o produto.");
      return;
    }

    const nome = p.nome || "este produto";

    if (!confirm(
      `Deseja excluir "${nome}"?\n\n` +
      "O sistema verificará se existe histórico de venda, perda ou movimentação de estoque. " +
      "Se houver histórico, o produto será desativado para preservar os registros. " +
      "Se não houver histórico, será excluído definitivamente."
    )) return;

    try {
      // produto_id existe nas três tabelas consultadas.
      // Usamos essa coluna para verificar o histórico sem depender
      // de uma coluna id que não foi confirmada em todas elas.

      const verificacoes = await Promise.all([
        supabase.from("itens_pedido")
          .select("produto_id")
          .eq("produto_id", p.id)
          .limit(1),

        supabase.from("itens_perdidos")
          .select("produto_id")
          .eq("produto_id", p.id)
          .limit(1),

        supabase.from("movimentacoes_estoque")
          .select("produto_id")
          .eq("produto_id", p.id)
          .limit(1)
      ]);

      const erroConsulta = verificacoes.find(r => r.error);
      if (erroConsulta) throw erroConsulta.error;

      const possuiHistorico = verificacoes.some(
        r => Array.isArray(r.data) && r.data.length > 0
      );

      if (possuiHistorico) {
        const { data, error: erroAtualizacao } = await supabase
          .from("produtos")
          .update({ ativo: false })
          .eq("id", p.id)
          .select("id")
          .maybeSingle();

        if (erroAtualizacao) throw erroAtualizacao;
        if (!data) {
          throw new Error("O banco não confirmou a desativação do produto. Verifique as permissões RLS.");
        }

        mensagem(
          `O produto "${nome}" possui histórico de vendas, perdas ou estoque. ` +
          "Para preservar os registros, ele foi desativado."
        );
      } else {
        const { data, error: erroExclusao } = await supabase
          .from("produtos")
          .delete()
          .eq("id", p.id)
          .select("id")
          .maybeSingle();

        if (erroExclusao) throw erroExclusao;
        if (!data) {
          throw new Error("O banco não confirmou a exclusão. Verifique as permissões RLS ou se existe alguma referência ao produto.");
        }

        mensagem(`Produto "${nome}" excluído com sucesso.`);
      }

      await carregarProdutos();
      mostrarProdutos();

    } catch (e) {
      console.error("Erro ao excluir produto:", e);

      const detalhes = [
        e?.message,
        e?.details,
        e?.hint,
        e?.code
      ].filter(Boolean).join(" | ");

      mensagem(
        "Não foi possível concluir a operação do produto.\n" +
        (detalhes || String(e))
      );
    }
  }

  function formularioProduto(p = null) {
    if (!exigirAdministrador()) return;
    limpar();

    const categorias = [
      { valor: "comida", rotulo: "Comida" },
      { valor: "bebida", rotulo: "Bebida" },
      { valor: "petiscos", rotulo: "Petiscos" },
      { valor: "drinks", rotulo: "Drinks" },
      { valor: "bebidas sem álcool", rotulo: "Bebidas sem álcool" }
    ];

    painel.innerHTML = `
      <h2>${p ? "Editar produto" : "Novo produto"}</h2>
      <label>Código</label><input id="codigo" autocomplete="off">
      <label>Nome</label><input id="nome" autocomplete="off">
      <label>Categoria</label>
      <select id="categoria">
        <option value="">Selecione</option>
        ${categorias.map(c => `<option value="${escapar(c.valor)}">${escapar(c.rotulo)}</option>`).join("")}
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
    if (!exigirAdministrador()) return;

    const campo = id => document.querySelector(id);
    const aviso = campo("#avisoProduto");
    const botao = campo("#salvar");
    if (!aviso || !botao) return;

    const precoTexto = campo("#preco").value.trim();
    const custoTexto = campo("#custo").value.trim();
    const minimoTexto = campo("#minimo").value.trim();
    const estoqueTexto = campo("#estoque").value.trim();

    const registro = {
      codigo: campo("#codigo").value.trim() || null,
      nome: campo("#nome").value.trim(),
      categoria: campo("#categoria").value,
      preco_venda: precoTexto === "" ? NaN : Number(precoTexto),
      custo: custoTexto === "" ? 0 : Number(custoTexto),
      estoque_minimo: minimoTexto === "" ? 0 : Number(minimoTexto)
    };

    const inicial = estoqueTexto === "" ? 0 : Number(estoqueTexto);

    if (!registro.nome) {
      aviso.textContent = "Informe o nome do produto.";
      return;
    }

    if (!["comida", "bebida", "petiscos", "drinks", "bebidas sem álcool"].includes(registro.categoria)) {
      aviso.textContent = "Selecione uma categoria válida.";
      return;
    }

    if (!Number.isFinite(registro.preco_venda) || registro.preco_venda < 0 ||
        !Number.isFinite(registro.custo) || registro.custo < 0 ||
        !Number.isFinite(registro.estoque_minimo) || registro.estoque_minimo < 0 ||
        (!p && (!Number.isFinite(inicial) || inicial < 0))) {
      aviso.textContent = "Informe valores numéricos válidos. O preço de venda é obrigatório.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Salvando...";
    aviso.textContent = "";

    try {
      if (registro.codigo && await verificarCodigoDuplicado(registro.codigo, p)) {
        aviso.textContent = "Já existe produto com esse código.";
        return;
      }

      let resultado;

      if (p) {
        resultado = await supabase.from("produtos")
          .update(registro)
          .eq("id", p.id)
          .select("id")
          .maybeSingle();
      } else {
        resultado = await supabase.from("produtos")
          .insert({ ...registro, estoque: inicial, ativo: true })
          .select("id")
          .single();
      }

      if (resultado.error) throw resultado.error;

      if (!resultado.data) {
        throw new Error("O Supabase não confirmou a gravação. Verifique as permissões RLS da tabela produtos.");
      }

      await carregarProdutos();
      mostrarProdutos();
      mensagem(p ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso.");
    } catch (e) {
      console.error("Erro detalhado ao salvar produto:", e);
      const detalhes = [e?.message, e?.details, e?.hint, e?.code]
        .filter(Boolean).join(" | ");
      aviso.textContent = "Não foi possível salvar o produto: " + (detalhes || String(e));
    } finally {
      if (campo("#salvar")) {
        botao.disabled = false;
        botao.textContent = "Salvar produto";
      }
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
        <button id="relatorioCaixaAtual">Relatório deste caixa</button>
      `;

      document.querySelector("#registrarMovCaixa").onclick = registrarMovimentacaoCaixa;
      document.querySelector("#fecharCaixa").onclick = fecharCaixa;
      document.querySelector("#relatorioCaixaAtual").onclick = () => relatorioCaixa(caixa.id);
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

      const { error: e } = await supabase.rpc("fechar_caixa", {
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
        const botaoRelatorio = document.createElement("button");
        botaoRelatorio.textContent = "Ver relatório completo";
        botaoRelatorio.onclick = () => relatorioCaixa(c.id, true);
        item.appendChild(botaoRelatorio);
        lista.appendChild(item);
      });
    } catch (e) {
      erro("Não foi possível carregar o histórico de caixas.", e);
    }
  }

  // RELATÓRIO DE CAIXA
  // Pagamentos filtrados pelo caixa_id e data pago_em.
  // Movimentações filtradas pelo caixa_id e data criado_em.

  async function relatorioCaixa(caixaId, voltarParaHistorico = false) {
    if (!exigirCaixa()) return;

    if (!caixaId) {
      mensagem("Não foi possível identificar o caixa.");
      return;
    }

    limpar();
    painel.innerHTML = `
      <h2>Relatório de caixa</h2>
      <p id="statusRelatorio">Carregando informações...</p>
      <div id="relatorioImpressao"></div>
      <div class="botoes-relatorio">
        <button id="imprimirRelatorio" disabled>Imprimir relatório</button>
        <button id="voltarRelatorio">Voltar</button>
      </div>
    `;

    document.querySelector("#voltarRelatorio").onclick = () => {
      if (voltarParaHistorico) historicoCaixa();
      else mostrarCaixa();
    };

    try {
      const { data: caixa, error: erroCaixa } = await supabase
        .from("caixas")
        .select("*")
        .eq("id", caixaId)
        .single();

      if (erroCaixa) throw erroCaixa;
      if (!caixa) throw new Error("Caixa não encontrado.");

      // Busca diretamente os pagamentos vinculados a este caixa.
      // Não utiliza pedidos.fechado_em para identificar pagamentos.
      const [resultadoPagamentos, resultadoMovimentos] = await Promise.all([
        supabase.from("pagamentos")
          .select("id,pedido_id,forma_pagamento,valor,valor_recebido,troco,pago_em,caixa_id")
          .eq("caixa_id", caixaId)
          .order("pago_em", { ascending: true }),

        supabase.from("movimentacoes_caixa")
          .select("id,caixa_id,operador_id,tipo,valor,descricao,criado_em")
          .eq("caixa_id", caixaId)
          .order("criado_em", { ascending: true })
      ]);

      if (resultadoPagamentos.error) throw resultadoPagamentos.error;
      if (resultadoMovimentos.error) throw resultadoMovimentos.error;

      const pagamentos = resultadoPagamentos.data || [];
      const movimentos = resultadoMovimentos.data || [];

      // Soma os pagamentos deste caixa, agrupando por forma.
      const totalPorForma = {};

      pagamentos.forEach(p => {
        const forma = String(p.forma_pagamento || "não informado");
        totalPorForma[forma] = (totalPorForma[forma] || 0) + Number(p.valor || 0);
      });

      const totalPagamentos = pagamentos.reduce(
        (soma, p) => soma + Number(p.valor || 0), 0
      );

      const totalSuprimentos = movimentos
        .filter(m => String(m.tipo || "").toLowerCase() === "suprimento")
        .reduce((soma, m) => soma + Number(m.valor || 0), 0);

      const totalSangrias = movimentos
        .filter(m => String(m.tipo || "").toLowerCase() === "sangria")
        .reduce((soma, m) => soma + Number(m.valor || 0), 0);

      const valorInicial = Number(caixa.valor_inicial || 0);

      // O saldo esperado salvo na tabela caixas é o valor oficial
      // utilizado pelo fechamento. O cálculo abaixo serve como conferência.
      const saldoCalculado = Number(
        (valorInicial + totalPagamentos + totalSuprimentos - totalSangrias).toFixed(2)
      );

      const saldoEsperado = caixa.valor_esperado == null
        ? saldoCalculado
        : Number(caixa.valor_esperado);

      const valorContado = caixa.valor_contado == null
        ? null
        : Number(caixa.valor_contado);

      const diferenca = caixa.diferenca == null
        ? (valorContado == null
          ? null
          : Number((valorContado - saldoEsperado).toFixed(2)))
        : Number(caixa.diferenca);

      // Identifica o operador que abriu o caixa.
      let nomeOperador = "Não identificado";

      if (caixa.operador_id) {
        const resultadoOperador = await supabase.from("perfis_usuarios")
          .select("nome")
          .eq("id", caixa.operador_id)
          .maybeSingle();

        if (resultadoOperador.error) throw resultadoOperador.error;

        nomeOperador = resultadoOperador.data?.nome || nomeOperador;
      }

      const formas = Object.entries(totalPorForma);

      const formasHtml = formas.length
        ? formas.map(([forma, valor]) => `
            <tr>
              <td>${escapar(forma.toUpperCase())}</td>
              <td class="valor-relatorio">${dinheiro(valor)}</td>
            </tr>
          `).join("")
        : '<tr><td colspan="2">Nenhum pagamento registrado neste caixa.</td></tr>';

      const pagamentosHtml = pagamentos.length
        ? pagamentos.map(p => `
            <tr>
              <td>${p.pago_em ? new Date(p.pago_em).toLocaleString("pt-BR") : "—"}</td>
              <td>${escapar(String(p.forma_pagamento || "—").toUpperCase())}</td>
              <td>${dinheiro(p.valor)}</td>
              <td>${dinheiro(p.valor_recebido)}</td>
              <td>${dinheiro(p.troco)}</td>
              <td>${escapar(p.pedido_id || "—")}</td>
            </tr>
          `).join("")
        : '<tr><td colspan="6">Nenhum pagamento registrado neste caixa.</td></tr>';

      const movimentosHtml = movimentos.length
        ? movimentos.map(m => `
            <tr>
              <td>${m.criado_em ? new Date(m.criado_em).toLocaleString("pt-BR") : "—"}</td>
              <td>${escapar(String(m.tipo || "—").toUpperCase())}</td>
              <td>${dinheiro(m.valor)}</td>
              <td>${escapar(m.descricao || "—")}</td>
            </tr>
          `).join("")
        : '<tr><td colspan="4">Nenhuma movimentação de caixa registrada.</td></tr>';

      const diferencaCalculo = Number((saldoEsperado - saldoCalculado).toFixed(2));

      document.querySelector("#relatorioImpressao").innerHTML = `
        <div class="relatorio-caixa">
          <h2>🚤 Ligeirinho PDV — Relatório de Caixa</h2>

          <p><strong>Situação:</strong> ${escapar(String(caixa.status || "").toUpperCase())}</p>
          <p><strong>Operador da abertura:</strong> ${escapar(nomeOperador)}</p>
          <p><strong>Abertura:</strong> ${caixa.aberto_em ? new Date(caixa.aberto_em).toLocaleString("pt-BR") : "—"}</p>
          <p><strong>Fechamento:</strong> ${caixa.fechado_em ? new Date(caixa.fechado_em).toLocaleString("pt-BR") : "Caixa ainda aberto"}</p>

          <h3>Resumo financeiro</h3>
          <table>
            <tbody>
              <tr>
                <td>Valor inicial</td>
                <td class="valor-relatorio">${dinheiro(valorInicial)}</td>
              </tr>
              <tr>
                <td>Total de pagamentos deste caixa</td>
                <td class="valor-relatorio">${dinheiro(totalPagamentos)}</td>
              </tr>
              <tr>
                <td>Suprimentos</td>
                <td class="valor-relatorio">${dinheiro(totalSuprimentos)}</td>
              </tr>
              <tr>
                <td>Sangrias</td>
                <td class="valor-relatorio">${dinheiro(totalSangrias)}</td>
              </tr>
              <tr>
                <td><strong>Saldo calculado</strong></td>
                <td class="valor-relatorio">${dinheiro(saldoCalculado)}</td>
              </tr>
              <tr>
                <td><strong>Saldo esperado registrado no caixa</strong></td>
                <td class="valor-relatorio">${dinheiro(saldoEsperado)}</td>
              </tr>
              <tr>
                <td>Diferença entre cálculo e saldo registrado</td>
                <td class="valor-relatorio">${dinheiro(diferencaCalculo)}</td>
              </tr>
              <tr>
                <td>Valor contado no fechamento</td>
                <td class="valor-relatorio">${valorContado == null ? "Ainda não fechado" : dinheiro(valorContado)}</td>
              </tr>
              <tr>
                <td>Diferença do fechamento</td>
                <td class="valor-relatorio">${diferenca == null ? "—" : dinheiro(diferenca)}</td>
              </tr>
            </tbody>
          </table>

          <h3>Pagamentos por forma</h3>
          <table>
            <thead>
              <tr><th>Forma de pagamento</th><th>Total</th></tr>
            </thead>
            <tbody>${formasHtml}</tbody>
          </table>

          <h3>Detalhamento dos pagamentos</h3>
          <table>
            <thead>
              <tr>
                <th>Data do pagamento</th>
                <th>Forma</th>
                <th>Valor</th>
                <th>Recebido</th>
                <th>Troco</th>
                <th>Pedido</th>
              </tr>
            </thead>
            <tbody>${pagamentosHtml}</tbody>
          </table>

          <h3>Suprimentos e sangrias</h3>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>${movimentosHtml}</tbody>
          </table>

          <p><strong>Justificativa da diferença:</strong> ${escapar(caixa.justificativa || "—")}</p>
          <p><small>Relatório gerado em ${new Date().toLocaleString("pt-BR")}</small></p>
        </div>
      `;

      document.querySelector("#statusRelatorio").textContent =
        "Relatório carregado. Confira os valores antes de imprimir.";

      document.querySelector("#imprimirRelatorio").disabled = false;
      document.querySelector("#imprimirRelatorio").onclick = () => window.print();

    } catch (e) {
      erro("Não foi possível gerar o relatório do caixa.", e);

      const status = document.querySelector("#statusRelatorio");
      if (status) {
        status.textContent =
          "Falha ao carregar o relatório. Confira as permissões e os dados das tabelas.";
      }
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

    mesas.forEach(m => {
      const botao = document.createElement("button");
      botao.className = "mesa";

      if (m.status === "livre") {
        botao.classList.add("mesa-livre");
      } else if (m.status === "ocupada") {
        botao.classList.add("mesa-ocupada");
      } else if (m.status === "aguardando_pagamento") {
        botao.classList.add("mesa-aguardando");
      } else {
        botao.classList.add("mesa-desconhecida");
      }

      botao.innerHTML = `
        <strong>Mesa ${escapar(m.numero)}</strong>
        <span>${escapar(String(m.status || "").replace("_", " "))}</span>
      `;

      botao.onclick = () => selecionarMesa(m);
      grade.appendChild(botao);
    });
  }

  async function selecionarMesa(mesa) {
    if (!mesa?.id) return;

    if (mesa.status === "livre") {
      await abrirMesa(mesa);
      return;
    }

    const { data, error: e } = await supabase.from("pedidos")
      .select("*")
      .eq("mesa_id", mesa.id)
      .in("status", ["aberto", "aguardando_pagamento"])
      .order("aberto_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (e) {
      erro("Não foi possível consultar o pedido da mesa.", e);
      return;
    }

    if (!data) {
      mensagem("Não foi encontrado pedido aberto para esta mesa.");
      await carregarMesas();
      mostrarMesas();
      return;
    }

    pedidoAtual = data;
    await mostrarPedido();
  }

  async function abrirMesa(mesa) {
    if (!mesa?.id) return;

    try {
      const { data, error: e } = await supabase.rpc("abrir_mesa", {
        p_mesa_id: mesa.id,
        p_garcom_id: usuarioAtual.id
      });

      if (e) throw e;

      const pedidoId = typeof data === "string" ? data : data?.id;
      if (!pedidoId) throw new Error("A abertura da mesa não retornou o pedido.");

      const { data: pedido, error: erroPedido } = await supabase.from("pedidos")
        .select("*")
        .eq("id", pedidoId)
        .single();

      if (erroPedido) throw erroPedido;

      pedidoAtual = pedido;
      await carregarMesas();
      await mostrarPedido();
    } catch (e) {
      erro("Não foi possível abrir a mesa.", e);
    }
  }

  async function mostrarPedido() {
    if (!pedidoAtual?.id) return;

    limpar();

    painel.innerHTML = `
      <h2>Pedido da mesa</h2>
      <div id="dadosPedido">Carregando pedido...</div>
      <div id="listaItensPedido"></div>
      <div id="totalPedido"></div>
      <div id="acoesPedido"></div>
      <button id="voltarMesas">Voltar às mesas</button>
    `;

    document.querySelector("#voltarMesas").onclick = async () => {
      pedidoAtual = null;
      await carregarMesas();
      mostrarMesas();
    };

    await atualizarPedidoAtual();
  }

  async function atualizarPedidoAtual() {
    if (!pedidoAtual?.id) return;

    const { data: pedido, error: erroPedido } = await supabase.from("pedidos")
      .select("*")
      .eq("id", pedidoAtual.id)
      .single();

    if (erroPedido) throw erroPedido;
    if (!pedido) return;

    pedidoAtual = pedido;

    const { data: itens, error: erroItens } = await supabase.from("itens_pedido")
      .select("id,pedido_id,produto_id,quantidade,preco_unitario,subtotal,observacao")
      .eq("pedido_id", pedido.id)
      .order("id");

    if (erroItens) throw erroItens;

    const itensPedido = itens || [];
    const produtosIds = [...new Set(itensPedido.map(i => i.produto_id).filter(Boolean))];
    const nomesProdutos = {};

    if (produtosIds.length) {
      const resultadoProdutos = await supabase.from("produtos")
        .select("id,nome")
        .in("id", produtosIds);

      if (resultadoProdutos.error) throw resultadoProdutos.error;

      (resultadoProdutos.data || []).forEach(p => {
        nomesProdutos[p.id] = p.nome;
      });
    }

    const mesa = mesas.find(m => m.id === pedido.mesa_id);
    const dados = document.querySelector("#dadosPedido");
    const lista = document.querySelector("#listaItensPedido");
    const total = document.querySelector("#totalPedido");
    const acoes = document.querySelector("#acoesPedido");

    if (!dados || !lista || !total || !acoes) return;

    dados.innerHTML = `
      <p><strong>Mesa:</strong> ${escapar(mesa?.numero ?? "—")}</p>
      <p><strong>Status:</strong> ${escapar(pedido.status)}</p>
      <p><strong>Aberto em:</strong> ${pedido.aberto_em ? new Date(pedido.aberto_em).toLocaleString("pt-BR") : "—"}</p>
    `;

    lista.innerHTML = "";

    if (!itensPedido.length) {
      lista.textContent = "Nenhum item neste pedido.";
    } else {
      itensPedido.forEach(item => {
        const linha = document.createElement("div");
        linha.className = "item-pedido";

        const nomeProduto = nomesProdutos[item.produto_id] || "Produto";
        linha.innerHTML = `
          <strong>${escapar(nomeProduto)}</strong>
          <p>Quantidade: ${escapar(item.quantidade)}</p>
          <p>Valor unitário: ${dinheiro(item.preco_unitario)}</p>
          <p>Subtotal: ${dinheiro(item.subtotal)}</p>
          <p>Observação: ${escapar(item.observacao || "—")}</p>
        `;

        if (pedido.status === "aberto") {
          const remover = document.createElement("button");
          remover.textContent = "Remover item";
          remover.onclick = () => removerItemPedido(item.id);
          linha.appendChild(remover);
        }

        lista.appendChild(linha);
      });
    }

    const valorTotal = Number(pedido.valor_total || 0);
    total.innerHTML = `<h3>Total: ${dinheiro(valorTotal)}</h3>`;

    acoes.innerHTML = "";

    if (pedido.status === "aberto") {
      if (temPermissao("administrador", "garcom")) {
        const adicionar = document.createElement("button");
        adicionar.textContent = "Adicionar produto";
        adicionar.onclick = formularioAdicionarItem;
        acoes.appendChild(adicionar);
      }

      if (temPermissao("administrador", "garcom")) {
        const fechar = document.createElement("button");
        fechar.textContent = "Solicitar fechamento da conta";
        fechar.onclick = solicitarFechamentoConta;
        acoes.appendChild(fechar);
      }
    }

    if (pedido.status === "aguardando_pagamento") {
      if (temPermissao("administrador", "caixa")) {
        const pagamento = document.createElement("button");
        pagamento.textContent = "Registrar pagamento";
        pagamento.onclick = () => registrarPagamento(pedido);
        acoes.appendChild(pagamento);
      }
    }
  }

  function formularioAdicionarItem() {
    if (!temPermissao("administrador", "garcom")) {
      mensagem("Você não tem permissão para adicionar itens.");
      return;
    }

    const ativos = produtos.filter(p => p.ativo);

    if (!ativos.length) {
      mensagem("Não há produtos ativos cadastrados.");
      return;
    }

    const area = document.querySelector("#acoesPedido");

    area.innerHTML = `
      <h3>Adicionar produto</h3>
      <label>Produto</label>
      <select id="produtoPedido">
        <option value="">Selecione</option>
        ${ativos.map(p => `<option value="${p.id}">${escapar(p.nome)} — ${dinheiro(p.preco_venda)}</option>`).join("")}
      </select>
      <label>Quantidade</label>
      <input id="quantidadePedido" type="number" min="0.001" step="0.001" value="1">
      <label>Observação</label>
      <textarea id="observacaoPedido" rows="2"></textarea>
      <button id="confirmarItem">Adicionar</button>
      <button id="cancelarItem">Cancelar</button>
    `;

    document.querySelector("#confirmarItem").onclick = adicionarItemPedido;
    document.querySelector("#cancelarItem").onclick = atualizarPedidoAtual;
  }

  async function adicionarItemPedido() {
    if (!temPermissao("administrador", "garcom")) {
      mensagem("Você não tem permissão para adicionar itens.");
      return;
    }

    const produtoId = document.querySelector("#produtoPedido").value;
    const quantidade = Number(document.querySelector("#quantidadePedido").value);
    const observacao = document.querySelector("#observacaoPedido").value.trim();

    if (!produtoId || !Number.isFinite(quantidade) || quantidade <= 0) {
      mensagem("Selecione um produto e informe uma quantidade válida.");
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

      await carregarProdutos();
      await carregarMesas();
      await atualizarPedidoAtual();
      mensagem("Produto adicionado ao pedido.");
    } catch (e) {
      erro("Não foi possível adicionar o produto.", e);
    }
  }

  async function removerItemPedido(itemId) {
    if (!temPermissao("administrador", "garcom")) {
      mensagem("Você não tem permissão para remover itens.");
      return;
    }

    if (!confirm("Deseja remover este item do pedido?")) return;

    try {
      const { error: e } = await supabase.rpc("remover_item_pedido", {
        p_item_id: itemId
      });

      if (e) throw e;

      await carregarProdutos();
      await carregarMesas();
      await atualizarPedidoAtual();
      mensagem("Item removido.");
    } catch (e) {
      erro("Não foi possível remover o item.", e);
    }
  }

  async function solicitarFechamentoConta() {
    if (!temPermissao("administrador", "garcom")) {
      mensagem("Você não tem permissão para solicitar o fechamento.");
      return;
    }

    if (!pedidoAtual?.id) return;

    if (!confirm("Deseja enviar esta conta para o caixa?")) return;

    try {
      const { error: e } = await supabase.rpc("solicitar_fechamento_conta", {
        p_pedido_id: pedidoAtual.id
      });

      if (e) throw e;

      await carregarMesas();
      await atualizarPedidoAtual();
      mensagem("Conta enviada ao caixa. O pagamento será registrado pelo caixa ou administrador.");
    } catch (e) {
      erro("Não foi possível solicitar o fechamento da conta.", e);
    }
  }

  async function carregarContasAguardando() {
    if (!exigirCaixa()) return;

    limpar();
    painel.innerHTML = `
      <h2>Contas aguardando pagamento</h2>
      <button id="atualizarContas">Atualizar</button>
      <button id="voltarContas">Voltar</button>
      <div id="listaContas">Carregando...</div>
    `;

    document.querySelector("#atualizarContas").onclick = carregarContasAguardando;
    document.querySelector("#voltarContas").onclick = mostrarInicio;

    try {
      const { data, error: e } = await supabase.rpc("listar_contas_aguardando_pagamento");

      if (e) throw e;

      const lista = document.querySelector("#listaContas");
      lista.innerHTML = "";

      if (!data?.length) {
        lista.textContent = "Nenhuma conta aguardando pagamento.";
        return;
      }

      data.forEach(conta => {
        const item = document.createElement("div");
        item.className = "item-pedido";
        item.innerHTML = `
          <strong>Mesa ${escapar(conta.numero_mesa ?? conta.mesa_numero ?? "—")}</strong>
          <p>Total: ${dinheiro(conta.valor_total)}</p>
          <p>Pedido: ${escapar(conta.pedido_id || conta.id || "—")}</p>
        `;

        const botao = document.createElement("button");
        botao.textContent = "Abrir conta";
        botao.onclick = async () => {
          const id = conta.pedido_id || conta.id;
          const { data: pedido, error: erroPedido } = await supabase.from("pedidos")
            .select("*")
            .eq("id", id)
            .single();

          if (erroPedido) {
            erro("Não foi possível abrir a conta.", erroPedido);
            return;
          }

          pedidoAtual = pedido;
          await mostrarPedido();
        };

        item.appendChild(botao);
        lista.appendChild(item);
      });
    } catch (e) {
      erro("Não foi possível carregar as contas aguardando pagamento.", e);
    }
  }

  async function registrarPagamento(pedido) {
    if (!temPermissao("administrador", "caixa")) {
      mensagem("Somente caixa ou administrador pode registrar pagamentos.");
      return;
    }

    const total = Number(pedido.valor_total || 0);

    limpar();
    painel.innerHTML = `
      <h2>Registrar pagamento</h2>
      <p>Total da conta: <strong>${dinheiro(total)}</strong></p>
      <label>Forma de pagamento</label>
      <select id="formaPagamento">
        <option value="dinheiro">Dinheiro</option>
        <option value="pix">PIX</option>
        <option value="credito">Cartão de crédito</option>
        <option value="debito">Cartão de débito</option>
      </select>
      <label>Valor recebido</label>
      <input id="valorRecebido" type="number" min="0" step="0.01" value="${total.toFixed(2)}">
      <button id="confirmarPagamento">Confirmar pagamento</button>
      <button id="cancelarPagamento">Voltar</button>
    `;

    document.querySelector("#cancelarPagamento").onclick = mostrarPedido;
    document.querySelector("#confirmarPagamento").onclick = async () => {
      const forma = document.querySelector("#formaPagamento").value;
      const recebido = Number(document.querySelector("#valorRecebido").value);

      if (!Number.isFinite(recebido) || recebido < total) {
        mensagem("O valor recebido não pode ser menor que o total da conta.");
        return;
      }

      try {
        const { error: e } = await supabase.rpc("registrar_pagamento", {
          p_pedido_id: pedido.id,
          p_forma_pagamento: forma,
          p_valor: total,
          p_valor_recebido: recebido
        });

        if (e) throw e;

        pedidoAtual = null;
        await carregarMesas();
        await carregarProdutos();
        mensagem("Pagamento registrado com sucesso.");
        await carregarContasAguardando();
      } catch (e) {
        erro("Não foi possível registrar o pagamento.", e);
      }
    };
  }

  // TEMPO REAL

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
