/**
 * verificar-produtos.js
 *
 * O que este script faz:
 * 1. Lê o arquivo produtos.json
 * 2. Para cada produto, acessa o link "checkout" (link de afiliado meli.la/...)
 *    e segue o redirecionamento até a página real do produto no Mercado Livre
 * 3. Extrai: preço atual, preço original, % de desconto real (Pix),
 *    selo de desconto por quantidade (informativo, separado) e
 *    informação de frete
 * 4. Compara com o que já está salvo no produtos.json
 * 5. Atualiza os campos que mudaram -- o preço (precoPor) é sempre
 *    comparado e atualizado de forma independente de haver ou não
 *    desconto real. A ausência de desconto NUNCA impede a atualização
 *    do preço.
 * 6. Se o produto não existir mais (404 / removido), marca "indisponivel: true"
 * 7. Salva o produtos.json atualizado
 *
 * Este script NÃO cria produtos novos e NÃO publica nada no Mercado Livre.
 * Ele só confere e corrige os dados dos produtos que você já tem cadastrados.
 */

const fs = require("fs");
const path = require("path");

const ARQUIVO_PRODUTOS = path.join(__dirname, "produtos.json");
const ARQUIVO_LOG = path.join(__dirname, "ultima-verificacao.json");

// Pausa entre cada requisição, para não sobrecarregar o site e reduzir
// a chance de bloqueio por excesso de acessos automatizados.
const PAUSA_ENTRE_PRODUTOS_MS = 4000;

// Cabeçalhos que simulam um navegador comum, para reduzir a chance
// de a página retornar uma versão diferente (ou bloqueada) do conteúdo.
const HEADERS_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function carregarProdutos() {
  const conteudo = fs.readFileSync(ARQUIVO_PRODUTOS, "utf-8");
  return JSON.parse(conteudo);
}

function salvarProdutos(produtos) {
  fs.writeFileSync(
    ARQUIVO_PRODUTOS,
    JSON.stringify(produtos, null, 2),
    "utf-8"
  );
}

/**
 * Busca a página do produto, seguindo redirecionamentos (o link meli.la
 * redireciona para a URL real do anúncio no Mercado Livre).
 * Retorna { ok: true, html, urlFinal } ou { ok: false, status }.
 */
async function buscarPaginaProduto(url) {
  try {
    const resposta = await fetch(url, {
      headers: HEADERS_NAVEGADOR,
      redirect: "follow",
    });

    if (resposta.status === 404 || resposta.status === 410) {
      return { ok: false, status: resposta.status, removido: true };
    }

    if (!resposta.ok) {
      return { ok: false, status: resposta.status, removido: false };
    }

    const html = await resposta.text();
    return { ok: true, html, urlFinal: resposta.url };
  } catch (erro) {
    return { ok: false, erro: erro.message, removido: false };
  }
}

/**
 * Extrai preço atual, preço original, desconto e frete do HTML da página
 * de um produto do Mercado Livre.
 *
 * Usa múltiplos padrões conhecidos, pois o Mercado Livre pode mudar a
 * estrutura da página. Se nada for encontrado, retorna campos como null
 * para que o produto seja marcado para revisão manual, em vez de gravar
 * um dado inventado ou errado.
 */
