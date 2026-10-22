"use strict";
/**
 * Site publico + area interna da Tripac.
 *
 * O SITE PUBLICO so mostra imovel com status PUBLICADO, e so os campos do bloco
 * 'publico' (ver lib/modelo.js). A AREA INTERNA fica inteira atras de login.
 * Nenhum segredo mora aqui: tudo vem de variavel de ambiente.
 */
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const sessao = require("express-session");
const LojaPg = require("connect-pg-simple")(sessao);
const multer = require("multer");

const { pool, preparar } = require("./lib/db");
const auth = require("./lib/auth");
const modelo = require("./lib/modelo");
const vista = require("./lib/html");

const app = express();
const producao = process.env.NODE_ENV === "production";
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
app.use(express.json({ limit: "512kb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: producao ? "1h" : 0 }));

if (!process.env.SESSION_SECRET && producao) {
  console.error("SESSION_SECRET nao definido. Defina a variavel de ambiente antes de subir.");
  process.exit(1);
}
app.use(sessao({
  store: new LojaPg({ pool, tableName: "sessoes", createTableIfMissing: true }),
  name: "tripac.sid",
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: producao,
    maxAge: 1000 * 60 * 60 * 12,
  },
}));

/* ------------------------------------------------ upload de fotos */
const FOTOS_OK = ["image/jpeg", "image/png", "image/webp"];
const enviarFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 12 },
  fileFilter: (req, arquivo, ok) => {
    if (!FOTOS_OK.includes(arquivo.mimetype)) return ok(new Error("tipo de imagem nao aceito"));
    ok(null, true);
  },
});

