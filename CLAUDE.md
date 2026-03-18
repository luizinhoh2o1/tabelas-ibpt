# CLAUDE.md - Guia para Claude Code neste projeto

## Sobre o Projeto

API estática de consulta às **Tabelas IBPTax** (Instituto Brasileiro de Planejamento e Tributação) hospedada no GitHub Pages. Extrai dados de arquivos ZIP contendo CSVs do IBPT, converte para JSON comprimido com gzip e publica como endpoints estáticos.

## Estrutura do Projeto

```
src/
  construir.ts      → Script principal de build (extrai ZIPs, gera JSON/CSV)
  processadorCsv.ts → Parser de CSV via streaming (readline)
  geradorJson.ts    → Gerador de arquivos JSON.gz e CSV.gz consolidado
  constantes.ts     → Constantes (UFs, tipos de tabela)
  tipos.ts          → Interfaces TypeScript (Registro, Versao, MetaDados, etc.)
docs/
  index.html        → Página interativa de consulta (client-side)
  404.html          → Intercepta rotas para exibir JSON descomprimido no browser
  api/              → Arquivos gerados pelo build (gitignored)
.github/workflows/
  deploy.yml        → GitHub Actions: build + deploy no GitHub Pages
repositorio-ibpt/   → Submodule com os ZIPs originais do IBPT
```

## Convenções

- **Nomenclatura em português (PT-BR)**: Variáveis, funções e propriedades em camelCase com palavras em português (ex: `aliquotaNacionalFederal`, `processarCsv`, `gerarMetaDados`)
- **TypeScript ESM**: Projeto usa ES Modules (`"type": "module"` no package.json), importações com extensão `.js`
- **Node.js >= 22**: Usa APIs modernas como `import.meta.dirname`
- **Sem acentos no código-fonte**: Nomes de variáveis/funções sem acentos, mas textos visíveis ao usuário (HTML, README) devem ter acentuação correta
- **Compressão gzip nível 9**: Todos os arquivos de dados usam compressão máxima

## Endpoints da API

```
/api/meta.json                         → Metadados (anos, versões, tipos, UFs)
/api/{ano}/index.json                  → Índice do ano
/api/{ano}/{tabela}/index.json         → Índice da versão
/api/{ano}/{tabela}/{tipo}/index.json  → Índice por tipo
/api/{ano}/{tabela}/{tipo}/{uf}.json.gz → Dados comprimidos
/api/todos.csv.gz                      → CSV consolidado com todos os registros
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
npm run construir    # Build: extrair ZIPs e gerar API estática
```

## Formato de Saída JSON

```json
{
  "tabela": "26.1.F",
  "dados": [
    {
      "codigo": "01012100",
      "excecao": "",
      "descricao": "Cavalos reprodutores,de raca pura",
      "aliquotaNacionalFederal": 13.45,
      "aliquotaImportadosFederal": 15.45,
      "aliquotaEstadual": 18.00,
      "aliquotaMunicipal": 0.00,
      "vigenciaInicio": "20/02/2026",
      "vigenciaFim": "31/03/2026"
    }
  ]
}
```

## Interface Web

- **Design System VALRAW UI** — Cores, tipografia (Ubuntu/Ubuntu Mono), glassmorphism, glow, orbs
- **4 abas:** Home (sobre a API), Pesquisa (filtros + tabela), Endpoints (documentação técnica), Informações (extras)
- **6 filtros de pesquisa:** Ano, Versão, UF, Tipo, Código, Descrição
- **Tooltips** nos cabeçalhos da tabela de resultados explicando cada coluna
- **12 colunas na tabela:** Código, Ex, Tipo, UF, Tabela, Descrição, 4 alíquotas, Início Vig., Fim Vig.
- **Tabela sempre visível** com estados de vazio ("Nenhum dado para exibir") e carregamento ("Buscando dados…")
- **Spinner de carregamento** ao lado do status de busca durante consultas
- **CSV consolidado** (`todos.csv.gz`) usado automaticamente quando consulta exigiria >50 arquivos individuais
- **Sem limite de resultados** — todos os registros encontrados são exibidos
- Ícones via Font Awesome 6
- Layout responsivo (mobile-first)

## Regras Importantes

- Arquivos em `docs/api/` são gerados pelo build e estão no `.gitignore` — nunca editar manualmente
- O `repositorio-ibpt/` é um submodule Git com os ZIPs originais
- O `404.html` intercepta rotas sem extensão e descomprime/exibe o JSON no browser
- Textos visíveis ao usuário (HTML, README) devem ter acentuação correta em português
- O CSV consolidado (`todos.csv.gz`) é gerado via streaming (createGzip) para não acumular memória
