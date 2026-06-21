# Robô verificador de produtos + gerador de páginas SEO (Mercado Livre)

Este robô faz duas coisas, todos os dias, automaticamente:

1. **Verifica preços**: confere se o preço, desconto (%) e frete dos seus
   produtos ainda correspondem ao que está no Mercado Livre, e corrige o
   `produtos.json` sozinho quando necessário.
2. **Gera páginas otimizadas para o Google**: cria uma página HTML própria
   para cada produto (em `/produto/nome-do-produto/`), além de atualizar
   a página inicial (catálogo) — tudo já escrito em HTML puro, sem depender
   de JavaScript para aparecer, o que ajuda o Google a indexar seu site.

Ele não cria produtos novos nem publica nada no Mercado Livre — só
confere/corrige os produtos que você já tem, e organiza as páginas do
site a partir deles.

## O que mudou na estrutura do site

- **`index.html`**: agora é gerado automaticamente pelo robô (catálogo
  com todos os produtos, já em HTML puro). Não edite esse arquivo
  manualmente — qualquer edição será sobrescrita na próxima execução.
- **`produto/`**: pasta nova, com uma subpasta para cada produto
  (ex: `produto/gel-de-limpeza-principia.../index.html`). Também gerada
  automaticamente.
- **`estilo.css`**: o visual do site (cores, fontes, layout), extraído
  para um arquivo único, compartilhado entre o catálogo e todas as
  páginas de produto.
- **`sitemap.xml`**: lista de todas as páginas do site, gerada
  automaticamente, que ajuda o Google a descobrir e indexar tudo.

## Arquivos deste pacote

- `verificar-produtos.js` — verifica os preços no Mercado Livre.
- `gerar-paginas-seo.js` — gera o catálogo e as páginas de produto.
- `produtos.json` — os dados dos seus produtos.
- `estilo.css` — o CSS compartilhado de todo o site.
- `.github/workflows/verificar-produtos.yml` — roda os dois scripts
  acima, em sequência, todos os dias.

## Como ativar (passo a passo)

1. **Suba estes arquivos para o seu repositório no GitHub**, mantendo a
   mesma estrutura de pastas (a pasta `.github/workflows` precisa ficar na
   raiz do repositório, exatamente com esse nome).
   - **Atenção**: isso vai **substituir** o `index.html` atual.
   - A pasta `produto/` é nova; ela será criada automaticamente.

2. **Confirme que o GitHub Actions está habilitado** e que as permissões
   de escrita estão ativas (Settings → Actions → General → Workflow
   permissions → "Read and write permissions").

3. **Rode manualmente uma vez** (aba Actions → "Verificar produtos no
   Mercado Livre" → Run workflow), para gerar as páginas pela primeira
   vez.

4. **Pronto.** A partir daí, o robô roda todo dia sozinho.

## Próximos passos para o SEO (fora do robô)

O robô resolve a parte técnica (conteúdo visível para o Google, meta
tags, URLs amigáveis). Mas SEO também depende de ações fora do código:

1. **Submeter o site ao Google Search Console**
   (search.google.com/search-console): cadastre seu site e envie o
   `sitemap.xml` (ex: `https://biroscaafiliado.netlify.app/sitemap.xml`).
   Isso acelera a indexação.

2. **Paciência**: mesmo com tudo certo tecnicamente, o Google pode levar
   dias ou semanas para indexar e começar a mostrar páginas novas nos
   resultados de busca.

3. **Conteúdo único**: páginas com descrições muito parecidas ao que já
   existe no próprio Mercado Livre tendem a rankear pior. Quanto mais
   original/detalhado for o texto de cada produto, melhor.

## Como testar manualmente (sem esperar o dia seguinte)

1. No GitHub, vá na aba **Actions** do seu repositório.
2. Clique no workflow **"Verificar produtos no Mercado Livre"**.
3. Clique no botão **"Run workflow"** → confirme.
4. Aguarde 1-2 minutos e veja se rodou com sucesso (✅).
5. Veja o log da etapa "Gerar páginas otimizadas para SEO" para confirmar
   que todas as páginas foram criadas.

## Como ler o relatório da última verificação de preços

Depois de cada execução, o arquivo `ultima-verificacao.json` mostra um
resumo do que foi verificado: quais produtos mudaram, quais ficaram
indisponíveis, e quais tiveram erro de acesso.
