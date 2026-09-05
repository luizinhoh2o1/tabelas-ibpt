#!/usr/bin/env tsx
/**
 * Script de construcao: Extrai TODOS os dados CSV dos ZIPs do IBPT
 * e gera arquivos JSON comprimidos (gzip) para a API estatica.
 *
 * Estrutura de saida:
 *   /docs/api/meta.json
 *   /docs/api/{ano}/index.json
 *   /docs/api/{ano}/{versao}/index.json
 *   /docs/api/{ano}/{versao}/{tipo}/index.json
 *   /docs/api/{ano}/{versao}/{tipo}/{uf}.json.gz
 *
 * Todas as versoes sao processadas (todos semestres/revisoes).
 *
 * Uso: npx tsx src/construir.ts
 */

import { readdirSync, rmSync, mkdirSync, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { processarCsv, extrairUfDoNomeArquivo, type DadosPorTipo } from './processadorCsv.js';
import {
  gerarArquivoDados,
  gerarIndiceVersao,
  gerarIndiceAno,
  gerarIndiceTipoVersao,
  gerarMetaDados,
  criarFluxoCsvGz,
  lerManifesto,
  gravarManifesto,
  nomeCsvAno,
  META,
  VERSAO_MANIFESTO,
  type FluxoCsvGz
} from './geradorJson.js';
import { UFS, ROTULO_TIPO, TIPOS } from './constantes.js';
import type { Versao, TipoTabela, IndiceVersao, IndiceAno, MetaDados, Estatisticas, Manifesto, AnoNoManifesto } from './tipos.js';

const DIRETORIO_RAIZ = join(import.meta.dirname, '..');
const DIRETORIO_REPO = join(DIRETORIO_RAIZ, 'repositorio-ibpt');
const DIRETORIO_DOCS = join(DIRETORIO_RAIZ, 'docs');
const DIRETORIO_API = join(DIRETORIO_DOCS, 'api');
const DIRETORIO_TEMP = join(tmpdir(), 'ibpt_construcao');

/** Nome de diretorio de ano dentro de docs/api (ex: "2026"). */
const ANO_DIR = /^[0-9]{4}$/;

// ─── Funcoes auxiliares ───────────────────────────────────

function analisarNomeArquivoZip(nomeArquivo: string): Versao | null {
  const resultado = nomeArquivo.match(/TabelaIBPTax_(\d{2})\.(\d)\.([A-Z])\.zip/);
  if (!resultado) return null;
  return {
    ano: 2000 + parseInt(resultado[1]),
    semestre: parseInt(resultado[2]),
    revisao: resultado[3],
    codigo: `${resultado[1]}.${resultado[2]}.${resultado[3]}`,
    arquivo: nomeArquivo
  };
}

function agruparPorAno(arquivos: string[]): Map<number, Versao[]> {
  const porAno = new Map<number, Versao[]>();

  for (const arquivo of arquivos) {
    const versao = analisarNomeArquivoZip(arquivo);
    if (!versao) continue;

    if (!porAno.has(versao.ano)) porAno.set(versao.ano, []);
    porAno.get(versao.ano)!.push(versao);
  }

  // Ordenar versoes: semestre asc, revisao asc
  for (const versoes of porAno.values()) {
    versoes.sort((a, b) => {
      if (a.semestre !== b.semestre) return a.semestre - b.semestre;
      return a.revisao.localeCompare(b.revisao);
    });
  }

  return porAno;
}

/**
 * Extrai um ZIP para `diretorioDestino` usando fflate (JS puro), sem depender
 * do binario `unzip` do sistema -- que nao existe por padrao no Windows nem
 * no macOS.
 *
 * As entradas sao gravadas pelo nome-base: alguns ZIPs do IBPT trazem os CSVs
 * dentro de uma subpasta, e o resto do build so olha o nivel raiz.
 */
function extrairZip(caminhoZip: string, diretorioDestino: string): boolean {
  try {
    const conteudo = unzipSync(readFileSync(caminhoZip));

    for (const [caminhoInterno, dados] of Object.entries(conteudo)) {
      if (caminhoInterno.endsWith('/') || dados.length === 0) continue;

      const nome = basename(caminhoInterno);
      const destino = join(diretorioDestino, nome);
      if (existsSync(destino)) {
        console.log(`  AVISO: nome repetido no ZIP, ignorando ${caminhoInterno}`);
        continue;
      }
      writeFileSync(destino, dados);
    }

    return true;
  } catch (erro) {
    console.log(`  AVISO: falha ao extrair: ${(erro as Error).message}`);
    return false;
  }
}

/**
 * Conta arquivos e bytes em `diretorio`, ignorando `ignorar` na raiz.
 *
 * O meta.json fica de fora porque e escrito depois desta contagem (ele contem
 * o proprio resultado dela) -- inclui-lo daria numero diferente entre um build
 * completo, onde ele ainda nao existe, e um incremental, onde sobrou do build
 * anterior.
 */
function contarArquivosEtamanho(
  diretorio: string,
  ignorar: string[] = []
): { arquivos: number; tamanho: number } {
  let arquivos = 0;
  let tamanho = 0;

  function percorrer(dir: string, raiz: boolean) {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (raiz && ignorar.includes(entrada.name)) continue;
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        percorrer(caminho, false);
      } else {
        arquivos++;
        tamanho += statSync(caminho).size;
      }
    }
  }

  percorrer(diretorio, true);
  return { arquivos, tamanho };
}

