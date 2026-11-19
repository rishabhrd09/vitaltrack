// CareKosh system design pages — small progressive enhancements. Every page reads fine without this file.
(function () {
  "use strict";

  // 1. The chapter list is open beside the text on wide screens and folds into a menu on small ones.
  var toc = document.querySelector(".toc details");
  if (toc && window.matchMedia("(min-width: 1100px)").matches) toc.open = true;

  // 2. Copy buttons on code blocks.
  document.querySelectorAll(".codeblock").forEach(function (block) {
    var pre = block.querySelector("pre");
    if (!pre) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "copy";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy this code");
    button.addEventListener("click", function () {
      var text = pre.innerText;
      var done = function () { button.textContent = "Copied"; setTimeout(function () { button.textContent = "Copy"; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { selectText(pre); });
      } else {
        selectText(pre);
      }
    });
    block.appendChild(button);
  });

  function selectText(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // 3. Enlarge any diagram: a full-screen view with zoom steps.
  var dialog = null, stage = null, current = null, scale = 1, natural = 1000, lastTrigger = null;

  function buildDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "zoom";
    dialog.setAttribute("aria-label", "Enlarged diagram");
    dialog.innerHTML =
      '<div class="zoom-panel">' +
        '<div class="zoom-bar"><p class="zoom-title"></p><div class="zoom-tools">' +
          '<button type="button" data-z="out" aria-label="Zoom out">−</button>' +
          '<button type="button" data-z="fit">Fit width</button>' +
          '<button type="button" data-z="one">Actual size</button>' +
          '<button type="button" data-z="in" aria-label="Zoom in">+</button>' +
          '<button type="button" data-z="close" class="active">Close</button>' +
        '</div></div>' +
        '<div class="zoom-stage" tabindex="0"></div>' +
      '</div>';
    document.body.appendChild(dialog);
    stage = dialog.querySelector(".zoom-stage");
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
      var z = event.target.getAttribute && event.target.getAttribute("data-z");
      if (!z) return;
      if (z === "close") dialog.close();
      if (z === "in") setScale(scale * 1.25);
      if (z === "out") setScale(scale / 1.25);
      if (z === "one") setScale(1);
      if (z === "fit") setScale(fitScale());
    });
    dialog.addEventListener("close", function () {
      stage.innerHTML = "";
      if (lastTrigger) lastTrigger.focus();
    });
  }

  function fitScale() {
    var available = stage.clientWidth - 48;
    return Math.max(0.4, Math.min(available / natural, 1.8));
  }

  function setScale(value) {
    scale = Math.max(0.4, Math.min(value, 3));
    if (current) current.style.width = Math.round(natural * scale) + "px";
  }

  function openZoom(svg, trigger) {
    if (!dialog) buildDialog();
    lastTrigger = trigger || null;
    var markup = svg.outerHTML
      .replace(/\sid="([^"]+)"/g, ' id="$1-zoom"')
      .replace(/url\(#([^)]+)\)/g, "url(#$1-zoom)")
      .replace(/href="#([^"]+)"/g, 'href="#$1-zoom"')
      .replace(/aria-labelledby="([^"]+)"/g, function (_, ids) {
        return 'aria-labelledby="' + ids.split(/\s+/).map(function (i) { return i + "-zoom"; }).join(" ") + '"';
      });
    stage.innerHTML = markup;
    current = stage.querySelector("svg");
    current.removeAttribute("width");
    current.removeAttribute("height");
    current.style.maxWidth = "none";
    current.style.minWidth = "0";
    var box = (svg.getAttribute("viewBox") || "0 0 1000 800").split(/\s+/);
    natural = parseFloat(box[2]) || 1000;
    var title = svg.querySelector("title");
    dialog.querySelector(".zoom-title").textContent = title ? title.textContent : "Diagram";
    dialog.showModal();
    setScale(fitScale());
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
    stage.focus();
  }

  document.querySelectorAll("figure.diagram").forEach(function (figure) {
    var svg = figure.querySelector(".frame > svg");
    if (!svg || typeof HTMLDialogElement === "undefined") return;
    var tools = figure.querySelector(".fig-tools");
    var button = document.createElement("button");
    button.type = "button";
    button.className = "pill enlarge";
    button.textContent = "Enlarge";
    button.setAttribute("aria-label", "Enlarge this diagram");
    button.addEventListener("click", function () { openZoom(svg, button); });
    if (tools) tools.insertBefore(button, tools.firstChild);
    svg.addEventListener("click", function () { openZoom(svg, button); });
  });

  // 4. Highlight the chapter-list entry for the section being read.
  var links = Array.prototype.slice.call(document.querySelectorAll(".toc a[href^='#']"));
  if (!links.length || !("IntersectionObserver" in window)) return;
  var byId = {};
  links.forEach(function (a) { byId[decodeURIComponent(a.getAttribute("href").slice(1))] = a; });
  var targets = Object.keys(byId).map(function (id) { return document.getElementById(id); }).filter(Boolean);
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      links.forEach(function (a) { a.classList.remove("active"); });
      var link = byId[entry.target.id];
      if (link) link.classList.add("active");
    });
  }, { rootMargin: "-90px 0px -70% 0px", threshold: 0 });
  targets.forEach(function (t) { observer.observe(t); });
})();
