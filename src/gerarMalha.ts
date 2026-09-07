#!/usr/bin/env tsx
/**
 * Gera docs/malha-uf.json, o desenho das 27 unidades da federacao usado pelo
 * mapa do painel.
 *
 * Roda sob demanda, nunca no build: o contorno dos estados nao muda a cada
 * tabela do IBPT, entao o arquivo fica versionado e o build continua offline,
 * como ja acontece com dados/ e com os ZIPs.
 *
 * Uso: npm run malha
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UFS } from './constantes.js';

/**
 * Malha do IBGE recortada por UF. "minima" e a versao mais simplificada que a
 * API publica: 98 KB de GeoJSON, detalhe de sobra para um mapa de 1000 px.
 */
const MALHA =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR'
  + '?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=minima';

/** Codigo do IBGE de cada UF, que e o que a malha traz em properties.codarea. */
const CODIGOS: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA',
  '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS',
  '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF'
};

/** Largura do desenho em unidades do viewBox; a altura sai da proporcao. */
const LARGURA = 1000;

/** Casas decimais das coordenadas no path. Uma ja e menos que meio pixel. */
const CASAS = 1;

/**
 * Lado de cada faixa do perfil da silhueta, em unidades do viewBox. O painel
 * caminha por esse perfil para descobrir onde o desenho acaba e encostar o
 * rotulo do lado de fora, perto do proprio estado.
 */
const FAIXA_PERFIL = 10;

type Anel = [number, number][];

interface Feicao {
  properties: { codarea: string };
  geometry:
    | { type: 'Polygon'; coordinates: Anel[] }
    | { type: 'MultiPolygon'; coordinates: Anel[][] };
}

/**
 * Mercator, a mesma projecao dos mapas de rua. Sem ela o Brasil fica achatado
 * no Sul: um grau de longitude vale menos quilometros longe do equador, e a
 * projecao plana ignoraria isso.
 */
function projetar([lon, lat]: [number, number]): [number, number] {
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [lon, -y * (180 / Math.PI)];
}

/** Aneis de um poligono ou multipoligono, ja projetados. */
function aneis(feicao: Feicao): Anel[] {
  const bruto =
    feicao.geometry.type === 'Polygon'
      ? feicao.geometry.coordinates
      : feicao.geometry.coordinates.flat();
  return bruto.map(anel => anel.map(projetar));
}

/**
 * Centroide de area do maior anel, nao o centro da caixa: em estado com
 * formato de L ou com ilha o centro da caixa cai fora do desenho.
 */
function centroide(lista: Anel[]): [number, number] {
  const maior = lista.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a));
  const dobro = area(maior);
  let x = 0;
  let y = 0;
  for (let i = 0; i < maior.length - 1; i++) {
    const [x1, y1] = maior[i];
    const [x2, y2] = maior[i + 1];
    const cruzado = x1 * y2 - x2 * y1;
    x += (x1 + x2) * cruzado;
    y += (y1 + y2) * cruzado;
  }
  return [x / (3 * dobro), y / (3 * dobro)];
}

/** Area assinada do anel, pela formula do cadarco. */
function area(anel: Anel): number {
  let soma = 0;
  for (let i = 0; i < anel.length - 1; i++) {
    soma += anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1];
  }
  return soma;
}

