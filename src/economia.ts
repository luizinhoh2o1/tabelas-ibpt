/**
 * Series economicas que a pagina cruza com as aliquotas do IBPT.
 *
 * Tres arquivos em dados/, todos versionados: IPCA mensal e salario minimo,
 * baixados do Banco Central por `npm run indices`, e a tabela do INSS, digitada
 * a partir das portarias porque nao existe API para ela.
 *
 * O build nao acessa a rede: le o que esta no disco.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AnoEconomico, Economia } from './tipos.js';

/** Diretorio com as series, na raiz do repositorio. */
export const DIRETORIO_DADOS = join(import.meta.dirname, '..', 'dados');

/**
 * IPCA geral e os recortes que correspondem as categorias do painel.
 *
 * `alimentacao` e o grupo inteiro, que e o agregado certo para uma cesta de 13
 * produtos. `automovel` e `motocicleta` sao subitens: o grupo Transportes
 * misturaria os dois com combustivel, passagem e conserto, e daria o mesmo
 * numero para carro e moto.
 */
export const ARQUIVOS_IPCA = {
  geral: 'ipca.csv',
  alimentacao: 'ipca-alimentacao.csv',
  automovel: 'ipca-automovel.csv',
  motocicleta: 'ipca-motocicleta.csv'
} as const;

export type GrupoIpca = keyof typeof ARQUIVOS_IPCA;

export const ARQUIVO_IPCA = ARQUIVOS_IPCA.geral;
export const ARQUIVO_SALARIO = 'salario-minimo.csv';
export const ARQUIVO_INSS = 'inss.csv';

/** Jornada mensal da CLT, a base para converter salario em valor da hora. */
export const JORNADA_MENSAL = 220;

/** Uma faixa da tabela do INSS, valida a partir de uma competencia. */
export interface FaixaInss {
  /** Competencia inicial, "aaaa-mm" */
  vigencia: string;
  /** Teto da faixa, em reais */
  ate: number;
  aliquota: number;
  /**
   * Ate fevereiro de 2020 a aliquota incidia sobre o salario inteiro. Da EC
   * 103/2019 em diante e progressiva: cada faixa so pega a parte do salario
   * que cai dentro dela.
   */
  progressiva: boolean;
}

/** Le um CSV de duas ou mais colunas separadas por ponto-e-virgula. */
function lerCsv(caminho: string): string[][] {
  if (!existsSync(caminho)) {
    throw new Error(`arquivo de dados ausente: ${caminho}. Rode "npm run indices".`);
  }
  return readFileSync(caminho, 'utf-8')
    .split(/\r?\n/)
    .slice(1)
    .filter(linha => linha.trim() !== '')
    .map(linha => linha.split(';'));
}

/** Serie mensal simples: "aaaa-mm" -> numero. */
export function lerSerieMensal(diretorio: string, arquivo: string): Map<string, number> {
  const serie = new Map<string, number>();
  for (const [mes, valor] of lerCsv(join(diretorio, arquivo))) {
    serie.set(mes, Number(valor));
  }
  return serie;
}

export function lerTabelaInss(diretorio: string): FaixaInss[] {
  return lerCsv(join(diretorio, ARQUIVO_INSS))
    .map(([vigencia, ate, aliquota, progressiva]) => ({
      vigencia,
      ate: Number(ate),
      aliquota: Number(aliquota),
      progressiva: progressiva === 'sim'
    }))
    .sort((a, b) => a.vigencia.localeCompare(b.vigencia) || a.ate - b.ate);
}

/** Faixas em vigor numa competencia. Vazio se o mes for anterior a tabela. */
export function faixasVigentes(tabela: FaixaInss[], mes: string): FaixaInss[] {
  const vigencias = [...new Set(tabela.map(f => f.vigencia))].filter(v => v <= mes);
  if (vigencias.length === 0) return [];
  const atual = vigencias[vigencias.length - 1];
  return tabela.filter(f => f.vigencia === atual);
}

