"use strict";
/**
 * As paginas. Sem motor de template: string com escape em todo valor.
 *
 * Dois desenhos, de proposito: a AREA INTERNA (captacao pelo celular) fica com
 * o leiaute dela, que funciona e que quem capta ja conhece; o SITE PUBLICO tem
 * o desenho da vitrine, com o logo da Tripac. Nada do que e interno aparece
 * aqui: as paginas publicas so recebem o que passou por modelo.paraOPublico().
 */
const fs = require("fs");
const path = require("path");
const { moeda } = require("./modelo");
const empresa = require("./empresa");

const WHATSAPP = empresa.whatsapp;

function linkWhatsApp(mensagem) {
  if (!WHATSAPP) return "";
  return "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(mensagem);
}

function e(valor) {
  return String(valor === undefined || valor === null ? "" : valor)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * A foto da cidade no alto da pagina inicial. Mora em public/img/caragua.jpg;
 * o credito (exigido por foto de licenca livre) vai em public/img/caragua.txt.
 * Sem o arquivo, a capa usa a foto do imovel mais recente - e, sem nenhuma
 * foto, um fundo da marca. Desenho imitando foto, nunca mais.
 */
/**
 * O endereco de cada arquivo leva a impressao digital do conteudo
 * (/vitrine.css?v=3f9a1c2b). O servidor manda o navegador guardar os arquivos
 * por 1 hora; com o mesmo nome, o Safari que ja tinha aberto o site juntou a
 * pagina NOVA com o visual ANTIGO guardado - "tudo bugado" no Safari e normal
 * no Chrome, em 22/10/2026. Com a impressao no endereco, arquivo novo e
 * endereco novo, e nenhum navegador usa o velho.
 */
const crypto = require("crypto");
const PASTA_PUBLICA = path.join(__dirname, "..", "public");
function versionado(arquivo) {
  try {
    const conteudo = fs.readFileSync(path.join(PASTA_PUBLICA, arquivo));
    return "/" + arquivo + "?v=" + crypto.createHash("md5").update(conteudo).digest("hex").slice(0, 10);
  } catch { return "/" + arquivo; }
}
const ARQUIVO = {
  estilo: versionado("estilo.css"), vitrine: versionado("vitrine.css"),
  vitrineJs: versionado("vitrine.js"), captacao: versionado("captacao.js"),
};

const PASTA_IMG = path.join(__dirname, "..", "public", "img");
const FOTO_CIDADE = fs.existsSync(path.join(PASTA_IMG, "caragua.jpg")) ? "/img/caragua.jpg" : "";
const CREDITO_CIDADE = fs.existsSync(path.join(PASTA_IMG, "caragua.txt"))
  ? fs.readFileSync(path.join(PASTA_IMG, "caragua.txt"), "utf8").trim() : "";

/* ------------------------------------------------ pequenas ajudas */

/** "SALA COMERCIAL" -> "Sala comercial". */
function escrito(valor) {
  const t = String(valor || "").trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function finalidadeEscrita(finalidade) {
  const f = String(finalidade || "");
  if (/ALUGAR/.test(f) && /VENDER/.test(f)) return "Aluguel ou venda";
  return /ALUGAR/.test(f) ? "Para alugar" : /VENDER/.test(f) ? "À venda" : "";
}

/**
 * O nome do imovel numa frase, para titulo e para o texto alternativo das fotos
 * ("Apartamento em Martim de Sa, Caraguatatuba"). Foto com alt="" e foto que o
 * leitor de tela anuncia como "imagem" e o Google nao sabe do que e.
 */
function nomeDoImovel(imovel) {
  if (imovel.titulo) return imovel.titulo;
  const onde = [imovel.bairro, imovel.cidade].filter(Boolean).join(", ");
  return escrito(imovel.tipo || "Imóvel") + (onde ? " em " + onde : "");
}

function capaDe(imovel) {
  const fotos = imovel.fotos || [];
  return fotos.find((f) => f.capa) || fotos[0];
}

function precoPrincipal(imovel) {
  if (imovel.valor_aluguel) return { valor: moeda(imovel.valor_aluguel), sufixo: "/mês" };
  if (imovel.valor_venda) return { valor: moeda(imovel.valor_venda), sufixo: "" };
  return { valor: "Consulte", sufixo: "" };
}

/** Icones de linha, desenhados aqui: nada de biblioteca de fora (a CSP nao deixa, e nao precisa). */
const ICONE = {
  dorm: '<path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 14h18M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M3 18v2M21 18v2"/>',
  banho: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3zM6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2"/>',
  vaga: '<path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M7.5 13h.01M16.5 13h.01"/>',
  area: '<path d="M4 4h16v16H4zM4 9h3M4 14h3M9 4v3M14 4v3"/>',
  local: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  zap: '<path d="M20 11.5A8.5 8.5 0 0 1 7.6 19L3 20.5l1.5-4.4A8.5 8.5 0 1 1 20 11.5z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 1c-1.2-.5-2.4-1.7-2.9-2.9l1-1-1-2L9 8.5z"/>',
  escudo: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
  conversa: '<path d="M4 5h16v11H9l-5 4V5z"/><path d="M8 10h8M8 13h5"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
function icone(nome, classe) {
  return `<svg class="icone ${classe || ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONE[nome]}</svg>`;
}

function tracos(imovel) {
  return [
    imovel.dormitorios && [icone("dorm"), imovel.dormitorios + (Number(imovel.dormitorios) === 1 ? " dorm." : " dorms.")],
    imovel.banheiros && [icone("banho"), imovel.banheiros + (Number(imovel.banheiros) === 1 ? " banh." : " banhs.")],
    imovel.vagas && [icone("vaga"), imovel.vagas + (Number(imovel.vagas) === 1 ? " vaga" : " vagas")],
    imovel.area && [icone("area"), imovel.area + " m²"],
  ].filter(Boolean);
}

/* ------------------------------------------------ etiquetas do WhatsApp/Google */

/**
 * As etiquetas que o WhatsApp, o Facebook e o Google leem quando alguem cola o
 * link: sem elas, o link do imovel chega no WhatsApp sem foto e sem titulo.
 * Pedem endereco completo (https://...), por isso 'social.url' e 'social.imagem'
 * ja chegam absolutos. Sem foto, vai o logo (social.site + /marca/compartilhar.jpg).
 */
function etiquetasSociais(social, titulo, descricao) {
  if (!social || !social.url) return "";
  const texto = descricao || "Locação e venda de imóveis em Caraguatatuba e região.";
  const imagem = social.imagem || (social.site ? social.site + "/marca/compartilhar.jpg" : "");
  return `
<link rel="canonical" href="${e(social.url)}">
<meta property="og:site_name" content="${e(empresa.nome)}">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="website">
<meta property="og:title" content="${e(titulo)}">
<meta property="og:description" content="${e(texto)}">
<meta property="og:url" content="${e(social.url)}">${imagem ? `
<meta property="og:image" content="${e(imagem)}">
<meta property="og:image:alt" content="${e(titulo)}">` : ""}
<meta name="twitter:card" content="${imagem ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${e(titulo)}">
<meta name="twitter:description" content="${e(texto)}">`;
}

/* ------------------------------------------------ o leiaute */

function pagina(opcoes) {
  return opcoes.interna ? paginaInterna(opcoes) : paginaPublica(opcoes);
}

/** A area interna, como sempre foi: quem capta pelo celular ja conhece esta tela. */
function paginaInterna({ titulo, corpo, usuario }) {
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${e(titulo)} · ${e(empresa.nome)}</title>
<meta name="description" content="Locação e venda de imóveis em Caraguatatuba e região.">
<link rel="icon" href="/marca/favicon-32.png">
<link rel="stylesheet" href="${ARQUIVO.estilo}">
</head><body class="interna">
<header class="topo">
  <a class="marca" href="/interna">TRIPAC<span> · Área interna</span></a>
  <nav>
    <a href="/interna">Captações</a><a href="/interna/contatos">Contatos</a>${usuario && usuario.perfil === "ADMIN" ? '<a href="/interna/usuarios">Usuários</a>' : ""}<a href="/interna/senha">Senha</a><a href="/" target="_blank" rel="noopener">Ver o site</a><a href="/interna/sair">Sair</a>
  </nav>
  ${usuario ? `<span class="quem">${e(usuario.nome || usuario.email)}</span>` : ""}
</header>
<main id="conteudo">${corpo}</main>
<footer>
  <p>${e(empresa.nome)} · ${e(empresa.cidade)}/${e(empresa.uf)}</p>
</footer>
</body></html>`;
}

function paginaPublica({ titulo, corpo, descricao, social, ativo, semTituloDaMarca, classe }) {
  const item = (href, texto, chave) =>
    `<a href="${href}"${ativo === chave ? ' aria-current="page"' : ""}>${texto}</a>`;
  const contato = [
    WHATSAPP && `<a href="${e(linkWhatsApp("Olá! Vim pelo site da Tripac."))}" target="_blank" rel="noopener">${icone("zap")} ${e(empresa.telefone)}</a>`,
    empresa.email && `<a href="mailto:${e(empresa.email)}">${e(empresa.email)}</a>`,
    empresa.instagram && `<a href="https://instagram.com/${e(empresa.instagram)}" target="_blank" rel="noopener">@${e(empresa.instagram)}</a>`,
  ].filter(Boolean);
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${e(semTituloDaMarca ? titulo : titulo + " · " + empresa.nome)}</title>
<meta name="description" content="${e(descricao || "Locação e venda de imóveis em Caraguatatuba e região, com a segurança jurídica da Tripac.")}">${etiquetasSociais(social, titulo, (social && social.descricao) || descricao)}
<meta name="theme-color" content="#6E5446">
<link rel="icon" href="/marca/favicon-32.png">
<link rel="apple-touch-icon" href="/marca/icone-180.png">
<link rel="stylesheet" href="${ARQUIVO.vitrine}">
<script src="${ARQUIVO.vitrineJs}" defer></script>
</head><body class="publico${classe ? " " + e(classe) : ""}">
<a class="pular-conteudo" href="#conteudo">Pular para o conteúdo</a>
<header class="cabecalho">
  <div class="cabecalho-dentro">
    <a class="logo" href="/" aria-label="${e(empresa.nome)}, página inicial">
      <img src="/marca/casa.png" alt="" width="52" height="49">
      <span><strong>${e(empresa.marca)}</strong><small>${e(empresa.complemento)}</small></span>
    </a>
    <nav class="menu" aria-label="Principal">
      ${item("/alugar", "Alugar", "alugar")}
      ${item("/comprar", "Comprar", "comprar")}
      ${item("/#quem-somos", "A Tripac", "")}
      <a class="menu-anuncie" href="/anuncie"${ativo === "anuncie" ? ' aria-current="page"' : ""}>Anuncie<span class="menu-extra"> seu imóvel</span></a>
    </nav>
  </div>
</header>
<main id="conteudo">${corpo}</main>
<footer class="rodape">
  <div class="rodape-dentro">
    <div class="rodape-marca">
      <img src="/marca/logo-branco.png" alt="${e(empresa.nome)}" width="120" height="156">
      <p>Locação, venda e administração de imóveis em ${e(empresa.cidade)} e região, com contratos revisados por advogados.</p>
    </div>
    <div>
      <h2>Imóveis</h2>
      <a href="/alugar">Para alugar</a>
      <a href="/comprar">À venda</a>
      <a href="/anuncie">Anunciar meu imóvel</a>
      <a class="rodape-equipe" href="/interna">Área interna · captação</a>
    </div>
    <div>
      <h2>Contato</h2>
      ${contato.join("\n      ") || "<span>Em breve.</span>"}
    </div>
  </div>
  <div class="rodape-legal">
    <p>${e(empresa.nome)} · CNPJ ${e(empresa.cnpj)} · CRECI/SP ${e(empresa.creciEmpresa)}
      · Responsável: ${e(empresa.responsavel)}, CRECI/SP ${e(empresa.creciResponsavel)}</p>
    <p><a href="/privacidade">Política de privacidade</a> · <a href="/interna">Área interna</a>${CREDITO_CIDADE
      ? ` · Foto de ${e(empresa.cidade)}: ${e(CREDITO_CIDADE)}` : ""}</p>
  </div>
</footer>${WHATSAPP ? `
<a class="whats-flutuante" href="${e(linkWhatsApp("Olá! Vim pelo site da Tripac."))}" target="_blank" rel="noopener"
   aria-label="Falar com a Tripac pelo WhatsApp">${icone("zap")}<span>WhatsApp</span></a>` : ""}
</body></html>`;
}

/* ------------------------------------------------ busca */

/** As opcoes dos filtros saem do que esta no ar: nunca oferecer bairro sem imovel. */
function opcoesDaBusca(imoveis) {
  const unicos = (campo) => [...new Set(imoveis.map((i) => String(i[campo] || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { bairros: unicos("bairro"), tipos: unicos("tipo") };
}

function selecao(nome, rotulo, valores, atual, primeiro, mostrar) {
  return `<label class="campo"><span>${rotulo}</span><select name="${nome}">
    ${primeiro === null ? "" : `<option value="">${primeiro}</option>`}
    ${valores.map((v) => {
      const [valor, texto] = Array.isArray(v) ? v : [v, mostrar ? mostrar(v) : v];
      return `<option value="${e(valor)}"${String(atual || "") === String(valor) ? " selected" : ""}>${e(texto)}</option>`;
    }).join("")}
  </select></label>`;
}

const DORMITORIOS = [["1", "1 ou mais"], ["2", "2 ou mais"], ["3", "3 ou mais"], ["4", "4 ou mais"]];
const ORDENS = [["recentes", "Mais recentes"], ["menor", "Menor valor"], ["maior", "Maior valor"]];

function formularioDeBusca({ acao, filtros, opcoes, naCapa }) {
  const f = filtros || {};
  const finalidade = naCapa ? `
    <fieldset class="abas-busca"><legend class="so-leitor">O que você procura</legend>
      <label><input type="radio" name="f" value="alugar"${f.f !== "comprar" ? " checked" : ""}><span>Alugar</span></label>
      <label><input type="radio" name="f" value="comprar"${f.f === "comprar" ? " checked" : ""}><span>Comprar</span></label>
    </fieldset>` : "";
  return `<form class="busca${naCapa ? " busca-capa" : ""}" method="get" action="${e(acao)}" role="search">${finalidade}
    <div class="busca-campos">
      ${selecao("tipo", "Tipo", opcoes.tipos, f.tipo, "Todos os tipos", escrito)}
      ${selecao("bairro", "Bairro", opcoes.bairros, f.bairro, "Todos os bairros")}
      ${selecao("dorm", "Dormitórios", DORMITORIOS, f.dorm, "Qualquer")}
      <label class="campo"><span>Valor até</span><input name="ate" inputmode="numeric" placeholder="R$" value="${e(f.ate || "")}"></label>
      ${naCapa ? "" : selecao("ordem", "Ordenar", ORDENS, f.ordem || "recentes", null)}
      <button class="botao primario">Buscar</button>
    </div>
  </form>`;
}

/* ------------------------------------------------ cartao */

function cartaoImovel(imovel) {
  const capa = capaDe(imovel);
  const preco = precoPrincipal(imovel);
  const quantas = (imovel.fotos || []).length;
  return `<a class="cartao" href="/imovel/${e(encodeURIComponent(imovel.codigo))}">
    <div class="cartao-foto">
      ${capa ? `<img src="${e(capa.url)}" alt="${e(nomeDoImovel(imovel))}" loading="lazy">`
             : `<div class="sem-foto"><img src="/marca/casa.png" alt="" width="60"><span>Fotos em breve</span></div>`}
      <span class="selo">${e(finalidadeEscrita(imovel.finalidade))}</span>
      ${quantas > 1 ? `<span class="contagem-fotos">${quantas} fotos</span>` : ""}
    </div>
    <div class="cartao-dados">
      <p class="cartao-onde">${icone("local")} ${e([imovel.bairro, imovel.cidade].filter(Boolean).join(", "))}</p>
      <h3>${e(nomeDoImovel(imovel))}</h3>
      <ul class="tracos">${tracos(imovel).map(([i, t]) => `<li>${i}${e(t)}</li>`).join("")}</ul>
      <p class="cartao-preco"><strong>${e(preco.valor)}</strong>${preco.sufixo ? `<span>${preco.sufixo}</span>` : ""}</p>
      ${imovel.valor_aluguel && imovel.valor_venda ? `<p class="cartao-venda">Venda: ${e(moeda(imovel.valor_venda))}</p>` : ""}
    </div></a>`;
}

function semResultado(busca, acao) {
  return `<div class="vazio">
    <img src="/marca/casa.png" alt="" width="56">
    <h3>${busca ? "Nenhum imóvel com esses filtros agora" : "Novos imóveis chegando"}</h3>
    <p>${busca ? "Tente tirar um filtro, ou conte o que você procura: a Tripac avisa quando entrar." :
      "Estamos captando. Conte o que você procura e avisamos quando entrar."}</p>
    <p class="vazio-acoes">${busca ? `<a class="botao contorno" href="${e(acao)}">Ver todos</a>` : ""}
      ${WHATSAPP ? `<a class="botao whats" href="${e(linkWhatsApp("Olá! Estou procurando um imóvel em Caraguatatuba e gostaria de ajuda."))}" target="_blank" rel="noopener">${icone("zap")} Falar com a Tripac</a>` : ""}</p>
  </div>`;
}

/* ------------------------------------------------ pagina inicial */

function paginaInicial(imoveis, social) {
  const opcoes = opcoesDaBusca(imoveis);
  const comFoto = imoveis.find((i) => capaDe(i));
  const fotoCapa = FOTO_CIDADE || (comFoto ? capaDe(comFoto).url : "");
  const locacoes = imoveis.filter((i) => /ALUGAR/.test(i.finalidade));
  const vendas = imoveis.filter((i) => /VENDER/.test(i.finalidade));
  const secao = (id, sobre, tituloSecao, lista, link, rotulo) => `
    <section class="secao" aria-labelledby="${id}">
      <div class="secao-cabecalho">
        <div><p class="sobretitulo">${sobre}</p><h2 id="${id}">${tituloSecao}</h2></div>
        <a class="link-seta" href="${link}">${rotulo} ${icone("seta")}</a>
      </div>
      ${lista.length ? `<div class="grade">${lista.slice(0, 6).map(cartaoImovel).join("")}</div>` : semResultado(false, link)}
    </section>`;
  return pagina({
    titulo: `${empresa.nome} · Imóveis em ${empresa.cidade}`, semTituloDaMarca: true, social,
    descricao: `Casas e apartamentos para alugar e comprar em ${empresa.cidade} e região, com contrato revisado por advogados.`,
    corpo: `
    <section class="capa${fotoCapa ? "" : " capa-marca"}">
      ${fotoCapa ? `<img class="capa-foto" src="${e(fotoCapa)}" alt="" fetchpriority="high">` : ""}
      <div class="capa-dentro">
        <p class="sobretitulo claro">${e(empresa.cidade)} · Litoral Norte de São Paulo</p>
        <h1>O imóvel certo no litoral, com contrato seguro do começo ao fim.</h1>
        <p class="capa-texto">Locação e venda com a Tripac: cada contrato passa pela revisão de advogados antes da assinatura.</p>
        ${formularioDeBusca({ acao: "/buscar", opcoes, naCapa: true })}
      </div>
    </section>

    <div class="selos-confianca">
      <div>${icone("escudo")}<p><strong>Contrato revisado</strong><span>por advogados, antes de assinar</span></p></div>
      <div>${icone("chave")}<p><strong>Administração completa</strong><span>cobrança, repasse e reajuste</span></p></div>
      <div>${icone("conversa")}<p><strong>Atendimento direto</strong><span>quem atende conhece o imóvel</span></p></div>
    </div>

    ${secao("titulo-alugar", "Locação", "Imóveis para alugar", locacoes, "/alugar", "Ver todos para alugar")}
    ${vendas.length ? secao("titulo-comprar", "Venda", "Imóveis à venda", vendas, "/comprar", "Ver todos à venda") : ""}

    <section class="quem-somos" id="quem-somos">
      <div class="quem-somos-texto">
        <p class="sobretitulo">A Tripac</p>
        <h2>Imobiliária e advocacia, lado a lado.</h2>
        <p>A Tripac nasceu da advocacia. Por isso cada locação e cada venda passa pela mesma mesa:
          o contrato é escrito e conferido por advogados, a garantia é analisada antes de a chave mudar de mão,
          e o proprietário acompanha cobrança, repasse e reajuste sem surpresa.</p>
        <p class="assinatura">${e(empresa.responsavel)} · CRECI/SP ${e(empresa.creciResponsavel)}</p>
      </div>
      <img src="/marca/logo.png" alt="${e(empresa.nome)}" width="200" height="261" loading="lazy">
    </section>

    <section class="convite">
      <div>
        <p class="sobretitulo claro">Para proprietários</p>
        <h2>Tem um imóvel para alugar ou vender?</h2>
        <p>A Tripac avalia, fotografa, anuncia e cuida do contrato. Você acompanha tudo.</p>
      </div>
      <a class="botao claro" href="/anuncie">Anunciar meu imóvel ${icone("seta")}</a>
    </section>`,
  });
}

/* ------------------------------------------------ listas */

function listaPublica({ titulo, subtitulo, imoveis, total, filtros, opcoes, acao, paginaAtual, paginas, social, ativo }) {
  const algumFiltro = ["tipo", "bairro", "dorm", "ate", "q"].some((c) => filtros[c]);
  const linkDaPagina = (n) => {
    const q = new URLSearchParams();
    for (const [c, v] of Object.entries(filtros)) if (v) q.set(c, v);
    if (n > 1) q.set("pagina", n);
    const s = q.toString();
    return acao + (s ? "?" + s : "");
  };
  const paginacao = paginas > 1 ? `<nav class="paginacao" aria-label="Páginas">
    ${paginaAtual > 1 ? `<a href="${e(linkDaPagina(paginaAtual - 1))}" rel="prev">Anterior</a>` : ""}
    ${Array.from({ length: paginas }, (_, i) => i + 1).map((n) => n === paginaAtual
      ? `<span aria-current="page">${n}</span>` : `<a href="${e(linkDaPagina(n))}">${n}</a>`).join("")}
    ${paginaAtual < paginas ? `<a href="${e(linkDaPagina(paginaAtual + 1))}" rel="next">Próxima</a>` : ""}
  </nav>` : "";
  return pagina({
    titulo, descricao: subtitulo, social, ativo,
    corpo: `<section class="faixa-titulo"><div>
      <p class="sobretitulo">${e(empresa.cidade)} e região</p>
      <h1>${e(titulo)}</h1>
      <p>${e(subtitulo)}</p></div></section>
    <div class="conteudo-largo">
      ${formularioDeBusca({ acao, filtros, opcoes })}
      <p class="resultado">${total === 1 ? "1 imóvel encontrado" : total + " imóveis encontrados"}${algumFiltro ? ` · <a href="${e(acao)}">limpar filtros</a>` : ""}</p>
      ${imoveis.length ? `<div class="grade">${imoveis.map(cartaoImovel).join("")}</div>` : semResultado(algumFiltro, acao)}
      ${paginacao}
    </div>`,
  });
}

/* ------------------------------------------------ pagina do imovel */

/** "R$ 2.500,00/mês · 2 dorm. · 72 m² · Martim de Sá, Caraguatatuba": o que se quer ver no WhatsApp. */
function resumoDoImovel(imovel) {
  return [
    imovel.valor_aluguel ? moeda(imovel.valor_aluguel) + "/mês" : moeda(imovel.valor_venda),
    imovel.dormitorios && imovel.dormitorios + " dorm.",
    imovel.area && imovel.area + " m²",
    [imovel.bairro, imovel.cidade].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");
}

function consentimento() {
  return `<p class="nota">Ao enviar, você concorda com a nossa <a href="/privacidade">política de privacidade</a>.
    Seus dados servem só para a Tripac responder a você.</p>`;
}

function paginaImovel(imovel, social) {
  const fotos = imovel.fotos || [];
  const nome = nomeDoImovel(imovel);
  const preco = precoPrincipal(imovel);
  const aluguel = Number(imovel.valor_aluguel) || 0;
  const total = aluguel + (Number(imovel.condominio) || 0) + (Number(imovel.iptu) || 0);
  const ficha = [
    ["Tipo", escrito(imovel.tipo)], ["Finalidade", finalidadeEscrita(imovel.finalidade)],
    ["Dormitórios", imovel.dormitorios], ["Suítes", imovel.suites],
    ["Banheiros", imovel.banheiros], ["Vagas", imovel.vagas],
    ["Área", imovel.area && imovel.area + " m²"], ["Andar", imovel.andar],
    ["Mobília", imovel.mobiliado === "SIM" ? "Mobiliado" : imovel.mobiliado === "SEMI" ? "Semimobiliado" : ""],
    ["Bairro", imovel.bairro], ["Cidade", [imovel.cidade, imovel.uf].filter(Boolean).join(" / ")],
  ].filter(([, v]) => String(v || "").trim() !== "");
  const galeria = fotos.length ? `
    <div class="galeria galeria-${Math.min(fotos.length, 5)}" data-galeria>
      ${fotos.map((f, n) => `<a href="${e(f.url)}" class="galeria-item" data-indice="${n}">
        <img src="${e(f.url)}" alt="${e(nome + " — foto " + (n + 1) + " de " + fotos.length)}"${n ? ' loading="lazy"' : ' fetchpriority="high"'}>
        ${n === 4 && fotos.length > 5 ? `<span class="mais-fotos">+${fotos.length - 5} fotos</span>` : ""}
        <span class="foto-numero">${n + 1}/${fotos.length}</span></a>`).join("")}
    </div>` : `<div class="galeria-vazia"><img src="/marca/casa.png" alt="" width="70"><p>Fotos deste imóvel em breve.</p></div>`;
  return pagina({
    titulo: nome,
    descricao: (imovel.descricao || resumoDoImovel(imovel)).slice(0, 160),
    social: social && { ...social, descricao: resumoDoImovel(imovel) },
    ativo: /VENDER/.test(imovel.finalidade) && !/ALUGAR/.test(imovel.finalidade) ? "comprar" : "alugar",
    classe: "whats-no-painel",
    corpo: `<div class="conteudo-largo imovel">
      <nav class="migalhas" aria-label="Você está em">
        <a href="/">Início</a> <span aria-hidden="true">›</span>
        ${/ALUGAR/.test(imovel.finalidade) ? '<a href="/alugar">Alugar</a>' : '<a href="/comprar">Comprar</a>'} <span aria-hidden="true">›</span>
        <span>${e(imovel.bairro || nome)}</span>
      </nav>
      ${galeria}
      <div class="imovel-colunas">
        <div class="imovel-principal">
          <p class="selo-texto">${e(finalidadeEscrita(imovel.finalidade))} · Código ${e(imovel.codigo)}</p>
          <h1>${e(nome)}</h1>
          <p class="imovel-onde">${icone("local")} ${e([imovel.bairro, imovel.cidade, imovel.uf].filter(Boolean).join(", "))}</p>
          <ul class="tracos tracos-grandes">${tracos(imovel).map(([i, t]) => `<li>${i}${e(t)}</li>`).join("")}</ul>
          ${imovel.descricao ? `<h2>Sobre o imóvel</h2><p class="descricao">${e(imovel.descricao)}</p>` : ""}
          <h2>Ficha</h2>
          <dl class="ficha">${ficha.map(([r, v]) => `<div><dt>${e(r)}</dt><dd>${e(v)}</dd></div>`).join("")}</dl>
          <p class="nota">O endereço completo é passado ao agendar a visita.</p>
        </div>
        <aside class="painel">
          <p class="painel-preco"><strong>${e(preco.valor)}</strong>${preco.sufixo ? `<span>${preco.sufixo}</span>` : ""}</p>
          <dl class="painel-valores">
            ${aluguel && imovel.valor_venda ? `<div><dt>Venda</dt><dd>${e(moeda(imovel.valor_venda))}</dd></div>` : ""}
            ${imovel.condominio ? `<div><dt>Condomínio</dt><dd>${e(moeda(imovel.condominio))}</dd></div>` : ""}
            ${imovel.iptu ? `<div><dt>IPTU</dt><dd>${e(moeda(imovel.iptu))}</dd></div>` : ""}
            ${aluguel && total > aluguel ? `<div class="painel-total"><dt>Total por mês</dt><dd>${e(moeda(total))}</dd></div>` : ""}
          </dl>
          ${WHATSAPP ? `<a class="botao whats largo" target="_blank" rel="noopener" href="${e(linkWhatsApp(
            "Olá! Vi no site o imóvel " + imovel.codigo + " (" + nome + ") e quero saber mais."))}">${icone("zap")} Conversar pelo WhatsApp</a>` : ""}
          <form class="visita" method="post" action="/visita">
            <h2>Agendar visita</h2>
            <input type="hidden" name="imovel" value="${e(imovel.id)}">
            <label class="campo"><span>Nome</span><input name="nome" required maxlength="120" autocomplete="name"></label>
            <label class="campo"><span>Telefone / WhatsApp</span><input name="telefone" required maxlength="40" inputmode="tel" autocomplete="tel"></label>
            <label class="campo"><span>E-mail (opcional)</span><input name="email" type="email" maxlength="120" autocomplete="email"></label>
            <label class="campo"><span>Melhor dia e horário</span><textarea name="mensagem" maxlength="1000" rows="2" placeholder="Ex.: sábado de manhã"></textarea></label>
            <button class="botao primario largo">Quero visitar</button>
            ${consentimento()}
          </form>
        </aside>
      </div>
    </div>`,
  });
}

/* ------------------------------------------------ proprietario e textos */

function paginaAnuncie() {
  return {
    titulo: "Anuncie seu imóvel",
    descricao: "Quer alugar ou vender? A Tripac avalia, fotografa, anuncia e cuida do contrato.",
    ativo: "anuncie",
    classe: "whats-no-painel",
    corpo: `<section class="faixa-titulo"><div>
      <p class="sobretitulo">Para proprietários</p>
      <h1>Anuncie seu imóvel com a Tripac</h1>
      <p>Avaliação, fotos, anúncio, seleção do inquilino ou comprador e contrato revisado por advogados.</p></div></section>
    <div class="conteudo-largo anuncie">
      <ol class="passos">
        <li><strong>Você conta</strong><span>Preencha ao lado ou chame no WhatsApp. Retornamos no mesmo dia útil.</span></li>
        <li><strong>A Tripac avalia</strong><span>Visita, valor de mercado, fotos e conferência da documentação.</span></li>
        <li><strong>Anunciamos</strong><span>Com a sua autorização por escrito, o imóvel entra no site e nas redes.</span></li>
        <li><strong>Contrato seguro</strong><span>Garantia analisada e contrato escrito por advogados.</span></li>
      </ol>
      <form class="formulario" method="post" action="/anuncie">
        <h2>Conte sobre o imóvel</h2>
        <label class="campo"><span>Seu nome</span><input name="nome" required maxlength="120" autocomplete="name"></label>
        <label class="campo"><span>Telefone / WhatsApp</span><input name="telefone" required maxlength="40" inputmode="tel" autocomplete="tel"></label>
        <label class="campo"><span>E-mail (opcional)</span><input name="email" type="email" maxlength="120" autocomplete="email"></label>
        <label class="campo"><span>Sobre o imóvel</span><textarea name="mensagem" maxlength="1000" rows="4"
          placeholder="Tipo, bairro, quantos dormitórios, se é para alugar ou vender"></textarea></label>
        <button class="botao primario largo">Enviar</button>
        ${WHATSAPP ? `<a class="botao whats largo" target="_blank" rel="noopener" href="${e(linkWhatsApp("Olá! Quero anunciar meu imóvel com a Tripac."))}">${icone("zap")} Prefiro pelo WhatsApp</a>` : ""}
        ${consentimento()}
      </form>
    </div>`,
  };
}

function paginaPrivacidade() {
  return {
    titulo: "Política de privacidade",
    descricao: "Como a Tripac trata os dados de quem usa o site.",
    corpo: `<section class="faixa-titulo"><div><h1>Política de privacidade</h1>
      <p>Como a ${e(empresa.nome)} trata os seus dados, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p></div></section>
    <div class="conteudo-largo texto-corrido">
      <h2>Que dados recebemos</h2>
      <p>Só o que você digita nos formulários: nome, telefone, e-mail e a mensagem. O site não usa cookies de
        propaganda nem ferramentas de rastreamento de terceiros.</p>
      <h2>Para que usamos</h2>
      <p>Para responder ao seu contato, agendar visitas e avaliar o imóvel que você quer anunciar.
        Não vendemos nem cedemos os seus dados a ninguém.</p>
      <h2>Por quanto tempo</h2>
      <p>Pelo tempo do atendimento e, se virar contrato, pelo prazo que a lei exige para ele.</p>
      <h2>Seus direitos</h2>
      <p>Você pode pedir a qualquer momento para ver, corrigir ou apagar os seus dados${empresa.email
        ? `, pelo e-mail <a href="mailto:${e(empresa.email)}">${e(empresa.email)}</a>` : ""}${WHATSAPP
        ? ` ou pelo WhatsApp ${e(empresa.telefone)}` : ""}.</p>
      <h2>Imóveis anunciados</h2>
      <p>Nenhum imóvel é anunciado sem autorização do proprietário, e o endereço completo não é publicado:
        ele é passado a quem agenda a visita.</p>
    </div>`,
  };
}

/** Recado curto depois de um envio ou de um erro, no desenho da vitrine. 'texto' ja vem em HTML. */
function recado(titulo, texto, link) {
  return `<section class="faixa-titulo recado"><div>
    <h1>${e(titulo)}</h1><p>${texto}</p>
    ${link ? `<p><a class="botao primario" href="${e(link[0])}">${e(link[1])}</a></p>` : ""}</div></section>`;
}

module.exports = {
  ARQUIVO, e, linkWhatsApp, pagina, paginaInicial, nomeDoImovel, cartaoImovel, listaPublica, paginaImovel,
  paginaAnuncie, paginaPrivacidade, opcoesDaBusca, recado,
};