/** Confere os primeiros bytes: o mimetype declarado pelo navegador nao basta. */
function pareceImagem(buffer, tipo) {
  if (!buffer || buffer.length < 12) return false;
  const b = buffer;
  if (tipo === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8;
  if (tipo === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (tipo === "image/webp") return b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP";
  return false;
}

/**
 * Registro do que importa: quem fez, o que fez, quando, e o antes/depois.
 *
 * Nao registra senha, nem o corpo inteiro de um formulario - so o que permite
 * responder depois "quem tirou este imovel do ar?" e "quem mudou este preco?".
 * Falha de registro NUNCA derruba a acao: o registro e testemunha, nao guarda.
 */
async function registrar(req, acao, objeto, antes, depois) {
  const usuario = (req.session && req.session.usuario) || {};
  try {
    await pool.query(
      `INSERT INTO auditoria (usuario_id, usuario_email, acao, objeto, antes, depois, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [usuario.id || null, usuario.email || "", String(acao), String(objeto || ""),
       antes ? JSON.stringify(antes) : null, depois ? JSON.stringify(depois) : null,
       String(req.ip || "").slice(0, 60)]);
  } catch (erro) {
    console.error("auditoria falhou:", erro.message);
  }
}

/**
 * Limite simples por IP, na memoria do processo. Nao e defesa contra ataque
 * grande - e o suficiente para spam de formulario publico e para forca bruta de
 * senha, que e o que existe hoje.
 */
const contadores = new Map();
function dentroDoLimite(chave, quantas, minutos) {
  const agora = Date.now();
  let registro = contadores.get(chave);
  // A janela comeca no PRIMEIRO pedido, e nao no segundo: com "ate: agora" o
  // primeiro nao abria janela nenhuma e o limite deixava passar um a mais.
  if (!registro || agora >= registro.ate) registro = { contagem: 0, ate: agora + minutos * 60000 };
  registro.contagem += 1;
  contadores.set(chave, registro);
  if (contadores.size > 5000) {
    for (const [chaveVelha, valor] of contadores) {
      if (agora >= valor.ate) contadores.delete(chaveVelha);
    }
  }
  return registro.contagem <= quantas;
}

/* ------------------------------------------------ consultas */
async function fotosDe(imovelId) {
  const { rows } = await pool.query(
    "SELECT id, capa, ordem FROM fotos WHERE imovel_id = $1 ORDER BY ordem, criado_em", [imovelId]);
  return rows;
}

/**
 * As fotos de varios imoveis numa consulta so, agrupadas por imovel. Com uma
 * consulta por imovel, a home com 200 imoveis fazia 201 viagens ao banco.
 */
async function fotosDeVarios(imovelIds) {
  const porImovel = new Map(imovelIds.map((id) => [id, []]));
  if (!imovelIds.length) return porImovel;
  const { rows } = await pool.query(
    `SELECT id, imovel_id, capa, ordem FROM fotos WHERE imovel_id = ANY($1)
      ORDER BY imovel_id, ordem, criado_em`, [imovelIds]);
  for (const foto of rows) porImovel.get(foto.imovel_id).push(foto);
  return porImovel;
}

async function publicados(busca) {
  const termo = (busca || "").trim().toLowerCase();
  const { rows } = await pool.query(
    "SELECT * FROM imoveis WHERE status = $1 ORDER BY atualizado_em DESC LIMIT 200", [modelo.NO_AR]);
  const fotos = await fotosDeVarios(rows.map((linha) => linha.id));
  const comFotos = [];
  for (const linha of rows) {
    const imovel = modelo.paraOPublico(linha, fotos.get(linha.id));
    if (!termo || JSON.stringify([imovel.bairro, imovel.cidade, imovel.tipo, imovel.titulo])
        .toLowerCase().includes(termo)) comFotos.push(imovel);
  }
  return comFotos;
}

/**
 * Saude do servico. Sem segredo nenhum: diz se a aplicacao responde e se o
 * banco responde, e mais nada. E o que o Render (e voce, do celular) usa para
 * saber se esta de pe.
 */
app.get("/health", async (req, res) => {
  const comeco = Date.now();
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, banco: "ok", ms: Date.now() - comeco });
  } catch (erro) {
    console.error("health: banco fora -", erro.message);
    res.status(503).json({ ok: false, banco: "fora", ms: Date.now() - comeco });
  }
});

/**
 * O endereco do site, para as etiquetas do WhatsApp/Google, que exigem link
 * completo. SITE_URL manda (o dominio de verdade); sem ela, vale o endereco
 * pelo qual o site foi chamado.
 */
function enderecoDoSite(req) {
  return (process.env.SITE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
}

/* ------------------------------------------------ site publico */

/**
 * Quando o dominio estiver ligado, quem chega por www.tripacimoveis.com.br (ou
 * pelo endereco do Render) vai para o endereco oficial: um site so, um link so
 * no Google e no WhatsApp. So age com SITE_URL definida - sem ela, nao ha para
 * onde mandar. /health fica de fora: e o Render quem chama, pelo endereco dele.
 */
app.use((req, res, proximo) => {
  const oficial = process.env.SITE_URL;
  if (!oficial || req.path === "/health" || req.method !== "GET") return proximo();
  let alvo;
  try { alvo = new URL(oficial); } catch { return proximo(); }
  const host = String(req.get("host") || "").toLowerCase();
  if (host === alvo.host || host.startsWith("localhost") || host.startsWith("127.0.0.1")) return proximo();
  if (host === "www." + alvo.host || host.endsWith(".onrender.com")) {
    return res.redirect(301, oficial.replace(/\/+$/, "") + req.originalUrl);
  }
  proximo();
});

app.get("/favicon.ico", (req, res) => res.redirect(301, "/marca/favicon-32.png"));

app.get("/", async (req, res, proximo) => {
  try {
    const imoveis = await publicados("");
    const site = enderecoDoSite(req);
    res.send(vista.paginaInicial(imoveis, { url: site + "/", site }));
  } catch (erro) { proximo(erro); }
});

/**
 * Os filtros da busca, lidos da URL e limpos: so o que se conhece entra. Valor
 * "2.500" e "2500" sao a mesma coisa (modelo.numero ja sabe o milhar).
 */
function filtrosDaBusca(query) {
  const texto = (v, n) => modelo.texto(v, n || 80);
  const f = {
    q: texto(query.q), tipo: texto(query.tipo), bairro: texto(query.bairro),
    dorm: /^[1-9]$/.test(String(query.dorm || "")) ? String(query.dorm) : "",
    ate: modelo.numero(query.ate) ? String(modelo.numero(query.ate)) : "",
    ordem: ["menor", "maior"].includes(query.ordem) ? query.ordem : "",
  };
  return f;
}

const POR_PAGINA = 12;

/** /alugar e /comprar: a mesma busca, com a finalidade de cada uma. */
async function listar(req, res, { finalidade, titulo, subtitulo, acao, ativo }) {
  const filtros = filtrosDaBusca(req.query);
  const todos = (await publicados(filtros.q)).filter((i) => finalidade.test(i.finalidade));
  const valor = (i) => Number(acao === "/alugar" ? i.valor_aluguel : i.valor_venda) || 0;
  let lista = todos.filter((i) =>
    (!filtros.tipo || i.tipo === filtros.tipo) &&
    (!filtros.bairro || i.bairro === filtros.bairro) &&
    (!filtros.dorm || Number(i.dormitorios || 0) >= Number(filtros.dorm)) &&
    (!filtros.ate || (valor(i) > 0 && valor(i) <= Number(filtros.ate))));
  if (filtros.ordem === "menor") lista = lista.slice().sort((a, b) => (valor(a) || Infinity) - (valor(b) || Infinity));
  if (filtros.ordem === "maior") lista = lista.slice().sort((a, b) => valor(b) - valor(a));
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const paginaAtual = Math.min(paginas, Math.max(1, parseInt(req.query.pagina, 10) || 1));
  res.send(vista.listaPublica({
    titulo, subtitulo, acao, ativo, filtros, paginas, paginaAtual,
    total: lista.length,
    imoveis: lista.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA),
    opcoes: vista.opcoesDaBusca(todos),
    social: { url: enderecoDoSite(req) + acao, site: enderecoDoSite(req) },
  }));
}

app.get("/alugar", async (req, res, proximo) => {
  try {
    await listar(req, res, { finalidade: /ALUGAR/, titulo: "Imóveis para alugar", ativo: "alugar",
      subtitulo: "Casas e apartamentos para alugar em Caraguatatuba e região.", acao: "/alugar" });
  } catch (erro) { proximo(erro); }
});

app.get("/comprar", async (req, res, proximo) => {
  try {
    await listar(req, res, { finalidade: /VENDER/, titulo: "Imóveis à venda", ativo: "comprar",
      subtitulo: "Para morar ou investir em Caraguatatuba e região.", acao: "/comprar" });
  } catch (erro) { proximo(erro); }
});

/** A busca da pagina inicial escolhe Alugar ou Comprar e leva os filtros junto. */
app.get("/buscar", (req, res) => {
  const filtros = filtrosDaBusca(req.query);
  const q = new URLSearchParams();
  for (const [c, v] of Object.entries(filtros)) if (v) q.set(c, v);
  const s = q.toString();
  res.redirect((req.query.f === "comprar" ? "/comprar" : "/alugar") + (s ? "?" + s : ""));
});

app.get("/imovel/:codigo", async (req, res, proximo) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM imoveis WHERE (codigo = $1 OR id = $1) AND status = $2",
      [String(req.params.codigo), modelo.NO_AR]);
    if (!rows.length) return res.status(404).send(vista.pagina({
      titulo: "Imóvel não encontrado",
      corpo: vista.recado("Imóvel não encontrado", "Ele pode ter saído do ar ou já ter sido alugado.",
        ["/alugar", "Ver os imóveis disponíveis"]),
    }));
    const imovel = modelo.paraOPublico(rows[0], await fotosDe(rows[0].id));
    const capa = imovel.fotos.find((f) => f.capa) || imovel.fotos[0];
    const site = enderecoDoSite(req);
    res.send(vista.paginaImovel(imovel, {
      url: site + "/imovel/" + encodeURIComponent(imovel.codigo), site,
      imagem: capa ? site + capa.url : "",
    }));
  } catch (erro) { proximo(erro); }
});

app.get("/anuncie", (req, res) => {
  const site = enderecoDoSite(req);
  res.send(vista.pagina({ ...vista.paginaAnuncie(), social: { url: site + "/anuncie", site } }));
});

app.get("/privacidade", (req, res) => {
  const site = enderecoDoSite(req);
  res.send(vista.pagina({ ...vista.paginaPrivacidade(), social: { url: site + "/privacidade", site } }));
});

async function guardarContato(req, tipo) {
  await pool.query(
    "INSERT INTO contatos (tipo, imovel_id, nome, telefone, email, mensagem) VALUES ($1,$2,$3,$4,$5,$6)",
    [tipo, modelo.texto(req.body.imovel, 60) || null, modelo.texto(req.body.nome, 120),
     modelo.texto(req.body.telefone, 40), modelo.texto(req.body.email, 120),
     modelo.texto(req.body.mensagem, 1000)]);
}

function muitosEnvios(res) {
  return res.status(429).send(vista.pagina({ titulo: "Muitos envios",
    corpo: vista.recado("Muitos envios seguidos",
      "Espere alguns minutos e tente de novo, ou fale com a Tripac pelo WhatsApp.", ["/", "Voltar ao início"]) }));
}

app.post("/anuncie", async (req, res, proximo) => {
  try {
    if (!dentroDoLimite("form:" + req.ip, 8, 60)) return muitosEnvios(res);
    await guardarContato(req, "ANUNCIE");
    res.send(vista.pagina({ titulo: "Recebido",
      corpo: vista.recado("Recebemos o seu contato",
        "A Tripac retorna em breve, no telefone que você deixou.", ["/", "Voltar ao início"]) }));
  } catch (erro) { proximo(erro); }
});

app.post("/visita", async (req, res, proximo) => {
  try {
    if (!dentroDoLimite("form:" + req.ip, 8, 60)) return muitosEnvios(res);
    await guardarContato(req, "VISITA");
    res.send(vista.pagina({ titulo: "Pedido enviado",
      corpo: vista.recado("Pedido de visita enviado",
        "A Tripac entra em contato para combinar o dia e o horário.", ["/alugar", "Ver outros imóveis"]) }));
  } catch (erro) { proximo(erro); }
});

/**
 * Para o Google: o que pode ser lido e onde esta a lista. A area interna fica
 * de fora - robots.txt nao e protecao (quem protege e o login no servidor), e
 * so evita que a tela de entrar apareca na busca.
 */
app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(
    `User-agent: *\nDisallow: /interna\nDisallow: /api/\n\nSitemap: ${enderecoDoSite(req)}/sitemap.xml\n`);
});

/** A lista das paginas publicas, com cada imovel no ar e a data da ultima mudanca. */
app.get("/sitemap.xml", async (req, res, proximo) => {
  try {
    const site = enderecoDoSite(req);
    const { rows } = await pool.query(
      "SELECT codigo, id, atualizado_em FROM imoveis WHERE status = $1 ORDER BY atualizado_em DESC",
      [modelo.NO_AR]);
    const url = (caminho, quando) => `  <url><loc>${vista.e(site + caminho)}</loc>${
      quando ? `<lastmod>${new Date(quando).toISOString().slice(0, 10)}</lastmod>` : ""}</url>`;
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["/", "/alugar", "/comprar", "/anuncie", "/privacidade"].map((c) => url(c)).join("\n")}
${rows.map((r) => url("/imovel/" + encodeURIComponent(r.codigo || r.id), r.atualizado_em)).join("\n")}
</urlset>
`);
  } catch (erro) { proximo(erro); }
});

/** API publica: so o que esta no ar, so campos publicos. */
app.get("/api/imoveis", async (req, res, proximo) => {
  try { res.json({ imoveis: await publicados(req.query.q) }); }
  catch (erro) { proximo(erro); }
});

/**
 * A foto so aparece se o imovel estiver publicado - ou, fora do ar, para quem
 * pode ver aquela captacao: o ADMIN e quem captou (ver podeVerCaptacao).
 */
app.get("/fotos/:id", async (req, res, proximo) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.conteudo, f.tipo, i.status, i.criado_por FROM fotos f
         JOIN imoveis i ON i.id = f.imovel_id WHERE f.id = $1`, [String(req.params.id)]);
    const foto = rows[0];
    const usuario = req.session && req.session.usuario;
    if (!foto || (foto.status !== modelo.NO_AR && !podeVerCaptacao(usuario, foto.criado_por))) {
      return res.status(404).end();
    }
    res.set("Content-Type", foto.tipo);
    res.set("Cache-Control", foto.status === modelo.NO_AR ? "public, max-age=86400" : "private, no-store");
    res.send(foto.conteudo);
  } catch (erro) { proximo(erro); }
});

/* ------------------------------------------------ login */
app.get("/interna/login", (req, res) => {
  if (req.session.usuario) return res.redirect("/interna");
  res.send(vista.pagina({
    titulo: "Entrar", interna: true,
    corpo: `<section class="entrar">
      <h1>Área interna</h1>
      ${req.query.erro ? `<p class="erro">E-mail ou senha não conferem.</p>` : ""}
      <form method="post" action="/interna/login">
        <input type="hidden" name="de" value="${vista.e(req.query.de || "/interna")}">
        <label>E-mail<input name="email" type="email" required autocomplete="username"></label>
        <label>Senha<input name="senha" type="password" required autocomplete="current-password"></label>
        <button class="principal">Entrar</button>
      </form></section>`,
  }));
});

app.post("/interna/login", async (req, res, proximo) => {
  try {
    if (!dentroDoLimite("login:" + req.ip, 10, 15)) {
      return res.status(429).send("Muitas tentativas. Espere alguns minutos.");
    }
    const usuario = await auth.autenticar(req.body.email, req.body.senha);
    if (!usuario) {
      await registrar(req, "LOGIN RECUSADO", String(req.body.email || "").slice(0, 120));
      return res.redirect("/interna/login?erro=1");
    }
    req.session.regenerate((erro) => {
      if (erro) return proximo(erro);
      req.session.usuario = usuario;
      registrar(req, "LOGIN", usuario.email);
      const destino = String(req.body.de || "/interna");
      res.redirect(destino.startsWith("/interna") ? destino : "/interna");
    });
  } catch (erro) { proximo(erro); }
});

app.get("/interna/sair", (req, res) => {
  req.session.destroy(() => res.redirect("/interna/login"));
});

/* ------------------------------------------------ area interna */
app.use("/interna", auth.exigirLogin);

/**
 * Quem ve cada captacao (decidido pelo Rone em 22/10/2026): o ADMIN ve e mexe
 * em todas; o CORRETOR, so nas que ele captou (imoveis.criado_por). A regra e
 * do SERVIDOR e esta num lugar so: o porteiro abaixo fica na frente de TODAS
 * as rotas que recebem o id de uma captacao - pagina, leitura, gravacao,
 * fotos, ordem e exclusao de foto -, e a lista e as fotos usam a mesma funcao.
 * Rota nova de captacao debaixo desses dois caminhos ja nasce protegida.
 */
function podeVerCaptacao(usuario, criadoPor) {
  if (!usuario) return false;
  return usuario.perfil === "ADMIN" || (criadoPor !== null && Number(criadoPor) === Number(usuario.id));
}

app.use(["/interna/captacao/:id", "/interna/api/captacao/:id"], async (req, res, proximo) => {
  try {
    if (req.params.id === "nova") return proximo();
    const usuario = req.session.usuario;
    if (usuario.perfil === "ADMIN") return proximo();
    const { rows } = await pool.query("SELECT criado_por FROM imoveis WHERE id = $1", [String(req.params.id)]);
    if (rows.length && podeVerCaptacao(usuario, rows[0].criado_por)) return proximo();
    // 404, e nao 403: para quem nao pode ver, a captacao do outro nao existe.
    if (req.originalUrl.startsWith("/interna/api/")) return res.status(404).json({ erro: "não encontrada" });
    return res.status(404).send("Captação não encontrada.");
  } catch (erro) { proximo(erro); }
});

const ESTADOS_ESCRITOS = { RASCUNHO: "Rascunho", REVISAO: "Em revisão", PUBLICADO: "Publicado", PAUSADO: "Pausado", ARQUIVADO: "Arquivado" };

app.get("/interna", async (req, res, proximo) => {
  try {
    const eu = req.session.usuario;
    const admin = eu.perfil === "ADMIN";
    const estado = modelo.ESTADOS.includes(req.query.estado) ? req.query.estado : "";
    const por = admin && /^\d+$/.test(String(req.query.por || "")) ? Number(req.query.por) : null;
    const condicoes = [], valores = [];
    if (!admin) { valores.push(eu.id); condicoes.push(`i.criado_por = $${valores.length}`); }
    if (por !== null) { valores.push(por); condicoes.push(`i.criado_por = $${valores.length}`); }
    if (estado) { valores.push(estado); condicoes.push(`i.status = $${valores.length}`); }
    const { rows } = await pool.query(
      `SELECT i.*, u.nome AS captador_nome, u.email AS captador_email
         FROM imoveis i LEFT JOIN usuarios u ON u.id = i.criado_por
        ${condicoes.length ? "WHERE " + condicoes.join(" AND ") : ""}
        ORDER BY i.atualizado_em DESC LIMIT 300`, valores);
    const fotos = await fotosDeVarios(rows.map((linha) => linha.id));
    const cartoes = rows.map((linha) => {
      const dela = fotos.get(linha.id);
      const capa = dela.find((f) => f.capa) || dela[0];
      const p = linha.publico || {}, i = linha.interno || {};
      const titulo = p.titulo || [i.logradouro, i.numero].filter(Boolean).join(", ")
        || [p.tipo, p.bairro].filter(Boolean).join(" · ") || "Sem endereço ainda";
      const captador = linha.captador_nome || linha.captador_email || i.captado_por || "sem registro";
      return `<a class="item" href="/interna/captacao/${vista.e(linha.id)}">
        ${capa ? `<img src="/fotos/${vista.e(capa.id)}" alt="">` : `<span class="semfoto">sem foto</span>`}
        <span class="txt"><strong>${vista.e(titulo)}</strong>
          <span>captado por <b>${vista.e(captador)}</b> · ${vista.e(dela.length)} foto(s) · ${vista.e(new Date(linha.atualizado_em).toLocaleString("pt-BR"))}</span></span>
        <span class="chip ${vista.e(linha.status)}">${vista.e(linha.status)}</span></a>`;
    });
    let filtroPessoa = "";
    if (admin) {
      const { rows: pessoas } = await pool.query(
        `SELECT DISTINCT u.id, COALESCE(NULLIF(u.nome, ''), u.email) AS nome
           FROM usuarios u JOIN imoveis i ON i.criado_por = u.id ORDER BY 2`);
      filtroPessoa = `<label>Captado por<select name="por">
          <option value="">Todos</option>
          ${pessoas.map((u) => `<option value="${u.id}"${por === u.id ? " selected" : ""}>${vista.e(u.nome)}</option>`).join("")}
        </select></label>`;
    }
    res.send(vista.pagina({
      titulo: "Captações", interna: true, usuario: eu,
      corpo: `<div class="acoes-topo"><a class="botao principal" href="/interna/captacao/nova">+ Nova captação</a></div>
        <form class="filtros-internos" method="get" action="/interna">
          <label>Estado<select name="estado">
            <option value="">Todos</option>
            ${modelo.ESTADOS.map((s) => `<option value="${s}"${estado === s ? " selected" : ""}>${ESTADOS_ESCRITOS[s]}</option>`).join("")}
          </select></label>
          ${filtroPessoa}
          <button class="botao claro">Filtrar</button>
        </form>
        <p class="dica">${admin ? "Você vê as captações de todos." : "Você vê as captações que você fez."}
          ${rows.length === 1 ? "1 captação" : rows.length + " captações"}${estado || por !== null ? ' · <a href="/interna">limpar filtros</a>' : ""}</p>
        <section class="lista">${cartoes.join("") || `<p class="vazio">Nenhuma captação aqui.</p>`}</section>`,
    }));
  } catch (erro) { proximo(erro); }
});

app.get("/interna/captacao/nova", async (req, res, proximo) => {
  try {
    const id = modelo.novoId();
    await pool.query(
      `INSERT INTO imoveis (id, codigo, status, publico, interno, historico, criado_por)
       VALUES ($1, $2, 'RASCUNHO', $3, $4, $5, $6)`,
      [id, id.replace("im_", "TR-").toUpperCase().slice(0, 14),
       JSON.stringify(modelo.limparPublico({ finalidade: "ALUGAR", tipo: "APARTAMENTO", uf: "SP" })),
       JSON.stringify(modelo.limparInterno({ captado_por: req.session.usuario.nome })),
       JSON.stringify([{ quando: new Date().toISOString(), quem: req.session.usuario.nome, o_que: "captação criada" }]),
       req.session.usuario.id]);
    res.redirect("/interna/captacao/" + id);
  } catch (erro) { proximo(erro); }
});

app.get("/interna/captacao/:id", async (req, res, proximo) => {
  try {
    const { rows } = await pool.query("SELECT * FROM imoveis WHERE id = $1", [String(req.params.id)]);
    if (!rows.length) return res.status(404).send("Captação não encontrada.");
    res.send(vista.pagina({
      titulo: "Captação", interna: true, usuario: req.session.usuario,
      corpo: `<div id="captacao" data-id="${vista.e(rows[0].id)}"></div><script src="${vista.ARQUIVO.captacao}" defer></script>`,
    }));
  } catch (erro) { proximo(erro); }
});

/* ------------------------------------------------ API da area interna */
app.get("/interna/api/captacao/:id", async (req, res, proximo) => {
  try {
    const { rows } = await pool.query("SELECT * FROM imoveis WHERE id = $1", [String(req.params.id)]);
    if (!rows.length) return res.status(404).json({ erro: "não encontrada" });
    const linha = rows[0];
    res.json({
      id: linha.id, codigo: linha.codigo, status: linha.status,
      publico: linha.publico, interno: linha.interno, historico: linha.historico,
      atualizado_em: linha.atualizado_em,
      fotos: (await fotosDe(linha.id)).map((f) => ({ id: f.id, capa: f.capa, url: "/fotos/" + f.id })),
    });
  } catch (erro) { proximo(erro); }
});

app.put("/interna/api/captacao/:id", async (req, res, proximo) => {
  try {
    const id = String(req.params.id);
    const { rows } = await pool.query("SELECT historico, status, publico FROM imoveis WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ erro: "não encontrada" });
    const status = modelo.limparEstado(req.body.status, rows[0].status);
    const historico = Array.isArray(rows[0].historico) ? rows[0].historico.slice(-60) : [];
    if (status !== rows[0].status) {
      historico.push({ quando: new Date().toISOString(), quem: req.session.usuario.nome,
                       o_que: "estado: " + rows[0].status + " → " + status });
    }
    const publicoNovo = modelo.limparPublico(req.body.publico);
    await pool.query(
      `UPDATE imoveis SET publico = $2, interno = $3, status = $4, historico = $5,
              atualizado_em = now() WHERE id = $1`,
      [id, JSON.stringify(publicoNovo),
       JSON.stringify(modelo.limparInterno(req.body.interno)), status, JSON.stringify(historico)]);

    // So o que muda o dinheiro ou a visibilidade vira linha de auditoria: um
    // registro por tecla digitada seria ruido, e ruido ninguem le.
    if (status !== rows[0].status) {
      await registrar(req, "ESTADO", id, { status: rows[0].status }, { status });
    }
    const antes = rows[0].publico || {};
    for (const campo of ["valor_aluguel", "valor_venda", "condominio", "iptu"]) {
      if (String(antes[campo] || "") !== String(publicoNovo[campo] || "")) {
        await registrar(req, "PRECO", id, { [campo]: antes[campo] }, { [campo]: publicoNovo[campo] });
      }
    }
    res.json({ ok: true, salvo_em: new Date().toISOString(), status });
  } catch (erro) { proximo(erro); }
});

app.post("/interna/api/captacao/:id/fotos", enviarFoto.array("foto", 12), async (req, res, proximo) => {
  try {
    const id = String(req.params.id);
    const { rows } = await pool.query("SELECT id FROM imoveis WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ erro: "não encontrada" });
    const { rows: contagem } = await pool.query(
      "SELECT COUNT(*)::int AS quantas FROM fotos WHERE imovel_id = $1", [id]);
    let ordem = contagem[0].quantas;
    const criadas = [];
    for (const arquivo of req.files || []) {
      if (!pareceImagem(arquivo.buffer, arquivo.mimetype)) continue;
      const fotoId = "ft_" + crypto.randomBytes(10).toString("hex");
      await pool.query(
        `INSERT INTO fotos (id, imovel_id, ordem, capa, tipo, bytes, conteudo)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [fotoId, id, ordem, ordem === 0, arquivo.mimetype, arquivo.size, arquivo.buffer]);
      criadas.push({ id: fotoId, capa: ordem === 0, url: "/fotos/" + fotoId });
      ordem += 1;
    }
    await pool.query("UPDATE imoveis SET atualizado_em = now() WHERE id = $1", [id]);
    if (!criadas.length) return res.status(400).json({ erro: "nenhuma imagem válida" });
    res.json({ fotos: criadas });
  } catch (erro) { proximo(erro); }
});

