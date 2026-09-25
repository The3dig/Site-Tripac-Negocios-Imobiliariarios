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

async function semearAdministrador() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA || "";
  if (!email || !senha) return { criado: false, motivo: "ADMIN_EMAIL/ADMIN_SENHA nao definidos" };
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

module.exports = { PERFIS, gerarHash, conferirSenha, semearAdministrador, autenticar, exigirLogin, exigirPerfil };
