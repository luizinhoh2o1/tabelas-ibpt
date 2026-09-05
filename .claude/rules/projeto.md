---
description: Regras gerais do projeto IBPT API Estática
paths: ["**/*"]
---

# Regras do Projeto

## Escrita

- Nomenclatura em português, camelCase, sem acentos no código: `processarCsv`, `gerarMetaDados`, `aliquotaNacionalFederal`
- Texto visível ao usuário (HTML, README, mensagens) leva acentuação correta
- **Não usar travessão (`—`) em nenhum arquivo.** Usar hífen, dois-pontos ou reescrever a frase. Vale para código, comentários, HTML e Markdown
- O produto se chama **Tabelas IBPT**. É o valor de `<title>`, `og:title`, `twitter:title` e do `name` no JSON-LD. Não usar "IBPT API" nem acrescentar subtítulo depois de traço
- Números em texto (tamanhos, % de compressão, contagens) nunca são escritos à mão: saem de `docs/api/meta.json` → `estatisticas`. Antes de citar um número no README ou na página, ler o arquivo

## Tecnologias

- TypeScript com ES Modules; importações com extensão `.js`
- Node.js >= 22 (`import.meta.dirname`, `node:test`, `os.tmpdir()`)
- gzip nível 9 para dados; `DecompressionStream` no browser
- Dependência de runtime: só `fflate`. Antes de adicionar outra, verificar se a stdlib do Node resolve

## Estrutura de dados

- Registro: `codigo`, `excecao`, `descricao`, `aliquotaNacionalFederal`, `aliquotaImportadosFederal`, `aliquotaEstadual`, `aliquotaMunicipal`, `vigenciaInicio`, `vigenciaFim`
- Vigências são string `dd/mm/aaaa`, vindas de `campos[8]` e `campos[9]` do CSV original
- Tipos: `ncm`, `nbs`, `lc116`. 27 UFs
- CSV consolidado tem 13 colunas: `ano;tabela;tipo;uf;codigo;excecao;descricao;` + 4 alíquotas + 2 vigências

## Build

- `npm run build` (incremental), `npm run build -- --completo` (ignora cache), `npm test` (parser CSV)
- Saída em `docs/api/`, gitignored. Nunca editar nem commitar
- CSVs do IBPT vêm em `latin1` (ISO-8859-1); ler com `encoding: 'latin1'`
- Processar CSV por streaming (readline); escrever arquivos em paralelo com `Promise.all`
- CSV consolidado por ano (`todos-{ano}.csv.gz`) via `createGzip`, para não acumular em memória
- ZIPs extraídos com `fflate`, não com o binário `unzip` (não existe no Windows nem no macOS). Temporários em `os.tmpdir()`
- `extrairZip()` grava cada entrada pelo nome-base, então CSV dentro de subpasta é achatado na extração
- **Nunca montar `metaDados.versoes` a partir da lista de ZIPs.** Só entra a versão que gerou arquivo (`codigosGerados`); caso contrário o filtro da página oferece versão que responde 404
- ZIP que não gera dados: o build imprime `ERRO:` com a lista e sai com `process.exitCode = 1`, para o CI não publicar site parcial
- Testes em `src/*.test.ts` com `node:test` + `node:assert/strict`. Sem framework, sem dependência nova. O CI roda antes do build
- `analisarLinhaCsv` e `pegarCampo` são exportados só para teste; mexeu neles, rodar `npm test`

### Cache incremental

- A granularidade é o **ano**, não a versão: o CSV do ano cobre todas as versões dele, então um ZIP alterado reconstrói o ano inteiro
- `docs/api/_manifesto.json` guarda o sha256 de cada ZIP e os totais do ano; ano inalterado com saída no disco é reaproveitado
- O manifesto guarda também o sha256 de `src/*.ts`. Mudou o código do build, o cache inteiro é descartado. Sem isso o `restore-keys` do CI restauraria cache gerado por código antigo
- Ao mudar o formato do manifesto, subir `VERSAO_MANIFESTO` em `geradorJson.ts`
- No CI, `actions/cache` guarda `docs/api` entre execuções; num checkout limpo não haveria nada contra o que ser incremental

