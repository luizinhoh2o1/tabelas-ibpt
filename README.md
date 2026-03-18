> **AVISO:** Os dados contidos neste repositório **não são atualizados em tempo real**. As tabelas são utilizadas apenas para **consulta histórica** e **não é recomendado o uso em sistemas reais de produção**, apesar dos documentos contidos no repositório serem tabelas oficiais publicadas pelo IBPT (Instituto Brasileiro de Planejamento e Tributação).

# Repositório de Tabelas IBPT - API Estática

Repositório destinado ao armazenamento e versionamento das **Tabelas IBPTax** (Instituto Brasileiro de Planejamento e Tributação). Essas tabelas contêm as alíquotas aproximadas dos tributos incidentes sobre produtos e serviços, conforme a Lei da Transparência Fiscal (Lei 12.741/2012).

Este repositório disponibiliza uma **API estática via GitHub Pages** para consulta das alíquotas tributárias, com **todas as versões/tabelas** de cada ano (1º e 2º semestre, revisões A, B, C, etc.).

---

## Como Funciona o Sistema

O sistema funciona em 3 etapas: **construção**, **publicação** e **consulta**.

```mermaid
graph TD
    subgraph Construcao["1. Construção"]
        A["Arquivos ZIP com CSVs"] --> B["Extrair e ler CSVs"]
        B --> C["Agrupar por ano, versão, tipo e UF"]
        C --> D["Gerar JSON descritivo"]
        D --> E["Comprimir com gzip"]
    end

    subgraph Publicacao["2. Publicação"]
        E --> F["GitHub Actions executa o build"]
        F --> G["Publica no GitHub Pages"]
        G --> H["Arquivos .json.gz acessíveis via URL"]
    end

    subgraph Consulta["3. Consulta"]
        H --> K["Página interativa no navegador"]
        H --> L["Acesso direto via cURL"]
        H --> M["Acesso via Python ou outras linguagens"]
        K --> N["Descomprime, filtra e exibe resultados"]
    end

    style Construcao fill:#161b22,stroke:#58a6ff,color:#e6edf3
    style Publicacao fill:#161b22,stroke:#3fb950,color:#e6edf3
    style Consulta fill:#161b22,stroke:#d29922,color:#e6edf3
```

1. **Construção:** Os arquivos ZIP contendo CSVs do IBPT são extraídos, lidos e agrupados por ano, versão/tabela, tipo (NCM, NBS, LC116) e UF. Os dados são convertidos para JSON com propriedades descritivas e comprimidos com gzip.

2. **Publicação:** A cada push no repositório, o GitHub Actions executa o build automaticamente e publica os arquivos no GitHub Pages. Os dados ficam acessíveis como URLs estáticas.

3. **Consulta:** O usuário pode consultar de duas formas:
   - **Página interativa:** Filtros por ano, versão, UF, tipo, código e descrição. A página baixa os arquivos comprimidos, descomprime no navegador e exibe os resultados em tabela paginada com opção de exportar CSV.
   - **Acesso direto:** Qualquer aplicação pode acessar os endpoints e descomprimir os dados com a ferramenta de sua preferência.

### Compressão

Os dados originais somam ~1.7 GB. Para viabilizar a hospedagem, todos os arquivos de dados são comprimidos com gzip, reduzindo para ~314 MB (82% de redução).

- Arquivos de dados usam extensão `.json.gz` (comprimidos)
- Arquivos de índice usam extensão `.json` (sem compressão)
- No navegador, a descompressão é automática e nativa (Chrome 80+, Firefox 113+, Safari 16.4+)
- Via terminal: `curl URL | gunzip`
- Via Python: `gzip.decompress(resposta.content)`

### Pesquisa

A pesquisa na página interativa é inteiramente **client-side** — não existe backend.

1. Ao abrir a página, os metadados são carregados e os filtros são populados (anos, versões, UFs, tipos).
2. Ao consultar, a página monta as combinações necessárias com base nos filtros selecionados. Filtros vazios incluem todas as opções.
3. Os arquivos comprimidos são baixados em lotes paralelos, descomprimidos no navegador e filtrados por código e/ou descrição.
4. Os resultados são exibidos em tabela paginada, ordenável por qualquer coluna, com opção de exportar CSV.

