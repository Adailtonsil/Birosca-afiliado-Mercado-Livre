/**
 * gerar-paginas-seo.js
 *
 * O que este script faz:
 * 1. Lê o produtos.json
 * 2. Para cada produto, cria uma pasta produto/<slug-do-nome>/ com um
 *    index.html PRÓPRIO, contendo:
 *    - <title> e <meta description> específicos do produto
 *    - Open Graph (og:title, og:description, og:image) para prévias
 *      bonitas no WhatsApp/Instagram/Facebook
 *    - O conteúdo do produto já escrito em HTML puro, visível para o
 *      Google sem precisar executar JavaScript
 * 3. Gera também um sitemap.xml simples, listando todas as páginas,
 *    para ajudar o Google a descobrir e indexar todas elas.
 *
 * Este script não altera o produtos.json -- ele só LÊ os dados e GERA
 * arquivos HTML estáticos a partir deles.
 */

const fs = require("fs");
const path = require("path");

const ARQUIVO_PRODUTOS = path.join(__dirname, "produtos.json");
const PASTA_SAIDA = path.join(__dirname, "produto");
const URL_BASE = "https://biroscaafiliado.netlify.app";

/**
 * Transforma o nome do produto em um "slug": texto simples, em minúsculas,
 * sem acentos, sem caracteres especiais, com palavras separadas por hífen.
 * Exemplo: "Gel De Limpeza Principia Ácido Salicílico + Glicerina 350g"
 *       -> "gel-de-limpeza-principia-acido-salicilico-glicerina-350g"
 */
/**
 * Verifica se um valor de precoDe/desconto é um placeholder inválido
 * (texto de exemplo que nunca foi confirmado contra a página real, como
 * "Não informado"), para evitar mostrar isso no site.
 */
function ehValorInvalido(valor) {
  if (!valor) return true;
  const valorNormalizado = valor.toLowerCase();
  return (
    valorNormalizado.includes("não informado") ||
    valorNormalizado.includes("nao informado")
  );
}

function gerarSlug(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove caracteres especiais
    .trim()
    .replace(/\s+/g, "-") // espaços -> hífen
    .replace(/-+/g, "-"); // remove hífens duplicados
}

/**
 * Cria uma descrição curta (até ~155 caracteres, ideal para meta description)
 * a partir do HTML de detalhes do produto, removendo tags HTML.
 */
