import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  descontoInss,
  faixasVigentes,
  lerTabelaInss,
  nivelDePrecos,
  resumoAnual,
  DIRETORIO_DADOS,
  ARQUIVOS_IPCA,
  ARQUIVO_SALARIO,
  ARQUIVO_INSS,
  lerSerieMensal
} from './economia.js';

const TABELA_REAL = lerTabelaInss(DIRETORIO_DADOS);

test('ate fevereiro de 2020 o INSS incide sobre o salario inteiro', () => {
  // 2015: 8% ate 1.399,12. Salario minimo do ano, 788, cai na primeira faixa.
  assert.equal(descontoInss(788, TABELA_REAL, '2015-01').toFixed(2), '63.04');
  // 1.500 passa da primeira faixa, entao paga 9% sobre o total, nao por partes
  assert.equal(descontoInss(1500, TABELA_REAL, '2015-01').toFixed(2), '135.00');
});

test('de marco de 2020 em diante o INSS e progressivo por faixa', () => {
  // 2.000 em 2021: 7,5% sobre 1.100 mais 9% sobre os 900 seguintes
  const esperado = 1100 * 0.075 + 900 * 0.09;
  assert.equal(descontoInss(2000, TABELA_REAL, '2021-06').toFixed(2), esperado.toFixed(2));
});

test('quem ganha o minimo paga a aliquota da primeira faixa', () => {
  // O teto da primeira faixa e o proprio salario minimo desde a EC 103/2019
  for (const [mes, salario] of [['2021-06', 1100], ['2024-03', 1412], ['2026-01', 1621]] as const) {
    const desconto = descontoInss(salario, TABELA_REAL, mes);
    assert.equal((100 * desconto / salario).toFixed(2), '7.50', mes);
  }
});

test('a troca de tabela cai no mes certo', () => {
  assert.equal(faixasVigentes(TABELA_REAL, '2020-02')[0].progressiva, false);
  assert.equal(faixasVigentes(TABELA_REAL, '2020-03')[0].progressiva, true);
  // 2023 tem duas vigencias: o minimo subiu de 1.302 para 1.320 em maio
  assert.equal(faixasVigentes(TABELA_REAL, '2023-04')[0].ate, 1302);
  assert.equal(faixasVigentes(TABELA_REAL, '2023-05')[0].ate, 1320);
});

test('salario acima do teto paga a contribuicao maxima', () => {
  const faixas = faixasVigentes(TABELA_REAL, '2026-01');
  const teto = faixas[faixas.length - 1].ate;
  assert.equal(
    descontoInss(50000, TABELA_REAL, '2026-01').toFixed(2),
    descontoInss(teto, TABELA_REAL, '2026-01').toFixed(2)
  );
});

test('o nivel de precos encadeia as variacoes do IPCA', () => {
  const nivel = nivelDePrecos(new Map([['2020-01', 10], ['2020-02', 10], ['2020-03', -5]]));
  assert.equal(nivel.get('2020-01')?.toFixed(4), '110.0000');
  assert.equal(nivel.get('2020-02')?.toFixed(4), '121.0000');
  assert.equal(nivel.get('2020-03')?.toFixed(4), '114.9500');
});

test('resumoAnual devolve media anual das tres series', () => {
  const dir = mkdtempSync(join(tmpdir(), 'economia-teste-'));
  try {
    for (const arquivo of Object.values(ARQUIVOS_IPCA)) {
      writeFileSync(join(dir, arquivo), 'mes;valor\n2022-01;1.00\n2022-02;1.00\n');
    }
    // Fevereiro com salario maior: a media anual tem que ficar no meio
    writeFileSync(join(dir, ARQUIVO_SALARIO), 'mes;valor\n2022-01;1212.00\n2022-02;1412.00\n');
    writeFileSync(join(dir, ARQUIVO_INSS), 'vigencia;faixa_ate;aliquota;progressiva;fonte\n2022-01;1212.00;7.50;sim;teste\n2022-01;9999.00;9.00;sim;teste\n');

    const { anos, jornadaMensal } = resumoAnual(dir);
    assert.equal(jornadaMensal, 220);
    assert.equal(anos['2022'].meses, 2);
    // Os três grupos vêm da mesma série no teste, então os índices coincidem
    assert.deepEqual(Object.keys(anos['2022'].indices).sort(), ['alimentacao', 'automovel', 'geral', 'motocicleta']);
    assert.equal(anos['2022'].salarioBruto, 1312);
    // Janeiro paga 7,5% de 1212; fevereiro 7,5% de 1212 mais 9% de 200
    const liquidoJan = 1212 - 1212 * 0.075;
    const liquidoFev = 1412 - (1212 * 0.075 + 200 * 0.09);
    assert.equal(anos['2022'].salarioLiquido.toFixed(2), ((liquidoJan + liquidoFev) / 2).toFixed(2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mes sem IPCA publicado fica de fora da media do ano', () => {
  const dir = mkdtempSync(join(tmpdir(), 'economia-teste-'));
  try {
    // O salario tem tres meses, o IPCA so dois: o ano fecha com dois
    for (const arquivo of Object.values(ARQUIVOS_IPCA)) {
      writeFileSync(join(dir, arquivo), 'mes;valor\n2026-01;0.50\n2026-02;0.50\n');
    }
    writeFileSync(join(dir, ARQUIVO_SALARIO), 'mes;valor\n2026-01;1621.00\n2026-02;1621.00\n2026-03;1621.00\n');
    writeFileSync(join(dir, ARQUIVO_INSS), 'vigencia;faixa_ate;aliquota;progressiva;fonte\n2026-01;1621.00;7.50;sim;teste\n');

    assert.equal(resumoAnual(dir).anos['2026'].meses, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a primeira faixa do INSS acompanha o salario minimo publicado', () => {
  // Invariante da lei desde a EC 103/2019, e a defesa contra erro de digitacao
  // em dados/inss.csv. O mesmo teste roda em npm run indices.
  const salarios = lerSerieMensal(DIRETORIO_DADOS, ARQUIVO_SALARIO);
  const divergentes: string[] = [];

  for (const [mes, salario] of salarios) {
    const faixas = faixasVigentes(TABELA_REAL, mes);
    if (faixas.length === 0 || !faixas[0].progressiva) continue;
    if (Math.abs(faixas[0].ate - salario) > 0.01) divergentes.push(mes);
  }
  assert.deepEqual(divergentes, []);
});
