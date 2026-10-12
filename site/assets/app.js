// Progressive enhancement for the "Dora has moved" page. Without JS the page
// still works: hosts and links are filled in by nginx (sub_filter).
(function () {
  "use strict";

  var newUrl = document.documentElement.getAttribute("data-new-url") || "";

  // Long hosts (carlsbrgno-staging.dora.cust.sobr-brews.ch) may only wrap
  // after a dot, never at a hyphen or mid-label.
  var hosts = document.querySelectorAll(".host");
  for (var h = 0; h < hosts.length; h++) {
    var labels = hosts[h].textContent.trim().split(".");
    hosts[h].textContent = "";
    for (var l = 0; l < labels.length; l++) {
      if (l > 0) hosts[h].appendChild(document.createElement("wbr"));
      var seg = document.createElement("span");
      seg.className = "seg";
      seg.textContent = labels[l] + (l < labels.length - 1 ? "." : "");
      hosts[h].appendChild(seg);
    }
  }

  // Deep links: an old bookmark on /some/page should lead to the same page
  // on the new host. Built with URL() and set via href/textContent only.
  var target = newUrl;
  var path = location.pathname + location.search + location.hash;
  if (newUrl && path !== "/" && path !== "/index.html") {
    try {
      target = new URL(path, newUrl).href;
      var links = document.querySelectorAll(".js-target");
      for (var k = 0; k < links.length; k++) links[k].href = target;
      document.querySelector(".js-target-text").textContent = target;
      document.querySelector(".deeplink").hidden = false;
    } catch (e) {
      target = newUrl;
    }
  }

  // The clipboard API needs a secure context (https or localhost); the
  // button stays hidden otherwise.
  var copyBtn = document.querySelector(".js-copy");
  if (navigator.clipboard && window.isSecureContext) {
    copyBtn.hidden = false;
    var label = copyBtn.querySelector(".js-copy-label");
    var copyTimer;
    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(target).then(function () {
        label.textContent = "Copied";
        copyBtn.classList.add("is-done");
        clearTimeout(copyTimer);
        copyTimer = setTimeout(function () {
          label.textContent = "Copy address";
          copyBtn.classList.remove("is-done");
        }, 2000);
      }, function () {});
    });
  }

  network(document.querySelector(".network"));

  // Route-network background, a dependency-free take on the tsParticles
  // config of dora-web's home page: destinations of varied size joined by
  // "roads", slow drift, and hovering highlights nearby roads.
  function network(canvas) {
    var ctx = canvas && canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;

    var LINK_DISTANCE = 175;
    var GRAB_DISTANCE = 220;
    var DENSITY = 55 / (800 * 800); // 55 nodes per 800x800 px, as in tsParticles
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var darkMode = window.matchMedia("(prefers-color-scheme: dark)");

    var w = 0, hgt = 0, dpr = 1, nodes = [], colors = {}, mouse = null, frame = 0;

    function readColors() {
      var s = getComputedStyle(document.documentElement);
      colors.node = s.getPropertyValue("--node").trim() || "#166534";
      colors.link = s.getPropertyValue("--link").trim() || "#16a34a";
      colors.linkOpacity = parseFloat(s.getPropertyValue("--link-opacity")) || 0.35;
    }

    function resize() {
      dpr = window.devicePixelRatio || 1;
      w = window.innerWidth;
      hgt = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var want = Math.max(12, Math.round(w * hgt * DENSITY));
      while (nodes.length < want) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 0.15 + Math.random() * 0.45;
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * hgt,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 2 + Math.random() * 4,
        });
      }
      nodes.length = want;
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].x = Math.min(nodes[i].x, w);
        nodes[i].y = Math.min(nodes[i].y, hgt);
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, hgt);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = colors.link;
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          if (dx > LINK_DISTANCE || dx < -LINK_DISTANCE || dy > LINK_DISTANCE || dy < -LINK_DISTANCE) continue;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d >= LINK_DISTANCE) continue;
          ctx.globalAlpha = colors.linkOpacity * (1 - d / LINK_DISTANCE);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        if (mouse) {
          var mx = a.x - mouse.x, my = a.y - mouse.y;
          var md = Math.sqrt(mx * mx + my * my);
          if (md < GRAB_DISTANCE) {
            ctx.globalAlpha = 0.7 * (1 - md / GRAB_DISTANCE);
            ctx.beginPath();
            ctx.moveTo(mouse.x, mouse.y);
            ctx.lineTo(a.x, a.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = colors.node;
      for (var n = 0; n < nodes.length; n++) {
        ctx.beginPath();
        ctx.arc(nodes[n].x, nodes[n].y, nodes[n].r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function step() {
      for (var i = 0; i < nodes.length; i++) {
        var p = nodes[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < p.r || p.x > w - p.r) { p.vx = -p.vx; p.x = Math.max(p.r, Math.min(w - p.r, p.x)); }
        if (p.y < p.r || p.y > hgt - p.r) { p.vy = -p.vy; p.y = Math.max(p.r, Math.min(hgt - p.r, p.y)); }
      }
      draw();
      frame = requestAnimationFrame(step);
    }

    function start() {
      cancelAnimationFrame(frame);
      if (reduceMotion.matches) draw();
      else frame = requestAnimationFrame(step);
    }

    function onChange(mq, fn) {
      if (mq.addEventListener) mq.addEventListener("change", fn);
      else if (mq.addListener) mq.addListener(fn);
    }

    readColors();
    resize();
    start();

    window.addEventListener("resize", function () { resize(); if (reduceMotion.matches) draw(); });
    window.addEventListener("pointermove", function (e) { mouse = { x: e.clientX, y: e.clientY }; });
    document.addEventListener("mouseout", function (e) { if (!e.relatedTarget) mouse = null; });
    window.addEventListener("blur", function () { mouse = null; });
    onChange(darkMode, function () { readColors(); draw(); });
    onChange(reduceMotion, start);
  }
})();