Quanto mais filtros você selecionar, mais rápida será a consulta. Uma busca com ano + versão + tipo + UF específicos baixa apenas 1 arquivo (~190 KB).

---

## Página de Consulta

Acesse a página de consulta interativa:

> **[Acessar Consulta](https://luizinhoh2o1.github.io/tabelas-ibpt/)**

---

## API - Endpoints

### Base URL

```
https://luizinhoh2o1.github.io/tabelas-ibpt/api
```

### Endpoints Disponíveis

```mermaid
graph LR
    subgraph Endpoints
        direction TB
        E1["/api/meta.json"]
        E2["/api/{ano}/index.json"]
        E3["/api/{ano}/{tabela}/index.json"]
        E4["/api/{ano}/{tabela}/{tipo}/index.json"]
        E5["/api/{ano}/{tabela}/{tipo}/{uf}.json.gz"]
    end

    E1 -.- D1["Metadados: anos, versões, tipos e UFs"]
    E2 -.- D2["Índice do ano com todas as versões"]
    E3 -.- D3["Índice de uma versão/tabela específica"]
    E4 -.- D4["Índice por tipo com contagem por UF"]
    E5 -.- D5["Dados completos comprimidos com gzip"]

    style E1 fill:#238636,stroke:#3fb950,color:#fff
    style E2 fill:#238636,stroke:#3fb950,color:#fff
    style E3 fill:#238636,stroke:#3fb950,color:#fff
    style E4 fill:#238636,stroke:#3fb950,color:#fff
    style E5 fill:#1f6feb,stroke:#58a6ff,color:#fff
    style D1 fill:#161b22,stroke:#30363d,color:#8b949e
    style D2 fill:#161b22,stroke:#30363d,color:#8b949e
    style D3 fill:#161b22,stroke:#30363d,color:#8b949e
    style D4 fill:#161b22,stroke:#30363d,color:#8b949e
    style D5 fill:#161b22,stroke:#30363d,color:#8b949e
```

> Endpoints verdes retornam JSON simples. O endpoint azul retorna dados comprimidos com gzip (`.json.gz`).

### Parâmetros

```mermaid
graph LR
    subgraph Parametros["Parâmetros"]
        direction TB
        P1["<b>{ano}</b><br/>2017 a 2026"]
        P2["<b>{tabela}</b><br/>Código da versão ex: 26.1.F"]
        P3["<b>{tipo}</b><br/>ncm, nbs ou lc116"]
        P4["<b>{uf}</b><br/>Sigla do estado ex: SP, RJ"]
    end

    P1 --- P2 --- P3 --- P4

    style P1 fill:#161b22,stroke:#58a6ff,color:#e6edf3
    style P2 fill:#161b22,stroke:#58a6ff,color:#e6edf3
    style P3 fill:#161b22,stroke:#58a6ff,color:#e6edf3
    style P4 fill:#161b22,stroke:#58a6ff,color:#e6edf3
```

### Tipos de Dados

```mermaid
graph LR
    NCM["<b>NCM</b><br/>Nomenclatura Comum do Mercosul<br/>Produtos - 8 dígitos<br/>~11.000 registros/UF"]
    NBS["<b>NBS</b><br/>Nomenclatura Brasileira de Serviços<br/>Serviços - 9 dígitos<br/>~860 registros/UF"]
    LC["<b>LC116</b><br/>Lei Complementar 116<br/>Serviços municipais - 4 dígitos<br/>~200 registros/UF"]

    style NCM fill:#1f6feb,stroke:#58a6ff,color:#fff
    style NBS fill:#238636,stroke:#3fb950,color:#fff
    style LC fill:#9e6a03,stroke:#d29922,color:#fff
```

---

## Formato de Resposta

Os endpoints de dados (`.json.gz`) retornam JSON com propriedades descritivas comprimido com gzip:

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
      "aliquotaMunicipal": 0.00
    }
  ]
}
```

### Estrutura do JSON

```mermaid
graph TD
    ROOT["Resposta JSON"] --> T["<b>tabela</b><br/>Versão da tabela IBPTax"]
    ROOT --> D["<b>dados</b><br/>Array de registros"]

    D --> R["Cada registro é um objeto com propriedades descritivas"]

    R --> R0["<b>codigo</b><br/>Código do produto/serviço"]
    R --> R1["<b>excecao</b><br/>Exceção tarifária"]
    R --> R2["<b>descricao</b><br/>Descrição do item"]
    R --> R3["<b>aliquotaNacionalFederal</b><br/>Alíquota Nacional Federal %"]
    R --> R4["<b>aliquotaImportadosFederal</b><br/>Alíquota Importados Federal %"]
    R --> R5["<b>aliquotaEstadual</b><br/>Alíquota Estadual %"]
    R --> R6["<b>aliquotaMunicipal</b><br/>Alíquota Municipal %"]

    style ROOT fill:#1f6feb,stroke:#58a6ff,color:#fff
    style T fill:#161b22,stroke:#3fb950,color:#e6edf3
    style D fill:#161b22,stroke:#3fb950,color:#e6edf3
    style R fill:#161b22,stroke:#d29922,color:#e6edf3
    style R0 fill:#161b22,stroke:#30363d,color:#8b949e
    style R1 fill:#161b22,stroke:#30363d,color:#8b949e
    style R2 fill:#161b22,stroke:#30363d,color:#8b949e
    style R3 fill:#161b22,stroke:#30363d,color:#8b949e
    style R4 fill:#161b22,stroke:#30363d,color:#8b949e
    style R5 fill:#161b22,stroke:#30363d,color:#8b949e
    style R6 fill:#161b22,stroke:#30363d,color:#8b949e
