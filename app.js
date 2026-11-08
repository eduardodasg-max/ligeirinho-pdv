// Ligeirinho PDV
// Inicialização do aplicativo

document.addEventListener("DOMContentLoaded", () => {
  console.log("Ligeirinho PDV iniciado!");

  const status = document.querySelector(".status");

  if (status) {
    status.textContent = "Ligeirinho iniciado!";
  }
});
