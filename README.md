# Robô verificador de produtos (Mercado Livre)

Este robô confere, todos os dias automaticamente, se o **preço**, o **desconto (%)**
e o **frete** dos produtos do seu site ainda correspondem ao que está no
Mercado Livre. Se algo mudou, ele corrige o `produtos.json` sozinho. Se um
produto saiu do ar (anúncio removido), ele marca o produto como
"indisponível" no site (mas não remove do arquivo).

Ele **não cria** produtos novos e **não publica nada** no Mercado Livre —
só verifica e corrige os produtos que você já tem.

## Arquivos deste pacote

- `index.html` — sua página, agora carregando os produtos de `produtos.json`
  e mostrando um selo "Indisponível" quando aplicável.
- `produtos.json` — os dados dos seus produtos (preço, desconto, link, etc).
- `verificar-produtos.js` — o script que faz a verificação.
- `.github/workflows/verificar-produtos.yml` — a configuração que faz esse
  script rodar todo dia automaticamente, de graça, pelo GitHub Actions.

## Como ativar (passo a passo)

1. **Suba estes arquivos para o seu repositório no GitHub**, mantendo a
   mesma estrutura de pastas (a pasta `.github/workflows` precisa ficar na
   raiz do repositório, exatamente com esse nome).

2. **Confirme que o GitHub Actions está habilitado**:
   - No seu repositório, vá em **Settings → Actions → General**.
   - Em "Actions permissions", deixe marcado "Allow all actions".

3. **Dê permissão de escrita ao Actions** (para ele poder salvar as
   atualizações no `produtos.json`):
   - Ainda em **Settings → Actions → General**, role até **Workflow
     permissions**.
   - Marque **"Read and write permissions"**.
   - Salve.

4. **Pronto.** O robô vai rodar automaticamente todo dia, no horário
   configurado (09h, horário de Brasília — pode ajustar no arquivo
   `.yml` se quiser outro horário).

## Como testar manualmente (sem esperar o dia seguinte)

1. No GitHub, vá na aba **Actions** do seu repositório.
2. Clique no workflow **"Verificar produtos no Mercado Livre"**.
3. Clique no botão **"Run workflow"** → **"Run workflow"** de novo para
   confirmar.
4. Aguarde 1-2 minutos e atualize a página — você verá se rodou com
   sucesso (✅ verde) ou com erro (❌ vermelho).
5. Clique na execução para ver o log detalhado (o que foi verificado,
   o que mudou, se algum produto não pôde ser acessado).

## Importante: isso ainda precisa ser validado com o site real

Este robô foi testado com dados simulados (não foi possível testar direto
contra o Mercado Livre a partir deste ambiente). O Mercado Livre pode, em
alguns casos, bloquear acessos automatizados. Se isso acontecer, o robô
**não vai travar nem inventar dados** — ele simplesmente vai registrar
"não foi possível acessar" no relatório (`ultima-verificacao.json`) e
manter os dados antigos daquele produto, sem alterar nada.

Se isso acontecer com frequência, me avise os detalhes do erro encontrado
no log do GitHub Actions, e ajustamos a estratégia juntos (por exemplo,
adicionar mais pausas entre as requisições, ou trocar a forma de acessar
a página).

## Como ler o relatório da última verificação

Depois de cada execução, é gerado/atualizado um arquivo
`ultima-verificacao.json` no repositório, com um resumo do que foi feito:
quais produtos mudaram, quais ficaram indisponíveis, e quais tiveram erro
de acesso. É um bom lugar para checar rapidamente se tudo está saudável.
