import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { createGzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { ArquivoSaida, Registro, TipoTabela, IndiceVersao, IndiceAno, MetaDados, Manifesto } from './tipos.js';

const gzipAsync = promisify(gzip);

/** Nome do manifesto do build incremental, dentro de docs/api. */
export const MANIFESTO = '_manifesto.json';

/** Nome do arquivo de metadados publicado na raiz da API. */
export const META = 'meta.json';

/** Subir esta versao invalida o cache e forca um build completo. */
export const VERSAO_MANIFESTO = 1;

/** Nome do CSV consolidado de um ano. */
export function nomeCsvAno(ano: string | number): string {
  return `todos-${ano}.csv.gz`;
}

/**
 * Escreve um arquivo JSON comprimido com gzip (.json.gz).
 * Retorna o tamanho em bytes do arquivo comprimido.
 */
export async function escreverJsonGz(caminho: string, dados: unknown): Promise<number> {
  const json = JSON.stringify(dados);
  const comprimido = await gzipAsync(Buffer.from(json), { level: 9 });
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
  await escreverJson(join(diretorioBase, META), meta);
}

/**
 * Le o manifesto do build anterior. Retorna null quando nao existe ou esta
 * corrompido -- nesses casos o build simplesmente refaz tudo.
 */
export async function lerManifesto(diretorioBase: string): Promise<Manifesto | null> {
  const caminho = join(diretorioBase, MANIFESTO);
  if (!existsSync(caminho)) return null;

  try {
    const manifesto = JSON.parse(await readFile(caminho, 'utf-8')) as Manifesto;
    return manifesto.versao === VERSAO_MANIFESTO ? manifesto : null;
  } catch {
    return null;
  }
}

export async function gravarManifesto(diretorioBase: string, manifesto: Manifesto): Promise<void> {
  await escreverJson(join(diretorioBase, MANIFESTO), manifesto);
}

// ─── CSV consolidado (streaming) ─────────────────────────

const CABECALHO_CSV = 'ano;tabela;tipo;uf;codigo;excecao;descricao;aliquotaNacionalFederal;aliquotaImportadosFederal;aliquotaEstadual;aliquotaMunicipal;vigenciaInicio;vigenciaFim\n';

function escaparCampoCsv(valor: string): string {
  if (valor.includes(';') || valor.includes('"') || valor.includes('\n')) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

export interface FluxoCsvGz {
  escreverRegistros(ano: number, tabela: string, tipo: TipoTabela, uf: string, registros: Registro[]): void;
  finalizar(): Promise<void>;
}

/**
 * Cria um fluxo de escrita CSV comprimido com gzip (streaming).
 * Os registros sao escritos incrementalmente sem acumular em memoria.
 */
export function criarFluxoCsvGz(caminho: string): FluxoCsvGz {
  const gzip = createGzip({ level: 9 });
  const arquivo = createWriteStream(caminho);
  gzip.pipe(arquivo);

  // Escrever cabecalho
  gzip.write(CABECALHO_CSV);

  return {
    escreverRegistros(ano: number, tabela: string, tipo: TipoTabela, uf: string, registros: Registro[]) {
      const linhas: string[] = [];
      for (const r of registros) {
        linhas.push(`${ano};${tabela};${tipo};${uf};${r.codigo};${escaparCampoCsv(r.excecao)};${escaparCampoCsv(r.descricao)};${r.aliquotaNacionalFederal};${r.aliquotaImportadosFederal};${r.aliquotaEstadual};${r.aliquotaMunicipal};${r.vigenciaInicio};${r.vigenciaFim}\n`);
      }
      gzip.write(linhas.join(''));
    },

    finalizar(): Promise<void> {
      return new Promise((resolve, reject) => {
        arquivo.on('finish', resolve);
        arquivo.on('error', reject);
        gzip.end();
      });
    }
  };
}