function extrairDadosDaPagina(html) {
  const dados = {
    precoPor: null,
    precoDe: null,
    desconto: null,
    // Campo separado e meramente informativo (ex: "20% OFF levando 3").
    // NUNCA influencia precoPor, precoDe ou o campo "desconto" -- é só
    // um aviso extra de vantagem por quantidade, sem relação com o
    // desconto real (preço riscado) do produto.
    descontoQuantidade: null,
    frete: null,
  };

  // --- Preço atual, dentro do bloco "poly-price__current" ---
  //
  // O formato do aria-label muda dependendo de haver ou não desconto:
  //   - COM desconto: aria-label="Agora: 49 reais com 12 centavos"
  //   - SEM desconto: aria-label="54 reais" (sem o prefixo "Agora:",
  //     e às vezes sem a parte "com X centavos" quando o valor é
  //     redondo -- os centavos nesse caso ficam só visualmente em
  //     outro <span>, não no aria-label)
  //
  // O regex abaixo aceita "Agora:" como opcional, e "com X centavos"
  // também como opcional, para cobrir os dois formatos com o mesmo
  // padrão.
  let match = extrairBlocoComAriaLabel(html, "poly-price__current", /(?:Agora:\s*)?([\d.,]+)\s*reais?(?:\s*com\s*(\d{1,2})\s*centavos?)?/i);

  let precoPorNumero = null;
  if (match) {
    precoPorNumero = paraNumero(match[1], match[2]);
    dados.precoPor = formatarMoedaReaisCentavos(match[1], match[2]);
  } else {
    // DEPURAÇÃO TEMPORÁRIA: ajuda a identificar por que o preço não foi
    // encontrado nesta página (classe ausente, aria-label ausente, ou
    // regex não bateu no texto do aria-label). Pode ser removida depois
    // que o problema for confirmado e corrigido em definitivo.
    const existeClasse = html.indexOf("poly-price__current") !== -1;
    console.log(
      `  [debug-preco] Não foi possível extrair precoPor. Classe "poly-price__current" presente no HTML: ${existeClasse}`
    );
  }

  // --- Preço original (antes do desconto), no elemento <s> com classe "andes-money-amount--previous" ---
  // Exemplo real encontrado na página:
  // <s class="... andes-money-amount--previous ..." aria-label="Antes: 109 reais com 99 centavos" ...>
  match = extrairBlocoComAriaLabel(html, "andes-money-amount--previous", /Antes:\s*([\d.,]+)\s*reais?(?:\s*com\s*(\d{1,2})\s*centavos?)?/i);
  let precoDeNumero = null;
  if (match) {
    precoDeNumero = paraNumero(match[1], match[2]);
  }

  // VALIDAÇÃO DE SANIDADE: um "preço anterior" só faz sentido se for MAIOR
  // que o preço atual. Já vimos casos em que o site encontra, em outro
  // ponto da página (ex: comparação de preço histórico, ou produto
  // recomendado), um valor de "preço anterior" que não tem relação real
  // com o preço atual do produto. Nesses casos, é mais seguro não aceitar
  // esse valor do que arriscar gravar um desconto falso.
  if (
    precoDeNumero !== null &&
    precoPorNumero !== null &&
    precoDeNumero > precoPorNumero
  ) {
    dados.precoDe = formatarMoedaReaisCentavos(match[1], match[2]);
  } else if (precoDeNumero !== null) {
    console.log(
      `  [aviso] Preço "anterior" encontrado (${formatarMoedaReaisCentavos(match[1], match[2])}) não é maior que o preço atual. Ignorando, provavelmente não é o preço anterior real deste produto.`
    );
  }

  // --- Desconto real (preço riscado / Pix) ---
  //
  // Só é considerado desconto real se já tivermos validado um preço
  // anterior real (dados.precoDe). Esse é o ÚNICO critério que define
  // o campo "desconto" exibido como badge de promoção no site.
  if (dados.precoDe) {
    match = html.match(/poly-price__disc_label[^>]*>([^<]*\d{1,3}%[^<]*)</i);
    if (match) {
      dados.desconto = match[1].trim();
    }
  }

  if (!dados.desconto) {
    dados.desconto = "Desconto não aplicável ou desconto expirou";
  }

  // --- Desconto por quantidade (ex: "20% OFF levando 3") ---
  //
  // Isto é uma informação à parte, mostrada pelo Mercado Livre no bloco
  // "ui-pdp-price__volume-tags" mesmo quando não há nenhum desconto real
  // (preço riscado). É guardado em um campo próprio (descontoQuantidade)
  // e NUNCA é usado para preencher dados.desconto, dados.precoPor ou
  // dados.precoDe -- assim, a presença ou ausência desse selo de
  // vantagem por quantidade não interfere em nada na comparação e
  // atualização do preço do produto.
  const posVolumeTags = html.indexOf("ui-pdp-price__volume-tags");
  if (posVolumeTags !== -1) {
    const janela = html.slice(posVolumeTags, posVolumeTags + 600);
    const matchVolume = janela.match(/<span>([^<]*\d{1,3}%[^<]*)<\/span>/i);
    if (matchVolume) {
      dados.descontoQuantidade = matchVolume[1].trim();
    }
  }

  // --- Frete grátis ---
  if (/frete\s+gr[áa]tis/i.test(html)) {
    dados.frete = "Frete grátis";
  }

  return dados;
}

/**
 * Converte os textos "reais" e "centavos" capturados pelo regex em um
 * número (float), para permitir comparações matemáticas (ex: saber se
 * um preço é maior que outro).
 */
function paraNumero(reaisTexto, centavosTexto) {
  const reais = parseInt(reaisTexto.replace(/\D/g, ""), 10);
  if (Number.isNaN(reais)) return null;
  const centavos = centavosTexto ? parseInt(centavosTexto, 10) : 0;
  return reais + centavos / 100;
}

/**
 * Procura a primeira ocorrência da classe indicada (ex: "poly-price__current")
 * e, a partir dali, procura o PRIMEIRO atributo aria-label que aparece depois
 * -- geralmente em um elemento filho (ex: a div com a classe envolve um span
 * que tem o aria-label com o valor por extenso).
 *
 * A busca é limitada a uma janela pequena (200 caracteres) IMEDIATAMENTE
 * DEPOIS da classe, e nunca olha para trás. Isso evita pegar por engano
 * o aria-label de um elemento anterior ou de produtos recomendados.
 */
function extrairBlocoComAriaLabel(html, classeBusca, regexAriaLabel) {
  const posClasse = html.indexOf(classeBusca);
  if (posClasse === -1) return null;

  const janelaDepois = html.slice(posClasse, posClasse + 300);

  const matchAria = janelaDepois.match(/aria-label="([^"]*)"/);
  if (!matchAria) return null;

  const textoAriaLabel = matchAria[1];
  return textoAriaLabel.match(regexAriaLabel);
}