## Infraestrutura

- Deploy por GitHub Actions (`upload-pages-artifact` com `path: docs`). Só o conteúdo de `docs/` vai para o site
- O domínio customizado vem de **Settings > Pages**, não de um arquivo `CNAME`. Deploy por Actions ignora o `CNAME`; não recriar esse arquivo
- `docs/public/` é servido como `/public/`. Logo e favicons ficam ali e são referenciados por `/public/...`. Pasta `public/` na raiz do repositório não seria publicada
- **`docs/api/` ocupa ~1,1 GB e o limite documentado do GitHub Pages é 1 GB.** Antes de acrescentar arquivo novo à saída, considerar o total
- Os ZIPs em `repositorio-ibpt/` são rastreados neste repositório (não há `.gitmodules`). São binários já deflacionados: o git não faz delta e cada atualização grava um blob inteiro, então `.git` cresce ~5,7 MB por tabela

## Interface web (`docs/index.html`)

Página única, sem build step. HTML, CSS e JS no mesmo arquivo, propositalmente.

- Design System VALRAW UI light corporate, tokens em CSS vars no `<style>`
- Paleta própria, amostrada do `logo.webp`: azul `#000793` primário, verde `#05C700` acento, slate `#1F2937` neutro, fundos `#FFFFFF`/`#F7F9FC`, bordas `#EDF2F7`/`#E2E8F0`. **Não usar o laranja da `recuperaqui-landing`**, de onde vieram só a estrutura e os componentes
- Verde `#05C700` é decorativo (barras, orbs, gradientes): 2,3:1 sobre branco. Para texto, ou fundo com texto branco, usar `--verde-escuro` `#037A00` (5,5:1)
- Elevação por sombra (`--sombra-card`, `--sombra-card-hover`), não por glow
- Fontes Ubuntu e Ubuntu Mono; ícones Font Awesome 6; layout mobile-first
- 4 abas (Home, Pesquisa, Endpoints, Informações), 6 filtros, 12 colunas na tabela

### JavaScript da página

- Marcar número no HTML com `<span class="est-*">fallback</span>` e preencher em `preencherTextosDinamicos()`
- `LOTE_ARQUIVOS`, `LIMITE_ARQUIVOS` e `TAMANHO_PAGINA` alimentam também a prosa da aba Informações, para o texto não divergir do código
- Consulta cancelável por `AbortController` (`controleConsulta`): `limparFiltros()` aborta, e uma nova consulta aborta a anterior
- **Depois de todo `await`, checar `sinal.aborted` antes de escrever na UI.** Senão a consulta cancelada sobrescreve a tela
- `#resultados` nasce com `hidden` e só aparece na primeira consulta
- Consultas acima de `LIMITE_ARQUIVOS` usam os CSVs por ano; com filtro de ano, um arquivo só
- **Não usar a global implícita `event`** (depreciada, só no Chrome). Passar o elemento ou resolvê-lo por seletor
- CSV exportado passa por `escaparCsv()`: aspas dobradas, campo entre aspas quando houver `;` `"` ou quebra de linha, e prefixo `'` em campo iniciado por `= + - @`, que o Excel executaria como fórmula. O blob leva BOM UTF-8
- Colunas ordenáveis mantêm `aria-sort` via `atualizarAriaSort()`

## Tabelas

- 100 tabelas de 2015 a 2026, todas as versões publicadas pelo IBPT ou recuperáveis do mirror do ACBr
- Fontes dos ZIPs: portal De Olho no Imposto (IBPT) e SVN do Projeto ACBr (SourceForge / espelho GitHub `frones/ACBr`)
- 2015 e 2016 vieram do histórico de commits de `frones/ACBr` em `Exemplos/ACBrTCP/ACBrIBPTax/tabela` (o mirror git-svn começa em 2015-03-23)
- Para adicionar: colocar o ZIP em `repositorio-ibpt/` como `TabelaIBPTax_{versão}.zip` e rodar o build
- 7 ZIPs (17.2.B, 18.2.A, 18.2.B, 21.1.A, 21.1.I, 22.1.B, 23.2.A) vinham com os CSVs dentro de pasta e foram achatados em 2026-09-05
