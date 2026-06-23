/**
 * adicionar-produto.js
 *
 * O que este script faz:
 * 1. Recebe dois argumentos via linha de comando:
 *    - URL da página do produto no Mercado Livre (ou o ID, ex: MLB19603205)
 *    - URL de checkout (link de afiliado, ex: meli.la/...)
 * 2. Extrai o ID do anúncio (ex: MLB19603205) da URL informada, ignorando
 *    qualquer parâmetro de tracking/anúncio que venha colado junto.
 * 3. Usa a API PÚBLICA do Mercado Livre (https://api.mercadolibre.com/items/{ID})
 *    para buscar os dados do produto, em vez de fazer scraping do HTML.
 *    Isso evita o bloqueio 403 que ocorre quando o GitHub Actions tenta
 *    acessar a página do produto diretamente (o Mercado Livre bloqueia
 *    requisições vindas de IPs de datacenter).
 * 4. Extrai:
 *    - Nome do produto (title)
 *    - URL da imagem principal (pictures[0])
 *    - Preço atual (precoPor)
 *    - Preço original "De", SE existir e for maior que o atual (precoDe)
 *    - Desconto, calculado a partir de precoDe/precoPor
 *    - Frete (não vem na API pública de forma confiável; mantido como
 *      "Não informado" salvo indicação em shipping.free_shipping)
 *    - Características do produto (dimensão, tamanho, cor, etc.), vindas
 *      do campo "attributes" da API, inseridas dentro de "variacoes"
 *    - HTML/texto da descrição do produto (endpoint /description)
 * 5. Insere o novo produto no produtos.json com o próximo ID disponível
 * 6. Salva o arquivo atualizado
 *
 * Uso:
 *   node adicionar-produto.js "https://www.mercadolivre.com.br/..." "https://meli.la/..."
 *   node adicionar-produto.js "MLB19603205" "https://meli.la/..."
 *
 * Este script NÃO altera produtos existentes.
 */

const fs = require("fs");
const path = require("path");

const ARQUIVO_PRODUTOS = path.join(__dirname, "produtos.json");

