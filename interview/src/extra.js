// Interview-pack additions: question filter, show/hide all answers, open a linked question, expand answers for print.
(function () {
  "use strict";
  var questions = Array.prototype.slice.call(document.querySelectorAll("details.qa"));
  if (!questions.length) return;

  function updateCount(tools) {
    var count = tools.querySelector(".qa-count");
    if (!count) return;
    var shown = questions.filter(function (q) { return !q.classList.contains("hidden"); }).length;
    count.textContent = shown === questions.length ? questions.length + " questions" : "Showing " + shown + " of " + questions.length;
  }

  document.querySelectorAll(".qa-tools").forEach(function (tools) {
    var input = tools.querySelector("input");
    if (input) {
      input.addEventListener("input", function () {
        var words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
        questions.forEach(function (q) {
          var text = (q.textContent + " " + (q.getAttribute("data-tags") || "")).toLowerCase();
          var match = words.every(function (w) { return text.indexOf(w) !== -1; });
          q.classList.toggle("hidden", !match);
        });
        updateCount(tools);
      });
    }
    tools.addEventListener("click", function (event) {
      var action = event.target.getAttribute && event.target.getAttribute("data-qa");
      if (!action) return;
      questions.forEach(function (q) { if (!q.classList.contains("hidden")) q.open = action === "open"; });
    });
    updateCount(tools);
  });

  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    var target = id && document.getElementById(id);
    if (target && target.tagName === "DETAILS") { target.open = true; target.scrollIntoView(); }
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash();

  var wasOpen = [];
  window.addEventListener("beforeprint", function () {
    wasOpen = questions.map(function (q) { return q.open; });
    questions.forEach(function (q) { q.open = true; });
  });
  window.addEventListener("afterprint", function () {
    questions.forEach(function (q, i) { q.open = wasOpen[i]; });
  });
})();