function hashArquivo(caminho: string): string {
  return createHash('sha256').update(readFileSync(caminho)).digest('hex');
}

/**
 * Hash dos fontes do build. Entra no manifesto para que uma mudanca no codigo
 * de geracao descarte o cache -- sem isso, o CI poderia restaurar um cache
 * antigo (via restore-keys) e reaproveitar anos gerados pela versao anterior.
 */
function hashDoCodigo(): string {
  const dir = import.meta.dirname;
  const fontes = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort();
  const soma = createHash('sha256');
  for (const f of fontes) soma.update(f).update(readFileSync(join(dir, f)));
  return soma.digest('hex');
}

/**
 * Um ano so pode ser reaproveitado quando os ZIPs sao exatamente os mesmos e
 * as saidas continuam no disco. O CSV consolidado do ano cobre todas as
 * versoes daquele ano, entao a granularidade do cache e o ano inteiro: se um
 * ZIP muda, o ano todo e reconstruido.
 */
function anoPodeSerReaproveitado(
  ano: number,
  versoes: Versao[],
  registro: AnoNoManifesto | undefined
): boolean {
  if (!registro) return false;

  const arquivos = versoes.map(v => v.arquivo).sort();
  const noManifesto = Object.keys(registro.hashes).sort();
  if (arquivos.length !== noManifesto.length) return false;
  if (arquivos.some((a, i) => a !== noManifesto[i])) return false;

  if (!existsSync(join(DIRETORIO_API, nomeCsvAno(ano)))) return false;
  if (!existsSync(join(DIRETORIO_API, ano.toString(), 'index.json'))) return false;
  for (const codigo of registro.versoes) {
    if (!existsSync(join(DIRETORIO_API, ano.toString(), codigo))) return false;
  }

  return arquivos.every(
    arquivo => hashArquivo(join(DIRETORIO_REPO, arquivo)) === registro.hashes[arquivo]
  );
}

// ─── Processamento principal ──────────────────────────────

interface ResultadoVersao {
  registros: number;
  /** Soma dos CSVs extraidos do ZIP, antes de comprimir */
  bytesCsv: number;
  /** Por tipo: total de registros e quantas UFs geraram arquivo */
  porTipo: Record<TipoTabela, { registros: number; ufs: number }>;
}

