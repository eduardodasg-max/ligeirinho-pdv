async function abrirMesa(mesa) {
  if (mesa.status !== "livre") {
    mensagem("Esta mesa não está livre.");
    return;
  }

  const { data, error } = await supabase.rpc(
    "abrir_mesa",
    {
      p_mesa_id: mesa.id
    }
  );

  if (error) {
    erro("Não foi possível abrir a mesa.", error);
    return;
  }

  await carregarDadosMesas();

  pedidoAtual = pedidosAbertos.find(p => p.mesa_id === mesa.id);

  if (!pedidoAtual && data) {
    pedidoAtual = Array.isArray(data) ? data[0] : data;
  }

  if (!pedidoAtual) {
    mensagem("Mesa aberta. Atualizando os dados...");
    await mostrarMesas();
    return;
  }

  mesaAtual = mesa;
  await carregarItensPedido();
  mostrarPedido();
}
