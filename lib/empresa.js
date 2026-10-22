"use strict";
/**
 * Os dados da imobiliaria que aparecem no site. Um lugar so, e cada um com
 * variavel de ambiente: o padrao e a Tripac, mas o site vai servir outras
 * imobiliarias, e regra da casa nao fica escrita nas paginas.
 *
 * REGRA DO CRECI (a mesma do recibo do SIGI): quem anuncia e a EMPRESA, entao o
 * registro que acompanha o anuncio e o da pessoa juridica; o do corretor
 * responsavel vem ao lado, com o nome dele.
 */
const env = process.env;

function digitos(valor) { return String(valor || "").replace(/\D/g, ""); }

const whatsapp = digitos(env.WHATSAPP_NUMERO === undefined ? "5512988401131" : env.WHATSAPP_NUMERO);

/** 5512988401131 -> (12) 98840-1131: como o numero aparece escrito na tela. */
function telefoneEscrito(numero) {
  const d = digitos(numero).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

module.exports = {
  nome: env.EMPRESA_NOME || "TRIPAC Negócios Imobiliários",
  marca: env.EMPRESA_MARCA || "TRIPAC",
  complemento: env.EMPRESA_COMPLEMENTO || "Negócios Imobiliários",
  cnpj: env.EMPRESA_CNPJ || "65.201.123/0001-36",
  creciEmpresa: env.EMPRESA_CRECI_PJ || "52.721-J",
  responsavel: env.EMPRESA_RESPONSAVEL || "Allan Tripac A. dos Santos",
  creciResponsavel: env.EMPRESA_CRECI_PF || "229.775-F",
  cidade: env.EMPRESA_CIDADE || "Caraguatatuba",
  uf: env.EMPRESA_UF || "SP",
  // REGRA DO ESCRITORIO: advocacia e imobiliaria nao se misturam - nem no texto,
  // nem no contato. O e-mail do escritorio de advocacia NAO vai aqui. Sem um
  // e-mail da imobiliaria (EMPRESA_EMAIL), o site nao mostra e-mail nenhum.
  email: env.EMPRESA_EMAIL || "",
  instagram: env.EMPRESA_INSTAGRAM === undefined ? "tripacimoveis" : env.EMPRESA_INSTAGRAM.replace(/^@/, ""),
  whatsapp,
  telefone: telefoneEscrito(whatsapp),
  telefoneEscrito,
};
