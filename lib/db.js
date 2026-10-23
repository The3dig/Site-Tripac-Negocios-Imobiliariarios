"use strict";
/**
 * Banco de dados: PostgreSQL, com as tabelas criadas na subida.
 *
 * Por que as fotos ficam no banco (bytea) e nao num disco: no Render, o disco
 * do servico e trocado a cada deploy. Foto em disco sumiria no deploy seguinte,
 * que e exatamente o que nao pode acontecer com uma captacao. O banco e o unico
 * armazenamento persistente que o plano basico garante. Quando o volume crescer,
 * a troca para S3/R2 mexe so em lib/fotos.js.
 */
const { Pool } = require("pg");

/**
 * Qual banco o site usa. BANCO_URL manda; sem ela, DATABASE_URL.
 *
 * Por que duas (23/10/2026, troca do banco gratuito do Render pelo Neon): o
 * DATABASE_URL e preso ao banco do Render pelo render.yaml, e uma sincronizacao
 * do Blueprint poderia devolve-lo ao banco antigo - que o Render apaga. Com o
 * banco novo em BANCO_URL, variavel que o render.yaml nao conhece, ninguem a
 * sobrescreve; e o DATABASE_URL antigo fica de pe como ORIGEM da copia
 * (lib/copiar.js), so lido, nunca escrito.
 */
const ENDERECO = process.env.BANCO_URL || process.env.DATABASE_URL || "";

function opcoesDeConexao(endereco) {
  const precisaSsl = /render\.com|amazonaws|neon\.tech|supabase/.test(endereco || "");
  return { connectionString: endereco, ssl: precisaSsl ? { rejectUnauthorized: false } : false };
}

const pool = new Pool({ ...opcoesDeConexao(ENDERECO), max: 8 });

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  nome          TEXT NOT NULL DEFAULT '',
  senha_hash    TEXT NOT NULL,
  perfil        TEXT NOT NULL DEFAULT 'ADMIN',
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS imoveis (
  id            TEXT PRIMARY KEY,
  codigo        TEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'RASCUNHO',
  publico       JSONB NOT NULL DEFAULT '{}'::jsonb,
  interno       JSONB NOT NULL DEFAULT '{}'::jsonb,
  historico     JSONB NOT NULL DEFAULT '[]'::jsonb,
  criado_por    INTEGER REFERENCES usuarios(id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS imoveis_status ON imoveis (status);

CREATE TABLE IF NOT EXISTS fotos (
  id            TEXT PRIMARY KEY,
  imovel_id     TEXT NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  ordem         INTEGER NOT NULL DEFAULT 0,
  capa          BOOLEAN NOT NULL DEFAULT FALSE,
  tipo          TEXT NOT NULL DEFAULT 'image/jpeg',
  bytes         INTEGER NOT NULL DEFAULT 0,
  conteudo      BYTEA NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fotos_imovel ON fotos (imovel_id, ordem);

CREATE TABLE IF NOT EXISTS auditoria (
  id            SERIAL PRIMARY KEY,
  quando        TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id    INTEGER,
  usuario_email TEXT NOT NULL DEFAULT '',
  acao          TEXT NOT NULL,
  objeto        TEXT NOT NULL DEFAULT '',
  antes         JSONB,
  depois        JSONB,
  ip            TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS auditoria_quando ON auditoria (quando DESC);

CREATE TABLE IF NOT EXISTS contatos (
  id            SERIAL PRIMARY KEY,
  tipo          TEXT NOT NULL DEFAULT 'CONTATO',
  imovel_id     TEXT REFERENCES imoveis(id) ON DELETE SET NULL,
  nome          TEXT NOT NULL DEFAULT '',
  telefone      TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  mensagem      TEXT NOT NULL DEFAULT '',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function preparar() {
  await pool.query(ESQUEMA);
}

module.exports = { pool, preparar, opcoesDeConexao, ENDERECO };
