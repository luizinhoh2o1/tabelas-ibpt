---
description: Regras gerais do projeto IBPT API Estática
globs: "**/*"
---

# Regras do Projeto

## Linguagem e Nomenclatura
- Todo o código usa nomenclatura em português (camelCase): `processarCsv`, `gerarMetaDados`, `aliquotaNacionalFederal`
- Nomes de variáveis e funções sem acentos no código-fonte
- Textos visíveis ao usuário (HTML, strings exibidas, README) devem ter acentuação correta em português

## Tecnologias
- TypeScript com ES Modules (importações com extensão `.js`)
- Node.js >= 22 (usa `import.meta.dirname` e APIs modernas)
- Compressão gzip nível 9 para dados
- DecompressionStream no browser para descompressão client-side

## Estrutura de Dados
- Registros IBPT usam propriedades descritivas: `codigo`, `excecao`, `descricao`, `aliquotaNacionalFederal`, `aliquotaImportadosFederal`, `aliquotaEstadual`, `aliquotaMunicipal`, `vigenciaInicio`, `vigenciaFim`
- Datas de vigência no formato dd/mm/aaaa (string), extraídas dos campos[8] e campos[9] do CSV original
- Tipos de tabela: `ncm`, `nbs`, `lc116`
- 27 UFs brasileiras

## Build e Deploy
- `npm run build` gera todos os arquivos em `docs/api/`
- GitHub Actions faz build e deploy automático no GitHub Pages
- Arquivos em `docs/api/` são gitignored - nunca commitar

## Interface Web (docs/index.html)
- Design System VALRAW UI light corporate (tokens em CSS vars no `<style>` do index.html)
- Paleta propria (NAO usar o laranja da landing): azul `#000793` e verde `#05C700`, ambos amostrados do `logo.webp`
- Verde `#05C700` so decorativo (barras, orbs, gradientes) - 2,3:1 sobre branco; para texto ou fundo com texto branco usar `--verde-escuro` `#037A00` (5,5:1)
- Estrutura/componentes seguem `recuperaqui-landing` (`app/globals.css` + `lib/tokens.ts`), so as cores divergem
- Neutros: slate `#1F2937`, fundo `#FFFFFF`/`#F7F9FC`, bordas `#EDF2F7`/`#E2E8F0`
- Elevacao por sombra (`--sombra-card`, `--sombra-card-hover`), nao por glow
- Logo em `docs/public/logo.webp`, favicons em `docs/public/favicon-*.png`
- Fontes: Ubuntu (texto) + Ubuntu Mono (valores numéricos, código)
- Ícones: Font Awesome 6
- 4 abas: Home, Pesquisa, Endpoints, Informações
- 6 filtros: Ano, Versão, UF, Tipo, Código, Descrição
- 12 colunas na tabela de resultados (inclui Início Vig. e Fim Vig.)
- Numeros exibidos (tamanhos, % de compressao, total de tabelas/registros, media por UF) vem de `meta.json` -> `estatisticas`, gerado a cada build
- Marcar o numero no HTML com `<span class="est-*">valor de fallback</span>` e preencher em `preencherTextosDinamicos()`
- Constantes da pagina (`LOTE_ARQUIVOS`, `LIMITE_ARQUIVOS`, `TAMANHO_PAGINA`) tambem alimentam a prosa, para o texto nunca divergir do codigo
- Consulta cancelavel via `AbortController` (`controleConsulta`): `limparFiltros()` aborta, e uma nova consulta aborta a anterior
- Depois de `await`, sempre checar `sinal.aborted` antes de escrever na UI - senao a consulta cancelada sobrescreve a tela
- Bloco de resultados (`#resultados`) oculto via atributo `hidden` até o usuário consultar
- Estados de vazio e carregamento dentro da tabela
- Spinner de carregamento ao lado do status de busca
- Tooltips nos cabeçalhos da tabela de resultados
- Consultas amplas (>50 arquivos) usam o CSV consolidado via streaming
- Sem limite de resultados

## Padrões de Código
- CSV usa ponto-e-vírgula como separador
- CSVs do IBPT usam encoding `latin1` (ISO-8859-1) - leitura com `encoding: 'latin1'`
- Processamento de CSVs via streaming (readline) para baixo consumo de memória
- Escrita paralela de arquivos com Promise.all
- CSV consolidado (`todos.csv.gz`) usa streaming gzip (createGzip) para não acumular em memória
- CSV consolidado tem 13 colunas: ano;tabela;tipo;uf;codigo;excecao;descricao;4 alíquotas;vigenciaInicio;vigenciaFim

## Tabelas Disponíveis
- 100 tabelas IBPTax de 2015 a 2026 (todas as versões publicadas pelo IBPT e/ou disponíveis no mirror do SVN ACBr)
- Fonte dos ZIPs: portal De Olho no Imposto (IBPT) e SVN do Projeto ACBr (SourceForge / espelho GitHub `frones/ACBr`)
- Tabelas 2015–2016 foram recuperadas do histórico de commits de `frones/ACBr` em `Exemplos/ACBrTCP/ACBrIBPTax/tabela` (o mirror git-svn começa em 2015-03-23)
- O build detecta automaticamente novos ZIPs em `repositorio-ibpt/` - basta adicionar e rodar `npm run build`
- Os CSVs precisam estar na RAIZ do ZIP, sem subpasta: `construir.ts` usa `readdirSync` sem `recursive`, entao ZIP com pasta interna e pulado silenciosamente (so um `AVISO` no log, exit code continua 0)
- 7 ZIPs (17.2.B, 18.2.A, 18.2.B, 21.1.A, 21.1.I, 22.1.B, 23.2.A) vinham do IBPT com os CSVs dentro de pasta e foram achatados em 2026-09-05