```

---

## Versões Disponíveis

Todas as versões/tabelas de cada ano são processadas e disponibilizadas:

```mermaid
graph LR
    subgraph 2017
        V17["17.1.B<br/>17.2.A"]
    end
    subgraph 2018
        V18["18.1.A · 18.1.B<br/>18.2.C"]
    end
    subgraph 2019
        V19["19.1.A · 19.1.B<br/>19.2.A"]
    end
    subgraph 2020
        V20["20.1.A · 20.1.B<br/>20.2.A · 20.2.C"]
    end
    subgraph 2021
        V21["21.1.D · 21.1.G<br/>21.2.A · 21.2.B · 21.2.C<br/>21.2.D · 21.2.F · 21.2.G"]
    end

    style 2017 fill:#161b22,stroke:#30363d,color:#e6edf3
    style 2018 fill:#161b22,stroke:#30363d,color:#e6edf3
    style 2019 fill:#161b22,stroke:#30363d,color:#e6edf3
    style 2020 fill:#161b22,stroke:#30363d,color:#e6edf3
    style 2021 fill:#161b22,stroke:#30363d,color:#e6edf3
```

```mermaid
graph LR
    subgraph 2022
        V22["22.1.A · 22.1.C<br/>22.1.E · 22.2.B"]
    end
    subgraph 2023
        V23["23.1.A-G<br/>23.2.B-F"]
    end
    subgraph 2024
        V24["24.1.A-F<br/>24.2.A-F"]
    end
    subgraph 2025
        V25["25.1.A-F<br/>25.2.A-C · 25.2.G · 25.2.H"]
    end
    subgraph 2026
        V26["26.1.C<br/>26.1.F"]
    end

    style 2022 fill:#161b22,stroke:#30363d,color:#e6edf3
    style 2023 fill:#161b22,stroke:#30363d,color:#e6edf3
    style 2024 fill:#161b22,stroke:#30363d,color:#e6edf3
    style 2025 fill:#161b22,stroke:#30363d,color:#e6edf3
    style 2026 fill:#161b22,stroke:#58a6ff,color:#e6edf3
```

UFs: `AC` `AL` `AM` `AP` `BA` `CE` `DF` `ES` `GO` `MA` `MG` `MS` `MT` `PA` `PB` `PE` `PI` `PR` `RJ` `RN` `RO` `RR` `RS` `SC` `SE` `SP` `TO`

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

Para configurar:
1. Vá em **Settings > Pages** no repositório
2. Em **Source**, selecione **GitHub Actions**
3. Faça push na branch principal

---

## Licença

Este projeto está licenciado sob os termos do arquivo [LICENSE](LICENSE) (Apache 2.0).

O código fonte é de **uso livre**: qualquer pessoa pode baixar, modificar, distribuir e comercializar sem restrições.
