
// LIGEIRINHO PDV
// Mesas e lançamento de pedidos

document.addEventListener("DOMContentLoaded", () => {
  const painel = document.querySelector(".painel");

  const produtos = [
    { nome: "Água mineral", preco: 5.00 },
    { nome: "Refrigerante", preco: 8.00 },
    { nome: "Suco", preco: 10.00 },
    { nome: "Cerveja", preco: 12.00 },
    { nome: "Porção de batata", preco: 30.00 },
    { nome: "Hambúrguer", preco: 28.00 }
  ];

  const pedidos = {};
  let mesaAtual = null;

  function mostrarMesas() {
    painel.innerHTML = `
      <h2>Controle de Mesas</h2>
      <p>Selecione uma mesa para iniciar o atendimento.</p>
      <div id="mesas" class="mesas"></div>
    `;

    const area = document.querySelector("#mesas");

    for (let numero = 1; numero <= 50; numero++) {
      const botao = document.createElement("button");
      botao.textContent = numero;
      botao.className = "mesa";

      botao.addEventListener("click", () => {
        mesaAtual = numero;

        if (!pedidos[numero]) {
          pedidos[numero] = [];
        }

        mostrarPedido();
      });

      area.appendChild(botao);
    }
  }

  function mostrarPedido() {
    painel.innerHTML = `
      <h2>Mesa ${mesaAtual}</h2>

      <label>Produto</label>
      <select id="produto">
        <option value="">Selecione um produto</option>
        ${produtos.map((p, i) =>
          `<option value="${i}">${p.nome}</option>`
        ).join("")}
      </select>

      <label>Quantidade</label>
      <input id="quantidade" type="number" min="1" step="1" value="1">

      <p id="preco">Preço: R$ 0,00</p>

      <button id="adicionar">Adicionar pedido</button>
      <button id="voltar">Voltar às mesas</button>

      <h3>Itens da mesa</h3>
      <div id="lista"></div>

      <h2 id="total">Total: R$ 0,00</h2>
    `;

    document.querySelector("#produto")
      .addEventListener("change", atualizarPreco);

    document.querySelector("#quantidade")
      .addEventListener("input", atualizarPreco);

    document.querySelector("#adicionar")
      .addEventListener("click", adicionar);

    document.querySelector("#voltar")
      .addEventListener("click", mostrarMesas);

    atualizarLista();
  }

  function atualizarPreco() {
    const indice = document.querySelector("#produto").value;
    const qtd = Number(document.querySelector("#quantidade").value);
    const produto = produtos[indice];

    document.querySelector("#preco").textContent =
      produto && qtd > 0
        ? `Preço: R$ ${(produto.preco * qtd).toFixed(2).replace(".", ",")}`
        : "Preço: R$ 0,00";
  }

  function adicionar() {
    const indice = document.querySelector("#produto").value;
    const qtd = Number(document.querySelector("#quantidade").value);
    const produto = produtos[indice];

    if (
      indice === "" ||
      !produto ||
      !Number.isInteger(qtd) ||
      qtd < 1
    ) {
      alert("Selecione um produto e uma quantidade válida.");
      return;
    }

    pedidos[mesaAtual].push({
      nome: produto.nome,
      quantidade: qtd,
      preco: produto.preco,
      subtotal: produto.preco * qtd
    });

    document.querySelector("#produto").value = "";
    document.querySelector("#quantidade").value = 1;

    atualizarPreco();
    atualizarLista();
  }

  function atualizarLista() {
    const lista = document.querySelector("#lista");
    const total = document.querySelector("#total");

    lista.innerHTML = "";

    let soma = 0;

    pedidos[mesaAtual].forEach((item, indice) => {
      const linha = document.createElement("p");

      soma += item.subtotal;

      linha.textContent =
        `${item.quantidade}x ${item.nome} — R$ ${item.subtotal.toFixed(2).replace(".", ",")} `;

      const botaoRemover = document.createElement("button");

      botaoRemover.textContent = "Remover";

      botaoRemover.addEventListener("click", () => {
        const pedido = pedidos[mesaAtual][indice];

        if (pedido.quantidade > 1) {
          pedido.quantidade -= 1;
          pedido.subtotal = pedido.preco * pedido.quantidade;
        } else {
          pedidos[mesaAtual].splice(indice, 1);
        }

        atualizarLista();
      });

      linha.appendChild(botaoRemover);
      lista.appendChild(linha);
    });

    total.textContent =
      `Total: R$ ${soma.toFixed(2).replace(".", ",")}`;
  }

  mostrarMesas();
});