app.post("/interna/api/captacao/:id/fotos/ordem", async (req, res, proximo) => {
  try {
    const id = String(req.params.id);
    const ordem = Array.isArray(req.body.ordem) ? req.body.ordem.slice(0, 60) : [];
    const capa = modelo.texto(req.body.capa, 60);
    for (let i = 0; i < ordem.length; i += 1) {
      await pool.query("UPDATE fotos SET ordem = $3, capa = ($1 = $4) WHERE id = $1 AND imovel_id = $2",
        [String(ordem[i]), id, i, capa]);
    }
    res.json({ ok: true });
  } catch (erro) { proximo(erro); }
});

app.delete("/interna/api/captacao/:id/fotos/:foto", async (req, res, proximo) => {
  try {
    await pool.query("DELETE FROM fotos WHERE id = $1 AND imovel_id = $2",
      [String(req.params.foto), String(req.params.id)]);
    await registrar(req, "FOTO EXCLUIDA", String(req.params.id),
                    { foto: String(req.params.foto) }, null);
    const restantes = await fotosDe(String(req.params.id));
    if (restantes.length && !restantes.some((f) => f.capa)) {
      await pool.query("UPDATE fotos SET capa = TRUE WHERE id = $1", [restantes[0].id]);
    }
    res.json({ ok: true });
  } catch (erro) { proximo(erro); }
});