async function processarVersao(
  versao: Versao,
  diretorioApi: string,
  fluxoCsv: FluxoCsvGz
): Promise<ResultadoVersao | null> {
  const diretorioExtracao = join(DIRETORIO_TEMP, versao.codigo);
  mkdirSync(diretorioExtracao, { recursive: true });

  const caminhoZip = join(DIRETORIO_REPO, versao.arquivo);
  if (!extrairZip(caminhoZip, diretorioExtracao)) {
    console.log(`  AVISO: Falha ao extrair ${versao.arquivo}`);
    return null;
  }

  const arquivosCsv = readdirSync(diretorioExtracao).filter(f => f.endsWith('.csv'));
  const bytesCsv = arquivosCsv.reduce(
    (soma, f) => soma + statSync(join(diretorioExtracao, f)).size,
    0
  );
  if (arquivosCsv.length === 0) {
    console.log(`  AVISO: Nenhum CSV em ${versao.arquivo}`);
    rmSync(diretorioExtracao, { recursive: true });
    return null;
  }

  // Processar todos os CSVs em paralelo. Quando o CSV nao tem UF no nome
  // (publicacao consolidada do IBPT), os dados sao replicados para todas as UFs.
  const tarefas = arquivosCsv.map(async (csvFile) => {
    const uf = extrairUfDoNomeArquivo(csvFile);
    const caminhoCsv = join(diretorioExtracao, csvFile);
    const dados = await processarCsv(caminhoCsv);
    return { uf, dados };
  });

  const resultados = await Promise.all(tarefas);

  // Agrupar dados por tipo e UF
  const dadosPorTipoUf: Record<TipoTabela, Record<string, DadosPorTipo[TipoTabela]>> = {
    ncm: {}, nbs: {}, lc116: {}
  };

  for (const resultado of resultados) {
    const ufsAlvo = resultado.uf ? [resultado.uf] : [...UFS];
    for (const tipo of TIPOS) {
      if (resultado.dados[tipo].length > 0) {
        for (const uf of ufsAlvo) {
          dadosPorTipoUf[tipo][uf] = resultado.dados[tipo];
        }
      }
    }
  }

  // Gerar arquivos JSON comprimidos em paralelo
  const ano = versao.ano.toString();
  const tarefasEscrita: Promise<unknown>[] = [];
  const indiceVersao: IndiceVersao = {
    tabela: versao.codigo,
    semestre: versao.semestre,
    revisao: versao.revisao,
    tipos: {} as IndiceVersao['tipos']
  };
  let totalRegistros = 0;
  const porTipo = {} as ResultadoVersao['porTipo'];

  for (const tipo of TIPOS) {
    const contagemTipo = { total: 0, ufs: {} as Record<string, number> };

    for (const uf of UFS) {
      const registros = dadosPorTipoUf[tipo][uf];
      if (registros && registros.length > 0) {
        tarefasEscrita.push(
          gerarArquivoDados(diretorioApi, ano, versao.codigo, tipo, uf, registros)
        );
        fluxoCsv.escreverRegistros(versao.ano, versao.codigo, tipo, uf, registros);
        contagemTipo.ufs[uf] = registros.length;
        contagemTipo.total += registros.length;
      }
    }

    // Indice por tipo
    tarefasEscrita.push(
      gerarIndiceTipoVersao(diretorioApi, ano, versao.codigo, tipo, contagemTipo)
    );

    indiceVersao.tipos[tipo] = contagemTipo;
    porTipo[tipo] = { registros: contagemTipo.total, ufs: Object.keys(contagemTipo.ufs).length };
    totalRegistros += contagemTipo.total;
  }

  // Indice da versao
  tarefasEscrita.push(gerarIndiceVersao(diretorioApi, ano, indiceVersao));

  await Promise.all(tarefasEscrita);

  // Limpar arquivos extraidos
  rmSync(diretorioExtracao, { recursive: true });

  return { registros: totalRegistros, bytesCsv, porTipo };
}

