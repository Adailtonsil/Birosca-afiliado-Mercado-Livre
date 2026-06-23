/**
 * adicionar-produto.js
 *
 * O que este script faz:
 * 1. Recebe dois argumentos via linha de comando:
 *    - URL da página do produto no Mercado Livre
 *    - URL de checkout (link de afiliado, ex: meli.la/...)
 * 2. Acessa a página do produto (HTML) e extrai:
 *    - Nome do produto
 *    - URL da imagem principal
 *    - Preço atual (precoPor)
 *    - Preço original, se houver (precoDe)
 *    - Desconto, se houver (texto que já vem pronto na página, ex: "38% OFF")
 *    - Informações de frete
 *    - Características do produto (peso, tamanho, cor, dimensão, etc.),
 *      extraídas dos blocos de variação/ficha técnica da página
 *    - HTML da descrição do produto
 * 3. Insere o novo produto no produtos.json com o próximo ID disponível
 * 4. Salva o arquivo atualizado
 *
 * Uso:
 *   node adicionar-produto.js "https://www.mercadolivre.com.br/..." "https://meli.la/..."
 *
 * Este script NÃO altera produtos existentes.
 */

const fs = require("fs");
const path = require("path");

const ARQUIVO_PRODUTOS = path.join(__dirname, "produtos.json");

const HEADERS_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

// ─── Utilitários ────────────────────────────────────────────────────────────

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

function proximoId(produtos) {
  if (produtos.length === 0) return 1;
  return Math.max(...produtos.map((p) => p.id)) + 1;
}

