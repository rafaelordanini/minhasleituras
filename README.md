# MinhasLeituras

Protótipo de um leitor web minimalista com biblioteca, destaques, notas, busca, exportação e áudio.

## O que mudou nesta versão

A importação de links agora passa por uma função serverless em `api/import.js`. Isso evita o bloqueio de CORS que ocorre quando o navegador tenta buscar diretamente páginas como `https://ciudadseva.com/texto/chac-mool/`.

A API:

- valida a URL e bloqueia endereços locais/privados;
- segue poucos redirecionamentos e revalida cada destino;
- limita tamanho e tempo da resposta;
- extrai o texto principal com Mozilla Readability;
- sanitiza o HTML antes de devolvê-lo ao navegador.

## Dependências

- `@mozilla/readability` 0.6.0
- `jsdom` 30.0.1
- `sanitize-html` 2.17.7

## Deploy na Vercel

1. Importe este repositório na Vercel.
2. Mantenha as configurações padrão do projeto.
3. Faça o deploy.
4. Abra a URL gerada pela Vercel e teste **Adicionar link**.

A Vercel detecta automaticamente `api/import.js` como função serverless e serve `index.html` como aplicação estática.

> A versão aberta diretamente como arquivo local ou hospedada apenas no GitHub Pages não consegue executar `/api/import`; para importação de links, use a versão publicada na Vercel.
