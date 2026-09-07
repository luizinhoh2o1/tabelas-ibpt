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
- `gerarPainel.test.ts` monta uma API falsa em `os.tmpdir()`, então não depende de `docs/api` estar construído
- `analisarLinhaCsv` e `pegarCampo` são exportados só para teste; mexeu neles, rodar `npm test`

### Cache incremental

- A granularidade é o **ano**, não a versão: o CSV do ano cobre todas as versões dele, então um ZIP alterado reconstrói o ano inteiro
- `docs/api/_manifesto.json` guarda o sha256 de cada ZIP e os totais do ano; ano inalterado com saída no disco é reaproveitado
- O manifesto guarda também o sha256 de `src/*.ts`. Mudou o código do build, o cache inteiro é descartado. Sem isso o `restore-keys` do CI restauraria cache gerado por código antigo
- Ao mudar o formato do manifesto, subir `VERSAO_MANIFESTO` em `geradorJson.ts`
- No CI, `actions/cache` guarda `docs/api` entre execuções; num checkout limpo não haveria nada contra o que ser incremental

## Infraestrutura

- Deploy por GitHub Actions (`upload-pages-artifact` com `path: docs`). Só o conteúdo de `docs/` vai para o site
- **`docs/CNAME` é obrigatório** e contém `ibpt.valraw.com.br`. Com deploy por Actions, o Pages lê o `CNAME` de dentro do artefato publicado; sem ele o domínio customizado cai com "Site not found" e só o endereço `github.io` responde. O arquivo na raiz do repositório não serve para nada: precisa estar em `docs/`, que é a raiz do artefato
- `docs/public/` é servido como `/public/`. Logo e favicons ficam ali e são referenciados por `/public/...`. Pasta `public/` na raiz do repositório não seria publicada
- **`docs/api/` ocupa ~1,1 GB e o limite documentado do GitHub Pages é 1 GB.** Antes de acrescentar arquivo novo à saída, considerar o total
- Os ZIPs em `repositorio-ibpt/` são rastreados neste repositório (não há `.gitmodules`). São binários já deflacionados: o git não faz delta e cada atualização grava um blob inteiro, então `.git` cresce ~5,7 MB por tabela

## Séries econômicas (`dados/`, `src/economia.ts`)

Três CSVs versionados alimentam a seção em dinheiro do painel. Ficam no repositório de propósito: **o build nunca acessa a rede**, igual aos ZIPs do IBPT.

- `dados/ipca.csv`, `dados/ipca-alimentacao.csv`, `dados/ipca-transportes.csv` e `dados/salario-minimo.csv` saem do SGS do Banco Central (séries 433, 1635, 1639 e 1619) por `npm run indices`, sob demanda. Formato `mes;valor`, competência `aaaa-mm`
- **Cada categoria é corrigida pelo seu grupo do IPCA, nunca pelo índice cheio.** Comida e veículo não sofreram a mesma inflação: a mesma compra de R$ 100 de hoje custava R$ 50,91 em 2015 pelo índice de alimentação e R$ 58,08 pelo de transportes, 14% de diferença. O índice cheio fica só para o salário, que é o que mede o custo de vida de quem recebe
- As séries 1635 e 1639 não vêm nomeadas pela API. Foram identificadas contra os acumulados oficiais de 2020 a 2022: alimentação 14,11 / 7,93 / 11,63 e transportes 1,03 / 21,04 / -1,30, este último com o pico dos combustíveis em 2021 e o corte de ICMS em 2022. Ao trocar de série, refazer essa conferência
- `dados/inss.csv` é **o único dado escrito à mão do projeto**, porque não existe API para a tabela do INSS. Cada linha leva a portaria na última coluna. Formato `vigencia;faixa_ate;aliquota;progressiva;fonte`
- **Até fevereiro de 2020 a alíquota do INSS incidia sobre o salário inteiro; da EC 103/2019 em diante é progressiva por faixa.** A coluna `progressiva` marca isso, e `descontoInss()` trata os dois regimes
- **Invariante que protege a digitação:** desde 2020 o teto da primeira faixa do INSS é o próprio salário mínimo. `npm run indices` e `economia.test.ts` conferem mês a mês e falham se divergir. Foi assim que 2023 apareceu com duas vigências, janeiro em R$ 1.302 e maio em R$ 1.320
- O nível de preços é encadeado a partir do IPCA mensal com base arbitrária: só a razão entre dois anos significa alguma coisa
- A média é anual, para casar com a alíquota do IBPT, que também é média anual ponderada por dia. Mês sem IPCA publicado fica de fora dos dois lados
- Sem os arquivos, `resumoAnual()` lança e o `gerarPainel` segue sem o bloco `economia`; a página esconde a seção inteira em vez de mostrar número pela metade

