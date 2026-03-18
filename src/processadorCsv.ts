import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { MAPA_TIPO } from './constantes.js';
import type { Registro, TipoTabela } from './tipos.js';

export type DadosPorTipo = Record<TipoTabela, Registro[]>;

/**
 * Faz o parse de uma linha CSV separada por ponto-e-virgula,
 * respeitando campos entre aspas.
 */
function analisarLinhaCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const caractere = linha[i];
    if (caractere === '"') {
      dentroDeAspas = !dentroDeAspas;
    } else if (caractere === ';' && !dentroDeAspas) {
      campos.push(atual);
      atual = '';
    } else {
      atual += caractere;
    }
  }
  campos.push(atual);
  return campos;
}

/**
 * Processa um arquivo CSV usando streaming (readline) para baixo consumo de memoria.
 * Retorna os registros agrupados por tipo (ncm, nbs, lc116).
 */
export async function processarCsv(caminhoArquivo: string): Promise<DadosPorTipo> {
  const dados: DadosPorTipo = { ncm: [], nbs: [], lc116: [] };

  const fluxo = createReadStream(caminhoArquivo, { encoding: 'utf8', highWaterMark: 64 * 1024 });
  const leitor = createInterface({ input: fluxo, crlfDelay: Infinity });

  let primeiraLinha = true;

  for await (const linha of leitor) {
    if (primeiraLinha) {
      primeiraLinha = false;
      continue; // pular cabecalho
    }

    if (!linha.trim()) continue;

    const campos = analisarLinhaCsv(linha);
    if (campos.length < 8) continue;

    const tipo = MAPA_TIPO[campos[2]];
    if (!tipo) continue;

    const registro: Registro = {
      codigo: campos[0],
      excecao: campos[1] || '',
      descricao: campos[3],
      aliquotaNacionalFederal: parseFloat(campos[4]) || 0,
      aliquotaImportadosFederal: parseFloat(campos[5]) || 0,
      aliquotaEstadual: parseFloat(campos[6]) || 0,
      aliquotaMunicipal: parseFloat(campos[7]) || 0
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
