/**
 * verificar-produtos.js
 *
 * O que este script faz:
 * 1. Lê o arquivo produtos.json
 * 2. Para cada produto, acessa o link "checkout" (link de afiliado meli.la/...)
 *    e segue o redirecionamento até a página real do produto no Mercado Livre
 * 3. Extrai: preço atual, preço original, % de desconto, informação de frete
 * 4. Compara com o que já está salvo no produtos.json
 * 5. Atualiza os campos que mudaram
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
    frete: null,
  };

  // --- Preço atual (com desconto Pix), dentro do bloco "poly-price__current" ---
  // Exemplo real encontrado na página:
  // <span class="... poly-price__current ..." aria-label="Agora: 49 reais com 12 centavos" ...>
  let match = extrairBlocoComAriaLabel(html, "poly-price__current", /Agora:\s*([\d.,]+)\s*reais?(?:\s*com\s*(\d{1,2})\s*centavos?)?/i);
  if (match) {
    dados.precoPor = formatarMoedaReaisCentavos(match[1], match[2]);
  }

  // --- Preço original (antes do desconto), no elemento <s> com classe "andes-money-amount--previous" ---
  // Exemplo real encontrado na página:
  // <s class="... andes-money-amount--previous ..." aria-label="Antes: 109 reais com 99 centavos" ...>
  match = extrairBlocoComAriaLabel(html, "andes-money-amount--previous", /Antes:\s*([\d.,]+)\s*reais?(?:\s*com\s*(\d{1,2})\s*centavos?)?/i);
  if (match) {
    dados.precoDe = formatarMoedaReaisCentavos(match[1], match[2]);
  }

  // --- Desconto em porcentagem, no rótulo "poly-price__disc_label" ---
  // Exemplo real encontrado na página:
  // <span class="poly-price__disc_label ...">55% OFF no Pix</span>
  match = html.match(/poly-price__disc_label[^>]*>([^<]*\d{1,3}%[^<]*)</i);
  if (match) {
    dados.desconto = match[1].trim();
  }

  // --- Frete grátis ---
  if (/frete\s+gr[áa]tis/i.test(html)) {
    dados.frete = "Frete grátis";
  }

  return dados;
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
  const campos = ["precoPor", "precoDe", "desconto", "frete"];

  for (const campo of campos) {
    const valorNovo = dadosNovos[campo];
    // Só atualiza se conseguimos extrair um valor válido da página.
    // Se não achou nada (null), preserva o valor antigo em vez de apagar.
    if (valorNovo && valorNovo !== produto[campo]) {
      mudancas.push({ campo, de: produto[campo], para: valorNovo });
      produto[campo] = valorNovo;
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