async function construir(): Promise<void> {
  const inicio = performance.now();
  console.log('Construindo API estatica IBPT (todas as versoes)...\n');

  mkdirSync(DIRETORIO_API, { recursive: true });
  mkdirSync(DIRETORIO_TEMP, { recursive: true });

  // Build incremental: o manifesto guarda o hash dos ZIPs de cada ano e os
  // totais do ultimo build. Ano com ZIPs identicos e saida no disco e pulado.
  // `npm run build -- --completo` ignora o cache.
  const forcarCompleto = process.argv.includes('--completo');
  const codigoHash = hashDoCodigo();
  const salvo = forcarCompleto ? null : await lerManifesto(DIRETORIO_API);
  const manifestoAnterior = salvo?.codigoHash === codigoHash ? salvo : null;
  const manifesto: Manifesto = { versao: VERSAO_MANIFESTO, codigoHash, anos: {} };

  if (salvo && !manifestoAnterior) {
    console.log('Codigo do build mudou desde o ultimo cache: reconstruindo tudo.\n');
  }

  // Listar e agrupar ZIPs
  const arquivosZip = readdirSync(DIRETORIO_REPO).filter(f => f.endsWith('.zip')).sort();
  const porAno = agruparPorAno(arquivosZip);
  const anos = [...porAno.keys()].sort();

  console.log('Anos e versoes encontrados:');
  for (const ano of anos) {
    const versoes = porAno.get(ano)!;
    console.log(`  ${ano}: ${versoes.map(v => v.codigo).join(', ')}`);
  }
  console.log(`\nTotal: ${arquivosZip.length} ZIPs em ${anos.length} anos\n`);

  const metaDados: MetaDados = {
    anos: [],
    tipos: ROTULO_TIPO,
    ufs: [...UFS],
    versoes: {},
    // Preenchido no fim, quando os totais do build sao conhecidos
    estatisticas: {} as Estatisticas
  };

  let bytesCsvBruto = 0;
  let totalRegistros = 0;
  let versoesProcessadas = 0;
  const versoesIgnoradas: string[] = [];
  const acumuladoPorTipo: Record<TipoTabela, { registros: number; ufs: number }> = {
    ncm: { registros: 0, ufs: 0 },
    nbs: { registros: 0, ufs: 0 },
    lc116: { registros: 0, ufs: 0 }
  };

  let anosReaproveitados = 0;

  for (const ano of anos) {
    const versoes = porAno.get(ano)!;
    const chaveAno = ano.toString();
    const anterior = manifestoAnterior?.anos[chaveAno];

    // ── Ano inalterado: reaproveita os arquivos e os totais do manifesto ──
    if (anoPodeSerReaproveitado(ano, versoes, anterior)) {
      const registro = anterior!;
      console.log(`${ano}: inalterado, reaproveitando ${registro.versoes.length} tabela(s)`);

      bytesCsvBruto += registro.bytesCsv;
      totalRegistros += registro.registros;
      versoesProcessadas += registro.versoes.length;
      for (const tipo of TIPOS) {
        acumuladoPorTipo[tipo].registros += registro.porTipo[tipo].registros;
        acumuladoPorTipo[tipo].ufs += registro.porTipo[tipo].ufs;
      }
      versoesIgnoradas.push(...registro.ignorados);

      metaDados.anos.push(ano);
      metaDados.versoes[chaveAno] = registro.versoes;
      manifesto.anos[chaveAno] = registro;
      anosReaproveitados++;
      continue;
    }

    // ── Ano alterado: apaga a saida antiga e reconstroi por inteiro ──
    // O CSV do ano cobre todas as versoes dele, entao nao da para reprocessar
    // so a versao nova sem perder as linhas das demais.
    rmSync(join(DIRETORIO_API, chaveAno), { recursive: true, force: true });
    rmSync(join(DIRETORIO_API, nomeCsvAno(ano)), { force: true });

    const fluxoCsv = criarFluxoCsvGz(join(DIRETORIO_API, nomeCsvAno(ano)));

    // Preenchido a partir do que realmente virou arquivo, nunca da listagem de
    // ZIPs: um ZIP que falha nao pode aparecer no meta.json, senao a pagina
    // oferece no filtro uma versao cujos endpoints respondem 404.
    const codigosGerados: string[] = [];
    const ignoradosDoAno: string[] = [];
    const totaisAno = {
      registros: 0,
      bytesCsv: 0,
      porTipo: {
        ncm: { registros: 0, ufs: 0 },
        nbs: { registros: 0, ufs: 0 },
        lc116: { registros: 0, ufs: 0 }
      } as AnoNoManifesto['porTipo']
    };

    const indiceAno: IndiceAno = {
      ano,
      versoes: [],
      totalRegistros: 0
    };

    for (const versao of versoes) {
      console.log(`Processando ${versao.codigo} (${versao.arquivo})...`);
      const resultado = await processarVersao(versao, DIRETORIO_API, fluxoCsv);

      if (resultado) {
        bytesCsvBruto += resultado.bytesCsv;
        totalRegistros += resultado.registros;
        versoesProcessadas++;
        totaisAno.registros += resultado.registros;
        totaisAno.bytesCsv += resultado.bytesCsv;
        for (const tipo of TIPOS) {
          acumuladoPorTipo[tipo].registros += resultado.porTipo[tipo].registros;
          acumuladoPorTipo[tipo].ufs += resultado.porTipo[tipo].ufs;
          totaisAno.porTipo[tipo].registros += resultado.porTipo[tipo].registros;
          totaisAno.porTipo[tipo].ufs += resultado.porTipo[tipo].ufs;
        }

        indiceAno.versoes.push({
          tabela: versao.codigo,
          semestre: versao.semestre,
          revisao: versao.revisao,
          registros: resultado.registros
        });
        indiceAno.totalRegistros += resultado.registros;
        codigosGerados.push(versao.codigo);
        console.log(`  Concluido: ${resultado.registros.toLocaleString('pt-BR')} registros`);
      } else {
        ignoradosDoAno.push(`${versao.codigo} (${versao.arquivo})`);
      }
    }

    await fluxoCsv.finalizar();
    versoesIgnoradas.push(...ignoradosDoAno);

    // Ano sem nenhuma versao valida nao entra no meta.json nem ganha indice
    if (codigosGerados.length === 0) {
      rmSync(join(DIRETORIO_API, nomeCsvAno(ano)), { force: true });
      continue;
    }

    metaDados.anos.push(ano);
    metaDados.versoes[chaveAno] = codigosGerados;
    await gerarIndiceAno(DIRETORIO_API, chaveAno, indiceAno);

    manifesto.anos[chaveAno] = {
      hashes: Object.fromEntries(
        versoes.map(v => [v.arquivo, hashArquivo(join(DIRETORIO_REPO, v.arquivo))])
      ),
      versoes: codigosGerados,
      registros: totaisAno.registros,
      bytesCsv: totaisAno.bytesCsv,
      porTipo: totaisAno.porTipo,
      ignorados: ignoradosDoAno
    };
  }

  // Limpa sobras do build anterior: ano que saiu do repositorio, CSV de ano que
  // nao existe mais e o antigo todos.csv.gz unico.
  for (const nome of readdirSync(DIRETORIO_API)) {
    const ehAnoOrfao = ANO_DIR.test(nome) && !manifesto.anos[nome];
    const ehCsvOrfao = nome === 'todos.csv.gz'
      || (nome.startsWith('todos-') && !anos.some(a => nome === nomeCsvAno(a)));
    if (ehAnoOrfao || ehCsvOrfao) {
      rmSync(join(DIRETORIO_API, nome), { recursive: true, force: true });
      console.log(`Removido do build anterior: ${nome}`);
    }
  }

  metaDados.anos.sort((a, b) => b - a);
  await gravarManifesto(DIRETORIO_API, manifesto);

  // Estatisticas finais. O meta.json e excluido da contagem e somado como +1,
  // para o numero nao depender de ele ter sobrado de um build anterior.
  const { arquivos, tamanho } = contarArquivosEtamanho(DIRETORIO_API, [META]);
  const duracao = (performance.now() - inicio) / 1000;
  const mediaPorUf = (tipo: TipoTabela) => {
    const { registros, ufs } = acumuladoPorTipo[tipo];
    return ufs > 0 ? Math.round(registros / ufs) : 0;
  };

  metaDados.estatisticas = {
    geradoEm: new Date().toISOString(),
    duracaoSegundos: Number(duracao.toFixed(1)),
    tabelas: versoesProcessadas,
    anoInicial: anos[0],
    anoFinal: anos[anos.length - 1],
    totalRegistros,
    arquivosGerados: arquivos + 1,
    bytesCsvBruto,
    bytesComprimido: tamanho,
    reducaoPercentual: bytesCsvBruto > 0
      ? Math.round((1 - tamanho / bytesCsvBruto) * 100)
      : 0,
    registrosPorUf: {
      ncm: mediaPorUf('ncm'),
      nbs: mediaPorUf('nbs'),
      lc116: mediaPorUf('lc116')
    }
  };

  await gerarMetaDados(DIRETORIO_API, metaDados);

  console.log(`\nConstrucao concluida em ${duracao.toFixed(1)}s!`);
  console.log(`Arquivos gerados: ${metaDados.estatisticas.arquivosGerados}`);
  console.log(`CSV bruto: ${(bytesCsvBruto / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`Tamanho total: ${(tamanho / 1024 / 1024).toFixed(1)} MB (gzip, -${metaDados.estatisticas.reducaoPercentual}%)`);
  console.log(`Registros: ${totalRegistros.toLocaleString('pt-BR')}`);
  console.log(`Tabelas publicadas: ${versoesProcessadas} de ${arquivosZip.length} ZIPs`);
  console.log(`Anos reaproveitados do cache: ${anosReaproveitados} de ${anos.length}`);

  if (versoesIgnoradas.length > 0) {
    console.error(`\nERRO: ${versoesIgnoradas.length} ZIP(s) nao geraram dados e ficaram fora do meta.json:`);
    for (const item of versoesIgnoradas) console.error(`  - ${item}`);
    console.error('\nOs CSVs precisam estar dentro do ZIP e no formato esperado.');
    // Sai com erro depois de gerar tudo: os arquivos ficam no disco para
    // inspecao, mas o CI falha e o site parcial nao e publicado.
    process.exitCode = 1;
  }
}

construir().catch(erro => {
  console.error('Erro na construcao:', erro);
  process.exit(1);
});
