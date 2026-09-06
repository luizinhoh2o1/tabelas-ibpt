/**
 * Gera o painel de carga tributaria (docs/api/painel.json), consumido por
 * docs/painel.html.
 *
 * A ideia: para cada UF e cada ano, qual foi a aliquota media de um punhado de
 * itens do dia a dia. "Media" aqui e ponderada pelos dias de vigencia -- uma
 * tabela que valeu de janeiro a marco pesa 90 dias, nao 1. Isso e o que permite
 * comparar um ano incompleto com um ano fechado sem distorcer.
 *
 * Le os arquivos ja publicados em docs/api, entao roda depois do build e nao
 * interfere no processamento dos ZIPs.
 */

import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { UFS } from './constantes.js';
import type { ArquivoSaida, ItemCesta, Painel, PainelAno, ParAliquota, Registro } from './tipos.js';

/** Nome do arquivo publicado na raiz da API. */
export const PAINEL = 'painel.json';

/**
 * Cesta basica do Decreto-Lei 399/1938 (racao essencial minima), na composicao
 * da regiao que inclui Sao Paulo.
 *
 * Cada item aponta um par NCM + excecao tarifaria, nao so o NCM: o mesmo codigo
 * costuma trazer a linha base e uma linha "Ex 01" com aliquota diferente, e as
 * duas descrevem produtos distintos. O pao comum, por exemplo, so existe como
 * excecao 01 do 1905.90.90; a linha base do 1905.10.00 e o knackebrot, o pao
 * crocante escandinavo.
 */
const CESTA: ItemCesta[] = [
  { nome: 'Carne bovina (traseiro)', codigo: '02012020', excecao: '', ncm: '0201.20.20' },
  { nome: 'Leite UHT desnatado', codigo: '04011010', excecao: '', ncm: '0401.10.10' },
  { nome: 'Feijão', codigo: '07133399', excecao: '', ncm: '0713.33.99' },
  { nome: 'Arroz', codigo: '10063021', excecao: '', ncm: '1006.30.21' },
  { nome: 'Farinha de trigo', codigo: '11010010', excecao: '', ncm: '1101.00.10' },
  { nome: 'Batata', codigo: '07019000', excecao: '', ncm: '0701.90.00' },
  { nome: 'Tomate', codigo: '07020000', excecao: '', ncm: '0702.00.00' },
  { nome: 'Pão comum', codigo: '19059090', excecao: '01', ncm: '1905.90.90 Ex 01' },
  { nome: 'Café torrado', codigo: '09012100', excecao: '', ncm: '0901.21.00' },
  { nome: 'Banana', codigo: '08039000', excecao: '', ncm: '0803.90.00' },
  { nome: 'Açúcar', codigo: '17019900', excecao: '', ncm: '1701.99.00' },
  { nome: 'Óleo de soja', codigo: '15079011', excecao: '', ncm: '1507.90.11' },
  { nome: 'Manteiga', codigo: '04051000', excecao: '', ncm: '0405.10.00' }
];

/** Veiculos acompanhados individualmente. Os dois so tem linha base. */
const CARRO = { codigo: '87032100', excecao: '' };
const MOTO = { codigo: '87112010', excecao: '' };

/** Um item so e identificado pelo par NCM + excecao. */
function chaveItem(item: { codigo: string; excecao: string }): string {
  return `${item.codigo}|${item.excecao}`;
}

const CHAVES = new Set<string>([...CESTA, CARRO, MOTO].map(chaveItem));

/**
 * Publicacao com quase todas as aliquotas estaduais zeradas. Acontece algumas
 * vezes na serie (24.2.E, 25.1.A, 25.2.C...) e nao representa mudanca de
 * tributacao, e defeito de publicacao.
 */
const LIMITE_ZERADAS = 0.8;

/** UF usada so para descobrir a vigencia de cada versao. */
const UF_REFERENCIA = 'SP';

const ANO_DIR = /^[0-9]{4}$/;

const DIA = 86_400_000;

interface Vigencia {
  ano: string;
  codigo: string;
  inicio: number;
  fim: number;
}

/** Aliquotas dos itens rastreados + fracao de estaduais zeradas na tabela. */
interface TabelaLida {
  aliquotas: Map<string, ParAliquota>;
  zeradas: number;
}