function decodificarEntidadesHtml(texto) {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function formatarMoeda(valorNumerico) {
  if (valorNumerico === null || valorNumerico === undefined) return null;
  const arredondado = Math.round(valorNumerico * 100) / 100;
  const [reaisStr, centavosStr = "00"] = arredondado.toFixed(2).split(".");
  const reaisFormatado = reaisStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${reaisFormatado},${centavosStr}`;
}

// ─── Busca da página ────────────────────────────────────────────────────────

async function buscarPagina(url) {
  const resposta = await fetch(url, {
    headers: HEADERS_NAVEGADOR,
    redirect: "follow",
  });

  if (!resposta.ok) {
    throw new Error(`Página retornou status ${resposta.status}`);
  }

  const html = await resposta.text();

  const indicaRemovido =
    /item\s+n[ãa]o\s+encontrado/i.test(html) ||
    /publica[çc][ãa]o\s+(pausada|encerrada|finalizada)/i.test(html) ||
    /este\s+produto\s+n[ãa]o\s+est[áa]\s+mais\s+dispon[íi]vel/i.test(html) ||
    /an[úu]ncio\s+n[ãa]o\s+est[áa]\s+mais\s+dispon[íi]vel/i.test(html);

  if (indicaRemovido) {
    throw new Error("Produto não encontrado ou anúncio encerrado.");
  }

  return html;
}

// ─── Extração de dados ──────────────────────────────────────────────────────

function extrairNome(html) {
  // <h1 class="ui-pdp-title">Nome do produto</h1>
  let match = html.match(/<h1[^>]*class="[^"]*ui-pdp-title[^"]*"[^>]*>([^<]+)</i);
  if (match) return decodificarEntidadesHtml(match[1].trim());

  // Fallback: tag <title>
  match = html.match(/<title>([^<|]+)/i);
  if (match) return decodificarEntidadesHtml(match[1].trim());

  return null;
}

function extrairImagem(html) {
  // Imagem principal no carrossel do produto (mlstatic.com, alta resolução)
  let match = html.match(
    /https:\/\/http2\.mlstatic\.com\/D_NQ_NP[^"'\s]+\.(?:jpg|jpeg|webp|png)/i
  );
  if (match) return match[0];

  // Fallback: qualquer imagem do mlstatic
  match = html.match(/https:\/\/[^"'\s]+mlstatic\.com[^"'\s]+\.(?:jpg|jpeg|webp|png)/i);
  if (match) return match[0];

  return null;
}

function extrairPrecos(html) {
  const resultado = { precoPor: null, precoDe: null };

  // Preço atual: <meta itemprop="price" content="39.90"> dentro do bloco
  // ui-pdp-price-second-line (preço "Por", o que realmente será cobrado)
  const indiceSecondLine = html.indexOf("ui-pdp-price-second-line");
  let precoPorNumero = null;

  if (indiceSecondLine !== -1) {
    const janela = html.slice(indiceSecondLine, indiceSecondLine + 1500);
    const matchMeta = janela.match(/itemprop="price"\s+content="([\d.]+)"/i);
    if (matchMeta) precoPorNumero = parseFloat(matchMeta[1]);
  }

  // Fallback: primeiro <meta itemprop="price"> que aparecer na página
  if (precoPorNumero === null) {
    const matchMetaGlobal = html.match(/itemprop="price"\s+content="([\d.]+)"/i);
    if (matchMetaGlobal) precoPorNumero = parseFloat(matchMetaGlobal[1]);
  }

  if (precoPorNumero !== null) {
    resultado.precoPor = formatarMoeda(precoPorNumero);
  }

  // Preço anterior ("De", riscado): aria-label="Antes: 85 reais com 64 centavos"
  const matchDe = html.match(
    /andes-money-amount--previous[^>]*aria-label="Antes:\s*([\d.,]+)\s*reais?(?:\s*com\s*(\d{1,2})\s*centavos?)?"/i
  );

  if (matchDe) {
    const reais = parseInt(matchDe[1].replace(/\D/g, ""), 10);
    const centavos = matchDe[2] ? parseInt(matchDe[2], 10) : 0;
    const precoDeNumero = reais + centavos / 100;

    // Só aceita se for realmente maior que o preço atual (sanidade)
    if (precoPorNumero !== null && precoDeNumero > precoPorNumero) {
      resultado.precoDe = formatarMoeda(precoDeNumero);
    }
  }

  return resultado;
}

function extrairDesconto(html, temPrecoDe) {
  if (!temPrecoDe) return "Desconto expirou";

  // <span class="ui-pdp-price-second-line__discount ...">38% OFF</span>
  let match = html.match(
    /ui-pdp-price-second-line__discount[^>]*>([^<]*\d{1,3}%[^<]*)</i
  );
  if (match) return decodificarEntidadesHtml(match[1].trim());

  // Fallback: outro padrão de desconto usado em algumas páginas
  match = html.match(/poly-price__disc_label[^>]*>([^<]*\d{1,3}%[^<]*)</i);
  if (match) return decodificarEntidadesHtml(match[1].trim());

  return "Desconto expirou";
}

function extrairFrete(html) {
  // <div class="... ui-pdp-promotions-pill-label ...">FRETE GRÁTIS ACIMA DE R$ 19</div>
  const match = html.match(/ui-pdp-promotions-pill-label[^>]*>([^<]+)</i);
  if (match) {
    const texto = decodificarEntidadesHtml(match[1].trim());
    if (/frete/i.test(texto)) {
      return texto
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase())
        .replace(/r\$/gi, "R$");
    }
  }

  if (/frete\s+gr[áa]tis/i.test(html)) return "Frete grátis";
  return "Não informado";
}

/**
 * Extrai as características do produto (peso, tamanho, cor, dimensão, etc.)
 * dos blocos "ui-pdp-outside_variations__picker" da página. Cada bloco tem:
 *   - um título (ex: "Peso da unidade:", "Cor:")
 *   - um item selecionado, com o valor atual (ex: "250 g", "Branco")
 * Essas informações são inseridas dentro do campo "variacoes".
 */
function extrairVariacoes(html) {
  const variacoes = {};

  const regexPicker = /ui-pdp-outside_variations__picker[^"]*"/gi;
  let matchPicker;
  const indicesPickers = [];
  while ((matchPicker = regexPicker.exec(html)) !== null) {
    indicesPickers.push(matchPicker.index);
  }

  for (const indice of indicesPickers) {
    // Janela de busca: do início do picker até o próximo picker (ou um limite seguro)
    const janela = html.slice(indice, indice + 4000);

    // Título: <span class="ui-pdp-outside_variations_title_label ...">Peso da unidade:</span>
    // (a tag <p> pai também usa essa mesma classe, mas não tem texto direto —
    // por isso percorremos as ocorrências até achar uma com conteúdo de texto)
    const regexTitulo = /ui-pdp-outside_variations_title_label[^>]*>([^<]*)</gi;
    let matchTitulo = null;
    let candidatoTitulo;
    while ((candidatoTitulo = regexTitulo.exec(janela)) !== null) {
      if (candidatoTitulo[1].trim().length > 0) {
        matchTitulo = candidatoTitulo;
        break;
      }
    }
    if (!matchTitulo) continue;

    let nomeCaracteristica = decodificarEntidadesHtml(matchTitulo[1].trim());
    nomeCaracteristica = nomeCaracteristica.replace(/:\s*$/, ""); // remove ":" final

    // Valor selecionado: dentro do item com classe "...--SELECTED", pega o <span> do label
    const matchSelecionado = janela.match(
      /ui-pdp-outside_variations_thumbnails_item--SELECTED[\s\S]*?ui-pdp-outside_variations_thumbnails_item_label[^>]*>\s*<span>([^<]+)<\/span>/i
    );
    if (!matchSelecionado) continue;

    const valor = decodificarEntidadesHtml(matchSelecionado[1].trim());
    if (!nomeCaracteristica || !valor) continue;

    if (!variacoes[nomeCaracteristica]) variacoes[nomeCaracteristica] = [];
    if (!variacoes[nomeCaracteristica].includes(valor)) {
      variacoes[nomeCaracteristica].push(valor);
    }
  }

  if (Object.keys(variacoes).length > 0) return variacoes;

  // Fallback: tenta capturar a ficha técnica genérica "Características do produto"
  // (tabela de specs), caso a página não tenha o bloco de variações acima.
  const regexLinhaSpec =
    /<tr[^>]*>\s*<th[^>]*>([^<]+)<\/th>\s*<td[^>]*>([^<]+)<\/td>/gi;
  let matchSpec;
  while ((matchSpec = regexLinhaSpec.exec(html)) !== null) {
    const nome = decodificarEntidadesHtml(matchSpec[1].trim());
    const valor = decodificarEntidadesHtml(matchSpec[2].trim());
    if (!nome || !valor) continue;
    if (!variacoes[nome]) variacoes[nome] = [];
    if (!variacoes[nome].includes(valor)) variacoes[nome].push(valor);
  }

  return variacoes;
}

function extrairDetalhesHtml(html) {
  // <div id="description" class="ui-pdp-description">
  //   <h2 ...>Descrição</h2>
  //   <p class="ui-pdp-description__content" data-testid="content">...</p>
  // </div>
  const indiceDescricao = html.indexOf('id="description"');
  if (indiceDescricao !== -1) {
    const indiceConteudo = html.indexOf(
      "ui-pdp-description__content",
      indiceDescricao
    );
    if (indiceConteudo !== -1) {
      const indiceAberturaP = html.lastIndexOf("<p", indiceConteudo);
      if (indiceAberturaP !== -1) {
        const indiceFechamentoP = html.indexOf("</p>", indiceConteudo);
        if (indiceFechamentoP !== -1) {
          const indiceFimTag = html.indexOf(">", indiceAberturaP);
          return html.slice(indiceFimTag + 1, indiceFechamentoP).trim();
        }
      }
    }
  }

  // Fallback: bloco genérico de descrição
  let match = html.match(
    /<div[^>]*class="[^"]*ui-pdp-description[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<section|<div[^>]*class="ui-pdp)/i
  );
  if (match) return match[1].trim();

  match = html.match(/<section[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
  if (match) return match[1].trim();

  return "";
}

// ─── Principal ──────────────────────────────────────────────────────────────

async function main() {
  const [, , urlProduto, urlCheckout] = process.argv;

  if (!urlProduto || !urlCheckout) {
    console.error(
      "Uso: node adicionar-produto.js <url-produto> <url-checkout>\n" +
        'Exemplo: node adicionar-produto.js "https://www.mercadolivre.com.br/..." "https://meli.la/..."'
    );
    process.exit(1);
  }

  console.log("=== Adicionando novo produto ===");
  console.log(`URL do produto : ${urlProduto}`);
  console.log(`URL de checkout: ${urlCheckout}`);
  console.log("");

  console.log("Acessando a página do produto...");
  const html = await buscarPagina(urlProduto);

  console.log("Extraindo informações...");

  const nome = extrairNome(html);
  if (!nome) throw new Error("Não foi possível extrair o nome do produto.");
  console.log(`  Nome     : ${nome}`);

  const imagem = extrairImagem(html);
  if (!imagem) console.warn("  [aviso] Imagem não encontrada.");
  else console.log(`  Imagem   : ${imagem}`);

  const { precoPor, precoDe } = extrairPrecos(html);
  if (!precoPor) throw new Error("Não foi possível extrair o preço do produto.");
  console.log(`  precoPor : ${precoPor}`);
  if (precoDe) console.log(`  precoDe  : ${precoDe}`);

  const desconto = extrairDesconto(html, !!precoDe);
  console.log(`  Desconto : ${desconto}`);

  const frete = extrairFrete(html);
  console.log(`  Frete    : ${frete}`);

  const variacoes = extrairVariacoes(html);
  console.log(`  Características/Variações: ${JSON.stringify(variacoes)}`);

  const detalhesHtml = extrairDetalhesHtml(html);
  console.log(`  Detalhes : ${detalhesHtml ? detalhesHtml.length + " caracteres extraídos" : "não encontrado"}`);

  // Monta o objeto do novo produto seguindo o mesmo formato do produtos.json
  const produtos = carregarProdutos();
  const novoId = proximoId(produtos);

  const novoProduto = {
    id: novoId,
    nome,
    imagem: imagem || "",
    checkout: urlCheckout,
    ...(precoDe ? { precoDe } : {}),
    precoPor,
    desconto,
    frete,
    variacoes,
    detalhesHtml,
  };

  produtos.push(novoProduto);
  salvarProdutos(produtos);

  console.log(`\n✓ Produto #${novoId} inserido com sucesso no produtos.json`);
  console.log("=== Concluído ===");
}

main().catch((erro) => {
  console.error("\nErro ao adicionar produto:", erro.message);
  process.exit(1);
});