const HEADERS_API = {
  Accept: "application/json",
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

function formatarMoeda(valorNumerico) {
  if (valorNumerico === null || valorNumerico === undefined) return null;
  const arredondado = Math.round(valorNumerico * 100) / 100;
  const [reaisStr, centavosStr = "00"] = arredondado.toFixed(2).split(".");
  // Formata milhares com ponto (padrão brasileiro)
  const reaisFormatado = reaisStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${reaisFormatado},${centavosStr}`;
}

/**
 * Extrai o ID do anúncio (ex: MLB19603205) de uma URL do Mercado Livre,
 * ou retorna o próprio valor se já for um ID.
 * Ignora parâmetros de tracking, query string e fragmentos (#...).
 */
function extrairItemId(entrada) {
  const valor = entrada.trim();

  // Caso já seja só o ID (ex: "MLB19603205")
  const matchIdDireto = valor.match(/^MLB\d+$/i);
  if (matchIdDireto) return matchIdDireto[0].toUpperCase();

  // Remove fragmento (#...) e tudo que vem depois, que costuma conter
  // parâmetros de anúncio/tracking (is_advertising, searchVariation, etc.)
  const semFragmento = valor.split("#")[0];

  // Tenta achar o ID no path "/p/MLB19603205" (página de produto/catálogo)
  let match = semFragmento.match(/\/p\/(MLB\d+)/i);
  if (match) return match[1].toUpperCase();

  // Tenta achar o ID no path "/MLB-19603205-..." (página de anúncio individual)
  match = semFragmento.match(/MLB-?(\d{8,})/i);
  if (match) return `MLB${match[1]}`.toUpperCase();

  // Tenta achar no parâmetro item_id (?pdp_filters=item_id:MLB587206016 ou item_id=MLB...)
  match = semFragmento.match(/item_id[:=](MLB\d+)/i);
  if (match) return match[1].toUpperCase();

  throw new Error(
    `Não foi possível identificar o ID do produto (MLB...) a partir de: ${entrada}`
  );
}

// ─── Busca via API pública do Mercado Livre ────────────────────────────────

async function buscarItem(itemId) {
  const url = `https://api.mercadolibre.com/items/${itemId}`;
  const resposta = await fetch(url, { headers: HEADERS_API });

  if (resposta.status === 404) {
    throw new Error(`Produto ${itemId} não encontrado (404). Anúncio pode ter sido removido.`);
  }
  if (!resposta.ok) {
    throw new Error(`API do Mercado Livre retornou status ${resposta.status} para ${itemId}.`);
  }

  const dados = await resposta.json();

  if (dados.status && dados.status !== "active") {
    console.warn(`  [aviso] Status do anúncio: ${dados.status} (pode estar pausado/encerrado).`);
  }

  return dados;
}

async function buscarDescricao(itemId) {
  try {
    const resposta = await fetch(
      `https://api.mercadolibre.com/items/${itemId}/description`,
      { headers: HEADERS_API }
    );
    if (!resposta.ok) return "";
    const dados = await resposta.json();
    return dados.plain_text || dados.text || "";
  } catch (_) {
    return "";
  }
}

// ─── Extração / montagem de dados a partir do JSON da API ─────────────────

function extrairNome(item) {
  return item.title ? item.title.trim() : null;
}

function extrairImagem(item) {
  if (Array.isArray(item.pictures) && item.pictures.length > 0) {
    const primeira = item.pictures[0];
    return primeira.secure_url || primeira.url || null;
  }
  if (item.secure_thumbnail) return item.secure_thumbnail;
  if (item.thumbnail) return item.thumbnail;
  return null;
}

function extrairPrecos(item) {
  const precoPorNumero = typeof item.price === "number" ? item.price : null;
  const precoOriginalNumero =
    typeof item.original_price === "number" ? item.original_price : null;

  const resultado = {
    precoPor: formatarMoeda(precoPorNumero),
    precoDe: null,
  };

  // Só considera "De" se existir e for de fato maior que o preço atual
  if (
    precoOriginalNumero !== null &&
    precoPorNumero !== null &&
    precoOriginalNumero > precoPorNumero
  ) {
    resultado.precoDe = formatarMoeda(precoOriginalNumero);
  }

  return resultado;
}

function extrairDesconto(item, temPrecoDe) {
  if (!temPrecoDe) return "Desconto expirou";

  const precoPorNumero = item.price;
  const precoOriginalNumero = item.original_price;

  if (
    typeof precoPorNumero === "number" &&
    typeof precoOriginalNumero === "number" &&
    precoOriginalNumero > 0
  ) {
    const percentual = Math.round(
      ((precoOriginalNumero - precoPorNumero) / precoOriginalNumero) * 100
    );
    if (percentual > 0) return `${percentual}% OFF`;
  }

  return "Desconto expirou";
}

function extrairFrete(item) {
  if (item.shipping && item.shipping.free_shipping) return "Frete grátis";
  return "Não informado";
}

/**
 * Monta o objeto de variações a partir dos atributos (ficha técnica) da API.
 * Inclui qualquer atributo relevante (cor, tamanho, dimensão, peso, etc.).
 * Cada atributo vira { nome_do_atributo: [valor] } dentro de "variacoes",
 * seguindo o mesmo formato (objeto de arrays) já usado no produtos.json.
 */
function extrairVariacoes(item) {
  const variacoes = {};

  const atributosRelevantes = [
    /cor/i,
    /color/i,
    /tamanho/i,
    /size/i,
    /dimens/i,
    /comprimento/i,
    /largura/i,
    /altura/i,
    /peso/i,
    /volume/i,
    /capacidade/i,
    /material/i,
    /sabor/i,
    /voltagem/i,
    /modelo/i,
  ];

  if (Array.isArray(item.attributes)) {
    for (const atributo of item.attributes) {
      const nome = atributo.name;
      const valor = atributo.value_name;
      if (!nome || !valor) continue;

      const ehRelevante = atributosRelevantes.some((regex) => regex.test(nome));
      if (!ehRelevante) continue;

      if (!variacoes[nome]) variacoes[nome] = [];
      if (!variacoes[nome].includes(valor)) variacoes[nome].push(valor);
    }
  }

  // Caso o item tenha variações reais (combinações compráveis: cor/tamanho
  // escolhidos pelo comprador), inclui os valores possíveis também.
  if (Array.isArray(item.variations)) {
    for (const variacao of item.variations) {
      if (!Array.isArray(variacao.attribute_combinations)) continue;
      for (const combinacao of variacao.attribute_combinations) {
        const nome = combinacao.name;
        const valor = combinacao.value_name;
        if (!nome || !valor) continue;

        if (!variacoes[nome]) variacoes[nome] = [];
        if (!variacoes[nome].includes(valor)) variacoes[nome].push(valor);
      }
    }
  }

  return variacoes;
}

// ─── Principal ──────────────────────────────────────────────────────────────

async function main() {
  const [, , urlProduto, urlCheckout] = process.argv;

  if (!urlProduto || !urlCheckout) {
    console.error(
      "Uso: node adicionar-produto.js <url-ou-id-produto> <url-checkout>\n" +
        'Exemplo: node adicionar-produto.js "https://www.mercadolivre.com.br/..." "https://meli.la/..."\n' +
        'Exemplo: node adicionar-produto.js "MLB19603205" "https://meli.la/..."'
    );
    process.exit(1);
  }

  console.log("=== Adicionando novo produto ===");
  console.log(`URL/ID do produto : ${urlProduto}`);
  console.log(`URL de checkout   : ${urlCheckout}`);
  console.log("");

  const itemId = extrairItemId(urlProduto);
  console.log(`ID identificado   : ${itemId}`);

  console.log("Buscando dados na API do Mercado Livre...");
  const item = await buscarItem(itemId);

  console.log("Extraindo informações...");

  const nome = extrairNome(item);
  if (!nome) throw new Error("Não foi possível extrair o nome do produto.");
  console.log(`  Nome     : ${nome}`);

  const imagem = extrairImagem(item);
  if (!imagem) console.warn("  [aviso] Imagem não encontrada.");
  else console.log(`  Imagem   : ${imagem}`);

  const { precoPor, precoDe } = extrairPrecos(item);
  if (!precoPor) throw new Error("Não foi possível extrair o preço do produto.");
  console.log(`  precoPor : ${precoPor}`);
  if (precoDe) console.log(`  precoDe  : ${precoDe}`);

  const desconto = extrairDesconto(item, !!precoDe);
  console.log(`  Desconto : ${desconto}`);

  const frete = extrairFrete(item);
  console.log(`  Frete    : ${frete}`);

  const variacoes = extrairVariacoes(item);
  console.log(`  Variações/Características: ${JSON.stringify(variacoes)}`);

  console.log("Buscando descrição do produto...");
  const detalhesHtml = await buscarDescricao(itemId);
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
