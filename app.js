  // RELATÓRIO DE CAIXA — CONSULTA, RESUMO E IMPRESSÃO

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

      const inicio = caixa.aberto_em || new Date(0).toISOString();
      const fim = caixa.fechado_em || new Date().toISOString();

      // A tabela pagamentos não possui criado_em.
      // Primeiro buscamos os pedidos fechados durante este caixa.
      const { data: pedidosPeriodo, error: erroPedidos } = await supabase
        .from("pedidos")
        .select("id,fechado_em")
        .not("fechado_em", "is", null)
        .gte("fechado_em", inicio)
        .lte("fechado_em", fim);

      if (erroPedidos) throw erroPedidos;

      const pedidos = pedidosPeriodo || [];
      const idsPedidos = pedidos.map(p => p.id).filter(Boolean);

      const dataFechamentoPorPedido = {};

      pedidos.forEach(p => {
        dataFechamentoPorPedido[p.id] = p.fechado_em;
      });

      // Busca os pagamentos relacionados aos pedidos encontrados.
      let pagamentos = [];

      if (idsPedidos.length > 0) {
        const { data, error: erroPagamentos } = await supabase
          .from("pagamentos")
          .select("*")
          .in("pedido_id", idsPedidos);

        if (erroPagamentos) throw erroPagamentos;

        pagamentos = data || [];
      }

      // Busca suprimentos e sangrias deste caixa.
      const { data: movimentosData, error: erroMovimentos } = await supabase
        .from("movimentacoes_caixa")
        .select("*")
        .eq("caixa_id", caixaId)
        .order("criado_em", { ascending: true });

      if (erroMovimentos) throw erroMovimentos;

      const movimentos = movimentosData || [];

      // Padroniza os nomes das formas de pagamento.
      const normalizarForma = forma => {
        const valor = String(forma || "não informado")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[\s-]+/g, "_");

        if (["dinheiro", "cash"].includes(valor)) return "dinheiro";

        if ([
          "credito",
          "cartao_credito",
          "cartao_de_credito"
        ].includes(valor)) return "credito";

        if ([
          "debito",
          "cartao_debito",
          "cartao_de_debito"
        ].includes(valor)) return "debito";

        if (valor === "pix") return "pix";

        return valor || "não informado";
      };

      // Todas as formas aparecem, mesmo quando o valor for zero.
      const totalPorForma = {
        dinheiro: 0,
        credito: 0,
        debito: 0,
        pix: 0
      };

      pagamentos.forEach(p => {
        const forma = normalizarForma(p.forma_pagamento);

        totalPorForma[forma] =
          (totalPorForma[forma] || 0) + Number(p.valor || 0);
      });

      const nomesFormas = {
        dinheiro: "DINHEIRO",
        credito: "CRÉDITO",
        debito: "DÉBITO",
        pix: "PIX"
      };

      const formasOrdenadas = [
        "dinheiro",
        "credito",
        "debito",
        "pix"
      ];

      const formasExtras = Object.keys(totalPorForma)
        .filter(forma => !formasOrdenadas.includes(forma));

      const formasHtml = [...formasOrdenadas, ...formasExtras]
        .map(forma => `
          <tr>
            <td>${escapar(nomesFormas[forma] || forma.toUpperCase())}</td>
            <td class="valor-relatorio">
              ${dinheiro(totalPorForma[forma] || 0)}
            </td>
          </tr>
        `)
        .join("");

      // Soma de todos os pagamentos.
      const totalPagamentos = pagamentos.reduce(
        (soma, p) => soma + Number(p.valor || 0),
        0
      );

      // Soma de suprimentos.
      const totalSuprimentos = movimentos
        .filter(m => String(m.tipo).toLowerCase() === "suprimento")
        .reduce((soma, m) => soma + Number(m.valor || 0), 0);

      // Soma de sangrias.
      const totalSangrias = movimentos
        .filter(m => String(m.tipo).toLowerCase() === "sangria")
        .reduce((soma, m) => soma + Number(m.valor || 0), 0);

      const valorInicial = Number(caixa.valor_inicial || 0);

      const saldoEsperado = Number(
        caixa.valor_esperado ??
        (valorInicial + totalPagamentos + totalSuprimentos - totalSangrias)
      );

      const valorContado = caixa.valor_contado == null
        ? null
        : Number(caixa.valor_contado);

      const diferenca = caixa.diferenca == null
        ? (
            valorContado == null
              ? null
              : Number((valorContado - saldoEsperado).toFixed(2))
          )
        : Number(caixa.diferenca);

      // Identifica o operador que abriu o caixa.
      let nomeOperador = "Não identificado";

      if (caixa.operador_id) {
        const resultadoOperador = await supabase
          .from("perfis_usuarios")
          .select("nome")
          .eq("id", caixa.operador_id)
          .maybeSingle();

        if (!resultadoOperador.error) {
          nomeOperador =
            resultadoOperador.data?.nome || nomeOperador;
        }
      }

      // Detalhamento dos pagamentos.
      const pagamentosHtml = pagamentos.length
        ? pagamentos.map(p => `
            <tr>
              <td>
                ${
                  dataFechamentoPorPedido[p.pedido_id]
                    ? new Date(
                        dataFechamentoPorPedido[p.pedido_id]
                      ).toLocaleString("pt-BR")
                    : "—"
                }
              </td>
              <td>
                ${escapar(
                  String(
                    nomesFormas[normalizarForma(p.forma_pagamento)] ||
                    p.forma_pagamento ||
                    "—"
                  ).toUpperCase()
                )}
              </td>
              <td>${dinheiro(p.valor)}</td>
              <td>${escapar(p.pedido_id || "—")}</td>
            </tr>
          `).join("")
        : `
            <tr>
              <td colspan="4">Nenhum pagamento registrado neste caixa.</td>
            </tr>
          `;

      // Detalhamento de suprimentos e sangrias.
      const movimentosHtml = movimentos.length
        ? movimentos.map(m => `
            <tr>
              <td>
                ${
                  m.criado_em
                    ? new Date(m.criado_em).toLocaleString("pt-BR")
                    : "—"
                }
              </td>
              <td>${escapar(String(m.tipo || "—").toUpperCase())}</td>
              <td>${dinheiro(m.valor)}</td>
              <td>${escapar(m.descricao || m.motivo || "—")}</td>
            </tr>
          `).join("")
        : `
            <tr>
              <td colspan="4">Nenhuma movimentação de caixa registrada.</td>
            </tr>
          `;

      // Monta o relatório completo.
      document.querySelector("#relatorioImpressao").innerHTML = `
        <div class="relatorio-caixa">

          <h2>🚤 Ligeirinho PDV — Relatório de Caixa</h2>

          <p>
            <strong>Situação:</strong>
            ${escapar(String(caixa.status || "").toUpperCase())}
          </p>

          <p>
            <strong>Operador da abertura:</strong>
            ${escapar(nomeOperador)}
          </p>

          <p>
            <strong>Abertura:</strong>
            ${
              caixa.aberto_em
                ? new Date(caixa.aberto_em).toLocaleString("pt-BR")
                : "—"
            }
          </p>

          <p>
            <strong>Fechamento:</strong>
            ${
              caixa.fechado_em
                ? new Date(caixa.fechado_em).toLocaleString("pt-BR")
                : "Caixa ainda aberto"
            }
          </p>

          <h3>Resumo financeiro</h3>

          <table>
            <tbody>
              <tr>
                <td>Valor inicial</td>
                <td class="valor-relatorio">
                  ${dinheiro(valorInicial)}
                </td>
              </tr>

              <tr>
                <td>Total de pagamentos</td>
                <td class="valor-relatorio">
                  ${dinheiro(totalPagamentos)}
                </td>
              </tr>

              <tr>
                <td>Suprimentos</td>
                <td class="valor-relatorio">
                  ${dinheiro(totalSuprimentos)}
                </td>
              </tr>

              <tr>
                <td>Sangrias</td>
                <td class="valor-relatorio">
                  ${dinheiro(totalSangrias)}
                </td>
              </tr>

              <tr>
                <td><strong>Saldo esperado registrado</strong></td>
                <td class="valor-relatorio">
                  ${dinheiro(saldoEsperado)}
                </td>
              </tr>

              <tr>
                <td>Valor contado</td>
                <td class="valor-relatorio">
                  ${
                    valorContado == null
                      ? "Ainda não fechado"
                      : dinheiro(valorContado)
                  }
                </td>
              </tr>

              <tr>
                <td>Diferença</td>
                <td class="valor-relatorio">
                  ${diferenca == null ? "—" : dinheiro(diferenca)}
                </td>
              </tr>
            </tbody>
          </table>

          <h3>Pagamentos por forma</h3>

          <table>
            <thead>
              <tr>
                <th>Forma de pagamento</th>
                <th>Total recebido</th>
              </tr>
            </thead>

            <tbody>
              ${formasHtml}

              <tr>
                <td><strong>TOTAL GERAL</strong></td>
                <td class="valor-relatorio">
                  <strong>${dinheiro(totalPagamentos)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <h3>Detalhamento dos pagamentos</h3>

          <table>
            <thead>
              <tr>
                <th>Data do fechamento</th>
                <th>Forma</th>
                <th>Valor</th>
                <th>Pedido</th>
              </tr>
            </thead>

            <tbody>
              ${pagamentosHtml}
            </tbody>
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

            <tbody>
              ${movimentosHtml}
            </tbody>
          </table>

          <p>
            <strong>Justificativa da diferença:</strong>
            ${escapar(caixa.justificativa || "—")}
          </p>

          <p>
            <small>
              Relatório gerado em ${new Date().toLocaleString("pt-BR")}
            </small>
          </p>

        </div>
      `;

      document.querySelector("#statusRelatorio").textContent =
        "Relatório carregado. Confira os valores antes de imprimir.";

      document.querySelector("#imprimirRelatorio").disabled = false;

      document.querySelector("#imprimirRelatorio").onclick = () => {
        window.print();
      };

    } catch (e) {
      erro("Não foi possível gerar o relatório do caixa.", e);

      const status = document.querySelector("#statusRelatorio");

      if (status) {
        status.textContent =
          "Falha ao carregar o relatório. Confira as permissões e os dados das tabelas.";
      }
    }
  }
