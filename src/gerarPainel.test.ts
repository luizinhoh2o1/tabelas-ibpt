import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gerarPainel } from './gerarPainel.js';
import type { Registro } from './tipos.js';

const CARRO = '87032100';
const CARNE = '02012020';
const ARROZ = '10063021';
/** O pao da cesta e a excecao 01 deste NCM, nao a linha base. */
const PAO = '19059090';
/** Indice do pao em Painel.cesta */
const I_PAO = 7;

function registro(
  codigo: string,
  federal: number,
  estadual: number,
  inicio: string,
  fim: string,
  excecao = ''
): Registro {
  return {
    codigo,
    excecao,
    descricao: `item ${codigo} ${excecao}`,
    aliquotaNacionalFederal: federal,
    aliquotaImportadosFederal: federal + 2,
    aliquotaEstadual: estadual,
    aliquotaMunicipal: 0,
    vigenciaInicio: inicio,
    vigenciaFim: fim
  };
}

/** Grava uma versao ficticia para SP e RJ (o conteudo e igual nas duas). */
function gravarVersao(api: string, ano: string, tabela: string, dados: Registro[]): void {
  const diretorio = join(api, ano, tabela, 'ncm');
  mkdirSync(diretorio, { recursive: true });
  const conteudo = gzipSync(Buffer.from(JSON.stringify({ tabela, dados })));
  for (const uf of ['SP', 'RJ']) writeFileSync(join(diretorio, `${uf}.json.gz`), conteudo);
}

function novaApi(): string {
  const api = join(mkdtempSync(join(tmpdir(), 'painel-teste-')), 'api');
  mkdirSync(api, { recursive: true });
  return api;
}

/**
 * Monta um ano de 2020 com duas metades: 20.1.A cobre 182 dias, 20.1.B cobre
 * 184, e 20.1.C tem a mesma vigencia da B mas sai defeituosa (90% das estaduais
 * zeradas). Como a revisao mais alta vence, a C so e descartada se o filtro de
 * publicacao defeituosa funcionar.
 *
 * O pao aparece em duas linhas do mesmo NCM: a base, que nao e da cesta, e a
 * excecao 01, que e.
 */
function montarApi(): string {
  const api = novaApi();

  const metade = (inicio: string, fim: string, federalCarro: number): Registro[] => [
    registro(CARRO, federalCarro, 10, inicio, fim),
    registro(CARNE, 5, 10, inicio, fim),
    registro(ARROZ, 5, 20, inicio, fim),
    registro(PAO, 99, 99, inicio, fim),
    registro(PAO, 5, 12, inicio, fim, '01')
  ];

  gravarVersao(api, '2020', '20.1.A', metade('01/01/2020', '30/06/2020', 10));
  gravarVersao(api, '2020', '20.1.B', metade('01/07/2020', '31/12/2020', 20));

  const defeituosos = [registro(CARRO, 99, 99, '01/07/2020', '31/12/2020')];
  for (let i = 0; i < 9; i++) defeituosos.push(registro(`0000000${i}`, 1, 0, '01/07/2020', '31/12/2020'));
  gravarVersao(api, '2020', '20.1.C', defeituosos);

  return api;
}

function comApi(teste: (api: string) => void): void {
  const api = montarApi();
  try {
    teste(api);
  } finally {
    rmSync(api, { recursive: true, force: true });
  }
}

test('gerarPainel pondera a media pelos dias de vigencia', () => {
  comApi(api => {
    const ano = gerarPainel(api).dados.SP['2020'];
    // (10 x 182 + 20 x 184) / 366 = 15.03
    assert.deepEqual(ano.carro, [15.03, 10]);
    assert.equal(ano.cobertura, 100);
  });
});

test('gerarPainel descarta publicacao com quase todas as estaduais zeradas', () => {
  comApi(api => {
    // A 20.1.C traz 99% e e a revisao mais alta do segundo semestre. Se
    // entrasse na conta, o federal do ano passaria de 15.03 para perto de 55.
    assert.equal(gerarPainel(api).dados.SP['2020'].carro?.[0], 15.03);
  });
});

test('item da cesta identificado por NCM mais excecao pega a linha certa', () => {
  comApi(api => {
    const painel = gerarPainel(api);
    // A linha base do mesmo NCM traz 99/99 e nao pode vazar para a cesta
    assert.deepEqual(painel.dados.SP['2020'].itens[I_PAO], [5, 12]);
    assert.equal(painel.cesta[I_PAO].nome, 'Pão comum');
  });
});

