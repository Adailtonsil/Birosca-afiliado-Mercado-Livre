/**
 * diagnostico6.js
 *
 * Já sabemos que "poly-price__current" aparece muitas vezes (18x) na
 * página, porque cada produto recomendado na vitrine usa a mesma classe.
 *
 * Este script procura marcadores que devem aparecer só 1 vez na página
 * (o <title>, o atributo og:title, o data-testid de breadcrumb, etc),
 * para descobrir em qual posição do HTML a "área principal" do produto
 * começa. Depois, mostra qual é a PRIMEIRA ocorrência de
 * "poly-price__current" que vem DEPOIS desse marcador -- essa deve ser
 * a do produto principal, não de uma recomendação.
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

  const resposta = await fetch(produto.checkout, {
    headers: HEADERS_NAVEGADOR,
    redirect: "follow",
  });
  const html = await resposta.text();
  console.log("Tamanho do HTML:", html.length);
  console.log("");

  // --- Candidatos a marcador único da área principal ---
  const candidatos = [
    { nome: "<title>", regex: /<title>([\s\S]*?)<\/title>/ },
    { nome: 'meta property="og:title"', regex: /property="og:title"\s+content="([^"]*)"/ },
    { nome: 'data-testid="action-row"', regex: null, classe: 'data-testid="action-row"' },
    { nome: "ui-pdp-title (classe de título do produto)", regex: null, classe: "ui-pdp-title" },
    { nome: "ui-pdp-price (classe geral da seção de preço principal)", regex: null, classe: "ui-pdp-price" },
  ];

  for (const c of candidatos) {
    if (c.regex) {
      const m = html.match(c.regex);
      console.log(`Marcador "${c.nome}":`, m ? `ENCONTRADO -> "${m[1]}"` : "não encontrado");
    } else {
      const todas = [...html.matchAll(new RegExp(c.classe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))];
      console.log(`Marcador "${c.nome}": ocorrências =`, todas.length, todas.length > 0 ? `(primeira posição: ${todas[0].index})` : "");
    }
  }
  console.log("");

  // --- Usa ui-pdp-price (classe geral da seção de preço, contêiner maior) como ponto de partida ---
  console.log("=== Testando 'ui-pdp-price' como ponto de partida ===");
  const posPdpPrice = html.indexOf("ui-pdp-price");
  console.log("Posição da primeira ocorrência de 'ui-pdp-price':", posPdpPrice);

  if (posPdpPrice !== -1) {
    // A partir dali, procura a primeira ocorrência de poly-price__current
    const trechoAPartirDaPosicao = html.slice(posPdpPrice);
    const posRelativaCurrent = trechoAPartirDaPosicao.indexOf("poly-price__current");
    console.log("Posição de 'poly-price__current' a partir daí (relativa):", posRelativaCurrent);

    if (posRelativaCurrent !== -1) {
      const posAbsoluta = posPdpPrice + posRelativaCurrent;
      const contexto = html.slice(posAbsoluta, posAbsoluta + 350);
      console.log("Contexto encontrado:");
      console.log(contexto.replace(/\s+/g, " "));

      const matchAria = contexto.match(/aria-label="([^"]*)"/);
      console.log("");
      console.log("aria-label nesse contexto:", matchAria ? matchAria[1] : "NÃO ENCONTRADO");
    }
  }

  console.log("");
  console.log("=== Posições de TODAS as 'poly-price__current', para comparar com 'ui-pdp-price' ===");
  const todasCurrent = [...html.matchAll(/poly-price__current/g)];
  todasCurrent.slice(0, 5).forEach((m, i) => console.log(`  [${i}] posição ${m.index}`));
}

main().catch((erro) => {
  console.error("ERRO:", erro.message);
  process.exit(1);
});
