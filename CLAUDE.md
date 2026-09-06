# CLAUDE.md - Guia para Claude Code neste projeto

## Sobre o Projeto

API estática de consulta às **Tabelas IBPTax** (Instituto Brasileiro de Planejamento e Tributação) hospedada no GitHub Pages. Extrai dados de arquivos ZIP contendo CSVs do IBPT, converte para JSON comprimido com gzip e publica como endpoints estáticos.

## Estrutura do Projeto

```
src/
  construir.ts      → Script principal de build (extrai ZIPs, gera JSON/CSV)
  processadorCsv.ts → Parser de CSV via streaming (readline)
  geradorJson.ts    → Gerador de arquivos JSON.gz e CSV.gz consolidado
  gerarPainel.ts    → Lê a API gerada e monta docs/api/painel.json
  constantes.ts     → Constantes (UFs, tipos de tabela)
  tipos.ts          → Interfaces TypeScript (Registro, Versao, MetaDados, etc.)
docs/
  index.html        → Página interativa de consulta (client-side)
  painel.html       → Painel de carga tributária por categoria, UF e ano
  404.html          → Intercepta rotas para exibir JSON descomprimido no browser
  api/              → Arquivos gerados pelo build (gitignored)
.github/workflows/
  deploy.yml        → GitHub Actions: build + deploy no GitHub Pages
repositorio-ibpt/   → ZIPs originais do IBPT (rastreados neste repo, nao e submodule)
```

## Convenções

- **Nomenclatura em português (PT-BR)**: Variáveis, funções e propriedades em camelCase com palavras em português (ex: `aliquotaNacionalFederal`, `processarCsv`, `gerarMetaDados`)
- **TypeScript ESM**: Projeto usa ES Modules (`"type": "module"` no package.json), importações com extensão `.js`
- **Node.js >= 22**: Usa APIs modernas como `import.meta.dirname`
- **Sem acentos no código-fonte**: Nomes de variáveis/funções sem acentos, mas textos visíveis ao usuário (HTML, README) devem ter acentuação correta
- **Compressão gzip nível 9**: Todos os arquivos de dados usam compressão máxima

## Endpoints da API

```
/api/meta.json                         → Metadados (anos, versões, tipos, UFs) + estatísticas do build
/api/{ano}/index.json                  → Índice do ano
/api/{ano}/{tabela}/index.json         → Índice da versão
/api/{ano}/{tabela}/{tipo}/index.json  → Índice por tipo
/api/{ano}/{tabela}/{tipo}/{uf}.json.gz → Dados comprimidos
/api/todos-{ano}.csv.gz                → CSV consolidado de um ano (todas as versões/tipos/UFs)
/api/painel.json                       → Série por categoria/UF/ano consumida por painel.html
/api/{ano}/{tabela}/{tipo}/{uf}        → Rota sem extensão (404.html descomprime e exibe)
```

## Tipos de Dados IBPT

- **NCM** (tipo `0` no CSV): Produtos - 8 dígitos, ~11.000 registros/UF
- **NBS** (tipo `1` no CSV): Serviços - 9 dígitos, ~860 registros/UF
- **LC116** (tipo `2` no CSV): Serviços municipais - 4 dígitos, ~200 registros/UF

## Campos do Registro

Cada registro contém 9 propriedades extraídas do CSV original do IBPT:

| Propriedade | Tipo | Origem CSV | Descrição |
|---|---|---|---|
| `codigo` | string | campos[0] | Código NCM/NBS/LC116 |
| `excecao` | string | campos[1] | Exceção tarifária |
| `descricao` | string | campos[3] | Descrição do item |
| `aliquotaNacionalFederal` | number | campos[4] | Alíquota federal (nacionais) % |
| `aliquotaImportadosFederal` | number | campos[5] | Alíquota federal (importados) % |
| `aliquotaEstadual` | number | campos[6] | Alíquota estadual (ICMS) % |
| `aliquotaMunicipal` | number | campos[7] | Alíquota municipal (ISS) % |
| `vigenciaInicio` | string | campos[8] | Data de início da vigência (dd/mm/aaaa) |
| `vigenciaFim` | string | campos[9] | Data de fim da vigência (dd/mm/aaaa) |

## Comandos

```bash
npm install          # Instalar dependências
npm run build        # Build: extrair ZIPs e gerar API estática
npm test             # Testes do parser CSV e do gerador do painel (runner nativo do Node)
```

## Formato de Saída JSON

```json
{
  "tabela": "26.1.G",
  "dados": [
    {
      "codigo": "01012100",
      "excecao": "",
      "descricao": "Cavalos reprodutores,de raca pura",
      "aliquotaNacionalFederal": 13.45,
      "aliquotaImportadosFederal": 15.45,
      "aliquotaEstadual": 18.00,
      "aliquotaMunicipal": 0.00,
      "vigenciaInicio": "20/03/2026",
      "vigenciaFim": "30/04/2026"
    }
  ]
}
```

## Painel de Carga Tributaria (`docs/painel.html`)

Pagina separada, ligada no header do `index.html`. Mostra quanto do preco e tributo
na cesta basica (13 itens do DL 399/1938), no carro popular e na moto, ano a ano,
com filtro de UF.

