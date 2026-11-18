```javascript
    document.querySelector("#salvarFuncionario").onclick = cadastrarFuncionario;
    document.querySelector("#voltarFuncionarios").onclick = mostrarInicio;

    await carregarFuncionarios();
  }

  async function cadastrarFuncionario() {
    if (!exigirAdministrador()) return;

    const nome = document.querySelector("#funcNome").value.trim();
    const email = document.querySelector("#funcEmail").value.trim().toLowerCase();
    const senha = document.querySelector("#funcSenha").value;
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
      aviso.textContent = "A senha inicial deve ter pelo menos 8 caracteres.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Cadastrando...";

    try {
      const { data: sessaoData } = await supabase.auth.getSession();
      const token = sessaoData.session?.access_token;

      if (!token) throw new Error("Sessão administrativa não encontrada.");

      const resposta = await fetch(
        `${SUPABASE_URL}/functions/v1/gerenciar-funcionarios`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": SUPABASE_KEY
          },
          body: JSON.stringify({
            acao: "criar",
            nome,
            email,
            senha,
            funcao: "garcom"
          })
        }
      );

      const resultado = await resposta.json();

      if (!resposta.ok || resultado.error) {
        throw new Error(resultado.error || resultado.message || "Falha ao cadastrar funcionário.");
      }

      aviso.textContent = "Garçom cadastrado com sucesso.";
      document.querySelector("#funcNome").value = "";
      document.querySelector("#funcEmail").value = "";
      document.querySelector("#funcSenha").value = "";

      await carregarFuncionarios();
    } catch (e) {
      aviso.textContent = "Erro: " + e.message;
    } finally {
      botao.disabled = false;
      botao.textContent = "Cadastrar garçom";
    }
  }

  async function carregarFuncionarios() {
    if (!exigirAdministrador()) return;

    const lista = document.querySelector("#listaFuncionarios");
    if (!lista) return;

    lista.textContent = "Carregando...";

    try {
      const { data, error: e } = await supabase.from("perfis_usuarios")
        .select("id,nome,funcao,ativo,criado_em")
        .order("nome", { ascending: true });

      if (e) throw e;

      const funcionarios = (data || []).filter(f =>
        ["garcom", "caixa", "administrador"].includes(f.funcao)
      );

      if (!funcionarios.length) {
        lista.textContent = "Nenhum funcionário cadastrado.";
        return;
      }

      lista.innerHTML = "";

      funcionarios.forEach(funcionario => {
        const linha = document.createElement("div");
        linha.className = "item-pedido";

        const descricao = document.createElement("p");
        descricao.textContent =
          `${funcionario.nome} — ${funcionario.funcao} — ` +
          (funcionario.ativo ? "Ativo" : "Inativo");

        linha.appendChild(descricao);

        if (funcionario.funcao === "garcom") {
          const botao = document.createElement("button");
          botao.textContent = funcionario.ativo ? "Desativar garçom" : "Reativar garçom";
          botao.onclick = () => alterarStatusFuncionario(
            funcionario.id,
            !funcionario.ativo
          );
          linha.appendChild(botao);
        }

        lista.appendChild(linha);
      });
    } catch (e) {
      lista.textContent = "Não foi possível carregar os funcionários: " + e.message;
    }
  }

  async function alterarStatusFuncionario(id, ativo) {
    if (!exigirAdministrador()) return;

    const acao = ativo ? "reativar" : "desativar";

    if (!confirm(`Deseja ${acao} este garçom?`)) return;

    try {
      const { data: sessaoData } = await supabase.auth.getSession();
      const token = sessaoData.session?.access_token;

      if (!token) throw new Error("Sessão administrativa não encontrada.");

      const resposta = await fetch(
        `${SUPABASE_URL}/functions/v1/gerenciar-funcionarios`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": SUPABASE_KEY
          },
          body: JSON.stringify({
            acao,
            funcionario_id: id
          })
        }
      );

      const resultado = await resposta.json();

      if (!resposta.ok || resultado.error) {
        throw new Error(resultado.error || resultado.message || "Falha ao alterar funcionário.");
      }

      mensagem(ativo ? "Garçom reativado." : "Garçom desativado.");
      await carregarFuncionarios();
    } catch (e) {
      erro("Não foi possível alterar o funcionário.", e);
    }
  }

  async function sair() {
    try {
      if (canalRealtime) {
        await supabase.removeChannel(canalRealtime);
        canalRealtime = null;
      }

      await supabase.auth.signOut();
      usuarioAtual = null;
      perfilAtual = null;
      pedidoAtual = null;
      mostrarLogin();
    } catch (e) {
      erro("Não foi possível sair.", e);
    }
  }

  async function atualizarTudo() {
    try {
      await carregarProdutos();
      await carregarMesas();
      mostrarInicio();
    } catch (e) {
      erro("Não foi possível atualizar o sistema.", e);
    }
  }

  // PRODUTOS

  async function carregarProdutos() {
    const { data, error: e } = await supabase.from("produtos")
      .select("*")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (e) throw e;
    produtos = data || [];
  }

  function mostrarProdutos() {
    if (!exigirAdministrador()) return;

    limpar();
    painel.innerHTML = `
      <h2>Produtos</h2>
      <div class="item-pedido">
        <h3>Cadastrar produto</h3>
        <label>Nome</label>
        <input id="produtoNome" type="text" placeholder="Nome do produto">
        <label>Código interno (opcional)</label>
        <input id="produtoCodigo" type="text" placeholder="Código">
        <label>Categoria</label>
        <select id="produtoCategoria">
          <option value="comida">Comida</option>
          <option value="bebida">Bebida</option>
          <option value="petiscos">Petiscos</option>
          <option value="drinks">Drinks</option>
          <option value="bebidas sem álcool">Bebidas sem álcool</option>
        </select>
        <label>Preço de venda</label>
        <input id="produtoPreco" type="number" min="0" step="0.01">
        <label>Custo de compra</label>
        <input id="produtoCusto" type="number" min="0" step="0.01">
        <label>Estoque inicial</label>
        <input id="produtoEstoque" type="number" min="0" step="0.01" value="0">
        <label>Estoque mínimo</label>
        <input id="produtoMinimo" type="number" min="0" step="0.01" value="0">
        <button id="salvarProduto">Salvar produto</button>
        <p id="avisoProduto"></p>
      </div>
      <h3>Produtos cadastrados</h3>
      <div id="listaProdutos"></div>
      <button id="voltarProdutos">Voltar</button>
    `;

    document.querySelector("#salvarProduto").onclick = salvarProduto;
    document.querySelector("#voltarProdutos").onclick = mostrarInicio;
    renderizarProdutos();
  }

  async function salvarProduto() {
    if (!exigirAdministrador()) return;

    const nome = document.querySelector("#produtoNome").value.trim();
    const codigo = document.querySelector("#produtoCodigo").value.trim();
    const categoria = document.querySelector("#produtoCategoria").value;
    const preco = Number(document.querySelector("#produtoPreco").value);
    const custo = Number(document.querySelector("#produtoCusto").value);
    const estoque = Number(document.querySelector("#produtoEstoque").value);
    const minimo = Number(document.querySelector("#produtoMinimo").value);
    const aviso = document.querySelector("#avisoProduto");

    if (!nome || !Number.isFinite(preco) || preco < 0 ||
        !Number.isFinite(custo) || custo < 0 ||
        !Number.isFinite(estoque) || estoque < 0 ||
        !Number.isFinite(minimo) || minimo < 0) {
      aviso.textContent = "Preencha os campos com valores válidos.";
      return;
    }

    try {
      const { error: e } = await supabase.from("produtos").insert({
        nome,
        codigo: codigo || null,
        categoria,
        preco_venda: preco,
        custo,
        estoque,
        estoque_minimo: minimo,
        ativo: true
      });

      if (e) throw e;

      mensagem("Produto cadastrado.");
      await carregarProdutos();
      mostrarProdutos();
    } catch (e) {
      erro("Não foi possível cadastrar o produto.", e);
    }
  }

  function renderizarProdutos() {
    const lista = document.querySelector("#listaProdutos");
    if (!lista) return;

    lista.innerHTML = "";

    if (!produtos.length) {
      lista.textContent = "Nenhum produto ativo cadastrado.";
      return;
    }

    produtos.forEach(produto => {
      const item = document.createElement("div");
      item.className = "item-pedido";

      const texto = document.createElement("p");
      texto.textContent =
        `${produto.nome} — ${produto.categoria} — ` +
        `${dinheiro(produto.preco_venda)} — Estoque: ${produto.estoque}`;

      const editar = document.createElement("button");
      editar.textContent = "Editar";
      editar.onclick = () => editarProduto(produto);

      const desativar = document.createElement("button");
      desativar.textContent = "Desativar";
      desativar.onclick = () => desativarProduto(produto.id);

      item.append(texto, editar, desativar);
      lista.appendChild(item);
    });
  }

  function editarProduto(produto) {
    if (!exigirAdministrador()) return;

    limpar();
    painel.innerHTML = `
      <h2>Editar produto</h2>
      <label>Nome</label>
      <input id="editarNome" type="text" value="${escapar(produto.nome)}">
      <label>Código interno</label>
      <input id="editarCodigo" type="text" value="${escapar(produto.codigo || "")}">
      <label>Categoria</label>
      <select id="editarCategoria">
        <option value="comida">Comida</option>
        <option value="bebida">Bebida</option>
        <option value="petiscos">Petiscos</option>
        <option value="drinks">Drinks</option>
        <option value="bebidas sem álcool">Bebidas sem álcool</option>
      </select>
      <label>Preço de venda</label>
      <input id="editarPreco" type="number" min="0" step="0.01" value="${Number(produto.preco_venda || 0)}">
      <label>Custo</label>
      <input id="editarCusto" type="number" min="0" step="0.01" value="${Number(produto.custo || 0)}">
      <button id="atualizarProduto">Salvar alterações</button>
      <button id="cancelarEdicao">Cancelar</button>
      <p id="avisoEdicao"></p>
    `;

    document.querySelector("#editarCategoria").value = produto.categoria;
    document.querySelector("#atualizarProduto").onclick = () => atualizarProduto(produto.id);
    document.querySelector("#cancelarEdicao").onclick = mostrarProdutos;
  }

  async function atualizarProduto(id) {
    if (!exigirAdministrador()) return;

    const nome = document.querySelector("#editarNome").value.trim();
    const codigo = document.querySelector("#editarCodigo").value.trim();
    const categoria = document.querySelector("#editarCategoria").value;
    const preco = Number(document.querySelector("#editarPreco").value);
    const custo = Number(document.querySelector("#editarCusto").value);
    const aviso = document.querySelector("#avisoEdicao");

    if (!nome || !Number.isFinite(preco) || preco < 0 ||
        !Number.isFinite(custo) || custo < 0) {
      aviso.textContent = "Informe nome, preço e custo válidos.";
      return;
    }

    try {
      const { error: e } = await supabase.from("produtos")
        .update({
          nome,
          codigo: codigo || null,
          categoria,
          preco_venda: preco,
          custo
        })
        .eq("id", id);

      if (e) throw e;

      mensagem("Produto atualizado.");
      await carregarProdutos();
      mostrarProdutos();
    } catch (e) {
      erro("Não foi possível atualizar o produto.", e);
    }
  }

  async function desativarProduto(id) {
    if (!exigirAdministrador()) return;
    if (!confirm("Deseja desativar este produto?")) return;

    try {
      const { error: e } = await supabase.from("produtos")
        .update({ ativo: false })
        .eq("id", id);

      if (e) throw e;

      await carregarProdutos();
      mostrarProdutos();
    } catch (e) {
      erro("Não foi possível desativar o produto.", e);
    }
  }

  // ESTOQUE
