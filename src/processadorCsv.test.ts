/**
 * Testes do parser CSV (runner nativo do Node, sem dependencia extra).
 *
 * Rodar: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analisarLinhaCsv, processarCsv, extrairUfDoNomeArquivo } from './processadorCsv.js';

// ─── analisarLinhaCsv ─────────────────────────────────────

test('separa campos por ponto-e-virgula', () => {
  assert.deepEqual(analisarLinhaCsv('a;b;c'), ['a', 'b', 'c']);
});

test('preserva campos vazios no inicio, meio e fim', () => {
  assert.deepEqual(analisarLinhaCsv(';a;;b;'), ['', 'a', '', 'b', '']);
});

test('remove as aspas envolventes do campo', () => {
  assert.deepEqual(analisarLinhaCsv('1;"texto";2'), ['1', 'texto', '2']);
});

test('ponto-e-virgula dentro de aspas nao separa campo', () => {
  assert.deepEqual(analisarLinhaCsv('1;"a;b;c";2'), ['1', 'a;b;c', '2']);
});

test('desescapa aspas duplas para uma aspa', () => {
  assert.deepEqual(analisarLinhaCsv('1;"diz ""ola""";2'), ['1', 'diz "ola"', '2']);
});

test('virgula nao e separador', () => {
  assert.deepEqual(analisarLinhaCsv('1;"Cavalos reprodutores,de raca pura"'),
    ['1', 'Cavalos reprodutores,de raca pura']);
});

test('linha real do IBPT rende os 13 campos', () => {
  const linha = '01012100;;0;"Cavalos reprodutores,de raca pura";13.45;15.45;18.00;0.00;'
    + '20/08/2026;30/09/2026;A906AF;26.2.A;IBPT/empresometro.com.br';
  const campos = analisarLinhaCsv(linha);
  assert.equal(campos.length, 13);
  assert.equal(campos[0], '01012100');
  assert.equal(campos[1], '');
  assert.equal(campos[3], 'Cavalos reprodutores,de raca pura');
  assert.equal(campos[9], '30/09/2026');
});

test('linha vazia rende um unico campo vazio', () => {
  assert.deepEqual(analisarLinhaCsv(''), ['']);
});

// ─── processarCsv ─────────────────────────────────────────

/** Escreve um CSV em latin1, como os arquivos originais do IBPT. */
function csvTemporario(conteudo: string): { caminho: string; limpar: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'ibpt-teste-'));
  const caminho = join(dir, 'TabelaIBPTaxSP26.2.A.csv');
  writeFileSync(caminho, Buffer.from(conteudo, 'latin1'));
  return { caminho, limpar: () => rmSync(dir, { recursive: true, force: true }) };
}

const CABECALHO = 'codigo;ex;tipo;descricao;nacionalfederal;importadosfederal;'
  + 'estadual;municipal;vigenciainicio;vigenciafim;chave;versao;fonte';

test('agrupa os registros por tipo e pula o cabecalho', async () => {
  const { caminho, limpar } = csvTemporario([
    CABECALHO,
    '01012100;;0;"Cavalo";13.45;15.45;18.00;0.00;20/08/2026;30/09/2026;A;26.2.A;IBPT',
    '112050100;;1;"Servico";12.00;12.00;0.00;3.00;20/08/2026;30/09/2026;A;26.2.A;IBPT',
    '0101;;2;"Municipal";10.00;10.00;0.00;5.00;20/08/2026;30/09/2026;A;26.2.A;IBPT'
  ].join('\n'));

  try {
    const dados = await processarCsv(caminho);
    assert.equal(dados.ncm.length, 1);
    assert.equal(dados.nbs.length, 1);
    assert.equal(dados.lc116.length, 1);
    assert.deepEqual(dados.ncm[0], {
      codigo: '01012100',
      excecao: '',
      descricao: 'Cavalo',
      aliquotaNacionalFederal: 13.45,
      aliquotaImportadosFederal: 15.45,
      aliquotaEstadual: 18,
      aliquotaMunicipal: 0,
      vigenciaInicio: '20/08/2026',
      vigenciaFim: '30/09/2026'
    });
  } finally {
    limpar();
  }
});

test('descarta linha vazia, linha curta e tipo desconhecido', async () => {
  const { caminho, limpar } = csvTemporario([
    CABECALHO,
    '01012100;;0;"Valido";1;2;3;4;20/08/2026;30/09/2026;A;26.2.A;IBPT',
    '',
    '99;;0;"Curta";1;2',
    '88;;9;"Tipo inexistente";1;2;3;4;20/08/2026;30/09/2026;A;26.2.A;IBPT'
  ].join('\n'));

  try {
    const dados = await processarCsv(caminho);
    assert.equal(dados.ncm.length, 1);
    assert.equal(dados.ncm[0].descricao, 'Valido');
    assert.equal(dados.nbs.length + dados.lc116.length, 0);
  } finally {
    limpar();
  }
});

test('le acentuacao latin1 e trata aliquota invalida como zero', async () => {
  const { caminho, limpar } = csvTemporario([
    CABECALHO,
    '01012100;;0;"Ração e óleo";;abc;18.00;0.00;20/08/2026;30/09/2026;A;26.2.A;IBPT'
  ].join('\n'));

  try {
    const dados = await processarCsv(caminho);
    assert.equal(dados.ncm[0].descricao, 'Ração e óleo');
    assert.equal(dados.ncm[0].aliquotaNacionalFederal, 0);
    assert.equal(dados.ncm[0].aliquotaImportadosFederal, 0);
    assert.equal(dados.ncm[0].aliquotaEstadual, 18);
  } finally {
    limpar();
  }
});

test('aceita arquivo terminado em CRLF', async () => {
  const { caminho, limpar } = csvTemporario(
    CABECALHO + '\r\n01012100;;0;"Cavalo";1;2;3;4;20/08/2026;30/09/2026;A;26.2.A;IBPT\r\n'
  );

  try {
    const dados = await processarCsv(caminho);
    assert.equal(dados.ncm.length, 1);
    assert.equal(dados.ncm[0].vigenciaFim, '30/09/2026');
  } finally {
    limpar();
  }
});

// ─── extrairUfDoNomeArquivo ───────────────────────────────

test('extrai a UF do nome do arquivo', () => {
  assert.equal(extrairUfDoNomeArquivo('TabelaIBPTaxSP26.1.F.csv'), 'SP');
  assert.equal(extrairUfDoNomeArquivo('TabelaIBPTaxAC17.2.B.csv'), 'AC');
});

test('devolve null quando o CSV e consolidado, sem UF no nome', () => {
  assert.equal(extrairUfDoNomeArquivo('TabelaIBPTax26.1.E.csv'), null);
});
