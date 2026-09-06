#!/usr/bin/env tsx
/**
 * Atualiza dados/ipca.csv e dados/salario-minimo.csv a partir das series
 * temporais do Banco Central (SGS).
 *
 * Roda sob demanda, nunca no build: os arquivos ficam versionados para que o
 * build seja offline e reproduzivel, como ja acontece com os ZIPs do IBPT.
 *
 * Uso: npm run indices
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIRETORIO_DADOS,
  ARQUIVOS_IPCA,
  ARQUIVO_SALARIO,
  lerTabelaInss,
  faixasVigentes
} from './economia.js';

/**
 * Series do SGS do Banco Central. 433 e o IPCA cheio, 1635 e o grupo
 * Alimentacao e bebidas, conferido contra os acumulados oficiais de 2020 a
 * 2022 (14,11 / 7,93 / 11,63). 1619 e o salario minimo.
 */
const SERIES = [
  { codigo: 433, arquivo: ARQUIVOS_IPCA.geral, rotulo: 'IPCA geral (%)' },
  { codigo: 1635, arquivo: ARQUIVOS_IPCA.alimentacao, rotulo: 'IPCA alimentacao e bebidas (%)' },
  { codigo: 1619, arquivo: ARQUIVO_SALARIO, rotulo: 'Salario minimo (R$)' }
];

/**
 * Subitens do IPCA, que o SGS nao publica. Vem do SIDRA, e sao os que separam
 * carro de moto: o grupo Transportes juntaria os dois com combustivel,
 * passagem e conserto.
 *
 * A serie muda de tabela em 2020, quando o IBGE trocou a estrutura de pesos:
 * 1419 vai ate dezembro de 2019, 7060 comeca em janeiro de 2020. Os codigos de
 * classificacao sao os mesmos nas duas.
 */
const SUBITENS = [
  { classificacao: 7641, arquivo: ARQUIVOS_IPCA.automovel, rotulo: 'IPCA automovel novo (%)' },
  { classificacao: 7654, arquivo: ARQUIVOS_IPCA.motocicleta, rotulo: 'IPCA motocicleta (%)' }
];

/** Tabelas do SIDRA e o periodo que cada uma cobre. */
const TABELAS_SIDRA = [
  { tabela: 1419, de: '201501', ate: '201912' },
  { tabela: 7060, de: '202001', ate: '209912' }
];

/** A serie do painel comeca em 2015; o mes anterior vira a base do indice. */
const INICIO = '01/01/2015';

interface PontoSgs {
  data: string;
  valor: string;
}

interface PontoSidra {
  /** Competencia no formato aaaamm */
  D3C: string;
  /** Valor da variacao mensal, ou "..." quando nao publicado */
  V: string;
}

/**
 * Variacao mensal de um subitem, emendando as duas tabelas do SIDRA.
 * Mes sem valor publicado e descartado em vez de virar zero.
 */
async function baixarSubitem(classificacao: number): Promise<Map<string, string>> {
  const serie = new Map<string, string>();

  for (const { tabela, de, ate } of TABELAS_SIDRA) {
    const url = `https://apisidra.ibge.gov.br/values/t/${tabela}/n1/1/v/63`
      + `/p/${de}-${ate}/c315/${classificacao}`;
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`SIDRA ${tabela} respondeu ${resposta.status}`);

    const linhas = await resposta.json() as PontoSidra[];
    // A primeira linha do SIDRA e o cabecalho, com os nomes das colunas
    for (const ponto of linhas.slice(1)) {
      const valor = Number(ponto.V);
      if (!Number.isFinite(valor)) continue;
      serie.set(`${ponto.D3C.slice(0, 4)}-${ponto.D3C.slice(4)}`, valor.toFixed(2));
    }
  }

  if (serie.size === 0) throw new Error(`SIDRA c315/${classificacao} voltou vazio`);
  return serie;
}

async function baixarSerie(codigo: number): Promise<PontoSgs[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados`
    + `?formato=json&dataInicial=${INICIO}`;
  const resposta = await fetch(url);
  if (!resposta.ok) {
    throw new Error(`SGS ${codigo} respondeu ${resposta.status}`);
  }
  const pontos = await resposta.json() as PontoSgs[];
  if (pontos.length === 0) throw new Error(`SGS ${codigo} voltou vazio`);
  return pontos;
}

/** "01/07/2026" vira "2026-07". */
function competencia(data: string): string {
  const [, mes, ano] = data.split('/');
  return `${ano}-${mes}`;
}

function gravarSerie(arquivo: string, pontos: PontoSgs[]): string[] {
  const linhas = pontos
    .map(p => `${competencia(p.data)};${p.valor}`)
    .sort();
  writeFileSync(join(DIRETORIO_DADOS, arquivo), `mes;valor\n${linhas.join('\n')}\n`);
  return linhas;
}

/**
 * Desde a EC 103/2019 o teto da primeira faixa do INSS e o proprio salario
 * minimo. Se isso deixar de bater, ou a tabela digitada esta errada ou a regra
 * mudou, e nos dois casos o build nao deve seguir em silencio.
 */
function conferirPrimeiraFaixa(salarios: string[]): string[] {
  const tabela = lerTabelaInss(DIRETORIO_DADOS);
  const divergencias: string[] = [];

  for (const linha of salarios) {
    const [mes, valor] = linha.split(';');
    const faixas = faixasVigentes(tabela, mes);
    if (faixas.length === 0 || !faixas[0].progressiva) continue;

    const teto = faixas[0].ate;
    const salario = Number(valor);
    if (Math.abs(teto - salario) > 0.01) {
      divergencias.push(`${mes}: primeira faixa ${teto.toFixed(2)}, salario minimo ${salario.toFixed(2)}`);
    }
  }
  return divergencias;
}

async function atualizar(): Promise<void> {
  let salarios: string[] = [];

  for (const serie of SERIES) {
    const pontos = await baixarSerie(serie.codigo);
    const linhas = gravarSerie(serie.arquivo, pontos);
    if (serie.arquivo === ARQUIVO_SALARIO) salarios = linhas;
    console.log(`${serie.rotulo}: ${linhas.length} meses, ate ${linhas[linhas.length - 1].split(';')[0]}`);
  }

  for (const subitem of SUBITENS) {
    const serie = await baixarSubitem(subitem.classificacao);
    const linhas = [...serie].sort().map(([mes, valor]) => `${mes};${valor}`);
    writeFileSync(join(DIRETORIO_DADOS, subitem.arquivo), `mes;valor\n${linhas.join('\n')}\n`);
    console.log(`${subitem.rotulo}: ${linhas.length} meses, ate ${linhas[linhas.length - 1].split(';')[0]}`);
  }

  const divergencias = conferirPrimeiraFaixa(salarios);
  if (divergencias.length > 0) {
    console.error('\nERRO: a primeira faixa do INSS nao bate com o salario minimo:');
    for (const d of divergencias) console.error(`  - ${d}`);
    console.error('\nAtualize dados/inss.csv com a portaria do ano.');
    process.exitCode = 1;
    return;
  }
  console.log('Tabela do INSS conferida contra o salario minimo: ok');
}

atualizar().catch(erro => {
  console.error('Erro ao atualizar os indices:', erro);
  process.exit(1);
});