app.get("/interna/senha", (req, res) => {
  res.send(vista.pagina({
    titulo: "Trocar a senha", interna: true, usuario: req.session.usuario,
    corpo: `<section class="entrar">
      <h1>Trocar a minha senha</h1>
      ${req.query.erro ? `<p class="erro">${vista.e(req.query.erro)}</p>` : ""}
      ${req.query.ok ? `<p class="ok-msg">Senha trocada. Ela já vale no próximo login.</p>` : ""}
      <form method="post" action="/interna/senha">
        <label>Senha atual<input type="password" name="atual" required
          autocomplete="current-password"></label>
        <label>Senha nova<input type="password" name="nova" required minlength="10"
          autocomplete="new-password"></label>
        <label>Repita a senha nova<input type="password" name="repetida" required
          minlength="10" autocomplete="new-password"></label>
        <p class="dica">Pelo menos 10 caracteres. Depois de trocar aqui, apague a
          variável ADMIN_SENHA do painel do Render: ela não é mais usada.</p>
        <button class="principal">Trocar a senha</button>
      </form></section>`,
  }));
});

app.post("/interna/senha", async (req, res, proximo) => {
  try {
    const usuario = req.session.usuario;
    const nova = String(req.body.nova || "");
    if (nova.length < 10) {
      return res.redirect("/interna/senha?erro=" + encodeURIComponent("A senha nova precisa de pelo menos 10 caracteres."));
    }
    if (nova !== String(req.body.repetida || "")) {
      return res.redirect("/interna/senha?erro=" + encodeURIComponent("As duas senhas novas não são iguais."));
    }
    const conferido = await auth.autenticar(usuario.email, req.body.atual);
    if (!conferido) {
      await registrar(req, "SENHA RECUSADA", usuario.email);
      return res.redirect("/interna/senha?erro=" + encodeURIComponent("A senha atual não confere."));
    }
    await pool.query("UPDATE usuarios SET senha_hash = $2 WHERE id = $1",
                     [usuario.id, auth.gerarHash(nova)]);
    await registrar(req, "SENHA TROCADA", usuario.email);
    res.redirect("/interna/senha?ok=1");
  } catch (erro) { proximo(erro); }
});