async function principal(): Promise<void> {
  const resposta = await fetch(MALHA);
  if (!resposta.ok) throw new Error(`IBGE respondeu ${resposta.status}`);
  const colecao = (await resposta.json()) as { features: Feicao[] };

  const projetadas = new Map<string, Anel[]>();
  for (const feicao of colecao.features) {
    const uf = CODIGOS[feicao.properties.codarea];
    if (!uf) throw new Error(`codarea ${feicao.properties.codarea} nao tem UF conhecida`);
    projetadas.set(uf, aneis(feicao));
  }

  const faltando = UFS.filter(uf => !projetadas.has(uf));
  if (faltando.length > 0) throw new Error(`malha sem ${faltando.join(', ')}`);

  const todos = [...projetadas.values()].flat().flat();
  const minX = Math.min(...todos.map(p => p[0]));
  const maxX = Math.max(...todos.map(p => p[0]));
  const minY = Math.min(...todos.map(p => p[1]));
  const maxY = Math.max(...todos.map(p => p[1]));
  const escala = LARGURA / (maxX - minX);
  const altura = Number(((maxY - minY) * escala).toFixed(CASAS));

  const emTela = ([x, y]: [number, number]): [number, number] => [
    Number(((x - minX) * escala).toFixed(CASAS)),
    Number(((y - minY) * escala).toFixed(CASAS))
  ];

  const faixasY = Math.floor(altura / FAIXA_PERFIL) + 1;
  const faixasX = Math.floor(LARGURA / FAIXA_PERFIL) + 1;
  const oeste = new Array<number>(faixasY).fill(Infinity);
  const leste = new Array<number>(faixasY).fill(-Infinity);
  const norte = new Array<number>(faixasX).fill(Infinity);
  const sul = new Array<number>(faixasX).fill(-Infinity);

  /**
   * Marca o trecho de silhueta que o segmento cobre. Percorre as faixas nos
   * dois sentidos: por latitude sai o extremo oeste e leste de cada altura,
   * por longitude sai o extremo norte e sul de cada coluna.
   */
  function registrarSegmento([x1, y1]: number[], [x2, y2]: number[]): void {
    const varrer = (
      de: number, ate: number, total: number,
      pontoEm: (t: number) => [number, number],
      menor: number[], maior: number[],
      eixo: 0 | 1
    ): void => {
      const inicio = Math.min(de, ate);
      const fim = Math.max(de, ate);
      for (let i = Math.floor(inicio / FAIXA_PERFIL); i <= Math.floor(fim / FAIXA_PERFIL); i++) {
        if (i < 0 || i >= total) continue;
        // as duas pontas do trecho do segmento que cai dentro desta faixa
        for (const corte of [
          Math.max(inicio, i * FAIXA_PERFIL),
          Math.min(fim, (i + 1) * FAIXA_PERFIL)
        ]) {
          const t = de === ate ? 0 : (corte - de) / (ate - de);
          const valor = pontoEm(t)[eixo];
          menor[i] = Math.min(menor[i], valor);
          maior[i] = Math.max(maior[i], valor);
        }
      }
    };

    const ponto = (t: number): [number, number] => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    varrer(y1, y2, faixasY, ponto, oeste, leste, 0);
    varrer(x1, x2, faixasX, ponto, norte, sul, 1);
  }

  const ufs: Record<string, { d: string; cx: number; cy: number }> = {};
  for (const uf of UFS) {
    const lista = projetadas.get(uf)!;
    const d = lista
      .map(anel => {
        const pontos = anel.map(emTela);
        for (let i = 0; i < pontos.length - 1; i++) registrarSegmento(pontos[i], pontos[i + 1]);
        return `M${pontos.map(([x, y]) => `${x} ${y}`).join('L')}Z`;
      })
      .join('');
    const [cx, cy] = emTela(centroide(lista));
    ufs[uf] = { d, cx, cy };
  }

  const arredondar1 = (v: number): number => Number(v.toFixed(CASAS));
  // Coluna sem terra existe de verdade (o mapa nao e um retangulo), e vira
  // uma faixa vazia que o painel trata como "ja esta fora do desenho"
  const semTerra = (v: number): number | null => (Number.isFinite(v) ? arredondar1(v) : null);
  if (oeste.filter(Number.isFinite).length < faixasY * 0.9) {
    throw new Error('perfil por latitude saiu vazio demais');
  }

  const perfil = {
    faixa: FAIXA_PERFIL,
    oeste: oeste.map(semTerra),
    leste: leste.map(semTerra),
    norte: norte.map(semTerra),
    sul: sul.map(semTerra)
  };

  const destino = join(import.meta.dirname, '..', 'docs', 'malha-uf.json');
  writeFileSync(
    destino,
    JSON.stringify({ viewBox: `0 0 ${LARGURA} ${altura}`, perfil, ufs })
  );
  console.log(
    `malha-uf.json: 27 UFs, viewBox 0 0 ${LARGURA} ${altura}, `
    + `perfil de ${faixasY} por ${faixasX} faixas de ${FAIXA_PERFIL}`
  );
}

await principal();
