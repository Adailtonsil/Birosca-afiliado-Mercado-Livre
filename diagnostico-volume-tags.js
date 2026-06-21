/**
 * diagnostico-volume-tags.js
 *
 * Foca em um único ponto: por que a busca por "ui-pdp-price__volume-tags"
 * não está encontrando o texto "20% OFF levando 3" no produto 1
 * (Gel de Limpeza). Mostra o trecho bruto exato (sem normalizar espaços)
 * para identificarmos qualquer diferença de formatação.
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
  const produto = produtos[0]; // Gel de Limpeza

  const resposta = await fetch(produto.checkout, {
    headers: HEADERS_NAVEGADOR,
    redirect: "follow",
  });
  const html = await resposta.text();

  console.log("Produto:", produto.nome);
  console.log("Tamanho do HTML:", html.length);
  console.log("");

  // Quantas vezes "ui-pdp-price__volume-tags" aparece?
  const todasOcorrencias = [...html.matchAll(/ui-pdp-price__volume-tags/g)];
  console.log("Ocorrências de 'ui-pdp-price__volume-tags':", todasOcorrencias.length);
  console.log("");

  if (todasOcorrencias.length === 0) {
    console.log("NÃO ENCONTROU a classe 'ui-pdp-price__volume-tags' em lugar nenhum do HTML.");
    console.log("Isso pode significar que o nome da classe é ligeiramente diferente,");
    console.log("ou que esse bloco só é inserido por JavaScript depois do carregamento inicial.");
  } else {
    const pos = todasOcorrencias[0].index;
    console.log("=== Trecho BRUTO (sem normalizar espaços), 800 caracteres a partir da 1a ocorrência ===");
    console.log(html.slice(pos, pos + 800));
    console.log("");
    console.log("=== Mesmo trecho, mas com espaços/quebras de linha visíveis como texto ===");
    console.log(JSON.stringify(html.slice(pos, pos + 800)));
  }

  console.log("");
  console.log("=== Procurando diretamente por 'levando' no HTML inteiro ===");
  const posLevando = html.indexOf("levando");
  if (posLevando === -1) {
    console.log("A palavra 'levando' NÃO aparece em lugar nenhum do HTML recebido.");
  } else {
    console.log("Encontrado na posição", posLevando, "- contexto bruto:");
    console.log(JSON.stringify(html.slice(Math.max(0, posLevando - 200), posLevando + 100)));
  }
}

main().catch((erro) => {
  console.error("ERRO:", erro.message);
  process.exit(1);
});