function caminhoNcm(api: string, ano: string, codigo: string, uf: string): string {
  return join(api, ano, codigo, 'ncm', `${uf}.json.gz`);
}

function lerJsonGz(caminho: string): ArquivoSaida {
  return JSON.parse(gunzipSync(readFileSync(caminho)).toString('utf-8')) as ArquivoSaida;
}

/** "dd/mm/aaaa" para timestamp UTC. NaN quando a data nao bate com o formato. */
function paraData(texto: string): number {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!partes) return NaN;
  return Date.UTC(Number(partes[3]), Number(partes[2]) - 1, Number(partes[1]));
}

/**
 * Vigencia de uma tabela: a janela que aparece na maioria dos registros.
 *
 * Nao da para confiar no primeiro registro. Ha arquivo publicado com duas
 * janelas dentro (2024/24.2.F/ncm/PR tem 11 linhas de uma revisao anterior no
 * comeco), e ali o primeiro registro apontaria para o periodo errado.
 */
function vigenciaDominante(registros: Registro[]): { inicio: number; fim: number } | null {
  const contagem = new Map<string, number>();
  for (const r of registros) {
    const janela = `${r.vigenciaInicio}|${r.vigenciaFim}`;
    contagem.set(janela, (contagem.get(janela) ?? 0) + 1);
  }

  let dominante = '';
  let maior = 0;
  for (const [janela, vezes] of contagem) {
    if (vezes > maior) {
      maior = vezes;
      dominante = janela;
    }
  }
  if (maior === 0) return null;

  const [textoInicio, textoFim] = dominante.split('|');
  const inicio = paraData(textoInicio);
  const fim = paraData(textoFim);
  return Number.isNaN(inicio) || Number.isNaN(fim) ? null : { inicio, fim };
}

/** Percorre docs/api e devolve a vigencia de cada versao publicada. */
function lerVigencias(api: string): Vigencia[] {
  const vigencias: Vigencia[] = [];

  for (const ano of readdirSync(api).filter(n => ANO_DIR.test(n)).sort()) {
    for (const codigo of readdirSync(join(api, ano)).sort()) {
      const caminho = caminhoNcm(api, ano, codigo, UF_REFERENCIA);
      if (!existsSync(caminho)) continue;

      const janela = vigenciaDominante(lerJsonGz(caminho).dados);
      if (janela) vigencias.push({ ano, codigo, ...janela });
    }
  }

  return vigencias;
}

function diasNoAno(ano: number): number {
  return (Date.UTC(ano + 1, 0, 1) - Date.UTC(ano, 0, 1)) / DIA;
}

/**
 * Para um ano, agrupa os dias por conjunto de versoes vigentes: quantos dias
 * cada conjunto cobre e quantos dias do ano tem alguma tabela.
 */
function diasPorConjunto(ano: number, vigencias: Vigencia[]) {
  const contagem = new Map<string, { versoes: Vigencia[]; dias: number }>();
  const total = diasNoAno(ano);
  let cobertos = 0;

  for (let i = 0; i < total; i++) {
    const dia = Date.UTC(ano, 0, 1) + i * DIA;
    const vigentes = vigencias
      .filter(v => v.inicio <= dia && dia <= v.fim)
      // Revisao mais alta primeiro: e a que corrige as anteriores
      .sort((a, b) => b.codigo.localeCompare(a.codigo));
    if (vigentes.length === 0) continue;

    cobertos++;
    const chave = vigentes.map(v => v.codigo).join('|');
    const grupo = contagem.get(chave);
    if (grupo) grupo.dias++;
    else contagem.set(chave, { versoes: vigentes, dias: 1 });
  }

  return { contagem, cobertos, total };
}

function lerTabela(api: string, vigencia: Vigencia, uf: string): TabelaLida {
  const caminho = caminhoNcm(api, vigencia.ano, vigencia.codigo, uf);
  if (!existsSync(caminho)) return { aliquotas: new Map(), zeradas: 1 };

  const registros = lerJsonGz(caminho).dados;
  if (registros.length === 0) return { aliquotas: new Map(), zeradas: 1 };

  let zeradas = 0;
  const aliquotas = new Map<string, ParAliquota>();
  for (const r of registros) {
    if (r.aliquotaEstadual === 0) zeradas++;
    const chave = chaveItem(r);
    if (CHAVES.has(chave)) {
      // Municipal entra junto do estadual: para NCM e sempre 0, mas somar evita
      // perder o valor caso o IBPT passe a preencher.
      aliquotas.set(chave, [r.aliquotaNacionalFederal, r.aliquotaEstadual + r.aliquotaMunicipal]);
    }
  }

  return { aliquotas, zeradas: zeradas / registros.length };
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(2));
}