/**
 * Desconto de INSS do empregado, em reais.
 *
 * Salario acima do teto paga o valor do teto, que e o que a lei chama de
 * contribuicao maxima.
 */
export function descontoInss(salario: number, tabela: FaixaInss[], mes: string): number {
  const faixas = faixasVigentes(tabela, mes);
  if (faixas.length === 0) return 0;

  if (!faixas[0].progressiva) {
    const faixa = faixas.find(f => salario <= f.ate) ?? faixas[faixas.length - 1];
    return Math.min(salario, faixa.ate) * (faixa.aliquota / 100);
  }

  let devido = 0;
  let piso = 0;
  for (const faixa of faixas) {
    if (salario <= piso) break;
    devido += (Math.min(salario, faixa.ate) - piso) * (faixa.aliquota / 100);
    piso = faixa.ate;
  }
  return devido;
}

/**
 * Nivel de precos mes a mes, encadeando as variacoes do IPCA a partir de 100.
 * So as razoes entre dois meses importam, entao a base e arbitraria.
 */
export function nivelDePrecos(ipca: Map<string, number>): Map<string, number> {
  const nivel = new Map<string, number>();
  let atual = 100;
  for (const mes of [...ipca.keys()].sort()) {
    atual *= 1 + ipca.get(mes)! / 100;
    nivel.set(mes, atual);
  }
  return nivel;
}

function media(valores: number[]): number {
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

function arredondar(valor: number, casas = 2): number {
  return Number(valor.toFixed(casas));
}

/**
 * Resumo anual das tres series. A media anual e a forma certa de casar com a
 * aliquota do IBPT, que tambem e media anual ponderada por dia.
 *
 * Um ano so entra se tiver as duas series completas o suficiente para nao
 * distorcer a media: exige o mesmo numero de meses de IPCA e de salario.
 */
export function resumoAnual(diretorio = DIRETORIO_DADOS): Economia {
  const salarios = lerSerieMensal(diretorio, ARQUIVO_SALARIO);
  const tabela = lerTabelaInss(diretorio);

  const grupos = Object.keys(ARQUIVOS_IPCA) as GrupoIpca[];
  const niveis = new Map<GrupoIpca, Map<string, number>>(
    grupos.map(g => [g, nivelDePrecos(lerSerieMensal(diretorio, ARQUIVOS_IPCA[g]))])
  );

  interface Acumulado {
    indices: Map<GrupoIpca, number[]>;
    brutos: number[];
    liquidos: number[];
    inss: number[];
  }
  const porAno = new Map<string, Acumulado>();

  for (const [mes, bruto] of [...salarios].sort()) {
    // Mes que ainda nao tem TODOS os indices publicados fica de fora dos dois
    // lados, senao a media de um grupo cobriria meses que outro nao cobre
    if (grupos.some(g => niveis.get(g)!.get(mes) === undefined)) continue;

    const ano = mes.slice(0, 4);
    const desconto = descontoInss(bruto, tabela, mes);
    const acumulado = porAno.get(ano) ?? {
      indices: new Map(grupos.map(g => [g, [] as number[]])),
      brutos: [], liquidos: [], inss: []
    };
    for (const g of grupos) acumulado.indices.get(g)!.push(niveis.get(g)!.get(mes)!);
    acumulado.brutos.push(bruto);
    acumulado.liquidos.push(bruto - desconto);
    acumulado.inss.push((100 * desconto) / bruto);
    porAno.set(ano, acumulado);
  }

  const anos: Record<string, AnoEconomico> = {};
  for (const [ano, a] of porAno) {
    anos[ano] = {
      meses: a.brutos.length,
      indices: Object.fromEntries(
        grupos.map(g => [g, arredondar(media(a.indices.get(g)!), 4)])
      ) as AnoEconomico['indices'],
      salarioBruto: arredondar(media(a.brutos)),
      salarioLiquido: arredondar(media(a.liquidos)),
      inss: arredondar(media(a.inss))
    };
  }

  return { jornadaMensal: JORNADA_MENSAL, anos };
}
