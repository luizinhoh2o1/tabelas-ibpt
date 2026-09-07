#!/usr/bin/env node
/**
 * Confere o posicionamento dos rotulos do mapa do painel.
 *
 * Recorta as funcoes de posicionamento de dentro do proprio `painel.html` e
 * roda com a malha publicada, entao confere o codigo que vai para o ar, nao
 * uma copia. Falha se algum tracado cruzar outro, se algum tracado passar
 * por cima de rotulo alheio ou se dois rotulos se sobrepuserem.
 *
 * Uso: npm run mapa
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const MALHA = JSON.parse(readFileSync(join(RAIZ, 'docs', 'malha-uf.json'), 'utf8'));
const PAGINA = readFileSync(join(RAIZ, 'docs', 'painel.html'), 'utf8');

/** Tracado que vai longe demais denuncia rotulo empurrado para fora do mapa. */
const LIMITE_TRACADO = 460;

/** Pega um trecho do script da pagina, do primeiro marco ate o segundo. */
function recortar(de, ate) {
  const inicio = PAGINA.indexOf(de);
  const fim = PAGINA.indexOf(ate, inicio);
  if (inicio < 0 || fim < 0) {
    throw new Error(`marco nao encontrado no painel.html: ${JSON.stringify(de.slice(0, 40))}`);
  }
  return PAGINA.slice(inicio, fim);
}

// O segundo trecho termina no comentario da funcao seguinte, que fica de fora
const trechoFinal = recortar('/** Tamanho do desenho, lido do viewBox', 'function montarMapa(');
const codigo = [
  recortar('    const FORMATOS', '/** Aliquota total da cesta'),
  trechoFinal.slice(0, trechoFinal.lastIndexOf('/**'))
].join('\n');

const montar = new Function(
  'MALHA', 'D', 'BRASIL',
  `${codigo}\nreturn { lugaresDosRotulos, moldura };`
);

// A unica coisa que o posicionamento usa de D e a lista de UFs
const { lugaresDosRotulos, moldura } = montar(
  MALHA, { ufs: ['BR', ...Object.keys(MALHA.ufs)] }, 'BR'
);

const lugares = lugaresDosRotulos();
const siglas = Object.keys(lugares);
const problemas = [];

const ladoDaReta = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));

function cruzam(a, b, c, d) {
  const s = [ladoDaReta(a, b, c), ladoDaReta(a, b, d), ladoDaReta(c, d, a), ladoDaReta(c, d, b)];
  return s[0] !== s[1] && s[2] !== s[3] && s.every(v => v !== 0);
}

function cortaCaixa(a, b, caixa) {
  const cantos = [
    { x: caixa.x1, y: caixa.y1 }, { x: caixa.x2, y: caixa.y1 },
    { x: caixa.x2, y: caixa.y2 }, { x: caixa.x1, y: caixa.y2 }
  ];
  const dentro = p => p.x >= caixa.x1 && p.x <= caixa.x2 && p.y >= caixa.y1 && p.y <= caixa.y2;
  if (dentro(a) || dentro(b)) return true;
  return cantos.some((canto, i) => cruzam(a, b, canto, cantos[(i + 1) % 4]));
}

const centroDe = uf => ({ x: MALHA.ufs[uf].cx, y: MALHA.ufs[uf].cy });

for (let i = 0; i < siglas.length; i++) {
  for (let j = i + 1; j < siglas.length; j++) {
    const [um, outro] = [siglas[i], siglas[j]];
    const a = lugares[um];
    const b = lugares[outro];

    if (cruzam(centroDe(um), a.saida, centroDe(outro), b.saida)) {
      problemas.push(`tracados de ${um} e ${outro} se cruzam`);
    }
    if (cortaCaixa(centroDe(um), a.saida, b.caixa)) {
      problemas.push(`tracado de ${um} passa por cima do rotulo de ${outro}`);
    }
    if (cortaCaixa(centroDe(outro), b.saida, a.caixa)) {
      problemas.push(`tracado de ${outro} passa por cima do rotulo de ${um}`);
    }
    if (a.caixa.x1 < b.caixa.x2 && b.caixa.x1 < a.caixa.x2
      && a.caixa.y1 < b.caixa.y2 && b.caixa.y1 < a.caixa.y2) {
      problemas.push(`rotulos de ${um} e ${outro} se sobrepoem`);
    }
  }
}

for (const uf of siglas) {
  const centro = centroDe(uf);
  const comprimento = Math.hypot(lugares[uf].saida.x - centro.x, lugares[uf].saida.y - centro.y);
  if (comprimento > LIMITE_TRACADO) {
    problemas.push(`tracado de ${uf} tem ${comprimento.toFixed(0)} unidades, `
      + `acima do limite de ${LIMITE_TRACADO}`);
  }
}

console.log(`${siglas.length} rotulos, viewBox ${moldura(lugares)}`);
if (problemas.length > 0) {
  for (const problema of problemas) console.error(`ERRO: ${problema}`);
  process.exitCode = 1;
} else {
  console.log('nenhum cruzamento, nenhuma sobreposicao');
}
