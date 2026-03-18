import { writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import type { ArquivoSaida, Registro, TipoTabela, IndiceVersao, IndiceAno, MetaDados } from './tipos.js';

/**
 * Escreve um arquivo JSON comprimido com gzip (.json.gz).
 * Retorna o tamanho em bytes do arquivo comprimido.
 */
export async function escreverJsonGz(caminho: string, dados: unknown): Promise<number> {
  const json = JSON.stringify(dados);
  const comprimido = gzipSync(Buffer.from(json), { level: 9 });
  await writeFile(caminho, comprimido);
  return comprimido.length;
}

/**
 * Escreve um arquivo JSON simples (sem compressao) para indices e metadados.
 */
export async function escreverJson(caminho: string, dados: unknown): Promise<void> {
  await writeFile(caminho, JSON.stringify(dados, null, 2));
}

/**
 * Gera os arquivos JSON comprimidos para uma versao/tipo/uf.
 */
export async function gerarArquivoDados(
  diretorioBase: string,
  ano: string,
  tabela: string,
  tipo: TipoTabela,
  uf: string,
  registros: Registro[]
): Promise<number> {
  const diretorio = join(diretorioBase, ano, tabela, tipo);
  await mkdir(diretorio, { recursive: true });

  const saida: ArquivoSaida = {
    tabela,
    dados: registros
  };

  const caminho = join(diretorio, `${uf}.json.gz`);
  return escreverJsonGz(caminho, saida);
}

/**
 * Gera o indice de uma versao (contagem por tipo e UF).
 */
export async function gerarIndiceVersao(
  diretorioBase: string,
  ano: string,
  versao: IndiceVersao
): Promise<void> {
  const diretorio = join(diretorioBase, ano, versao.tabela);
  await mkdir(diretorio, { recursive: true });
  await escreverJson(join(diretorio, 'index.json'), versao);
}

/**
 * Gera o indice de um ano (lista de versoes disponiveis).
 */
export async function gerarIndiceAno(
  diretorioBase: string,
  ano: string,
  indice: IndiceAno
): Promise<void> {
  const diretorio = join(diretorioBase, ano);
  await mkdir(diretorio, { recursive: true });
  await escreverJson(join(diretorio, 'index.json'), indice);
}

/**
 * Gera o indice de um tipo dentro de uma versao.
 */
export async function gerarIndiceTipoVersao(
  diretorioBase: string,
  ano: string,
  tabela: string,
  tipo: TipoTabela,
  contagem: { total: number; ufs: Record<string, number> }
): Promise<void> {
  const diretorio = join(diretorioBase, ano, tabela, tipo);
  await mkdir(diretorio, { recursive: true });
  await escreverJson(join(diretorio, 'index.json'), {
    tabela,
    tipo,
    ano: parseInt(ano),
    ...contagem
  });
}

/**
 * Gera o arquivo de metadados principal.
 */
export async function gerarMetaDados(
  diretorioBase: string,
  meta: MetaDados
): Promise<void> {
  await escreverJson(join(diretorioBase, 'meta.json'), meta);
}
