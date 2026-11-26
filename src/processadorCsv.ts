import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { MAPA_TIPO } from './constantes.js';
import type { Registro, TipoTabela } from './tipos.js';

export type DadosPorTipo = Record<TipoTabela, Registro[]>;

const CODIGO_ASPA = 34;    // "
const CODIGO_PONTO_VIRGULA = 59;    // ;

/**
 * UF dos arquivos das tabelas nacionais de 2013 (0.0.1 e 0.0.2), que o IBPT
 * publicou antes de separar por estado. Nao e uma UF: e o pais inteiro.
 */
export const UF_NACIONAL = 'BR';

/** Posicao das colunas no layout nacional de 2013, achada pelo cabecalho. */
interface ColunasNacionais {
  /** -1 na 0.0.1, que nao tem descricao */
  descricao: number;
  nacional: number;
  importados: number;
}

/**
 * Reconhece o layout nacional de 2013 pelo cabecalho: `codigo;ex;tabela;
 * aliqNac;aliqImp;0.0.1`, com `descricao` antes das aliquotas a partir da
 * 0.0.2. Sem UF, sem aliquota estadual e municipal e sem vigencia. Devolve
 * null para o layout por UF, usado de 14.2.a em diante.
 */
function colunasNacionais(cabecalho: string): ColunasNacionais | null {
  const nomes = analisarLinhaCsv(cabecalho);
  const nacional = nomes.indexOf('aliqNac');
  const importados = nomes.indexOf('aliqImp');
  if (nacional < 0 || importados < 0) return null;
  return { descricao: nomes.indexOf('descricao'), nacional, importados };
}

/**
 * Extrai um campo de `linha` entre os indices [inicio, fim).
 * Remove aspas envolventes e desescapa "" → " (convencao CSV).
 * Fast path quando o campo nao comeca com aspas.
 */
export function pegarCampo(linha: string, inicio: number, fim: number): string {
  if (inicio === fim) return '';
  if (linha.charCodeAt(inicio) !== CODIGO_ASPA) {
    return linha.slice(inicio, fim);
  }
  const conteudo = fim > inicio + 1 && linha.charCodeAt(fim - 1) === CODIGO_ASPA
    ? linha.slice(inicio + 1, fim - 1)
    : linha.slice(inicio + 1, fim);
  return conteudo.indexOf('""') < 0 ? conteudo : conteudo.replace(/""/g, '"');
}

/**
 * Faz o parse de uma linha CSV separada por ponto-e-virgula,
 * respeitando campos entre aspas. Usa slice em vez de concat char-a-char
 * para evitar comportamento quadratico em linhas longas.
 */
export function analisarLinhaCsv(linha: string): string[] {
  const campos: string[] = [];
  const tamanho = linha.length;
  let inicio = 0;
  let dentroDeAspas = false;

  for (let i = 0; i < tamanho; i++) {
    const codigo = linha.charCodeAt(i);
    if (codigo === CODIGO_ASPA) {
      dentroDeAspas = !dentroDeAspas;
    } else if (codigo === CODIGO_PONTO_VIRGULA && !dentroDeAspas) {
      campos.push(pegarCampo(linha, inicio, i));
      inicio = i + 1;
    }
  }
  campos.push(pegarCampo(linha, inicio, tamanho));
  return campos;
}

/**
 * Processa um arquivo CSV usando streaming (readline) para baixo consumo de memoria.
 * Retorna os registros agrupados por tipo (ncm, nbs, lc116).
 */
export async function processarCsv(caminhoArquivo: string): Promise<DadosPorTipo> {
  const dados: DadosPorTipo = { ncm: [], nbs: [], lc116: [] };

  const fluxo = createReadStream(caminhoArquivo, { encoding: 'latin1', highWaterMark: 64 * 1024 });
  const leitor = createInterface({ input: fluxo, crlfDelay: Infinity });

  let primeiraLinha = true;
  let nacionais: ColunasNacionais | null = null;

  for await (const linha of leitor) {
    if (primeiraLinha) {
      primeiraLinha = false;
      nacionais = colunasNacionais(linha);
      continue;
    }

    if (linha.length === 0) continue;

    const campos = analisarLinhaCsv(linha);
    const tipo = MAPA_TIPO[campos[2]];
    if (!tipo) continue;

    if (nacionais) {
      if (campos.length <= nacionais.importados) continue;
      dados[tipo].push({
        codigo: campos[0],
        excecao: campos[1] || '',
        descricao: nacionais.descricao >= 0 ? campos[nacionais.descricao] : '',
        aliquotaNacionalFederal: parseFloat(campos[nacionais.nacional]) || 0,
        aliquotaImportadosFederal: parseFloat(campos[nacionais.importados]) || 0,
        aliquotaEstadual: null,
        aliquotaMunicipal: null,
        vigenciaInicio: '',
        vigenciaFim: ''
      });
      continue;
    }

    if (campos.length < 10) continue;

    const registro: Registro = {
      codigo: campos[0],
      excecao: campos[1] || '',
      descricao: campos[3],
      aliquotaNacionalFederal: parseFloat(campos[4]) || 0,
      aliquotaImportadosFederal: parseFloat(campos[5]) || 0,
      aliquotaEstadual: parseFloat(campos[6]) || 0,
      aliquotaMunicipal: parseFloat(campos[7]) || 0,
      vigenciaInicio: campos[8] || '',
      vigenciaFim: campos[9] || ''
    };

    dados[tipo].push(registro);
  }

  return dados;
}

/**
 * Extrai a UF do nome do arquivo CSV.
 * Ex: "TabelaIBPTaxSP26.1.F.csv" -> "SP"
 * Retorna null se nao for um arquivo por UF (consolidado).
 */
export function extrairUfDoNomeArquivo(nomeArquivo: string): string | null {
  const resultado = nomeArquivo.match(/TabelaIBPTax([A-Z]{2})\d/);
  return resultado ? resultado[1] : null;
}