/* ------------------------------------------------ usuarios (so ADMIN) */
/**
 * Quem entra na area interna. So ADMIN mexe aqui, e a regra e do SERVIDOR
 * (exigirPerfil), nao do botao: esconder o link nao e permissao.
 *
 * A senha de quem entra pela primeira vez e PROVISORIA, gerada aqui e mostrada
 * UMA vez na tela, para ser passada a pessoa; ela troca em "Senha" no primeiro
 * acesso. Ninguem escolhe a senha do outro, e a senha nunca fica guardada
 * legivel - nem na sessao depois de mostrada.
 */
const soAdmin = auth.exigirPerfil("ADMIN");

function paginaUsuarios(req, linhas, recado) {
  const eu = req.session.usuario;
  const mostrar = req.session.senhaParaMostrar;
  delete req.session.senhaParaMostrar;
  return vista.pagina({
    titulo: "Usuários", interna: true, usuario: eu,
    corpo: `<h1 class="titulo-secao">Quem entra na área interna</h1>
      ${recado ? `<p class="erro">${vista.e(recado)}</p>` : ""}
      ${mostrar ? `<section class="faixa senha-provisoria">
        <h2>Senha provisória de ${vista.e(mostrar.nome || mostrar.email)}</h2>
        <p>E-mail: <strong>${vista.e(mostrar.email)}</strong><br>
           Senha: <strong class="senha-mostrada">${vista.e(mostrar.senha)}</strong></p>
        <p class="dica">Ela aparece só agora. Passe para a pessoa (WhatsApp ou pessoalmente) e peça para
          trocar em <em>Senha</em> no primeiro acesso. Se fechar sem anotar, gere outra abaixo.</p></section>` : ""}
      <section class="lista">${linhas.map((u) => `<div class="item">
        <span class="txt"><strong>${vista.e(u.nome || u.email)}${u.id === eu.id ? " (você)" : ""}</strong>
          <span>${vista.e(u.email)} · ${vista.e(u.perfil)} · desde ${vista.e(new Date(u.criado_em).toLocaleDateString("pt-BR"))}</span></span>
        <span class="chip ${u.ativo ? "PUBLICADO" : "ARQUIVADO"}">${u.ativo ? "ATIVO" : "DESATIVADO"}</span>
        ${u.id === eu.id ? "" : `<form method="post" action="/interna/usuarios/${u.id}/senha" class="em-linha">
            <button class="botao claro">Nova senha provisória</button></form>
          <form method="post" action="/interna/usuarios/${u.id}/ativo" class="em-linha">
            <button class="botao claro">${u.ativo ? "Desativar" : "Reativar"}</button></form>`}
      </div>`).join("")}</section>
      <section class="entrar">
        <h2>Novo usuário</h2>
        <form method="post" action="/interna/usuarios">
          <label>Nome<input name="nome" required maxlength="120" placeholder="Ex.: Dr. Allan"></label>
          <label>E-mail (é o login)<input name="email" type="email" required maxlength="120"></label>
          <label>Perfil<select name="perfil">
            <option value="ADMIN">Administrador — vê e muda tudo, inclusive usuários</option>
            <option value="CORRETOR">Corretor — capta e publica imóveis</option></select></label>
          <p class="dica">A senha provisória é gerada na hora e aparece uma vez, nesta tela.</p>
          <button class="principal">Criar e gerar a senha</button>
        </form></section>`,
  });
}

