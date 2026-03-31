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
- `npm run construir` gera todos os arquivos em `docs/api/`
- GitHub Actions faz build e deploy automático no GitHub Pages
- Arquivos em `docs/api/` são gitignored — nunca commitar

## Interface Web (docs/index.html)
- Design System VALRAW UI (tokens em CSS vars)
- Fontes: Ubuntu (texto) + Ubuntu Mono (valores numéricos, código)
- Ícones: Font Awesome 6
- 4 abas: Home, Pesquisa, Endpoints, Informações
- 6 filtros: Ano, Versão, UF, Tipo, Código, Descrição
- 12 colunas na tabela de resultados (inclui Início Vig. e Fim Vig.)
- Tabela sempre visível com estados de vazio e carregamento
- Spinner de carregamento ao lado do status de busca
- Tooltips nos cabeçalhos da tabela de resultados
- Consultas amplas (>50 arquivos) usam o CSV consolidado via streaming
- Sem limite de resultados

## Padrões de Código
- CSV usa ponto-e-vírgula como separador
- CSVs do IBPT usam encoding `latin1` (ISO-8859-1) — leitura com `encoding: 'latin1'`
- Processamento de CSVs via streaming (readline) para baixo consumo de memória
- Escrita paralela de arquivos com Promise.all
- CSV consolidado (`todos.csv.gz`) usa streaming gzip (createGzip) para não acumular em memória
- CSV consolidado tem 13 colunas: ano;tabela;tipo;uf;codigo;excecao;descricao;4 alíquotas;vigenciaInicio;vigenciaFim

## Tabelas Disponíveis
- 91 tabelas IBPTax de 2017 a 2026 (todas as versões publicadas pelo IBPT)
- Fonte dos ZIPs: portal De Olho no Imposto (IBPT) e SVN do Projeto ACBr (SourceForge)
- O build detecta automaticamente novos ZIPs em `repositorio-ibpt/` — basta adicionar e rodar `npm run construir`
