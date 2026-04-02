> **AVISO:** Os dados contidos neste repositório **não são atualizados em tempo real**. As tabelas são utilizadas apenas para **consulta histórica** e **não é recomendado o uso em sistemas reais de produção**, apesar dos documentos contidos no repositório serem tabelas oficiais publicadas pelo IBPT (Instituto Brasileiro de Planejamento e Tributação).

# Repositório de Tabelas IBPT - API Estática

Repositório destinado ao armazenamento e versionamento das **Tabelas IBPTax** (Instituto Brasileiro de Planejamento e Tributação). Essas tabelas contêm as alíquotas aproximadas dos tributos incidentes sobre produtos e serviços, conforme a Lei da Transparência Fiscal (Lei 12.741/2012).

Este repositório disponibiliza uma **API estática via GitHub Pages** para consulta das alíquotas tributárias, com **todas as versões/tabelas** de cada ano (1º e 2º semestre, revisões A, B, C, etc.).

---

## Como Funciona o Sistema

| Etapa | Descrição |
|---|---|
| **1. Construção** | Arquivos ZIP com CSVs do IBPT são extraídos, agrupados por ano/versão/tipo/UF, convertidos para JSON e comprimidos com gzip |
| **2. Publicação** | GitHub Actions executa o build e publica no GitHub Pages como arquivos `.json.gz` acessíveis via URL |
| **3. Consulta** | Página interativa no navegador ou acesso direto via cURL/Python/qualquer linguagem |

### Compressão

Os dados originais somam ~1.7 GB. Com gzip, reduzem para ~314 MB (82% de redução).

| Formato | Extensão | Compressão |
|---|---|---|
| Dados | `.json.gz` | gzip nível 9 |
| Índices | `.json` | Sem compressão |
| CSV consolidado | `.csv.gz` | gzip nível 9 |

Descompressão: navegador (nativo via `DecompressionStream`), terminal (`curl URL \| gunzip`), Python (`gzip.decompress()`).

### Pesquisa

A pesquisa na página interativa é inteiramente **client-side** — não existe backend.

1. Metadados carregados ao abrir a página (anos, versões, UFs, tipos).
2. 6 filtros disponíveis: ano, versão, UF, tipo, código e descrição.
3. Arquivos baixados em lotes paralelos de 8, descomprimidos com `DecompressionStream`.
4. Consultas amplas (>50 arquivos) usam o CSV consolidado `todos.csv.gz` via streaming.
5. Resultados em tabela com 12 colunas, paginados (100/página), ordenáveis, exportáveis como CSV.

Quanto mais filtros você selecionar, mais rápida será a consulta. Uma busca com ano + versão + tipo + UF específicos baixa apenas 1 arquivo (~190 KB).

---

## Página de Consulta