function formatarMoedaReaisCentavos(reaisTexto, centavosTexto) {
  const reais = parseInt(reaisTexto.replace(/\D/g, ""), 10);
  if (Number.isNaN(reais)) return null;
  const centavos = centavosTexto ? parseInt(centavosTexto, 10) : 0;
  const centavosFormatado = String(centavos).padStart(2, "0");
  return `R$ ${reais},${centavosFormatado}`;
}

/**
 * Compara os dados extraídos com o produto atual e retorna a lista
 * de campos que mudaram (para registro no log).
 */
function compararEAtualizar(produto, dadosNovos) {
  const mudancas = [];

  // precoPor, frete e desconto: campos que sempre devem ter um valor agora
  // (desconto tem o fallback "Desconto não aplicável ou desconto expirou"
  // quando não há promoção real). Se não conseguimos ler agora, é mais
  // seguro preservar o valor antigo (provável falha temporária de leitura)
  // do que apagar.
  //
  // IMPORTANTE: precoPor é comparado e atualizado aqui de forma
  // COMPLETAMENTE INDEPENDENTE de haver ou não desconto real. Ou seja:
  // mesmo que o produto não tenha nenhum desconto (preço riscado), se o
  // preço atual da página mudou, ele é atualizado normalmente no site.
  // A existência (ou não) de desconto NUNCA bloqueia a atualização do
  // preço -- são duas coisas tratadas em separado.
  const camposSemprePresentes = ["precoPor", "frete", "desconto"];
  for (const campo of camposSemprePresentes) {
    const valorNovo = dadosNovos[campo];
    if (valorNovo && valorNovo !== produto[campo]) {
      mudancas.push({ campo, de: produto[campo], para: valorNovo });
      produto[campo] = valorNovo;
    }
  }

  // precoDe e descontoQuantidade: podem legitimamente deixar de existir
  // (a promoção pode ter acabado, ou o selo de quantidade pode não
  // aparecer mais). Se não conseguimos validar um valor novo, removemos
  // o valor antigo em vez de preservá-lo -- caso contrário, o site
  // continuaria mostrando uma vantagem que não existe mais de verdade
  // na página.
  const camposOpcionais = ["precoDe", "descontoQuantidade"];
  for (const campo of camposOpcionais) {
    const valorNovo = dadosNovos[campo];
    const valorAntigo = produto[campo] || null;
    if (valorNovo !== valorAntigo) {
      mudancas.push({ campo, de: valorAntigo, para: valorNovo });
      if (valorNovo) {
        produto[campo] = valorNovo;
      } else {
        delete produto[campo];
      }
    }
  }

  return mudancas;
}

async function main() {
  console.log("=== Iniciando verificação de produtos ===");
  console.log(new Date().toISOString());

  const produtos = carregarProdutos();
  const relatorio = [];

  for (const produto of produtos) {
    console.log(`\nVerificando produto ${produto.id}: ${produto.nome}`);

    const resultado = await buscarPaginaProduto(produto.checkout);

    if (!resultado.ok) {
      if (resultado.removido) {
        console.log("  -> Produto não encontrado (removido do Mercado Livre).");
        if (!produto.indisponivel) {
          produto.indisponivel = true;
          relatorio.push({
            id: produto.id,
            nome: produto.nome,
            status: "marcado_indisponivel",
          });
        }
      } else {
        console.log(
          `  -> Não foi possível acessar a página (status: ${resultado.status || "erro de rede"}). Pulando, sem alterar dados.`
        );
        relatorio.push({
          id: produto.id,
          nome: produto.nome,
          status: "erro_acesso",
          detalhe: resultado.status || resultado.erro,
        });
      }
      await dormir(PAUSA_ENTRE_PRODUTOS_MS);
      continue;
    }

    // Produto voltou a ficar acessível: remove a marca de indisponível
    if (produto.indisponivel) {
      delete produto.indisponivel;
      console.log("  -> Produto voltou a ficar disponível.");
    }

    const dadosNovos = extrairDadosDaPagina(resultado.html);
    const mudancas = compararEAtualizar(produto, dadosNovos);

    if (mudancas.length > 0) {
      console.log("  -> Atualizações encontradas:");
      mudancas.forEach((m) =>
        console.log(`     ${m.campo}: "${m.de}" -> "${m.para}"`)
      );
      relatorio.push({
        id: produto.id,
        nome: produto.nome,
        status: "atualizado",
        mudancas,
      });
    } else {
      console.log("  -> Sem mudanças.");
    }

    await dormir(PAUSA_ENTRE_PRODUTOS_MS);
  }

  salvarProdutos(produtos);

  const resumo = {
    executadoEm: new Date().toISOString(),
    totalProdutos: produtos.length,
    relatorio,
  };
  fs.writeFileSync(ARQUIVO_LOG, JSON.stringify(resumo, null, 2), "utf-8");

  console.log("\n=== Verificação concluída ===");
  console.log(`Produtos verificados: ${produtos.length}`);
  console.log(`Produtos com mudanças: ${relatorio.length}`);
}

main().catch((erro) => {
  console.error("Erro inesperado na execução do script:", erro);
  process.exit(1);
});
