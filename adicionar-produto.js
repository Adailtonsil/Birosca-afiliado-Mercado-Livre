/**
 * adicionar-produto.js
 *
 * O que este script faz:
 * 1. Recebe dois argumentos via linha de comando:
 *    - URL da página do produto no Mercado Livre
 *    - URL de checkout (link de afiliado, ex: meli.la/...)
 * 2. Acessa a página do produto e extrai:
 *    - Nome do produto
 *    - URL da imagem principal
 *    - Preço atual (precoPor)
 *    - Preço original, se houver (precoDe)
 *    - Desconto, se houver
 *    - Informações de frete
 *    - Variações disponíveis (cores, tamanhos, etc.)
 *    - HTML completo da descrição/detalhes
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

function paraNumero(reaisTexto, centavosTexto) {
  const reais = parseInt(reaisTexto.replace(/\D/g, ""), 10);
  if (Number.isNaN(reais)) return null;
  const centavos = centavosTexto ? parseInt(centavosTexto, 10) : 0;
  return reais + centavos / 100;
}

function formatarMoeda(reaisTexto, centavosTexto) {
  const reais = parseInt(reaisTexto.replace(/\D/g, ""), 10);
  if (Number.isNaN(reais)) return null;
  const centavos = centavosTexto ? parseInt(centavosTexto, 10) : 0;
  return `R$ ${reais},${String(centavos).padStart(2, "0")}`;
}

function extrairBlocoComAriaLabel(html, classeBusca, regexAriaLabel) {
  const posClasse = html.indexOf(classeBusca);
  if (posClasse === -1) return null;
  const janela = html.slice(posClasse, posClasse + 300);
  const matchAria = janela.match(/aria-label="([^"]*)"/);
  if (!matchAria) return null;
  return matchAria[1].match(regexAriaLabel);
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
  // Tenta o elemento principal do título do anúncio
  let match = html.match(/<h1[^>]*class="[^"]*ui-pdp-title[^"]*"[^>]*>([^<]+)</i);
  if (match) return match[1].trim();

  // Fallback: tag <title>
  match = html.match(/<title>([^<|]+)/i);
  if (match) return match[1].trim();

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

  // Preço atual
  const matchPor = extrairBlocoComAriaLabel(
    html,
    "poly-price__current",
    /(?:Agora:\s*)?([\d.,]+)\s*reais?(?:\s*com\s*(\d{1,2})\s*centavos?)?/i
  );

  let precoPorNumero = null;
  if (matchPor) {
    precoPorNumero = paraNumero(matchPor[1], matchPor[2]);
    resultado.precoPor = formatarMoeda(matchPor[1], matchPor[2]);
  }

  // Preço anterior (preço De, riscado)
  const matchDe = extrairBlocoComAriaLabel(
    html,
    "andes-money-amount--previous",
    /Antes:\s*([\d.,]+)\s*reais?(?:\s*com\s*(\d{1,2})\s*centavos?)?/i
  );

  if (matchDe) {
    const precoDeNumero = paraNumero(matchDe[1], matchDe[2]);
    // Só aceita se for realmente maior que o preço atual (sanidade)
    if (precoDeNumero !== null && precoPorNumero !== null && precoDeNumero > precoPorNumero) {
      resultado.precoDe = formatarMoeda(matchDe[1], matchDe[2]);
    }
  }

  return resultado;
}

function extrairDesconto(html, temPrecoDe) {
  if (!temPrecoDe) return "Desconto expirou";

  const match = html.match(/poly-price__disc_label[^>]*>([^<]*\d{1,3}%[^<]*)</i);
  if (match) return match[1].trim();

  return "Desconto expirou";
}

function extrairFrete(html) {
  const match = html.match(/ui-pdp-promotions-pill__label[^>]*>([^<]+)</i);
  if (match) {
    const texto = match[1].trim();
    if (/frete/i.test(texto)) {
      return texto
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase())
        .replace(/r\$/gi, "R$");
    }
  }
  if (/frete\s+gr[áa]tis/i.test(html)) return "Frete grátis";
  return null;
}

function extrairVariacoes(html) {
  const variacoes = {};

  // Tenta extrair as variações do JSON de estado embutido na página (window.__PRELOADED_STATE__)
  const matchState = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (matchState) {
    try {
      const state = JSON.parse(matchState[1]);
      const components = state?.initialState?.components;
      if (components) {
        for (const comp of Object.values(components)) {
          if (comp?.variations) {
            for (const variation of comp.variations) {
              const nome = variation.name;
              const valores = (variation.values || []).map((v) => v.name).filter(Boolean);
              if (nome && valores.length > 0) {
                variacoes[nome] = valores;
              }
            }
          }
        }
      }
    } catch (_) {
      // JSON inválido, ignora e tenta o fallback abaixo
    }
  }

  if (Object.keys(variacoes).length > 0) return variacoes;

  // Fallback: busca padrões de variação no HTML (cores e tamanhos)
  const matchCores = html.match(/(?:cores?|color)[^:]*:\s*([^<\n]{2,80})/i);
  if (matchCores) {
    const cores = matchCores[1].split(/,|\//).map((s) => s.trim()).filter(Boolean);
    if (cores.length > 0) variacoes["cores"] = cores;
  }

  const matchTamanhos = html.match(/(?:tamanhos?|sizes?)[^:]*:\s*([^<\n]{2,80})/i);
  if (matchTamanhos) {
    const tamanhos = matchTamanhos[1].split(/,|\//).map((s) => s.trim()).filter(Boolean);
    if (tamanhos.length > 0) variacoes["tamanhos"] = tamanhos;
  }

  return variacoes;
}

function extrairDetalhesHtml(html) {
  // Bloco principal de descrição do anúncio
  let match = html.match(
    /<div[^>]*class="[^"]*ui-pdp-description[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<section|<div[^>]*class="ui-pdp)/i
  );
  if (match) return match[1].trim();

  // Fallback: seção de descrição genérica
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

  const frete = extrairFrete(html) || "Não informado";
  console.log(`  Frete    : ${frete}`);

  const variacoes = extrairVariacoes(html);
  console.log(`  Variações: ${JSON.stringify(variacoes)}`);

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
