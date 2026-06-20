/**
 * diagnostico2.js
 *
 * Investigação mais profunda: tenta vários padrões diferentes de onde
 * o Mercado Livre costuma esconder o preço no HTML, e mostra um trecho
 * de contexto ao redor de cada ocorrência da palavra "price" encontrada,
 * para identificarmos visualmente o formato real usado atualmente.
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
  console.log("Link original:", produto.checkout);

  const resposta = await fetch(produto.checkout, {
    headers: HEADERS_NAVEGADOR,
    redirect: "follow",
  });
  const html = await resposta.text();
  console.log("Tamanho do HTML:", html.length);
  console.log("");

  // --- Tentativa 1: classe andes-money-amount (padrão visual comum do ML) ---
  console.log("=== Tentativa: andes-money-amount__fraction ===");
  const m1 = [...html.matchAll(/andes-money-amount__fraction"[^>]*>([\d.,]+)</g)];
  console.log("Ocorrências encontradas:", m1.length);
  m1.slice(0, 6).forEach((m, i) => console.log(`  [${i}] valor: ${m[1]}`));
  console.log("");

  // --- Tentativa 2: qualquer JSON embutido com "price": ---
  console.log("=== Tentativa: \"price\":NUMERO em JSON embutido ===");
  const m2 = [...html.matchAll(/"price"\s*:\s*([\d.]+)/g)];
  console.log("Ocorrências encontradas:", m2.length);
  m2.slice(0, 10).forEach((m, i) => console.log(`  [${i}] valor: ${m[1]}`));
  console.log("");

  // --- Tentativa 3: meta property og:price:amount (padrão Open Graph) ---
  console.log("=== Tentativa: og:price:amount ===");
  const m3 = html.match(/property="og:price:amount"\s+content="([\d.]+)"/);
  console.log(m3 ? `Encontrou: ${m3[1]}` : "Não encontrou");
  console.log("");

  // --- Mostra contexto ao redor de cada ocorrência da palavra "price" (até 5) ---
  console.log("=== CONTEXTO ao redor de cada 'price' encontrado (bruto) ===");
  const regexPrice = /price/gi;
  let count = 0;
  let match;
  while ((match = regexPrice.exec(html)) !== null && count < 8) {
    const inicio = Math.max(0, match.index - 80);
    const fim = Math.min(html.length, match.index + 80);
    console.log(`--- ocorrência ${count + 1} (posição ${match.index}) ---`);
    console.log(html.slice(inicio, fim).replace(/\s+/g, " "));
    console.log("");
    count++;
  }

  // --- Mostra contexto ao redor da palavra "OFF" (já sabemos que funciona) ---
  console.log("=== CONTEXTO ao redor de '% OFF' (sabemos que funciona) ===");
  const idxOff = html.search(/\d{1,3}\s*%\s*OFF/i);
  if (idxOff >= 0) {
    console.log(html.slice(Math.max(0, idxOff - 150), idxOff + 150).replace(/\s+/g, " "));
  }
}

main().catch((erro) => {
  console.error("ERRO:", erro.message);
  process.exit(1);
});
