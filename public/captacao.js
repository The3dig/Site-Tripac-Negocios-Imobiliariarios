"use strict";
/**
 * A captacao pelo celular: sete passos, fotos da camera e salvamento sozinho.
 *
 * Tudo o que se digita vai para o servidor depois de uma pausa (900 ms), e
 * tambem fica guardado neste aparelho. Se a internet cair, o rascunho local
 * continua e sobe quando a conexao volta.
 */
(function () {
  var raiz = document.getElementById("captacao");
  if (!raiz) return;
  var ID = raiz.dataset.id;
  var API = "/interna/api/captacao/" + ID;
  var MAX_LADO = 1600, QUALIDADE = 0.82;
  var PASSOS = ["Proprietário", "Imóvel", "Valores", "Características", "Fotos", "Captação", "Revisar"];
  var ESTADOS = [["RASCUNHO","Rascunho"],["REVISAO","Aguardando revisão"],
                 ["PUBLICADO","Publicado / no ar"],["PAUSADO","Pausado"],["ARQUIVADO","Arquivado"]];
  var TIPOS = ["APARTAMENTO","CASA","SALA COMERCIAL","LOJA","TERRENO","GALPÃO","OUTRO"];
  var FINALIDADES = ["ALUGAR","VENDER","ALUGAR OU VENDER"];

  var dado = null, passo = 0, relogio = null, salvando = false, pendente = false;

  function e(v){ return v === undefined || v === null ? "" : String(v); }
  function chave(){ return "captacao:" + ID; }
  function guardarLocal(){ try { localStorage.setItem(chave(), JSON.stringify(dado)); } catch (x) {} }
  function lerLocal(){ try { var b = localStorage.getItem(chave()); return b ? JSON.parse(b) : null; } catch (x) { return null; } }

  function estado(classe, texto){
    var el = document.getElementById("estado-salvar");
    if (!el) return;
    el.className = "estado " + (classe || "");
    el.textContent = texto;
  }

  function pedirSalvar(){
    pendente = true; guardarLocal(); estado("indo", "Salvando…");
    clearTimeout(relogio); relogio = setTimeout(salvar, 900);
  }

  function salvar(){
    if (!pendente || salvando) return Promise.resolve();
    salvando = true; pendente = false;
    return fetch(API, {
      method: "PUT", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({publico: dado.publico, interno: dado.interno, status: dado.status}),
    }).then(function (r){
      if (r.status === 401) { estado("erro", "Sessão expirou — entre de novo"); return; }
      if (!r.ok) throw new Error("falhou");
      estado("ok", "Salvo " + new Date().toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"}));
    }).catch(function (){
      pendente = true;
      estado("erro", "Falha ao salvar — tentando de novo");
      clearTimeout(relogio); relogio = setTimeout(salvar, 5000);
    }).then(function (){ salvando = false; });
  }
  window.addEventListener("online", function (){ if (pendente) salvar(); });

  function campo(pai, rotulo, valor, aoMudar, opcoes){
    opcoes = opcoes || {};
    var l = document.createElement("label");
    l.textContent = rotulo;
    var el;
    if (opcoes.lista){
      el = document.createElement("select");
      opcoes.lista.forEach(function (op){
        var o = document.createElement("option");
        if (Array.isArray(op)) { o.value = op[0]; o.textContent = op[1]; }
        else { o.value = op; o.textContent = op; }
        el.appendChild(o);
      });
    } else if (opcoes.area){
      el = document.createElement("textarea");
    } else {
      el = document.createElement("input");
      el.type = opcoes.tipo || "text";
      if (opcoes.modo) el.inputMode = opcoes.modo;
      if (opcoes.dica) el.placeholder = opcoes.dica;
    }
    el.value = e(valor);
    el.addEventListener("input", function (){ aoMudar(el.value); pedirSalvar(); });
    el.addEventListener("change", function (){ aoMudar(el.value); pedirSalvar(); });
    l.appendChild(el);
    pai.appendChild(l);
    if (opcoes.ajuda){
      var d = document.createElement("p"); d.className = "dica"; d.textContent = opcoes.ajuda;
      pai.appendChild(d);
    }
  }

  function cartao(pai, titulo, sub, classe){
    var c = document.createElement("section");
    c.className = "cartao" + (classe ? " " + classe : "");
    var h = document.createElement("h2"); h.textContent = titulo; c.appendChild(h);
    if (sub){ var p = document.createElement("p"); p.className = "dica"; p.textContent = sub; c.appendChild(p); }
    pai.appendChild(c);
    return c;
  }

  function desenhar(){
    raiz.innerHTML = "";
    var topo = document.createElement("div");
    topo.className = "linha-estado";
    topo.innerHTML = '<span class="estado" id="estado-salvar">Salvo</span>' +
      '<a class="voltar" href="/interna">← Minhas captações</a>';
    raiz.appendChild(topo);

    var passos = document.createElement("div");
    passos.className = "passos";
    PASSOS.forEach(function (nome, i){
      var b = document.createElement("button");
      b.className = "passo" + (i < passo ? " feito" : "");
      b.setAttribute("aria-current", i === passo ? "true" : "false");
      b.textContent = (i + 1) + ". " + nome;
      b.addEventListener("click", function (){ passo = i; desenhar(); });
      passos.appendChild(b);
    });
    raiz.appendChild(passos);

    var p = dado.publico, i = dado.interno;
    if (passo === 0){
      var c0 = cartao(raiz, "Proprietário", "Interno: nada daqui vai para o site.", "interno");
      campo(c0, "Nome do proprietário", i.proprietario, function (v){ i.proprietario = v; });
      campo(c0, "Telefone", i.telefone, function (v){ i.telefone = v; }, {tipo:"tel", modo:"tel", dica:"(12) 99999-9999"});
      campo(c0, "E-mail", i.email, function (v){ i.email = v; }, {tipo:"email", modo:"email"});
    }
    if (passo === 1){
      var c1 = cartao(raiz, "Imóvel", "O endereço completo é interno; o site mostra bairro e cidade.");
      campo(c1, "Finalidade", p.finalidade, function (v){ p.finalidade = v; }, {lista: FINALIDADES});
      campo(c1, "Tipo", p.tipo, function (v){ p.tipo = v; }, {lista: TIPOS});
      campo(c1, "CEP", i.cep, function (v){ i.cep = v; }, {modo:"numeric"});
      campo(c1, "Logradouro", i.logradouro, function (v){ i.logradouro = v; });
      campo(c1, "Número", i.numero, function (v){ i.numero = v; }, {modo:"numeric"});
      campo(c1, "Complemento", i.complemento, function (v){ i.complemento = v; });
      campo(c1, "Bairro", p.bairro, function (v){ p.bairro = v; });
      campo(c1, "Cidade", p.cidade, function (v){ p.cidade = v; });
      campo(c1, "UF", p.uf, function (v){ p.uf = v; }, {dica:"SP"});
    }
    if (passo === 2){
      var c2 = cartao(raiz, "Valores", "Deixe em branco o que ainda não souber.");
      campo(c2, "Aluguel pretendido (R$)", p.valor_aluguel, function (v){ p.valor_aluguel = v; }, {modo:"decimal"});
      campo(c2, "Valor de venda (R$)", p.valor_venda, function (v){ p.valor_venda = v; }, {modo:"decimal"});
      campo(c2, "Condomínio (R$)", p.condominio, function (v){ p.condominio = v; }, {modo:"decimal"});
      campo(c2, "IPTU (R$)", p.iptu, function (v){ p.iptu = v; }, {modo:"decimal"});
    }
    if (passo === 3){
      var c3 = cartao(raiz, "Características", "");
      campo(c3, "Dormitórios", p.dormitorios, function (v){ p.dormitorios = v; }, {modo:"numeric"});
      campo(c3, "Suítes", p.suites, function (v){ p.suites = v; }, {modo:"numeric"});
      campo(c3, "Banheiros", p.banheiros, function (v){ p.banheiros = v; }, {modo:"numeric"});
      campo(c3, "Vagas", p.vagas, function (v){ p.vagas = v; }, {modo:"numeric"});
      campo(c3, "Área (m²)", p.area, function (v){ p.area = v; }, {modo:"decimal"});
      campo(c3, "Andar", p.andar, function (v){ p.andar = v; });
      campo(c3, "Mobiliado", p.mobiliado, function (v){ p.mobiliado = v; },
            {lista:[["NAO","Não"],["SEMI","Semimobiliado"],["SIM","Sim"]]});
      campo(c3, "Título do anúncio", p.titulo, function (v){ p.titulo = v; },
            {dica:"Apartamento 2 dormitórios no Centro"});
      campo(c3, "Descrição para o site", p.descricao, function (v){ p.descricao = v; }, {area:true});
    }
    if (passo === 4) desenharFotos();
    if (passo === 5){
      var c5 = cartao(raiz, "Captação (interno)", "Nada deste bloco aparece no site.", "interno");
      campo(c5, "Autorização", i.autorizacao, function (v){ i.autorizacao = v; },
            {lista:[["","—"],["VERBAL","Verbal"],["ASSINADA","Assinada"],["PENDENTE","Pendente"]]});
      campo(c5, "Validade da autorização", i.validade, function (v){ i.validade = v; }, {tipo:"date"});
      campo(c5, "Comissão (%)", i.comissao, function (v){ i.comissao = v; }, {modo:"decimal"});
      campo(c5, "Exclusividade", i.exclusividade, function (v){ i.exclusividade = v; },
            {lista:[["NAO","Não"],["SIM","Sim"]]});
      campo(c5, "Captado por", i.captado_por, function (v){ i.captado_por = v; });
      campo(c5, "Observações internas", i.observacoes, function (v){ i.observacoes = v; }, {area:true});
      if ((dado.historico || []).length){
        var h = cartao(raiz, "Histórico", "");
        dado.historico.slice().reverse().slice(0, 12).forEach(function (linha){
          var li = document.createElement("p"); li.className = "dica";
          li.textContent = new Date(linha.quando).toLocaleString("pt-BR") + " — " + linha.o_que;
          h.appendChild(li);
        });
      }
    }
    if (passo === 6) desenharRevisao();

    var barra = document.createElement("div");
    barra.className = "barra-baixo";
    var voltar = document.createElement("button");
    voltar.textContent = passo === 0 ? "Sair" : "Voltar";
    voltar.addEventListener("click", function (){
      salvar().then(function (){
        if (passo === 0) window.location.href = "/interna";
        else { passo -= 1; desenhar(); }
      });
    });
    var avancar = document.createElement("button");
    avancar.className = "principal";
    avancar.textContent = passo === PASSOS.length - 1 ? "Concluir" : "Avançar";
    avancar.addEventListener("click", function (){
      salvar().then(function (){
        if (passo === PASSOS.length - 1) window.location.href = "/interna";
        else { passo += 1; desenhar(); }
      });
    });
    barra.appendChild(voltar); barra.appendChild(avancar);
    raiz.appendChild(barra);
    window.scrollTo(0, 0);
  }

  /* ---------------------------------------------- fotos */
  function desenharFotos(){
    var c = cartao(raiz, "Fotos", "Tire agora, dentro do imóvel. A marcada com ★ é a capa.");
    var linha = document.createElement("div");
    linha.className = "linha-botoes";
    var camera = document.createElement("input");
    camera.type = "file"; camera.accept = "image/*"; camera.capture = "environment";
    camera.multiple = true; camera.hidden = true;
    camera.addEventListener("change", function (){ receber(camera.files, camera); });
    var galeria = document.createElement("input");
    galeria.type = "file"; galeria.accept = "image/*"; galeria.multiple = true; galeria.hidden = true;
    galeria.addEventListener("change", function (){ receber(galeria.files, galeria); });
    var bc = document.createElement("button");
    bc.className = "principal"; bc.textContent = "📷 Tirar foto";
    bc.addEventListener("click", function (){ camera.click(); });
    var bg = document.createElement("button");
    bg.textContent = "Escolher da galeria";
    bg.addEventListener("click", function (){ galeria.click(); });
    linha.appendChild(bc); linha.appendChild(bg);
    c.appendChild(linha); c.appendChild(camera); c.appendChild(galeria);
    var grade = document.createElement("div");
    grade.className = "fotos"; grade.id = "grade-fotos";
    c.appendChild(grade);
    redesenharFotos();
  }

  function redesenharFotos(){
    var grade = document.getElementById("grade-fotos");
    if (!grade) return;
    grade.innerHTML = "";
    var fotos = dado.fotos || [];
    if (!fotos.length){
      var v = document.createElement("p"); v.className = "dica"; v.textContent = "Nenhuma foto ainda.";
      grade.appendChild(v);
    }
    fotos.forEach(function (f, indice){
      var cx = document.createElement("div");
      cx.className = "foto" + (f.capa ? " capa" : "") + (f.enviando ? " enviando" : "");
      var img = document.createElement("img");
      img.alt = "Foto " + (indice + 1); img.src = f.previa || f.url;
      cx.appendChild(img);
      if (f.capa){ var m = document.createElement("span"); m.className = "marca"; m.textContent = "★ CAPA"; cx.appendChild(m); }
      var acoes = document.createElement("div"); acoes.className = "acoes";
      acoes.appendChild(botao("★", "Capa", function (){
        fotos.forEach(function (x){ x.capa = false; });
        f.capa = true; gravarOrdem(); redesenharFotos();
      }));
      acoes.appendChild(botao("←", "Mover", function (){
        if (indice === 0) return;
        fotos.splice(indice - 1, 0, fotos.splice(indice, 1)[0]);
        gravarOrdem(); redesenharFotos();
      }));
      acoes.appendChild(botao("→", "Mover", function (){
        if (indice === fotos.length - 1) return;
        fotos.splice(indice + 1, 0, fotos.splice(indice, 1)[0]);
        gravarOrdem(); redesenharFotos();
      }));
      var lixo = botao("🗑", "Excluir", function (){
        if (lixo.dataset.confirmar !== "1"){
          lixo.dataset.confirmar = "1"; lixo.textContent = "apagar?";
          setTimeout(function (){ if (lixo.isConnected){ lixo.dataset.confirmar = ""; lixo.textContent = "🗑"; } }, 4000);
          return;
        }
        apagar(f);
      });
      lixo.className = "perigo";
      acoes.appendChild(lixo);
      cx.appendChild(acoes);
      grade.appendChild(cx);
    });
  }

  function botao(texto, titulo, aoClicar){
    var b = document.createElement("button");
    b.textContent = texto; b.title = titulo;
    b.addEventListener("click", aoClicar);
    return b;
  }

  function gravarOrdem(){
    var fotos = (dado.fotos || []).filter(function (f){ return f.id; });
    var capa = (fotos.find(function (f){ return f.capa; }) || {}).id || "";
    estado("indo", "Salvando…");
    fetch(API + "/fotos/ordem", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ordem: fotos.map(function (f){ return f.id; }), capa: capa}),
    }).then(function (){ estado("ok", "Salvo"); })
      .catch(function (){ estado("erro", "Falha ao salvar a ordem"); });
  }

  function apagar(foto){
    fetch(API + "/fotos/" + foto.id, {method: "DELETE"})
      .then(function (){
        dado.fotos = dado.fotos.filter(function (x){ return x !== foto; });
        if (foto.capa && dado.fotos.length) dado.fotos[0].capa = true;
        redesenharFotos(); estado("ok", "Foto excluída");
      })
      .catch(function (){ estado("erro", "Falha ao excluir"); });
  }

  function receber(arquivos, entrada){
    var lista = Array.prototype.slice.call(arquivos || []);
    if (entrada) entrada.value = "";
    lista.reduce(function (fila, arquivo){
      return fila.then(function (){ return enviarUma(arquivo); });
    }, Promise.resolve());
  }

  function enviarUma(arquivo){
    if (!/^image\//.test(arquivo.type || "")) return Promise.resolve();
    var marcador = {id:"", previa: URL.createObjectURL(arquivo), enviando:true,
                    capa: !(dado.fotos || []).length};
    dado.fotos = (dado.fotos || []).concat([marcador]);
    redesenharFotos(); estado("indo", "Enviando foto…");
    return comprimir(arquivo).then(function (blob){
      var pacote = new FormData();
      pacote.append("foto", blob, "foto.jpg");
      return fetch(API + "/fotos", {method: "POST", body: pacote});
    }).then(function (r){
      if (!r.ok) throw new Error("falhou");
      return r.json();
    }).then(function (resposta){
      var criada = (resposta.fotos || [])[0];
      if (!criada) throw new Error("sem foto");
      marcador.id = criada.id; marcador.url = criada.url;
      marcador.capa = criada.capa || marcador.capa; marcador.enviando = false;
      URL.revokeObjectURL(marcador.previa); delete marcador.previa;
      redesenharFotos(); estado("ok", "Foto enviada");
    }).catch(function (){
      dado.fotos = dado.fotos.filter(function (x){ return x !== marcador; });
      redesenharFotos(); estado("erro", "Falha ao enviar a foto");
    });
  }

  function comprimir(arquivo){
    var obter = (typeof createImageBitmap === "function")
      ? createImageBitmap(arquivo, {imageOrientation: "from-image"})
          .catch(function (){ return createImageBitmap(arquivo); })
      : Promise.reject();
    return obter.catch(function (){
      return new Promise(function (ok, falhou){
        var img = new Image();
        img.onload = function (){ ok(img); };
        img.onerror = falhou;
        img.src = URL.createObjectURL(arquivo);
      });
    }).then(function (fonte){
      var escala = Math.min(1, MAX_LADO / Math.max(fonte.width, fonte.height));
      var tela = document.createElement("canvas");
      tela.width = Math.round(fonte.width * escala);
      tela.height = Math.round(fonte.height * escala);
      tela.getContext("2d").drawImage(fonte, 0, 0, tela.width, tela.height);
      if (fonte.close) fonte.close();
      return new Promise(function (ok){ tela.toBlob(ok, "image/jpeg", QUALIDADE); });
    }).then(function (blob){
      if (!blob) throw new Error("não comprimiu");
      return blob;
    });
  }

  /* ---------------------------------------------- revisão */
  function desenharRevisao(){
    var p = dado.publico, i = dado.interno;
    var c = cartao(raiz, "Revisar", "Confira antes de publicar.");
    var dl = document.createElement("dl");
    dl.className = "ficha";
    function par(rotulo, valor){
      if (!e(valor).trim()) return;
      var dt = document.createElement("dt"); dt.textContent = rotulo;
      var dd = document.createElement("dd"); dd.textContent = valor;
      dl.appendChild(dt); dl.appendChild(dd);
    }
    par("Anúncio", p.titulo || [p.tipo, p.bairro].filter(Boolean).join(" · "));
    par("Onde", [p.bairro, p.cidade, p.uf].filter(Boolean).join(", "));
    par("Endereço (interno)", [i.logradouro, i.numero, i.complemento].filter(Boolean).join(", "));
    par("Aluguel", p.valor_aluguel && "R$ " + p.valor_aluguel);
    par("Venda", p.valor_venda && "R$ " + p.valor_venda);
    par("Proprietário (interno)", [i.proprietario, i.telefone].filter(Boolean).join(" · "));
    par("Fotos", (dado.fotos || []).length + " enviada(s)");
    c.appendChild(dl);

    var est = cartao(raiz, "Estado", "Cadastrar não é publicar: só PUBLICADO aparece no site.");
    campo(est, "Estado da captação", dado.status, function (v){ dado.status = v; }, {lista: ESTADOS});
    var link = document.createElement("p");
    link.className = "dica";
    link.innerHTML = 'Depois de publicar, o imóvel aparece em <a href="/alugar">/alugar</a> ou ' +
                     '<a href="/comprar">/comprar</a>, conforme a finalidade.';
    est.appendChild(link);
  }

  /* ---------------------------------------------- início */
  fetch(API, {headers: {"Accept": "application/json"}})
    .then(function (r){ if (!r.ok) throw new Error("falhou"); return r.json(); })
    .then(function (servidor){
      var local = lerLocal();
      dado = servidor;
      if (local && local.atualizado_em && servidor.atualizado_em &&
          local.atualizado_em > servidor.atualizado_em){
        dado.publico = local.publico || dado.publico;
        dado.interno = local.interno || dado.interno;
      }
      dado.publico = dado.publico || {}; dado.interno = dado.interno || {};
      dado.fotos = dado.fotos || [];
      desenhar();
      estado("ok", "Salvo");
    })
    .catch(function (){
      raiz.innerHTML = '<p class="erro">Não consegui carregar a captação. ' +
        'Atualize a página ou <a href="/interna">volte à lista</a>.</p>';
    });
})();