> **[Acessar Consulta](https://ibpt.valraw.com.br/)**

---

## API - Endpoints

**Base URL:** `https://ibpt.valraw.com.br/api`

| Endpoint | Descrição |
|---|---|
| `/api/meta.json` | Metadados: anos disponíveis, versões, tipos e UFs |
| `/api/{ano}/index.json` | Índice do ano com todas as versões |
| `/api/{ano}/{tabela}/index.json` | Índice de uma versão/tabela específica |
| `/api/{ano}/{tabela}/{tipo}/index.json` | Índice por tipo com contagem por UF |
| `/api/{ano}/{tabela}/{tipo}/{uf}.json.gz` | Dados completos (gzip) |
| `/api/todos.csv.gz` | CSV consolidado com todos os registros (gzip) |

### Parâmetros

| Parâmetro | Valores | Exemplo |
|---|---|---|
| `{ano}` | 2017 a 2026 | `2026` |
| `{tabela}` | Código da versão | `26.1.G` |
| `{tipo}` | `ncm`, `nbs` ou `lc116` | `ncm` |
| `{uf}` | Sigla do estado (27 UFs) | `SP` |

### Tipos de Dados

| Tipo | Nome | Descrição | Registros/UF |
|---|---|---|---|
| `ncm` | Nomenclatura Comum do Mercosul | Produtos — 8 dígitos | ~11.000 |
| `nbs` | Nomenclatura Brasileira de Serviços | Serviços — 9 dígitos | ~860 |
| `lc116` | Lei Complementar 116 | Serviços municipais — 4 dígitos | ~200 |

---

## Formato de Resposta

Os endpoints de dados (`.json.gz`) retornam JSON comprimido com gzip:

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
      "vigenciaInicio": "01/04/2026",
      "vigenciaFim": "30/06/2026"
    }
  ]
}
```

### Campos do Registro

| Campo | Tipo | Descrição |
|---|---|---|
| `codigo` | string | Código NCM/NBS/LC116 |
| `excecao` | string | Exceção tarifária |
| `descricao` | string | Descrição do produto ou serviço |
| `aliquotaNacionalFederal` | number | Alíquota federal (nacionais) % |
| `aliquotaImportadosFederal` | number | Alíquota federal (importados) % |
| `aliquotaEstadual` | number | Alíquota estadual (ICMS) % |
| `aliquotaMunicipal` | number | Alíquota municipal (ISS) % |
| `vigenciaInicio` | string | Início da vigência (dd/mm/aaaa) |
| `vigenciaFim` | string | Fim da vigência (dd/mm/aaaa) |

---

## Versões Disponíveis

| Ano | Versões | Qtd |
|---|---|---|
| 2017 | 17.1.A, 17.1.B, 17.2.A, 17.2.B | 4 |
| 2018 | 18.1.A, 18.1.B, 18.2.A, 18.2.B, 18.2.C | 5 |
| 2019 | 19.1.A, 19.1.B, 19.2.A, 19.2.B | 4 |
| 2020 | 20.1.A, 20.1.B, 20.2.A, 20.2.B, 20.2.C | 5 |
| 2021 | 21.1.A–I, 21.2.A–G | 16 |
| 2022 | 22.1.A–G, 22.2.A–G | 14 |
| 2023 | 23.1.A–G, 23.2.A–F | 13 |
| 2024 | 24.1.A–F, 24.2.A–F | 12 |
| 2025 | 25.1.A–F, 25.2.A–H | 14 |
| 2026 | 26.1.C, 26.1.E, 26.1.F, 26.1.G | 4 |
| **Total** | | **91** |

**UFs:** AC, AL, AM, AP, BA, CE, DF, ES, GO, MA, MG, MS, MT, PA, PB, PE, PI, PR, RJ, RN, RO, RR, RS, SC, SE, SP, TO

---

## Build Local

Requisitos: Node.js >= 22 (LTS)

```bash
npm install
npm run construir
```

Os arquivos serão gerados em `docs/api/`.

---

## Deploy

O deploy é automático via **GitHub Actions**. A cada push na branch `main`/`master`, o workflow executa o build e publica no GitHub Pages.

1. Vá em **Settings > Pages** no repositório
2. Em **Source**, selecione **GitHub Actions**
3. Faça push na branch principal

---

## Claude Code

Este projeto inclui arquivos de configuração para o [Claude Code](https://claude.com/claude-code), facilitando o uso de IA para desenvolvimento e manutenção:

- **`CLAUDE.md`** — Guia principal com estrutura do projeto, convenções, comandos e regras
- **`.claude/rules/`** — Regras automáticas de nomenclatura, tecnologias e padrões de código

Ao abrir o projeto com Claude Code, essas configurações são carregadas automaticamente, garantindo que a IA siga as convenções do projeto (nomenclatura em português, compressão gzip, TypeScript ESM, etc.).

---

## Licença

Este projeto está licenciado sob os termos do arquivo [LICENSE](LICENSE) (Apache 2.0).

O código fonte é de **uso livre**: qualquer pessoa pode baixar, modificar, distribuir e comercializar sem restrições.

<!-- Keywords -->
<!-- tabela IBPT, TabelaIBPTax, IBPT histórico, alíquota IBPT, IBPT NCM, IBPT NBS, IBPT LC116,
tabela de impostos Brasil, De Olho no Imposto, Lei 12.741, valor aproximado de tributos,
carga tributária NCM, alíquota federal nacional, alíquota federal importado, alíquota estadual,
alíquota municipal, IBPT 2017, IBPT 2018, IBPT 2019, IBPT 2020, IBPT 2021, IBPT 2022,
IBPT 2023, IBPT 2024, IBPT 2025, IBPT 2026, versões IBPT, histórico IBPT,
auditoria fiscal NF-e, auditoria retroativa tributária, recuperação de créditos tributários,
nota fiscal eletrônica impostos, NF-e tributos, NFC-e IBPT, ERP fiscal Brasil,
Simples Nacional alíquota, NCM impostos, NCM alíquota, classificação fiscal NCM,
ibpt.valraw.com.br, VALRAW, API IBPT, API fiscal brasileira, API NCM, API tributária,
tabela IBPT JSON, tabela IBPT CSV, tabela IBPT open source, tabela IBPT gratuita,
IBPT API estática, IBPT GitHub Pages, IBPT sem cadastro, IBPT sem token,
IBPT todas as versões, IBPT semestral, IBPT vigência, IBPT revisões A B C,
deolhonoimposto, iws.ibpt.org.br, apidoni.ibpt.org.br,
imposto nota fiscal consumidor, transparência tributária, Lei de Transparência Fiscal -->
