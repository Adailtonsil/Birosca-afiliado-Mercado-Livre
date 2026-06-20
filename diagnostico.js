/**
 * diagnostico.js
 *
 * Script temporário, só para investigar o que está acontecendo.
 * Ele acessa o link de afiliado do PRIMEIRO produto do produtos.json,
 * e imprime no log:
 * - O status HTTP da resposta
 * - A URL final, depois de seguir os redirecionamentos
 * - Os primeiros 2000 caracteres do HTML recebido
 * - Se encontrou (ou não) os padrões de preço que o robô principal procura
 *
 * Depois de descobrirmos o problema, este arquivo pode ser apagado.
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

  // Testa só o primeiro produto, para um diagnóstico rápido e focado
  const produto = produtos[0];
  console.log("=== DIAGNÓSTICO ===");
  console.log("Produto testado:", produto.nome);
  console.log("Link original (checkout):", produto.checkout);
  console.log("");

  const resposta = await fetch(produto.checkout, {
    headers: HEADERS_NAVEGADOR,
    redirect: "follow",
  });

  console.log("Status HTTP da resposta:", resposta.status);
  console.log("URL final (após redirecionamentos):", resposta.url);
  console.log("");

  const html = await resposta.text();
  console.log("Tamanho total do HTML recebido:", html.length, "caracteres");
  console.log("");
  console.log("--- PRIMEIROS 2000 CARACTERES DO HTML ---");
  console.log(html.slice(0, 2000));
  console.log("--- FIM DO TRECHO ---");
  console.log("");

  // Testa os padrões que o robô principal usa
  console.log("=== TESTANDO OS PADRÕES DE BUSCA ===");

  const padraoPreco = html.match(/itemprop="price"\s+content="([\d.]+)"/);
  console.log(
    "Padrão 'itemprop price':",
    padraoPreco ? `ENCONTROU -> ${padraoPreco[1]}` : "NÃO ENCONTROU"
  );

  const padraoPrecoOriginal = html.match(/"original_price"\s*:\s*([\d.]+)/);
  console.log(
    "Padrão 'original_price':",
    padraoPrecoOriginal ? `ENCONTROU -> ${padraoPrecoOriginal[1]}` : "NÃO ENCONTROU"
  );

  const padraoDesconto = html.match(/(\d{1,3})\s*%\s*OFF/i);
  console.log(
    "Padrão '% OFF':",
    padraoDesconto ? `ENCONTROU -> ${padraoDesconto[1]}%` : "NÃO ENCONTROU"
  );

  // Pistas extras de diagnóstico: indícios comuns de bloqueio/captcha
  console.log("");
  console.log("=== PISTAS DE BLOQUEIO ===");
  console.log("Contém 'captcha'?", /captcha/i.test(html));
  console.log("Contém 'robot' ou 'automated'?", /robot|automated/i.test(html));
  console.log("Contém 'access denied' ou 'blocked'?", /access denied|blocked/i.test(html));
  console.log("Contém 'cloudflare'?", /cloudflare/i.test(html));
  console.log("Contém a palavra 'produto' (sinal de página normal)?", /produto/i.test(html));
  console.log("Contém 'mercadolivre' ou 'mercadolibre'?", /mercadolivre|mercadolibre/i.test(html));
}

main().catch((erro) => {
  console.error("ERRO durante o diagnóstico:", erro.message);
  process.exit(1);
});