## Painel de carga tributária (`docs/painel.html`)

Página separada, sem build step. Chega por dois caminhos: o link no header do `index.html` e o bloco `.promo-painel` na aba Home. Mede quanto do preço é tributo na cesta básica, no carro popular e na moto até 125cc.

- **Nenhuma afirmação factual sem número medido por trás.** A auditoria de 06/09/2026 pegou uma atribuição causal falsa ("o salto do carro em 2016 foi o fim da redução de IPI", que acabou em 31/12/2014, um ano antes do salto) e uma generalização falsa ("trocar o estado muda quase só a parte verde", verdade na cesta e falsa na moto, onde o federal varia de 20,77 a 31,60 entre UFs)
- **Frase que depende do dado tem que sair do dado.** "O federal é idêntico em todos os itens" é verdade desde 2020 e falsa de 2015 a 2019; hoje é montada em `montarItens()` a partir dos valores do ano
- **Texto voltado ao público, não ao desenvolvedor.** Sem código de versão (`24.2.E`), sem nomenclatura interna, sem recomendação de implementação na página. Esse detalhe fica neste arquivo e no `CLAUDE.md`

- **Todo o dado vem de `api/painel.json`**, gerado por `src/gerarPainel.ts` no fim do build. A página nunca lê os arquivos por versão, seriam ~2.700 requisições
- `gerarPainel.ts` lê a saída já publicada em `docs/api`, então roda depois do build e não toca no processamento dos ZIPs
- Regeneração é pulada quando nenhum ano foi refeito: senão o build incremental de 3s voltaria a levar 70s
- **Média anual ponderada pelos dias de vigência.** Contar versões distorceria: as janelas vão de 29 a 183 dias, e alguns meses são cobertos por tabela do ano anterior
- **Um item é o par NCM + exceção, nunca só o NCM.** O mesmo código traz a linha base e linhas `Ex 01` com alíquotas diferentes, descrevendo produtos diferentes. Ler só pelo código faz a última linha do arquivo vencer, que é a de exceção. Exemplos reais: `1905.90.90 Ex 01` é o pão comum e a linha base do `1905.10.00` é o knäckebrot; `1701.99.00 Ex 01` é sacarose pura e não açúcar de cana
- **Período sem nenhuma revisão sadia fica fora da média**, não cai na defeituosa. Em 2021, AL e AP têm cinco versões seguidas com 100% das estaduais zeradas, e usá-las derrubava o estadual da cesta em 39%
- **`cobertura` é por UF**, contando só dia com tabela utilizável naquela UF. É o que faz TO/2023 mostrar 95% em vez de 100%: a versão `23.1.D` é a única das 100 publicada sem Tocantins
- **A vigência de uma versão é a janela dominante do arquivo, não a do primeiro registro.** `2024/24.2.F/ncm/PR` tem 11 linhas de uma revisão anterior no começo
- `painel.fimCobertura` guarda o último dia coberto; a página usa para dizer quantos dos dias cobertos ainda são futuro. Sem isso, "cobre 273 de 365 dias" é lido como 273 dias já vividos
- **Mesma data de vigência: vence a revisão mais alta.** Versão com mais de 80% das alíquotas estaduais zeradas na UF é descartada como publicação defeituosa (24.2.E, 25.1.A, 25.2.C, 26.1.E, 18.2.A)
- **A série se parte em junho de 2021**, quando o IBPT deixou de publicar alíquota reduzida: 96,3% dos códigos mudaram de um mês para o outro, alta média de 9,14 pontos. Não é mudança de tributação. Os cards mostram os dois períodos separados e 2021 fica de fora dos dois lados
- **A seção em dinheiro nunca cruza 2021 em reais.** Multiplicar preço por alíquota atravessando a quebra dá +78% que não é tributação. Os cartões são um por era; a única linha que percorre a série inteira é a de horas de trabalho da compra, que não depende de alíquota
- **A régua é o salário líquido, não o bruto.** Sobre o mínimo o INSS tira 7,5% desde 2020 e 8% antes, o que muda as horas em 8%. IRRF é zero nessa faixa, FGTS não é desconto do trabalhador, e vale-transporte é opcional: os três ficam declarados na página
- **O filtro de estado se resolve sozinho na primeira visita**, nesta ordem: `localStorage['painel-ibpt-uf']`, depois o IP (`ipwho.is`, campo `region_code`), depois a geolocalização aproximada do navegador (`api.bigdatacloud.net/data/reverse-geocode-client`, campo `principalSubdivisionCode`), e por fim SP. O valor encontrado é gravado e só muda quando o visitante troca o filtro na mão
- **São as duas únicas chamadas a terceiros da página**, fora as fontes do Google, e as duas mandam dados do visitante para fora: o IP em uma, a coordenada na outra. Ambas têm prazo (4s e 5s) e falham em silêncio para SP. A geolocalização só é pedida quando o IP dá fora do Brasil, então o visitante brasileiro comum nunca vê o pedido de permissão
- **A detecção roda depois da primeira pintura**, dentro do mesmo `requestAnimationFrame` que liga as animações: pedir permissão de localização não pode segurar a tela
- **O mapa é geometria, não dado do build**: `docs/malha-uf.json` sai da malha do IBGE por `npm run malha`, fica versionado e é carregado em paralelo com o `painel.json`. Se faltar, a página esconde a seção do mapa e continua inteira
- **A cor do mapa é a distância até a média nacional do ano, não o valor absoluto.** Escala divergente de 7 faixas, azul abaixo e vermelho acima, com cinza entre -0,7 e +0,7 pp. Absoluto pintaria o mapa inteiro de vermelho depois de 2021, quando o nível subiu em todos os estados de uma vez
- **Nenhum rótulo dentro do desenho.** As 27 siglas e alíquotas ficam do lado de fora, cada uma encostada na borda do mapa perto do próprio estado, ligada a ele por um traçado. Dentro não cabe: oito estados do Nordeste e o DF são menores que o próprio texto
- **Sigla e alíquota na mesma linha**, sempre. Rótulo de duas linhas ocupa altura demais no Nordeste, onde nove estados dividem a mesma costa
- **A caixa do rótulo (`FORMATOS`) é folgada de propósito.** Ela é um palpite sobre o tamanho do texto: se a fonte Ubuntu demorar a chegar, o navegador desenha com a do sistema, mais larga, e o texto estoura uma caixa justa. Foi o que fez PE, AL e SE aparecerem colados em uma máquina e separados em outra
- **`PREFERENCIA` é a válvula manual**: direção preferida para o rótulo de um estado, quando a busca livre acha um lugar tecnicamente válido e visualmente ruim. Entra como custo alto, não como proibição, então nunca quebra as garantias. Hoje só o DF está lá, que cabia em vários lugares e ia parar embaixo, entre RJ e ES
- **A posição não é digitada, é procurada.** `lugaresDosRotulos()` roda três passadas: cada estado experimenta 48 ângulos por 5 deslocamentos laterais e fica com o mais barato; depois todos tentam de novo com o mapa inteiro posto; depois vizinhos trocam de rótulo entre si. A ordem de escolha é uma varredura girando ao redor do mapa, para vizinho decidir depois de vizinho
- **O deslocamento lateral (`DESVIOS`) não é enfeite**: sem ele a busca só anda para frente e para trás na mesma reta, e caía de 7 para 12 inversões de ordem geográfica
- **Três coisas seguram o custo da busca**, que sem elas leva cinco segundos: o raio de saída de cada candidato é calculado uma vez por estado e reaproveitado nas três passadas; os candidatos vêm ordenados por custo mínimo e a busca corta o resto quando o melhor já ganhou; e `EMPURRAO_MAXIMO` limita o quanto um rótulo pode ser empurrado antes de a busca desistir daquele ângulo
- **O resultado é guardado em `LUGARES`**, porque depende só do desenho: trocar de ano ou de UF não refaz a conta
- **O custo do lugar tem quatro parcelas**: distância até o texto, ângulo torto, lado errado do mapa e ordem geográfica invertida em relação aos vizinhos
- **`PESO_LADO` é proporcional à distância do estado ao centro do mapa.** É ele que impede o rótulo de Sergipe de aparecer à esquerda, mas "lado do estado" não quer dizer nada para quem fica no meio: com peso cheio, Goiás era empurrado 438 unidades para o sul em vez de usar a vaga que existe a oeste
- **A varredura que testa se o rótulo caiu sobre o desenho é fina, de 12 em 12 unidades.** Só os cantos não bastam: a ponta sul do Rio Grande do Sul passa entre dois pontos de teste, e o rótulo de Santa Catarina saía escrito por cima dela
- **O teste de cruzamento é feito na hora de escolher, não presumido.** Regra geométrica fixa não resolve: régua lateral obriga traçado enorme no estado central, e traçado radial a partir do centro do mapa deixa o rótulo de MT e TO a 500 unidades do estado. As duas tentativas foram descartadas por medição, não por gosto
- **`npm run mapa` é a guarda.** Recorta as funções de posicionamento de dentro do `painel.html` e falha se sobrar traçado cruzado, traçado por cima de rótulo, rótulo sobreposto ou traçado acima de 460 unidades. Mexeu no mapa, rodar
- **O mapa é figura, não controle**: sem clique, sem hover, sem estado selecionado. O filtro de UF do topo não mexe nele
- **A silhueta vem do `perfil` da malha**, que diz até onde o desenho vai em cada faixa de latitude (oeste/leste) e de longitude (norte/sul). É o que permite saber onde o mapa acaba sem testar o ponto contra 27 polígonos
- **O viewBox do mapa é calculado** a partir das caixas dos rótulos (`moldura()`), então mudar a malha ou o tamanho do texto não corta rótulo
- **O traçado é tinta escura com casulo branco fino, e a cor da faixa fica no ponto sobre o estado.** Traçado na cor da faixa some dentro do estado da mesma cor, e casulo branco largo vira um risco que se confunde com divisa de estado
- **A forma do estado não anima opacidade no hover**: clarear a forma deixa o fundo branco vazar pela divisa e a borda pisca. O realce é na espessura da divisa
- Par de cores das séries: federal `#2E3ED6`, estadual `#2E8B22`. Validado para daltonismo (ΔE 32,1 deutan, 10,4 tritan). Não trocar por olho
- Barras na escala fixa de 0 a 60%, para o comprimento ser comparável entre categorias, anos e estados
- Cards são montados uma vez e atualizados no lugar por `atualizarCards()`; refazer o HTML mataria a transição das barras na troca de UF
- `.anim` só entra no `<body>` depois de dois `requestAnimationFrame`: a primeira pintura nasce pronta e só as mudanças posteriores animam
- Cobertura do ano incompleto sai de `painel.diasCobertos`, nunca de conta feita sobre o percentual arredondado

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