/** Monta o painel a partir dos arquivos ja publicados em docs/api. */
export function gerarPainel(api: string): Painel {
  const vigencias = lerVigencias(api);
  const anos = [...new Set(vigencias.map(v => Number(v.ano)))].sort((a, b) => a - b);

  const calendario = new Map(anos.map(ano => [ano, diasPorConjunto(ano, vigencias)]));

  // Uma versao so precisa ser lida se algum dia do calendario a considera
  const usadas = new Map<string, Vigencia>();
  for (const { contagem } of calendario.values()) {
    for (const { versoes } of contagem.values()) {
      for (const v of versoes) usadas.set(`${v.ano}/${v.codigo}`, v);
    }
  }
  console.log(`Painel: ${usadas.size} versao(oes) x ${UFS.length} UFs`);

  const dados: Painel['dados'] = {};

  for (const uf of UFS) {
    const tabelas = new Map<string, TabelaLida>();
    for (const [chave, vigencia] of usadas) tabelas.set(chave, lerTabela(api, vigencia, uf));

    const porAno: Record<string, PainelAno> = {};

    for (const ano of anos) {
      const { contagem, total } = calendario.get(ano)!;
      // chave do item -> [federal*dias, estadual*dias, dias]
      const acumulado = new Map<string, [number, number, number]>();
      for (const chave of CHAVES) acumulado.set(chave, [0, 0, 0]);
      let diasUteis = 0;

      for (const { versoes, dias } of contagem.values()) {
        // Primeira revisao que traz dados sem parecer defeituosa
        const escolhida = versoes
          .map(v => tabelas.get(`${v.ano}/${v.codigo}`)!)
          .find(t => t.aliquotas.size > 0 && t.zeradas < LIMITE_ZERADAS);

        // Nenhuma revisao sadia cobrindo esses dias: eles ficam de fora da
        // media. Usar a defeituosa afundaria o ano inteiro (AL e AP em 2021,
        // onde cinco versoes seguidas saem com 100% das estaduais zeradas).
        // A UF que perde dias assim fica com cobertura abaixo de 100.
        if (!escolhida) continue;

        diasUteis += dias;
        for (const [chave, par] of escolhida.aliquotas) {
          const soma = acumulado.get(chave)!;
          soma[0] += par[0] * dias;
          soma[1] += par[1] * dias;
          soma[2] += dias;
        }
      }

      const media = (item: { codigo: string; excecao: string }): ParAliquota | null => {
        const [federal, estadual, dias] = acumulado.get(chaveItem(item))!;
        return dias > 0 ? [arredondar(federal / dias), arredondar(estadual / dias)] : null;
      };

      const itens = CESTA.map(media);
      const presentes = itens.filter((p): p is ParAliquota => p !== null);

      porAno[ano] = {
        cesta: presentes.length > 0
          ? [
              arredondar(presentes.reduce((s, p) => s + p[0], 0) / presentes.length),
              arredondar(presentes.reduce((s, p) => s + p[1], 0) / presentes.length)
            ]
          : null,
        carro: media(CARRO),
        moto: media(MOTO),
        itens,
        cobertura: Math.round((100 * diasUteis) / total)
      };
    }

    dados[uf] = porAno;
  }

  const diasCobertos = Object.fromEntries(
    anos.map(ano => {
      const { cobertos, total } = calendario.get(ano)!;
      return [ano, [cobertos, total] as [number, number]];
    })
  );

  const fimCobertura = new Date(Math.max(...vigencias.map(v => v.fim)))
    .toISOString()
    .slice(0, 10);

  return {
    ufs: [...UFS],
    anos,
    fimCobertura,
    cesta: CESTA.map(({ nome, ncm }) => ({ nome, ncm })),
    diasCobertos,
    dados
  };
}

/** Gera e grava docs/api/painel.json. Devolve o tamanho em bytes. */
export function gravarPainel(api: string): number {
  const conteudo = JSON.stringify(gerarPainel(api));
  writeFileSync(join(api, PAINEL), conteudo);
  return Buffer.byteLength(conteudo);
}
