"use strict";
/**
 * Login da area interna.
 *
 * Senha guardada como scrypt (nucleo do Node, sem dependencia compilada), com
 * sal por usuario. O ADMIN inicial nasce das variaveis de ambiente ADMIN_EMAIL
 * e ADMIN_SENHA na primeira subida - nenhuma senha vive no repositorio, e a
 * variavel so e lida uma vez, para criar o usuario.
 *
 * A coluna 'perfil' ja existe com ADMIN; CORRETOR e os outros entram depois sem
 * mexer no login: e so a checagem de permissao que cresce.
 */
const crypto = require("crypto");
const { pool } = require("./db");

const PERFIS = ["ADMIN", "CORRETOR"];

function gerarHash(senha) {
  const sal = crypto.randomBytes(16).toString("hex");
  const derivada = crypto.scryptSync(String(senha), sal, 64).toString("hex");
  return `scrypt$${sal}$${derivada}`;
}

function conferirSenha(senha, guardado) {
  try {
    const [algoritmo, sal, esperado] = String(guardado || "").split("$");
    if (algoritmo !== "scrypt" || !sal || !esperado) return false;
    const derivada = crypto.scryptSync(String(senha), sal, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(derivada, "hex"), Buffer.from(esperado, "hex"));
  } catch (erro) {
    return false;
  }
}

/**
 * Recuperar o acesso quando ninguem lembra a senha (22/10/2026: "nao lembro o
 * login e senha"). Com ADMIN_REDEFINIR=sim no painel do Render, a senha do
 * ADMIN_EMAIL passa a ser ADMIN_SENHA - so quem entra no painel consegue isso,
 * que e a mesma porta que criou o primeiro administrador.
 *
 * Vale UMA VEZ por senha: a impressao de (e-mail + senha) fica registrada na
 * auditoria, e o deploy seguinte, com a mesma variavel, nao refaz. Sem isso, a
 * senha trocada depois na tela voltaria para a do painel a cada deploy.
 */
async function redefinirPeloPainel(email, senha) {
  if (String(process.env.ADMIN_REDEFINIR || "").toLowerCase() !== "sim") return null;
  if (senha.length < 10) return { redefinido: false, motivo: "ADMIN_SENHA precisa de 10 caracteres ou mais" };
  const impressao = crypto.createHash("sha256").update(email + "\n" + senha).digest("hex").slice(0, 16);
  const { rows: feito } = await pool.query(
    "SELECT 1 FROM auditoria WHERE acao = 'SENHA REDEFINIDA PELO PAINEL' AND objeto = $1 AND depois->>'impressao' = $2",
    [email, impressao]);
  if (feito.length) return { redefinido: false, motivo: "ja aplicada - pode apagar ADMIN_REDEFINIR e ADMIN_SENHA" };
  const { rowCount } = await pool.query(
    "UPDATE usuarios SET senha_hash = $2, ativo = TRUE, perfil = 'ADMIN' WHERE email = $1", [email, gerarHash(senha)]);
  if (!rowCount) return null; // o usuario nao existe: a semente normal cria
  await pool.query(
    "INSERT INTO auditoria (usuario_email, acao, objeto, depois) VALUES ('painel do Render', 'SENHA REDEFINIDA PELO PAINEL', $1, $2)",
    [email, JSON.stringify({ impressao })]);
  return { redefinido: true };
}

async function semearAdministrador() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA || "";
  if (!email || !senha) return { criado: false, motivo: "ADMIN_EMAIL/ADMIN_SENHA nao definidos" };
  const redefinicao = await redefinirPeloPainel(email, senha);
  if (redefinicao) return { criado: false, ...redefinicao };
  const { rows } = await pool.query("SELECT id FROM usuarios WHERE email = $1", [email]);
  if (rows.length) return { criado: false, motivo: "ja existe" };
  await pool.query(
    "INSERT INTO usuarios (email, nome, senha_hash, perfil) VALUES ($1, $2, $3, 'ADMIN')",
    [email, process.env.ADMIN_NOME || "Administrador", gerarHash(senha)]
  );
  return { criado: true };
}

async function autenticar(email, senha) {
  const { rows } = await pool.query(
    "SELECT id, email, nome, senha_hash, perfil, ativo FROM usuarios WHERE email = $1",
    [String(email || "").trim().toLowerCase()]
  );
  const usuario = rows[0];
  if (!usuario || !usuario.ativo) return null;
  if (!conferirSenha(senha, usuario.senha_hash)) return null;
  return { id: usuario.id, email: usuario.email, nome: usuario.nome, perfil: usuario.perfil };
}

/** Toda rota da area interna passa por aqui. Sem sessao, vai para o login. */
function exigirLogin(req, res, proximo) {
  if (req.session && req.session.usuario) return proximo();
  if (req.path.startsWith("/api/")) return res.status(401).json({ erro: "faça login" });
  const destino = encodeURIComponent(req.originalUrl || "/interna");
  return res.redirect("/interna/login?de=" + destino);
}

function exigirPerfil(...perfis) {
  return function (req, res, proximo) {
    const usuario = req.session && req.session.usuario;
    if (usuario && perfis.includes(usuario.perfil)) return proximo();
    return res.status(403).send("Sem permissão.");
  };
}

/** Senha provisoria para entregar a quem entra pela primeira vez: 12 caracteres, sem os que se confundem (0/O, 1/l/I). */
function senhaProvisoria() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(12);
  let s = "";
  for (const b of bytes) s += letras[b % letras.length];
  return s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12);
}

module.exports = { PERFIS, gerarHash, senhaProvisoria, conferirSenha, semearAdministrador, autenticar, exigirLogin, exigirPerfil };