- **Todo o dado vem de `api/painel.json`**, gerado por `src/gerarPainel.ts` a cada build. A pagina nao consulta os arquivos por versao
- **Media anual ponderada pelos dias de vigencia**, nao por versao: as janelas variam de 29 a 183 dias
- **Cada item e um par NCM + excecao tarifaria.** O mesmo codigo tem linha base e linha `Ex 01` com aliquotas diferentes e produtos diferentes
- **Na mesma vigencia vence a revisao mais alta**, e versao com mais de 80% das aliquotas estaduais zeradas na UF e descartada como publicacao defeituosa
- **Periodo sem nenhuma revisao sadia sai da media**, e a UF aparece com `cobertura` abaixo de 100
- **A serie e cortada em 2021**, quando o IBPT trocou o criterio de publicacao (96,3% dos codigos mudaram de um mes para o outro). Os cards mostram dois blocos separados e a tabela deixa 2021 vazio
- Barras empilhadas federal + estadual na escala fixa de 0 a 60%; par de cores `#2E3ED6`/`#2E8B22`, validado para daltonismo
- Numeros da abertura e do rodape saem de `meta.json`, como no `index.html`

## Interface Web (`docs/index.html`)

- **Numeros da pagina vem do build** - `meta.json` carrega `estatisticas` (tamanhos, reducao, tabelas, registros, media por UF, data do build) e `preencherTextosDinamicos()` preenche todo `<span class="est-*">` das abas Home e Informacoes; o valor no HTML e so fallback. Nunca escrever numero fixo nesses trechos
- **Design System VALRAW UI (light corporate)** - Estrutura portada de `recuperaqui-landing`, mas com paleta propria tirada do logo: azul `#000793` primario, verde `#05C700` acento (`#037A00` quando precisa de texto branco em cima), slate `#1F2937` neutro, fundos brancos/`#F7F9FC`, sombras suaves em vez de glow, tipografia Ubuntu/Ubuntu Mono
- **4 abas:** Home (sobre a API), Pesquisa (filtros + tabela), Endpoints (documentação técnica), Informações (extras)
- **6 filtros de pesquisa:** Ano, Versão, UF, Tipo, Código, Descrição
- **Tooltips** nos cabeçalhos da tabela de resultados explicando cada coluna
- **12 colunas na tabela:** Código, Ex, Tipo, UF, Tabela, Descrição, 4 alíquotas, Início Vig., Fim Vig.
- **Consulta cancelavel** - `controleConsulta` (`AbortController`) e criado em `consultar()`/`consultarViaCsv()` e abortado por `limparFiltros()` ou por uma nova consulta; todo `fetch` da consulta recebe o `signal` (o `meta.json` da carga inicial fica de fora)
- **Bloco de resultados oculto** (`#resultados` com `hidden`) até a primeira consulta; reaparece em `consultar()`/`consultarViaCsv()` e volta a ocultar em `limparFiltros()`
- Estados de vazio ("Nenhum dado para exibir") e carregamento ("Buscando dados…") dentro da tabela
- **Spinner de carregamento** ao lado do status de busca durante consultas
- **Aviso de memória** na aba de pesquisa alertando que consultas sem filtro podem travar o navegador
- **CSVs consolidados por ano** (`todos-{ano}.csv.gz`) usados automaticamente quando a consulta exigiria >50 arquivos individuais; com filtro de ano, só um arquivo é baixado
- **Sem limite de resultados** - todos os registros encontrados são exibidos
- Ícones via Font Awesome 6
- Layout responsivo (mobile-first)

## Tabelas Disponíveis

100 tabelas IBPTax de 2015 a 2026 (todas as versões publicadas pelo IBPT e/ou recuperáveis do mirror ACBr):

- **2015:** 15.1.B, 15.2.A
- **2016:** 16.1.A, 16.2.A, 16.2.B
- **2017:** 17.1.A, 17.1.B, 17.2.A, 17.2.B
- **2018:** 18.1.A, 18.1.B, 18.2.A, 18.2.B, 18.2.C
- **2019:** 19.1.A, 19.1.B, 19.2.A, 19.2.B
- **2020:** 20.1.A, 20.1.B, 20.2.A, 20.2.B, 20.2.C
- **2021:** 21.1.A–I (A, B, C, D, E, F, G, H, I), 21.2.A–G
- **2022:** 22.1.A–G, 22.2.A–G
- **2023:** 23.1.A–G, 23.2.A–F
- **2024:** 24.1.A–F, 24.2.A–F
- **2025:** 25.1.A–F, 25.2.A–H
- **2026:** 26.1.C, 26.1.E, 26.1.F, 26.1.G, 26.1.H, 26.1.K, 26.1.L, 26.2.A

## Regras Importantes

- Arquivos em `docs/api/` são gerados pelo build e estão no `.gitignore` - nunca editar manualmente
- Os ZIPs em `repositorio-ibpt/` sao rastreados diretamente neste repositorio (nao ha `.gitmodules`)
- **Parser CSV coberto por testes** em `src/processadorCsv.test.ts` (`node:test` + `node:assert`, sem dependencia extra). Roda no CI antes do build. Ao mexer em `analisarLinhaCsv`/`pegarCampo`, rodar `npm test`
- **Extracao dos ZIPs em JS puro** (`fflate`), sem depender do binario `unzip` do sistema; o diretorio temporario vem de `os.tmpdir()`. Cada entrada e gravada pelo nome-base, entao ZIP com CSV dentro de subpasta e achatado na extracao
- **ZIP que nao gera dados nao entra no `meta.json`** e faz o build sair com codigo 1. `metaDados.versoes` e montado a partir do que virou arquivo, nunca da listagem de ZIPs - caso contrario a pagina oferece no filtro uma versao cujos endpoints respondem 404
- O `404.html` intercepta rotas sem extensão e descomprime/exibe o JSON no browser
- Textos visíveis ao usuário (HTML, README) devem ter acentuação correta em português
- Os CSVs consolidados (`todos-{ano}.csv.gz`) são gerados via streaming (createGzip), um por ano, para não acumular memória
- CSVs do IBPT usam encoding `latin1` (ISO-8859-1) - o `processadorCsv.ts` lê com `encoding: 'latin1'`
