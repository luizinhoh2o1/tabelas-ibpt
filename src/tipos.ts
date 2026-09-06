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

/** Par [federal, estadual] em pontos percentuais. */
export type ParAliquota = [number, number];

export interface ItemCesta {
  nome: string;
  /** NCM sem pontuacao, como vem no CSV do IBPT */
  codigo: string;
  /** Excecao tarifaria. Vazio e a linha base do NCM; o mesmo codigo pode ter linha Ex 01 com outra aliquota e outro produto */
  excecao: string;
  /** NCM formatado, para exibicao */
  ncm: string;
}

/** Medias de um ano, ponderadas pelos dias de vigencia de cada tabela */
export interface PainelAno {
  cesta: ParAliquota | null;
  carro: ParAliquota | null;
  moto: ParAliquota | null;
  /** Uma entrada por item da cesta, na ordem de Painel.cesta */
  itens: Array<ParAliquota | null>;
  /** Percentual dos dias do ano com tabela utilizavel nesta UF: exclui dia sem publicacao e dia coberto so por publicacao defeituosa */
  cobertura: number;
}

/** Numeros economicos de um ano, media dos meses disponiveis */
export interface AnoEconomico {
  /** Meses do ano que entraram na media */
  meses: number;
  /** Nivel de precos medio do ano por recorte do IPCA. So a razao entre dois anos tem significado */
  indices: { geral: number; alimentacao: number; automovel: number; motocicleta: number };
  /** Salario minimo medio do ano, em reais */
  salarioBruto: number;
  /** Salario minimo medio ja descontado o INSS do empregado */
  salarioLiquido: number;
  /** Percentual medio descontado a titulo de INSS */
  inss: number;
}

/** Series economicas que a pagina cruza com as aliquotas */
export interface Economia {
  /** Horas de trabalho no mes pela CLT, usada para achar o valor da hora */
  jornadaMensal: number;
  anos: Record<string, AnoEconomico>;
}

/** Conteudo de docs/api/painel.json */
export interface Painel {
  /** As 27 UFs, precedidas de "BR", que e a media simples delas */
  ufs: string[];
  anos: number[];
  cesta: Array<Omit<ItemCesta, 'codigo' | 'excecao'>>;
  /** Ano -> [dias com alguma tabela vigente, dias do ano] */
  diasCobertos: Record<string, [number, number]>;
  /** Ultimo dia coberto por alguma tabela, aaaa-mm-dd. A pagina usa para saber quanto da cobertura ainda e futuro */
  fimCobertura: string;
  /** IPCA, salario minimo e INSS por ano. Ausente quando dados/ nao esta completo */
  economia?: Economia;
  /** UF -> ano -> medias */
  dados: Record<string, Record<string, PainelAno>>;
}
