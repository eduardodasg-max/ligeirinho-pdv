// LIGEIRINHO PDV
// Primeira funcionalidade: seleção de mesas

document.addEventListener("DOMContentLoaded", () => {
  const painel = document.querySelector(".painel");

  painel.innerHTML = `
    <h2>Controle de Mesas</h2>
    <p>Selecione uma mesa para iniciar o atendimento.</p>

    <div id="mesas" class="mesas"></div>

    <p id="mesaSelecionada">Nenhuma mesa selecionada.</p>
  `;

  const areaMesas = document.querySelector("#mesas");
  const aviso = document.querySelector("#mesaSelecionada");

  for (let numero = 1; numero <= 50; numero++) {
    const botao = document.createElement("button");

    botao.textContent = numero;
    botao.className = "mesa";

    botao.addEventListener("click", () => {
      aviso.textContent = `Mesa ${numero} selecionada!`;
    });

    areaMesas.appendChild(botao);
  }
});