test('cesta e a media dos itens presentes, federal e estadual separados', () => {
  comApi(api => {
    const painel = gerarPainel(api);
    const ano = painel.dados.SP['2020'];
    // Carne [5,10], arroz [5,20] e pao [5,12]: media [5,14]. Faltam 10 itens.
    assert.deepEqual(ano.cesta, [5, 14]);
    assert.equal(ano.itens.length, painel.cesta.length);
    assert.equal(ano.itens.filter(Boolean).length, 3);
    assert.equal(ano.moto, null);
  });
});

test('a media nacional e a media simples das UFs com dado', () => {
  comApi(api => {
    const painel = gerarPainel(api);
    // A fixture publica SP e RJ com o mesmo conteudo, entao a media dos dois
    // repete o valor; as outras 25 UFs nao tem arquivo e ficam de fora
    assert.equal(painel.ufs[0], 'BR', 'a media abre a lista do filtro');
    assert.equal(painel.ufs.length, 28);
    assert.deepEqual(painel.dados.BR['2020'].carro, painel.dados.SP['2020'].carro);
    assert.deepEqual(painel.dados.BR['2020'].itens, painel.dados.SP['2020'].itens);
    // A cobertura, ao contrario da aliquota, conta as 27: UF sem arquivo entra
    // como 0%, porque "nao ha tabela utilizavel" e um fato, nao um dado faltando
    assert.equal(painel.dados.BR['2020'].cobertura, Math.round((2 * 100) / 27));
  });
});

test('UF sem arquivo publicado nao inventa numero', () => {
  comApi(api => {
    const ano = gerarPainel(api).dados.MG['2020'];
    assert.equal(ano.carro, null);
    assert.equal(ano.cesta, null);
    assert.equal(ano.cobertura, 0);
  });
});

test('periodo sem nenhuma revisao sadia fica de fora da media e da cobertura', () => {
  const api = novaApi();
  try {
    gravarVersao(api, '2019', '19.1.A', [
      registro(CARRO, 10, 10, '01/01/2019', '30/06/2019'),
      registro(CARNE, 5, 10, '01/01/2019', '30/06/2019')
    ]);
    // Segunda metade: unica vigente e 100% das estaduais zeradas
    const zerada = [registro(CARRO, 40, 0, '01/07/2019', '31/12/2019')];
    for (let i = 0; i < 9; i++) zerada.push(registro(`0000000${i}`, 1, 0, '01/07/2019', '31/12/2019'));
    gravarVersao(api, '2019', '19.1.B', zerada);

    const ano = gerarPainel(api).dados.SP['2019'];
    // So os 181 dias do primeiro semestre entram: o carro fica em 10, nao em 25
    assert.deepEqual(ano.carro, [10, 10]);
    assert.equal(ano.cobertura, Math.round((100 * 181) / 365));
    // O calendario continua dizendo que o ano inteiro tem alguma tabela
    assert.deepEqual(gerarPainel(api).diasCobertos['2019'], [365, 365]);
  } finally {
    rmSync(api, { recursive: true, force: true });
  }
});

test('vigencia sai da janela dominante, nao do primeiro registro', () => {
  const api = novaApi();
  try {
    // Tres linhas com a janela da revisao anterior antes das linhas boas,
    // como acontece em 2024/24.2.F/ncm/PR
    const dados = [
      registro('00000000', 1, 1, '01/01/2022', '31/01/2022'),
      registro('00000001', 1, 1, '01/01/2022', '31/01/2022'),
      registro('00000002', 1, 1, '01/01/2022', '31/01/2022'),
      registro(CARRO, 10, 10, '01/02/2022', '31/12/2022'),
      registro(CARNE, 5, 10, '01/02/2022', '31/12/2022'),
      registro(ARROZ, 5, 20, '01/02/2022', '31/12/2022'),
      registro('00000003', 1, 1, '01/02/2022', '31/12/2022'),
      registro('00000004', 1, 1, '01/02/2022', '31/12/2022')
    ];
    gravarVersao(api, '2022', '22.1.A', dados);

    const painel = gerarPainel(api);
    // 01/02 a 31/12 sao 334 dias; se lesse dados[0] seriam 31
    assert.deepEqual(painel.diasCobertos['2022'], [334, 365]);
    assert.equal(painel.dados.SP['2022'].cobertura, Math.round((100 * 334) / 365));
  } finally {
    rmSync(api, { recursive: true, force: true });
  }
});
