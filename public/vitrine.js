/* Site publico: amplia as fotos do imovel, com setas, teclado e arrastar.
   E so melhoria - sem este arquivo, cada foto abre sozinha pelo link. No
   celular a galeria ja e carrossel de arrastar (vitrine.css); la, tocar na foto
   tambem amplia. Arquivo separado, e nao <script> na pagina: a CSP nao deixa. */
(function () {
  "use strict";
  // "Copiar link" do imovel: copia e diz que copiou.
  Array.prototype.forEach.call(document.querySelectorAll("[data-copiar]"), function (botao) {
    botao.addEventListener("click", function () {
      var texto = botao.getAttribute("data-copiar");
      var pronto = function () { var antes = botao.textContent; botao.textContent = "Link copiado"; setTimeout(function () { botao.textContent = antes; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(texto).then(pronto, function () { window.prompt("Copie o link:", texto); });
      else window.prompt("Copie o link:", texto);
    });
  });

  var galeria = document.querySelector("[data-galeria]");
  if (!galeria) return;
  var links = Array.prototype.slice.call(galeria.querySelectorAll("a[data-indice]"));
  var fotos = links.map(function (a) {
    var img = a.querySelector("img");
    return { src: a.getAttribute("href"), alt: img ? img.alt : "" };
  });
  if (!fotos.length) return;

  var caixa, imagem, contador, atual = 0, voltarPara = null, toqueX = null;

  function mostrar(n) {
    atual = (n + fotos.length) % fotos.length;
    imagem.src = fotos[atual].src;
    imagem.alt = fotos[atual].alt;
    contador.textContent = (atual + 1) + " de " + fotos.length;
  }
  function botao(classe, rotulo, texto, acao) {
    var b = document.createElement("button");
    b.type = "button"; b.className = classe; b.setAttribute("aria-label", rotulo); b.textContent = texto;
    b.addEventListener("click", function (ev) { ev.stopPropagation(); acao(); });
    return b;
  }
  function teclas(ev) {
    if (ev.key === "Escape") fechar();
    else if (ev.key === "ArrowRight") mostrar(atual + 1);
    else if (ev.key === "ArrowLeft") mostrar(atual - 1);
  }
  function fechar() {
    if (!caixa) return;
    document.removeEventListener("keydown", teclas);
    caixa.remove(); caixa = null;
    document.body.style.overflow = "";
    if (voltarPara) voltarPara.focus();
  }
  function abrir(n, origem) {
    voltarPara = origem;
    caixa = document.createElement("div");
    caixa.className = "ampliada";
    caixa.setAttribute("role", "dialog");
    caixa.setAttribute("aria-modal", "true");
    caixa.setAttribute("aria-label", "Fotos do imóvel");
    imagem = document.createElement("img");
    contador = document.createElement("p");
    contador.className = "contador";
    caixa.appendChild(imagem);
    caixa.appendChild(contador);
    caixa.appendChild(botao("fechar", "Fechar", "×", fechar));
    if (fotos.length > 1) {
      caixa.appendChild(botao("anterior", "Foto anterior", "‹", function () { mostrar(atual - 1); }));
      caixa.appendChild(botao("proxima", "Próxima foto", "›", function () { mostrar(atual + 1); }));
    }
    caixa.addEventListener("click", function (ev) { if (ev.target === caixa) fechar(); });
    caixa.addEventListener("touchstart", function (ev) { toqueX = ev.touches[0].clientX; }, { passive: true });
    caixa.addEventListener("touchend", function (ev) {
      if (toqueX === null) return;
      var dx = ev.changedTouches[0].clientX - toqueX;
      if (Math.abs(dx) > 40) mostrar(atual + (dx < 0 ? 1 : -1));
      toqueX = null;
    });
    document.addEventListener("keydown", teclas);
    document.body.appendChild(caixa);
    document.body.style.overflow = "hidden";
    mostrar(n);
    caixa.querySelector(".fechar").focus();
  }
  links.forEach(function (a, n) {
    a.addEventListener("click", function (ev) { ev.preventDefault(); abrir(n, a); });
  });
})();
