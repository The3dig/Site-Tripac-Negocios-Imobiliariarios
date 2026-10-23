"use strict";
/**
 * Copia o banco antigo (Render) para o banco novo (Neon), UMA vez, na subida.
 *
 * Autorizado pelo Rone em 23/10/2026 ("ja faz a migracao pra neon antes que a
 * gente perca acesso"), com as regras de sempre para banco:
 *
 * - so roda com COPIAR_DO_RENDER=sim, e so quando ha um banco novo (BANCO_URL)
 *   DIFERENTE do antigo (DATABASE_URL);
 * - o antigo e so LIDO; nada e apagado, alterado ou zerado nele;
 * - o novo so recebe a copia se estiver VAZIO (sem usuario e sem imovel). Com
 *   qualquer coisa dentro, nao copia e diz por que - nunca sobrescreve;
 * - tudo numa transacao: ou entra inteiro, ou nao entra nada;
 * - no fim confere as contagens tabela por tabela e o md5 das fotos, e grava
 *   o resultado na auditoria. Se nao bater, desfaz.
 *
 * As sessoes (quem esta logado) nao vem: perder isso so obriga a entrar de novo.
 */
const { Pool } = require("pg");
const { pool: destino, opcoesDeConexao, ENDERECO } = require("./db");

// Na ordem das chaves estrangeiras: quem e apontado vem antes de quem aponta.
const TABELAS = ["usuarios", "imoveis", "fotos", "contatos", "auditoria"];
const COM_SEQUENCIA = ["usuarios", "contatos", "auditoria"];

async function colunas(cliente, tabela) {
  const { rows } = await cliente.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
    [tabela]);
  return rows.map((r) => r.column_name);
}

async function copiarDoRender() {
  if (String(process.env.COPIAR_DO_RENDER || "").toLowerCase() !== "sim") return null;
  const antigo = process.env.DATABASE_URL || "";
  if (!process.env.BANCO_URL || !antigo || antigo === ENDERECO) {
    return { copiado: false, motivo: "precisa de BANCO_URL (o banco novo) diferente de DATABASE_URL (o antigo)" };
  }
  const { rows: ja } = await destino.query(
    "SELECT (SELECT COUNT(*) FROM usuarios)::int AS usuarios, (SELECT COUNT(*) FROM imoveis)::int AS imoveis");
  if (ja[0].usuarios || ja[0].imoveis) {
    return { copiado: false, motivo: `o banco novo ja tem dados (${ja[0].usuarios} usuario(s), ${ja[0].imoveis} imovel(is)): nada foi copiado - pode apagar COPIAR_DO_RENDER` };
  }

  const origem = new Pool({ ...opcoesDeConexao(antigo), max: 2 });
  const cliente = await destino.connect();
  const contagens = {};
  try {
    await cliente.query("BEGIN");
    for (const tabela of TABELAS) {
      const daOrigem = await colunas(origem, tabela);
      if (!daOrigem.length) { contagens[tabela] = 0; continue; }
      const comuns = (await colunas(cliente, tabela)).filter((c) => daOrigem.includes(c));
      const lista = comuns.map((c) => `"${c}"`).join(", ");
      // Em lotes: as fotos (bytea) podem ser grandes, e nao precisam caber todas na memoria.
      let copiadas = 0;
      for (let deslocamento = 0; ; deslocamento += 50) {
        const { rows } = await origem.query(
          `SELECT ${lista} FROM ${tabela} ORDER BY 1 LIMIT 50 OFFSET ${deslocamento}`);
        for (const linha of rows) {
          const marcas = comuns.map((_, i) => "$" + (i + 1)).join(", ");
          await cliente.query(`INSERT INTO ${tabela} (${lista}) VALUES (${marcas})`, comuns.map((c) => {
            const v = linha[c];
            // JSONB volta do pg como objeto: devolve como texto JSON.
            return v !== null && typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v) ? JSON.stringify(v) : v;
          }));
        }
        copiadas += rows.length;
        if (rows.length < 50) break;
      }
      contagens[tabela] = copiadas;
    }
    // O proximo id continua de onde o antigo parou: sem isso, o primeiro
    // cadastro novo bateria no id de um que veio na copia.
    for (const tabela of COM_SEQUENCIA) {
      await cliente.query(`SELECT setval(pg_get_serial_sequence('${tabela}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${tabela}), 1), (SELECT MAX(id) FROM ${tabela}) IS NOT NULL)`);
    }
    // Conferencia: as contagens e as fotos byte a byte.
    for (const tabela of TABELAS) {
      const { rows: o } = await origem.query(`SELECT COUNT(*)::int AS n FROM ${tabela}`).catch(() => ({ rows: [{ n: 0 }] }));
      const { rows: d } = await cliente.query(`SELECT COUNT(*)::int AS n FROM ${tabela}`);
      if (o[0].n !== d[0].n) throw new Error(`${tabela}: ${o[0].n} no antigo e ${d[0].n} no novo`);
    }
    const md5 = "SELECT COALESCE(md5(string_agg(id || md5(conteudo), ',' ORDER BY id)), '') AS m FROM fotos";
    const { rows: mo } = await origem.query(md5);
    const { rows: md } = await cliente.query(md5);
    if (mo[0].m !== md[0].m) throw new Error("as fotos nao chegaram iguais (md5)");
    await cliente.query(
      "INSERT INTO auditoria (usuario_email, acao, objeto, depois) VALUES ('subida do site', 'BANCO COPIADO DO RENDER', 'neon', $1)",
      [JSON.stringify(contagens)]);
    await cliente.query("COMMIT");
    return { copiado: true, contagens };
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    return { copiado: false, motivo: "copia desfeita, nada ficou pela metade: " + erro.message };
  } finally {
    cliente.release();
    await origem.end().catch(() => {});
  }
}

module.exports = { copiarDoRender };