async function listaDeUsuarios() {
  const { rows } = await pool.query("SELECT id, email, nome, perfil, ativo, criado_em FROM usuarios ORDER BY ativo DESC, nome, email");
  return rows;
}

app.get("/interna/usuarios", soAdmin, async (req, res, proximo) => {
  try { res.send(paginaUsuarios(req, await listaDeUsuarios(), req.query.erro)); }
  catch (erro) { proximo(erro); }
});

app.post("/interna/usuarios", soAdmin, async (req, res, proximo) => {
  try {
    const email = modelo.texto(req.body.email, 120).toLowerCase();
    const nome = modelo.texto(req.body.nome, 120);
    const perfil = auth.PERFIS.includes(req.body.perfil) ? req.body.perfil : "CORRETOR";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.redirect("/interna/usuarios?erro=" + encodeURIComponent("E-mail inválido."));
    }
    const { rows: existe } = await pool.query("SELECT 1 FROM usuarios WHERE email = $1", [email]);
    if (existe.length) {
      return res.redirect("/interna/usuarios?erro=" + encodeURIComponent(
        "Já existe usuário com este e-mail. Use 'Nova senha provisória' na linha dele."));
    }
    const senha = auth.senhaProvisoria();
    await pool.query("INSERT INTO usuarios (email, nome, senha_hash, perfil) VALUES ($1, $2, $3, $4)",
      [email, nome, auth.gerarHash(senha), perfil]);
    await registrar(req, "USUARIO CRIADO", email, null, { nome, perfil });
    req.session.senhaParaMostrar = { email, nome, senha };
    res.redirect("/interna/usuarios");
  } catch (erro) { proximo(erro); }
});