function gerarDescricaoCurta(produto) {
  const textoSemHtml = (produto.detalhesHtml || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const baseDescricao = textoSemHtml || produto.nome;
  const precoTexto = produto.precoPor ? ` Por ${produto.precoPor}.` : "";
  const fretetexto = produto.frete ? ` ${produto.frete}.` : "";

  const descricaoCompleta = `${produto.nome}.${precoTexto}${fretetexto} ${baseDescricao}`;
  return descricaoCompleta.slice(0, 155).trim();
}

/**
 * Escapa texto para uso seguro dentro de atributos HTML (aspas, etc),
 * evitando que nomes de produto com caracteres especiais quebrem o HTML.
 */
function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function gerarHtmlVariacoes(variacoes) {
  if (!variacoes) return "";
  return Object.entries(variacoes)
    .map(
      ([nome, valores]) => `
        <p style="margin-top: 16px;"><strong>${escaparHtml(nome)}:</strong></p>
        <div class="variant-chips">
          ${valores.map((v) => `<span class="variant-chip">${escaparHtml(v)}</span>`).join("")}
        </div>
      `
    )
    .join("");
}

function gerarHtmlProduto(produto, slug) {
  const urlCanonica = `${URL_BASE}/produto/${slug}/`;
  const descricaoCurta = gerarDescricaoCurta(produto);
  const tituloPagina = `${produto.nome} | Birosca Afiliado Mercado Livre`;

  const variacoesHtml = gerarHtmlVariacoes(produto.variacoes);

  const blocoCompraOuIndisponivel = produto.indisponivel
    ? `<span class="unavailable-badge">PRODUTO INDISPONÍVEL NO MOMENTO</span>`
    : `<a class="buy-button" href="${escaparHtml(produto.checkout)}" target="_blank" rel="noopener noreferrer nofollow sponsored">
        COMPRAR NO MERCADO LIVRE
      </a>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${escaparHtml(tituloPagina)}</title>
  <meta name="description" content="${escaparHtml(descricaoCurta)}">
  <link rel="canonical" href="${urlCanonica}">
  <link rel="icon" type="image/png" href="${URL_BASE}/favicon-32.png">

  <!-- Open Graph: como o link aparece quando compartilhado no WhatsApp, Instagram, Facebook -->
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escaparHtml(produto.nome)}">
  <meta property="og:description" content="${escaparHtml(descricaoCurta)}">
  <meta property="og:image" content="${escaparHtml(produto.imagem)}">
  <meta property="og:url" content="${urlCanonica}">
  <meta property="og:locale" content="pt_BR">

  <!-- Twitter Card (mesma ideia do Open Graph, usada por algumas plataformas) -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escaparHtml(produto.nome)}">
  <meta name="twitter:description" content="${escaparHtml(descricaoCurta)}">
  <meta name="twitter:image" content="${escaparHtml(produto.imagem)}">

  <link rel="stylesheet" href="${URL_BASE}/estilo.css">
</head>

<body>
  <header class="hero">
    <div class="hero-top">
      <h1 class="hero-title">Pagina de afiliado do Mercado Livre.</h1>
    </div>
    <nav class="hero-nav">
      <a href="${URL_BASE}/">Melhores Ofertas</a>
      <a href="${URL_BASE}/produtos-testados">Produtos testados</a>
    </nav>
  </header>

  <div class="page-shell">
  <main class="product-page">
    <section class="detail-card">
      <div class="detail-image-wrap">
        <img src="${escaparHtml(produto.imagem)}" alt="${escaparHtml(produto.nome)}">
      </div>
      <div class="detail-content">
        <a class="back-link" href="${URL_BASE}/">Voltar para o catalogo</a>
        <h1 class="detail-title">${escaparHtml(produto.nome)}</h1>

        <div class="detail-price-wrap">
          ${!ehValorInvalido(produto.precoDe) ? `<span class="detail-old-price">${escaparHtml(produto.precoDe)}</span>` : ""}
          <span class="detail-current-price">${escaparHtml(produto.precoPor)}</span>
          ${(produto.desconto && !ehValorInvalido(produto.desconto)) ? `<span class="detail-discount${produto.desconto === "Desconto não aplicável" ? " is-neutral" : ""}">${escaparHtml(produto.desconto)}</span>` : ""}
        </div>

        <p class="detail-shipping">${escaparHtml(produto.frete)}</p>

        <div class="detail-variants">
          ${variacoesHtml}
        </div>

        ${blocoCompraOuIndisponivel}
      </div>
    </section>

    <section class="detail-description-box">
      ${produto.detalhesHtml || ""}
    </section>
  </main>
  </div>

  <footer class="footer">
    <p><strong>AVISO:</strong> Este site participa de programas de afiliados. Ao clicar nos links, você será redirecionado para plataformas parceiras, onde a compra é realizada. Podemos receber comissão sem custo adicional para você.</p>
  </footer>
</body>

</html>
`;
}

function gerarHtmlCardCatalogo(produto, slug) {
  const variacoesHtml = produto.variacoes
    ? Object.entries(produto.variacoes)
      .map(
        ([nome, valores]) => `
              <p class="info-line"><strong>${escaparHtml(nome)}:</strong> ${valores.map(escaparHtml).join(", ")}</p>
            `
      )
      .join("")
    : "";

  const blocoCompraOuIndisponivel = produto.indisponivel
    ? `<span class="unavailable-badge">PRODUTO INDISPONÍVEL</span>`
    : `<a class="buy-button" href="${escaparHtml(produto.checkout)}" target="_blank" rel="noopener noreferrer nofollow sponsored">
                COMPRAR
              </a>`;

  return `
        <a class="image-wrap" href="/produto/${slug}/">
          <img src="${escaparHtml(produto.imagem)}" alt="${escaparHtml(produto.nome)}" loading="lazy">
        </a>
        <div class="content">
          <a class="product-link" href="/produto/${slug}/">${escaparHtml(produto.nome)}</a>
          <div class="price-wrap">
            ${!ehValorInvalido(produto.precoDe) ? `<span class="old-price">${escaparHtml(produto.precoDe)}</span>` : ""}
            <span class="current-price">${escaparHtml(produto.precoPor)}</span>
            ${(produto.desconto && !ehValorInvalido(produto.desconto)) ? `<span class="discount-badge${produto.desconto === "Desconto não aplicável" ? " is-neutral" : ""}">${escaparHtml(produto.desconto)}</span>` : ""}
          </div>
          <p class="shipping">${escaparHtml(produto.frete)}</p>
          ${variacoesHtml}
          ${blocoCompraOuIndisponivel}
        </div>
      `;
}

function gerarHtmlCatalogo(produtos, slugsPorId) {
  const cardsHtml = produtos
    .map((produto) => {
      const slug = slugsPorId[produto.id];
      const classeCard = produto.indisponivel ? "card is-unavailable" : "card";
      return `<article class="${classeCard}">${gerarHtmlCardCatalogo(produto, slug)}</article>`;
    })
    .join("\n");

  const descricaoCatalogo =
    "Confira as melhores ofertas e maiores descontos do Mercado Livre, atualizados todos os dias: eletrônicos, moda, casa e muito mais.";

  return `<!DOCTYPE html>
<html lang="pt-BR">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Birosca Afiliado Mercado Livre | Melhores Ofertas e Promoções</title>
  <meta name="description" content="${escaparHtml(descricaoCatalogo)}">
  <link rel="canonical" href="${URL_BASE}/">
  <link rel="icon" type="image/png" href="${URL_BASE}/favicon-32.png">

  <meta property="og:type" content="website">
  <meta property="og:title" content="Birosca Afiliado Mercado Livre | Melhores Ofertas e Promoções">
  <meta property="og:description" content="${escaparHtml(descricaoCatalogo)}">
  <meta property="og:url" content="${URL_BASE}/">
  <meta property="og:locale" content="pt_BR">

  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Birosca Afiliado Mercado Livre | Melhores Ofertas e Promoções">
  <meta name="twitter:description" content="${escaparHtml(descricaoCatalogo)}">

  <link rel="stylesheet" href="/estilo.css">
</head>

<body>
  <header class="hero">
    <div class="hero-top">
      <h1 class="hero-title">Pagina de afiliado do Mercado Livre.</h1>
    </div>
    <nav class="hero-nav">
      <a class="active" href="/">Melhores Ofertas</a>
      <a href="/produtos-testados">Produtos testados</a>
    </nav>
  </header>

  <div class="page-shell">
  <main class="catalog">
${cardsHtml}
  </main>
  </div>

  <footer class="footer">
    <p><strong>AVISO:</strong> Este site participa de programas de afiliados. Ao clicar nos links, você será redirecionado para plataformas parceiras, onde a compra é realizada. Podemos receber comissão sem custo adicional para você.</p>
    <p><strong>ISENÇÃO DE RESPONSABILIDADE:</strong> Não nos responsabilizamos por preços, prazos de entrega ou condições dos produtos, que são definidos pela plataforma de destino.</p>
    <p><strong>PRIVACIDADE:</strong> Este site não coleta dados pessoais diretamente. Eventuais dados podem ser coletados automaticamente por serviços de hospedagem ou navegação padrão.</p>
  </footer>
</body>

</html>
`;
}

function main() {
  const produtos = JSON.parse(fs.readFileSync(ARQUIVO_PRODUTOS, "utf-8"));

  // Limpa a pasta de saída antes de gerar de novo, para remover páginas
  // de produtos que possam ter sido excluídos do produtos.json
  if (fs.existsSync(PASTA_SAIDA)) {
    fs.rmSync(PASTA_SAIDA, { recursive: true, force: true });
  }
  fs.mkdirSync(PASTA_SAIDA, { recursive: true });

  const urlsGeradas = [];
  const slugsPorId = {};

  for (const produto of produtos) {
    const slug = gerarSlug(produto.nome);
    slugsPorId[produto.id] = slug;

    const pastaProduto = path.join(PASTA_SAIDA, slug);
    fs.mkdirSync(pastaProduto, { recursive: true });

    const html = gerarHtmlProduto(produto, slug);
    fs.writeFileSync(path.join(pastaProduto, "index.html"), html, "utf-8");

    urlsGeradas.push(`${URL_BASE}/produto/${slug}/`);
    console.log(`Gerado: produto/${slug}/index.html`);
  }

  // Gera a página inicial (catálogo) com todos os produtos já escritos em HTML
  const htmlCatalogo = gerarHtmlCatalogo(produtos, slugsPorId);
  fs.writeFileSync(path.join(__dirname, "index.html"), htmlCatalogo, "utf-8");
  console.log("\nGerado: index.html (catálogo)");

  // Gera um sitemap.xml simples, listando a home e todas as páginas de produto
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${URL_BASE}/</loc></url>
${urlsGeradas.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(__dirname, "sitemap.xml"), sitemap, "utf-8");
  console.log("Gerado: sitemap.xml");

  console.log(`\n=== ${produtos.length} páginas de produto + catálogo gerados com sucesso ===`);
}

main();
