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

export interface MetaDados {
  anos: number[];
  tipos: Record<TipoTabela, string>;
  ufs: string[];
  versoes: Record<string, string[]>;
}