app.post("/interna/usuarios/:id/senha", soAdmin, async (req, res, proximo) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.session.usuario.id) return res.redirect("/interna/senha");
    const senha = auth.senhaProvisoria();
    const { rows } = await pool.query(
      "UPDATE usuarios SET senha_hash = $2 WHERE id = $1 RETURNING email, nome", [id, auth.gerarHash(senha)]);
    if (!rows.length) return res.redirect("/interna/usuarios?erro=" + encodeURIComponent("Usuário não encontrado."));
    await registrar(req, "SENHA PROVISORIA", rows[0].email);
    req.session.senhaParaMostrar = { email: rows[0].email, nome: rows[0].nome, senha };
    res.redirect("/interna/usuarios");
  } catch (erro) { proximo(erro); }
});

app.post("/interna/usuarios/:id/ativo", soAdmin, async (req, res, proximo) => {
  try {
    const id = parseInt(req.params.id, 10);
    // Desativar a si mesmo trancaria a porta por dentro.
    if (id === req.session.usuario.id) {
      return res.redirect("/interna/usuarios?erro=" + encodeURIComponent("Você não pode desativar a si mesmo."));
    }
    const { rows } = await pool.query(
      "UPDATE usuarios SET ativo = NOT ativo WHERE id = $1 RETURNING email, ativo", [id]);
    if (!rows.length) return res.redirect("/interna/usuarios?erro=" + encodeURIComponent("Usuário não encontrado."));
    await registrar(req, rows[0].ativo ? "USUARIO REATIVADO" : "USUARIO DESATIVADO", rows[0].email);
    res.redirect("/interna/usuarios");
  } catch (erro) { proximo(erro); }
});

