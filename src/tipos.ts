/** Tipos de dados do IBPT */

export type TipoTabela = 'ncm' | 'nbs' | 'lc116';

export interface Versao {
  ano: number;
  semestre: number;
  revisao: string;
  codigo: string; // ex: "26.1.F"
  arquivo: string; // nome do ZIP
}

/** Registro descritivo com propriedades nomeadas */
export interface Registro {
  codigo: string;
  excecao: string;
  descricao: string;
  aliquotaNacionalFederal: number;
  aliquotaImportadosFederal: number;
  aliquotaEstadual: number;
  aliquotaMunicipal: number;
  vigenciaInicio: string;
  vigenciaFim: string;
}

export interface ArquivoSaida {
  /** Codigo da tabela/versao */
  tabela: string;
  /** Array de registros descritivos */
  dados: Registro[];
}

export interface IndiceVersao {
  tabela: string;
  semestre: number;
  revisao: string;
  tipos: Record<TipoTabela, { total: number; ufs: Record<string, number> }>;
}

export interface IndiceAno {
  ano: number;
  versoes: Array<{
    tabela: string;
    semestre: number;
    revisao: string;
    registros: number;
  }>;
  totalRegistros: number;
}

/** Totais de um ano ja construido, guardados para o build incremental */
export interface AnoNoManifesto {
  /** sha256 de cada ZIP do ano, no momento em que o ano foi construido */
  hashes: Record<string, string>;
  /** Codigos das versoes que geraram arquivos, na ordem do indice */
  versoes: string[];
  registros: number;
  bytesCsv: number;
  porTipo: Record<TipoTabela, { registros: number; ufs: number }>;
  /** ZIPs do ano que falharam, para o build seguinte tornar a reclamar */
  ignorados: string[];
}

/** Estado do ultimo build, usado para pular anos que nao mudaram */
export interface Manifesto {
  versao: number;
  /** sha256 dos fontes do build; se mudar, o cache inteiro e descartado */
  codigoHash: string;
  anos: Record<string, AnoNoManifesto>;
}

/** Numeros do build, consumidos pela pagina para nao ter valor fixo no HTML */
export interface Estatisticas {
  /** ISO 8601 do momento em que o build terminou */
  geradoEm: string;
  duracaoSegundos: number;
  /** Total de versoes (ZIPs) processadas */
  tabelas: number;
  anoInicial: number;
  anoFinal: number;
  totalRegistros: number;
  /** Arquivos publicados em docs/api (json.gz, index.json, csv.gz e meta.json) */
  arquivosGerados: number;
  /** Soma dos CSVs extraidos dos ZIPs, antes da compressao */
  bytesCsvBruto: number;
  /** Soma dos arquivos publicados, ja comprimidos */
  bytesComprimido: number;
  /** Reducao percentual de bytesCsvBruto para bytesComprimido */
  reducaoPercentual: number;
  /** Media de registros por UF em cada tipo, sobre todas as versoes */
  registrosPorUf: Record<TipoTabela, number>;
}

export interface MetaDados {
  anos: number[];
  tipos: Record<TipoTabela, string>;
  ufs: string[];
  versoes: Record<string, string[]>;
  estatisticas: Estatisticas;
}
