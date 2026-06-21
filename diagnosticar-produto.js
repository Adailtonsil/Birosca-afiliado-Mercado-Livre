/**
 * diagnosticar-produto.js
 *
 * Script avulso só para investigar por que um produto específico não
 * está tendo o preço atualizado. Roda fora do fluxo normal do bot.
 *
 * Uso:
 *   node diagnosticar-produto.js "https://meli.la/2Ej5rgh"
 *
 * O que ele faz:
 * 1. Busca a página (igual o bot faz), seguindo redirecionamento
 * 2. Mostra a URL final, o status HTTP e o tamanho do HTML recebido
 * 3. Procura a classe "poly-price__current" no HTML e mostra os
 *    300 caracteres ao redor -- exatamente a janela que o bot usa
 * 4. Mostra se o aria-label "Agora: ..." foi encontrado ali dentro
 * 5. Salva o HTML completo em pagina-baixada.html para inspeção manual
 */

const fs = require("fs");

const HEADERS_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Uso: node diagnosticar-produto.js <url>");
    process.exit(1);
  }

  console.log(`Buscando: ${url}\n`);

  const resposta = await fetch(url, {
    headers: HEADERS_NAVEGADOR,
    redirect: "follow",
  });

  console.log("Status HTTP:", resposta.status);
  console.log("URL final (após redirecionamento):", resposta.url);
  console.log("Content-Type:", resposta.headers.get("content-type"));

  const html = await resposta.text();
  console.log("Tamanho do HTML recebido:", html.length, "caracteres\n");

  fs.writeFileSync("pagina-baixada.html", html, "utf-8");
  console.log("HTML completo salvo em: pagina-baixada.html\n");

  // Possíveis sinais de bloqueio / captcha / página diferente da esperada
  const sinaisDeBloqueio = [
    "captcha",
    "robot",
    "acesso negado",
    "blocked",
    "Just a moment",
    "Pardon Our Interruption",
  ];
  const encontrados = sinaisDeBloqueio.filter((sinal) =>
    html.toLowerCase().includes(sinal.toLowerCase())
  );
  if (encontrados.length > 0) {
    console.log("⚠️  POSSÍVEL BLOQUEIO DETECTADO. Termos encontrados no HTML:", encontrados);
    console.log("   Isso sugere que o site retornou uma página de verificação/bloqueio");
    console.log("   em vez da página real do produto.\n");
  }

  // --- Procura a classe usada pelo bot para extrair o preço atual ---
  const classeBusca = "poly-price__current";
  const posClasse = html.indexOf(classeBusca);

  if (posClasse === -1) {
    console.log(`❌ Classe "${classeBusca}" NÃO encontrada no HTML.`);
    console.log("   Isso explica por que precoPor veio null: o seletor que o bot");
    console.log("   usa não existe nesta página (pode ter mudado, ou a página");
    console.log("   recebida não é a página real do produto).\n");

    // Tenta achar variações próximas para ajudar a identificar o nome certo
    const candidatos = html.match(/poly-price__\w+/g);
    if (candidatos) {
      const unicos = [...new Set(candidatos)];
      console.log("   Classes parecidas encontradas no HTML:", unicos);
    } else {
      console.log("   Nenhuma classe começando com 'poly-price__' foi encontrada.");
    }

    const candidatosAndes = html.match(/andes-money-amount[\w-]*/g);
    if (candidatosAndes) {
      const unicos = [...new Set(candidatosAndes)];
      console.log("   Classes 'andes-money-amount' encontradas:", unicos);
    }
  } else {
    console.log(`✅ Classe "${classeBusca}" encontrada na posição ${posClasse}.`);
    const janela = html.slice(posClasse, posClasse + 300);
    console.log("\n--- Janela de 300 caracteres usada pelo bot ---");
    console.log(janela);
    console.log("--- fim da janela ---\n");

    const matchAria = janela.match(/aria-label="([^"]*)"/);
    if (!matchAria) {
      console.log("❌ Nenhum aria-label encontrado dentro dessa janela de 300 caracteres.");
      console.log("   Isso explica o problema: a classe existe, mas o aria-label");
      console.log("   com o valor 'Agora: X reais...' está fora da janela, ou tem");
      console.log("   uma estrutura HTML diferente da esperada.");
    } else {
      console.log("✅ aria-label encontrado:", matchAria[1]);
      const matchValor = matchAria[1].match(
        /Agora:\s*([\d.,]+)\s*reais?(?:\s*com\s*(\d{1,2})\s*centavos?)?/i
      );
      if (matchValor) {
        console.log("✅ Regex de valor bateu! Reais:", matchValor[1], "Centavos:", matchValor[2] || "0");
      } else {
        console.log("❌ O aria-label foi encontrado mas o regex 'Agora: X reais...' NÃO bateu.");
        console.log("   Texto exato do aria-label para comparar:", JSON.stringify(matchAria[1]));
      }
    }
  }
}

main().catch((erro) => {
  console.error("Erro no diagnóstico:", erro);
  process.exit(1);
});
