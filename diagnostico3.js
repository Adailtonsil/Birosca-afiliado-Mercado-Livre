/**
 * diagnostico3.js
 *
 * Procura por blocos de dados estruturados que o Mercado Livre normalmente
 * embute na página (JSON-LD com schema.org/Product, ou um objeto de estado
 * inicial tipo __PRELOADED_STATE__). Esses blocos costumam ser muito mais
 * confiáveis do que caçar números soltos no HTML visual.
 */

const fs = require("fs");
const path = require("path");

const HEADERS_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

async function main() {
  const produtos = JSON.parse(
    fs.readFileSync(path.join(__dirname, "produtos.json"), "utf-8")
  );
  const produto = produtos[0];

  console.log("Produto testado:", produto.nome);
  console.log("Preço salvo atualmente no produtos.json:", produto.precoPor, "/ original:", produto.precoDe, "/ desconto:", produto.desconto);
  console.log("");

  const resposta = await fetch(produto.checkout, {
    headers: HEADERS_NAVEGADOR,
    redirect: "follow",
  });
  const html = await resposta.text();

  // --- 1. Procura blocos <script type="application/ld+json"> (schema.org) ---
  console.log("=== Blocos JSON-LD (application/ld+json) ===");
  const blocosLd = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  console.log("Blocos encontrados:", blocosLd.length);
  blocosLd.forEach((bloco, i) => {
    try {
      const json = JSON.parse(bloco[1]);
      console.log(`--- bloco ${i} (@type: ${json["@type"]}) ---`);
      if (json.offers) {
        console.log("  offers:", JSON.stringify(json.offers));
      }
      if (json.name) console.log("  name:", json.name);
    } catch (e) {
      console.log(`--- bloco ${i}: não foi possível parsear (${e.message}) ---`);
    }
  });
  console.log("");

  // --- 2. Mostra todas as ocorrências de current_price com mais contexto (200 chars) ---
  console.log("=== Todas ocorrências de 'current_price' com contexto amplo ===");
  const regex = /current_price/g;
  let match;
  let count = 0;
  while ((match = regex.exec(html)) !== null && count < 6) {
    const inicio = Math.max(0, match.index - 30);
    const fim = Math.min(html.length, match.index + 250);
    console.log(`--- ocorrência ${count} (posição ${match.index}) ---`);
    console.log(html.slice(inicio, fim));
    console.log("");
    count++;
  }

  // --- 3. Procura especificamente pelo preço principal da página (geralmente o maior destaque visual) ---
  console.log("=== Tentando achar o preco-principal-container (classe comum de preço destaque) ===");
  const m = html.match(/ui-pdp-price__second-line[\s\S]{0,400}/);
  console.log(m ? m[0] : "Não encontrou 'ui-pdp-price__second-line'");
}

main().catch((erro) => {
  console.error("ERRO:", erro.message);
  process.exit(1);
});
