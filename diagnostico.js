/**
 * diagnostico.js
 *
 * Script TEMPORÁRIO só para diagnóstico. Baixa o HTML bruto da página do
 * produto exatamente como o adicionar-produto.js faria, e salva em um
 * arquivo (diagnostico.html) para podermos inspecionar o que o Mercado
 * Livre está realmente devolvendo para o GitHub Actions.
 *
 * Uso:
 *   node diagnostico.js "https://www.mercadolivre.com.br/..."
 *
 * Depois de rodar, abra o arquivo diagnostico.html gerado (ele fica
 * disponível como artifact do workflow, ou você pode commitar temporariamente
 * para visualizar) e me envie um trecho perto de "ui-pdp-title" ou as
 * primeiras 100 linhas.
 */

const fs = require("fs");

const HEADERS_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Uso: node diagnostico.js <url>");
    process.exit(1);
  }

  console.log(`Buscando: ${url}`);
  const resposta = await fetch(url, {
    headers: HEADERS_NAVEGADOR,
    redirect: "follow",
  });

  console.log(`Status HTTP: ${resposta.status}`);
  console.log(`URL final (após redirects): ${resposta.url}`);

  const html = await resposta.text();
  console.log(`Tamanho do HTML: ${html.length} caracteres`);

  fs.writeFileSync("diagnostico.html", html, "utf-8");
  console.log("HTML salvo em diagnostico.html");

  console.log("\n=== Verificações rápidas ===");
  console.log("Contém 'ui-pdp-title'?       ", html.includes("ui-pdp-title"));
  console.log("Contém '<h1'?                ", html.includes("<h1"));
  console.log("Contém 'mlstatic.com'?       ", html.includes("mlstatic.com"));
  console.log("Contém 'captcha'?            ", /captcha/i.test(html));
  console.log("Contém 'robot' ou 'bot'?     ", /are you a robot|verifica.*humano|unusual traffic/i.test(html));
  console.log("Contém 'javascript' (aviso)? ", /enable javascript|habilite o javascript/i.test(html));

  console.log("\n=== Primeiros 1500 caracteres do HTML ===");
  console.log(html.slice(0, 1500));

  console.log("\n=== Trecho ao redor de <title> ===");
  const idxTitle = html.indexOf("<title");
  if (idxTitle !== -1) {
    console.log(html.slice(idxTitle, idxTitle + 300));
  } else {
    console.log("Tag <title> não encontrada.");
  }

  console.log("\n=== Trecho ao redor de <h1 (se existir) ===");
  const idxH1 = html.indexOf("<h1");
  if (idxH1 !== -1) {
    console.log(html.slice(idxH1, idxH1 + 500));
  } else {
    console.log("Nenhuma tag <h1 encontrada no HTML.");
  }
}

main().catch((erro) => {
  console.error("Erro:", erro.message);
  process.exit(1);
});
