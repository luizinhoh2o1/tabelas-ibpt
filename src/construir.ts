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

import { readdirSync, rmSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { processarCsv, extrairUfDoNomeArquivo, type DadosPorTipo } from './processadorCsv.js';
import {
  gerarArquivoDados,
  gerarIndiceVersao,
  gerarIndiceAno,
  gerarIndiceTipoVersao,
  gerarMetaDados
} from './geradorJson.js';
import { UFS, ROTULO_TIPO, TIPOS } from './constantes.js';
import type { Versao, TipoTabela, IndiceVersao, IndiceAno, MetaDados } from './tipos.js';

const DIRETORIO_RAIZ = join(import.meta.dirname, '..');
const DIRETORIO_REPO = join(DIRETORIO_RAIZ, 'repositorio-ibpt');
const DIRETORIO_DOCS = join(DIRETORIO_RAIZ, 'docs');
const DIRETORIO_API = join(DIRETORIO_DOCS, 'api');
const DIRETORIO_TEMP = '/tmp/ibpt_construcao';

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

function extrairZip(caminhoZip: string, diretorioDestino: string): boolean {
  try {
    execSync(`unzip -o "${caminhoZip}" -d "${diretorioDestino}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function contarArquivosEtamanho(diretorio: string): { arquivos: number; tamanho: number } {
  let arquivos = 0;
  let tamanho = 0;

  function percorrer(dir: string) {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        percorrer(caminho);
      } else {
        arquivos++;
        tamanho += statSync(caminho).size;
      }
    }
  }

  percorrer(diretorio);
  return { arquivos, tamanho };
}

// ─── Processamento principal ──────────────────────────────

async function processarVersao(
  versao: Versao,
  diretorioApi: string
): Promise<{ registros: number } | null> {
  const diretorioExtracao = join(DIRETORIO_TEMP, versao.codigo);
  mkdirSync(diretorioExtracao, { recursive: true });

  const caminhoZip = join(DIRETORIO_REPO, versao.arquivo);
  if (!extrairZip(caminhoZip, diretorioExtracao)) {
    console.log(`  AVISO: Falha ao extrair ${versao.arquivo}`);
    return null;
  }

  const arquivosCsv = readdirSync(diretorioExtracao).filter(f => f.endsWith('.csv'));
  if (arquivosCsv.length === 0) {
    console.log(`  AVISO: Nenhum CSV em ${versao.arquivo}`);
    rmSync(diretorioExtracao, { recursive: true });
    return null;
  }

  // Processar todos os CSVs em paralelo
  const tarefas = arquivosCsv.map(async (csvFile) => {
    const uf = extrairUfDoNomeArquivo(csvFile);
    if (!uf) return null;
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
    if (!resultado) continue;
    for (const tipo of TIPOS) {
      if (resultado.dados[tipo].length > 0) {
        dadosPorTipoUf[tipo][resultado.uf] = resultado.dados[tipo];
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

  for (const tipo of TIPOS) {
    const contagemTipo = { total: 0, ufs: {} as Record<string, number> };

    for (const uf of UFS) {
      const registros = dadosPorTipoUf[tipo][uf];
      if (registros && registros.length > 0) {
        tarefasEscrita.push(
          gerarArquivoDados(diretorioApi, ano, versao.codigo, tipo, uf, registros)
        );
        contagemTipo.ufs[uf] = registros.length;
        contagemTipo.total += registros.length;
      }
    }

    // Indice por tipo
    tarefasEscrita.push(
      gerarIndiceTipoVersao(diretorioApi, ano, versao.codigo, tipo, contagemTipo)
    );

    indiceVersao.tipos[tipo] = contagemTipo;
    totalRegistros += contagemTipo.total;
  }

  // Indice da versao
  tarefasEscrita.push(gerarIndiceVersao(diretorioApi, ano, indiceVersao));

  await Promise.all(tarefasEscrita);

  // Limpar arquivos extraidos
  rmSync(diretorioExtracao, { recursive: true });

  return { registros: totalRegistros };
}

async function construir(): Promise<void> {
  const inicio = performance.now();
  console.log('Construindo API estatica IBPT (todas as versoes)...\n');

  // Limpar diretorio de saida
  if (existsSync(DIRETORIO_API)) rmSync(DIRETORIO_API, { recursive: true });
  mkdirSync(DIRETORIO_API, { recursive: true });
  mkdirSync(DIRETORIO_TEMP, { recursive: true });

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
    versoes: {}
  };

  for (const ano of anos) {
    const versoes = porAno.get(ano)!;
    metaDados.anos.push(ano);
    metaDados.versoes[ano.toString()] = versoes.map(v => v.codigo);

    const indiceAno: IndiceAno = {
      ano,
      versoes: [],
      totalRegistros: 0
    };

    for (const versao of versoes) {
      console.log(`Processando ${versao.codigo} (${versao.arquivo})...`);
      const resultado = await processarVersao(versao, DIRETORIO_API);

      if (resultado) {
        indiceAno.versoes.push({
          tabela: versao.codigo,
          semestre: versao.semestre,
          revisao: versao.revisao,
          registros: resultado.registros
        });
        indiceAno.totalRegistros += resultado.registros;
        console.log(`  Concluido: ${resultado.registros.toLocaleString('pt-BR')} registros`);
      }
    }

    await gerarIndiceAno(DIRETORIO_API, ano.toString(), indiceAno);
  }

  metaDados.anos.sort((a, b) => b - a);
  await gerarMetaDados(DIRETORIO_API, metaDados);

  // Estatisticas finais
  const { arquivos, tamanho } = contarArquivosEtamanho(DIRETORIO_API);
  const duracao = ((performance.now() - inicio) / 1000).toFixed(1);

  console.log(`\nConstrucao concluida em ${duracao}s!`);
  console.log(`Arquivos JSON: ${arquivos}`);
  console.log(`Tamanho total: ${(tamanho / 1024 / 1024).toFixed(1)} MB (comprimido com gzip)`);
}

construir().catch(erro => {
  console.error('Erro na construcao:', erro);
  process.exit(1);
});
