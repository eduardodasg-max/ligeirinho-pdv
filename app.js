
/* =====================================================
   LIGEIRINHO PDV
   Reconstrução da aplicação
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

      <button id="mesas">Controle de mesas</button>
      ${temPermissao("administrador")
        ? '<button id="produtos">Produtos</button>' : ""}
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
    }

    if (temPermissao("administrador", "caixa")) {
      document.querySelector("#contas").onclick =
        carregarContasAguardando;
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
    aguardandoRedefinicao = false;

    mostrarLogin();
  }

  async function atualizarTudo() {
    await carregarProdutos();
    await carregarMesas();
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
  }

  function mostrarProdutos() {
    limpar();

    painel.innerHTML = `
      <h2>Produtos</h2>
      <button id="novo">Novo produto</button>
      <button id="voltar">Voltar</button>
      <div id="lista"></div>
    `;

    document.querySelector("#novo").onclick = () => formularioProduto();
    document.querySelector("#voltar").onclick = mostrarInicio;

    const lista = document.querySelector("#lista");

    if (!produtos.length) {
      lista.textContent = "Nenhum produto cadastrado.";
      return;
    }

    produtos.forEach(produto => {
      const linha = document.createElement("div");
      linha.className = "item-pedido";

      const texto = document.createElement("span");
      texto.textContent =
        `${produto.nome} — ${dinheiro(produto.preco_venda)} — Estoque: ${produto.estoque}`;

      const editar = document.createElement("button");
      editar.textContent = "Editar";
      editar.onclick = () => formularioProduto(produto);

      linha.append(texto, editar);
      lista.appendChild(linha);
    });
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

      <label>Código</label>
      <input id="codigo">

      <label>Nome</label>
      <input id="nome">

      <label>Categoria</label>
      <select id="categoria">
        <option value="">Selecione</option>
        ${categorias.map(c =>
          `<option value="${escapar(c)}">${escapar(c)}</option>`
        ).join("")}
      </select>

      <label>Preço de venda</label>
      <input id="preco" type="number" min="0" step="0.01">

      <label>Custo</label>
      <input id="custo" type="number" min="0" step="0.01">

      <label>Estoque</label>
      <input id="estoque" type="number" min="0" step="0.001">

      <label>Estoque mínimo</label>
      <input id="minimo" type="number" min="0" step="0.001">

      <button id="salvar">Salvar</button>
      <button id="cancelar">Voltar</button>
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
      estoque: Number(document.querySelector("#estoque").value || 0),
      estoque_minimo: Number(document.querySelector("#minimo").value || 0),
      ativo: true
    };

    if (!registro.nome || !registro.categoria ||
        !Number.isFinite(registro.preco_venda) ||
        registro.preco_venda < 0) {
      mensagem("Confira o nome, a categoria e o preço.");
      return;
    }

    try {
      let consulta = supabase.from("produtos");

      const resultado = produto
        ? await consulta.update(registro).eq("id", produto.id)
        : await consulta.insert(registro);

      if (resultado.error) throw resultado.error;

      await carregarProdutos();
      mostrarProdutos();
      mensagem("Produto salvo.");
    } catch (erro) {
      mostrarErro("Não foi possível salvar o produto.", erro);
    }
  }
