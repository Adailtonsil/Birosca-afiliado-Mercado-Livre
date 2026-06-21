/**
 * diagnostico5.js
 *
 * O robô relatou "Sem mudanças" para o Gel de Limpeza, mesmo com o preço
 * local errado (R$ 39,00) e o preço real sendo R$ 54,00. Isso só é possível
 * se a extração do preço atual (precoPor) tiver falhado silenciosamente.
 *
 * Este script reproduz exatamente a extração de precoPor e mostra cada
 * etapa do processo, para descobrir onde ela está falhando.
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

function extrairBlocoComAriaLabel(html, classeBusca, regexAriaLabel) {
  const posClasse = html.indexOf(classeBusca);
  if (posClasse === -1) return { erro: `Classe "${classeBusca}" não encontrada em NENHUM lugar do HTML` };

  const janelaDepois = html.slice(posClasse, posClasse + 300);
  console.log(`  Janela de 300 caracteres após a classe "${classeBusca}":`);
  console.log("  " + janelaDepois.replace(/\s+/g, " "));

  const matchAria = janelaDepois.match(/aria-label="([^"]*)"/);
  if (!matchAria) return { erro: "Classe encontrada, mas SEM aria-label nos 300 caracteres seguintes" };

  const textoAriaLabel = matchAria[1];
  console.log(`  aria-label encontrado: "${textoAriaLabel}"`);

  const resultadoRegex = textoAriaLabel.match(regexAriaLabel);
  if (!resultadoRegex) return { erro: `aria-label encontrado ("${textoAriaLabel}") mas não bateu com o padrão esperado (ex: "Agora: X reais")` };

  return { sucesso: resultadoRegex };
}

async function main() {
  const produtos = JSON.parse(
    fs.readFileSync(path.join(__dirname, "produtos.json"), "utf-8")
  );
  const produto = produtos[0]; // Gel de Limpeza

  console.log("Produto:", produto.nome);
  console.log("Link:", produto.checkout);
  console.log("");

  const resposta = await fetch(produto.checkout, {
    headers: HEADERS_NAVEGADOR,
    redirect: "follow",
  });
  const html = await resposta.text();
  console.log("Status:", resposta.status, "| Tamanho HTML:", html.length);
  console.log("");

  console.log("=== Quantas vezes 'poly-price__current' aparece no HTML? ===");
  const todasOcorrencias = [...html.matchAll(/poly-price__current/g)];
  console.log("Ocorrências totais:", todasOcorrencias.length);
  console.log("");

  console.log("=== Tentando extrair precoPor (igual ao robô faz) ===");
  const resultado = extrairBlocoComAriaLabel(
    html,
    "poly-price__current",
    /Agora:\s*([\d.,]+)\s*reais?(?:\s*com\s*(\d{1,2})\s*centavos?)?/i
  );

  if (resultado.erro) {
    console.log("FALHOU:", resultado.erro);
  } else {
    console.log("SUCESSO:", resultado.sucesso[0]);
  }
  console.log("");

  // Se a primeira ocorrência falhou, mostra contexto de TODAS as ocorrências
  // de poly-price__current, para ver se uma das outras tem o aria-label certo
  if (todasOcorrencias.length > 1) {
    console.log("=== Existem múltiplas ocorrências. Mostrando contexto de cada uma ===");
    todasOcorrencias.forEach((m, i) => {
      const trecho = html.slice(m.index, m.index + 300).replace(/\s+/g, " ");
      console.log(`--- ocorrência ${i} (posição ${m.index}) ---`);
      console.log(trecho);
      console.log("");
    });
  }

  // Mostra também o contexto ao redor de "Agora:" diretamente, caso exista
  // em outro formato diferente do esperado
  console.log("=== Buscando 'Agora:' diretamente no HTML (texto livre) ===");
  const todasAgora = [...html.matchAll(/Agora:[^"<]{0,60}/gi)];
  console.log("Ocorrências de 'Agora:' encontradas:", todasAgora.length);
  todasAgora.slice(0, 5).forEach((m, i) => console.log(`[${i}] "${m[0]}"`));
}

main().catch((erro) => {
  console.error("ERRO:", erro.message);
  process.exit(1);
});