app.get("/interna/contatos", async (req, res, proximo) => {
  try {
    // Pedido de VISITA e do imovel: o corretor ve so os dos imoveis dele.
    // "Quero anunciar" e oportunidade de captacao: todos veem.
    const eu = req.session.usuario;
    const admin = eu.perfil === "ADMIN";
    const { rows } = await pool.query(
      `SELECT c.*, i.codigo AS imovel_codigo FROM contatos c LEFT JOIN imoveis i ON i.id = c.imovel_id
        ${admin ? "" : "WHERE c.tipo <> 'VISITA' OR i.criado_por = $1"}
        ORDER BY c.criado_em DESC LIMIT 200`, admin ? [] : [eu.id]);
    res.send(vista.pagina({
      titulo: "Contatos do site", interna: true, usuario: eu,
      corpo: `<h1 class="titulo-secao">Contatos do site</h1>
        <p class="dica">${admin ? "Você vê todos os contatos." :
          "Você vê os pedidos de visita dos seus imóveis e todos os pedidos de anúncio."}</p>
        <section class="lista">${rows.map((c) => `<div class="item">
          <span class="txt"><strong>${vista.e(c.nome)} · ${vista.e(c.telefone)}</strong>
          <span>${vista.e(c.tipo)}${c.imovel_codigo ? " · imóvel " + vista.e(c.imovel_codigo) : ""} · ${vista.e(new Date(c.criado_em).toLocaleString("pt-BR"))}
            ${c.email ? " · " + vista.e(c.email) : ""}</span>
          <span>${vista.e(c.mensagem)}</span></span></div>`).join("")
          || `<p class="vazio">Nenhum contato ainda.</p>`}</section>`,
    }));
  } catch (erro) { proximo(erro); }
});

/* ------------------------------------------------ erros e subida */
app.use((req, res) => res.status(404).send(vista.pagina({
  titulo: "Página não encontrada", interna: req.path.startsWith("/interna"),
  corpo: vista.recado("Página não encontrada", "O endereço pode ter mudado.", ["/", "Voltar ao início"]),
})));

app.use((erro, req, res, proximo) => {
  console.error("erro:", erro && erro.message);
  const codigo = erro && erro.message === "tipo de imagem nao aceito" ? 400 : 500;
  if (req.path.startsWith("/interna/api/") || req.path.startsWith("/api/")) {
    return res.status(codigo).json({ erro: codigo === 400 ? erro.message : "falha no servidor" });
  }
  res.status(codigo).send(vista.pagina({
    titulo: "Erro", interna: req.path.startsWith("/interna"),
    corpo: vista.recado("Algo deu errado", "Tente de novo. Se continuar, avise a Tripac.", ["/", "Voltar ao início"]),
  }));
});

const porta = process.env.PORT || 3000;
preparar()
  .then(async () => {
    const semeado = await auth.semearAdministrador();
    if (semeado.criado) console.log("administrador criado a partir de ADMIN_EMAIL");
    if (semeado.redefinido) console.log("senha do administrador REDEFINIDA pelo painel - apague ADMIN_REDEFINIR e ADMIN_SENHA");
    else if (process.env.ADMIN_REDEFINIR) console.log("ADMIN_REDEFINIR: " + (semeado.motivo || "nada feito"));
    app.listen(porta, () => console.log("no ar na porta " + porta));
  })
  .catch((erro) => { console.error("nao subiu:", erro.message); process.exit(1); });
