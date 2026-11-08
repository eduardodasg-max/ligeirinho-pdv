function atualizarLista() {
  const lista = document.querySelector("#lista");
  const total = document.querySelector("#total");

  lista.innerHTML = "";
  let soma = 0;

  pedidos[mesaAtual].forEach((item, indice) => {
    soma += item.subtotal;

    const linha = document.createElement("p");

    linha.textContent =
      `${item.quantidade}x ${item.nome} — R$ ${item.subtotal.toFixed(2).replace(".", ",")} `;

    const botaoRemover = document.createElement("button");
    botaoRemover.textContent = "Remover";
    botaoRemover.addEventListener("click", () => {
      pedidos[mesaAtual].splice(indice, 1);
      atualizarLista();
    });

    linha.appendChild(botaoRemover);
    lista.appendChild(linha);
  });

  total.textContent = `Total: R$ ${soma.toFixed(2).replace(".", ",")}`;
}
