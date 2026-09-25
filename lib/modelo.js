"use strict";
/**
 * O que e publico e o que e interno - a regra mais importante deste arquivo.
 *
 * 'publico' e o que pode sair no site e na API publica. 'interno' NUNCA sai:
 * endereco completo, proprietario, telefone, e-mail, autorizacao, comissao,
 * observacoes. A separacao e feita aqui, num lugar so, e as rotas publicas
 * chamam sempre paraOPublico().
 */
const crypto = require("crypto");

const ESTADOS = ["RASCUNHO", "REVISAO", "PUBLICADO", "PAUSADO", "ARQUIVADO"];
const NO_AR = "PUBLICADO";

const CAMPOS_PUBLICOS = [
  "finalidade", "tipo", "bairro", "cidade", "uf", "titulo", "descricao",
  "dormitorios", "suites", "banheiros", "vagas", "area", "andar", "mobiliado",
  "valor_aluguel", "valor_venda", "condominio", "iptu",
];

const CAMPOS_INTERNOS = [
  "logradouro", "numero", "complemento", "cep", "referencia",
  "proprietario", "telefone", "email", "autorizacao", "validade",
  "comissao", "captado_por", "exclusividade", "observacoes",
];

function novoId() {
  return "im_" + Date.now().toString(36) + "_" + crypto.randomBytes(4).toString("hex");
}

function texto(valor, limite) {
  const t = valor === undefined || valor === null ? "" : String(valor);
  return t.slice(0, limite || 2000).trim();
}

function numero(valor) {
  const t = String(valor === undefined || valor === null ? "" : valor)
    .replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(t);
  return isFinite(n) && t !== "" ? n : null;
}

/** Limpa o que veio do formulario: so os campos conhecidos entram. */
function limparPublico(entrada) {
  const saida = {};
  for (const campo of CAMPOS_PUBLICOS) {
    const valor = entrada ? entrada[campo] : "";
    if (["dormitorios", "suites", "banheiros", "vagas", "area",
         "valor_aluguel", "valor_venda", "condominio", "iptu"].includes(campo)) {
      const n = numero(valor);
      saida[campo] = n === null ? "" : n;
    } else {
      saida[campo] = texto(valor, campo === "descricao" ? 4000 : 200);
    }
  }
  return saida;
}

function limparInterno(entrada) {
  const saida = {};
  for (const campo of CAMPOS_INTERNOS) {
    saida[campo] = texto(entrada ? entrada[campo] : "", campo === "observacoes" ? 4000 : 200);
  }
  if (saida.comissao) {
    const n = numero(saida.comissao);
    saida.comissao = n === null ? "" : String(n);
  }
  return saida;
}

/**
 * O estado pedido, ou o ATUAL quando o pedido nao vale.
 *
 * O padrao era "RASCUNHO", e isso era uma armadilha: uma gravacao que chegasse
 * sem o campo status (um autosave antigo, um cliente com falha) TIRAVA DO AR um
 * imovel publicado, sem ninguem pedir. Manter o que ja esta e a escolha segura -
 * despublicar tem de ser um ato, nunca um efeito colateral.
 */
function limparEstado(valor, atual) {
  const t = texto(valor, 20).toUpperCase();
  if (ESTADOS.includes(t)) return t;
  const anterior = texto(atual, 20).toUpperCase();
  return ESTADOS.includes(anterior) ? anterior : "RASCUNHO";
}

/** A linha do banco vista pelo site publico: nada de 'interno' atravessa. */
function paraOPublico(linha, fotos) {
  const p = linha.publico || {};
  return {
    id: linha.id,
    codigo: linha.codigo || linha.id,
    finalidade: p.finalidade || "",
    tipo: p.tipo || "",
    bairro: p.bairro || "",
    cidade: p.cidade || "",
    uf: p.uf || "",
    titulo: p.titulo || "",
    descricao: p.descricao || "",
    dormitorios: p.dormitorios || "",
    suites: p.suites || "",
    banheiros: p.banheiros || "",
    vagas: p.vagas || "",
    area: p.area || "",
    andar: p.andar || "",
    mobiliado: p.mobiliado || "",
    valor_aluguel: p.valor_aluguel || "",
    valor_venda: p.valor_venda || "",
    condominio: p.condominio || "",
    iptu: p.iptu || "",
    atualizado_em: linha.atualizado_em,
    fotos: (fotos || []).map((f) => ({ id: f.id, capa: f.capa, url: "/fotos/" + f.id })),
  };
}

function moeda(valor) {
  const n = Number(valor);
  if (!isFinite(n) || !n) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

module.exports = {
  ESTADOS, NO_AR, CAMPOS_PUBLICOS, CAMPOS_INTERNOS,
  novoId, texto, numero, limparPublico, limparInterno, limparEstado, paraOPublico, moeda,
};
