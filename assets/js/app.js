(function () {
  "use strict";

  var root = document.documentElement;
  var body = document.body;
  var storageKeyLang = "kaban-lang";
  var storageKeyTheme = "kaban-theme";
  var translations = window.I18N || {};
  var supported = ["ru", "en", "uk"];

  function getLang() {
    var lang = root.lang;
    return supported.indexOf(lang) !== -1 ? lang : "ru";
  }

  function applyLanguage(lang) {
    var dictionary = translations[lang] || translations.ru || {};
    var fallback = translations.ru || {};

    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      var key = node.getAttribute("data-i18n");
      var value = dictionary[key] || fallback[key];
      if (typeof value === "string") {
        node.textContent = value;
      }
    });

    document.querySelectorAll("[data-i18n-html]").forEach(function (node) {
      var key = node.getAttribute("data-i18n-html");
      var value = dictionary[key] || fallback[key];
      if (typeof value === "string") {
        node.innerHTML = value;
      }
    });

    document.querySelectorAll("[data-i18n-content]").forEach(function (node) {
      var key = node.getAttribute("data-i18n-content");
      var value = dictionary[key] || fallback[key];
      if (typeof value === "string") {
        node.setAttribute("content", value);
      }
    });

    document.querySelectorAll("[data-i18n-attr]").forEach(function (node) {
      node.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var parts = pair.split(":");
        if (parts.length !== 2) return;
        var attr = parts[0].trim();
        var key = parts[1].trim();
        var value = dictionary[key] || fallback[key];
        if (attr && typeof value === "string") {
          node.setAttribute(attr, value);
        }
      });
    });

    document.querySelectorAll("[data-lang]").forEach(function (button) {
      var active = button.getAttribute("data-lang") === lang;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    root.lang = lang;
    var titleNode = document.querySelector("title[data-i18n]");
    if (titleNode) {
      document.title = titleNode.textContent;
    }
  }

  function setLanguage(lang) {
    if (supported.indexOf(lang) === -1) return;
    try {
      localStorage.setItem(storageKeyLang, lang);
    } catch (error) {}
    applyLanguage(lang);
    document.dispatchEvent(new CustomEvent("languagechange", { detail: { lang: lang } }));
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "light" ? "#f3f7f0" : "#060907");
    }
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      var key = theme === "light" ? "ui.themeToDark" : "ui.themeToLight";
      var dictionary = translations[getLang()] || {};
      var fallback = translations.ru || {};
      button.setAttribute("aria-label", dictionary[key] || fallback[key] || "Toggle theme");
      button.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    });
  }

  function setTheme(theme) {
    if (theme !== "light" && theme !== "dark") return;
    try {
      localStorage.setItem(storageKeyTheme, theme);
    } catch (error) {}
    applyTheme(theme);
  }

  function toggleTheme() {
    setTheme(root.dataset.theme === "light" ? "dark" : "light");
  }

  function initHeader() {
    var header = document.querySelector(".site-header");
    var progress = document.querySelector(".scroll-progress__bar");
    var update = function () {
      var scrollTop = window.scrollY || window.pageYOffset;
      if (header) header.classList.toggle("is-scrolled", scrollTop > 10);
      if (progress) {
        var height = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (height > 0 ? (scrollTop / height) * 100 : 0) + "%";
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  function initMenu() {
    var burger = document.querySelector(".burger");
    var menu = document.getElementById("mobileMenu");
    if (!burger || !menu) return;

    var setOpen = function (open) {
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      menu.classList.toggle("is-open", open);
      menu.setAttribute("aria-hidden", open ? "false" : "true");
      body.classList.toggle("no-scroll", open);
    };

    burger.addEventListener("click", function () {
      setOpen(burger.getAttribute("aria-expanded") !== "true");
    });

    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setOpen(false);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setOpen(false);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 1120) setOpen(false);
    });
  }

  function initThemeButtons() {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.addEventListener("click", toggleTheme);
    });
  }

  function initLanguageButtons() {
    document.querySelectorAll("[data-lang]").forEach(function (button) {
      button.addEventListener("click", function () {
        setLanguage(button.getAttribute("data-lang"));
        applyTheme(root.dataset.theme);
      });
    });
  }

  function initActiveNav() {
    var page = body.getAttribute("data-page");
    document.querySelectorAll(".nav-link[data-page]").forEach(function (link) {
      link.classList.toggle("is-active", link.getAttribute("data-page") === page);
      if (link.getAttribute("data-page") === page) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (item) { item.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    items.forEach(function (item, index) {
      item.style.transitionDelay = Math.min(index % 4, 3) * 55 + "ms";
      observer.observe(item);
    });
  }

  function initFilters() {
    var buttons = document.querySelectorAll("[data-filter]");
    var cards = document.querySelectorAll("[data-category]");
    if (!buttons.length || !cards.length) return;

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var filter = button.getAttribute("data-filter");
        buttons.forEach(function (item) {
          var active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", active ? "true" : "false");
        });
        cards.forEach(function (card) {
          var categories = (card.getAttribute("data-category") || "").split(" ");
          card.classList.toggle("is-hidden", filter !== "all" && categories.indexOf(filter) === -1);
        });
      });
    });
  }

  function initYear() {
    document.querySelectorAll("[data-year]").forEach(function (node) {
      node.textContent = new Date().getFullYear();
    });
  }

  function buildMineBoard() {
    var board = document.getElementById("msBoard");
    if (!board) return;

    var cols = 12;
    var rows = 10;
    var mines = new Set([5, 7, 27, 40, 52, 63, 76, 89, 101, 114]);
    var flags = new Set([7, 40, 76, 101]);
    var open = new Set([
      0, 1, 2, 3, 12, 13, 14, 15, 24, 25, 26, 36, 37, 38, 48, 49, 50, 60, 61, 62,
      8, 9, 10, 20, 21, 22, 32, 33, 34, 44, 45, 46, 56, 57, 58, 68, 69, 70,
      82, 83, 84, 94, 95, 96, 106, 107, 108, 118, 119, 4, 16, 17, 28, 29, 30, 41, 42, 43
    ]);

    function countNear(index) {
      var row = Math.floor(index / cols);
      var col = index % cols;
      var count = 0;
      for (var r = row - 1; r <= row + 1; r += 1) {
        for (var c = col - 1; c <= col + 1; c += 1) {
          if (r < 0 || c < 0 || r >= rows || c >= cols || (r === row && c === col)) continue;
          if (mines.has(r * cols + c)) count += 1;
        }
      }
      return count;
    }

    board.innerHTML = "";
    for (var i = 0; i < cols * rows; i += 1) {
      var cell = document.createElement("span");
      cell.className = "ms-cell";
      if (flags.has(i)) {
        cell.classList.add("is-flag");
        cell.textContent = "⚑";
      } else if (open.has(i) && !mines.has(i)) {
        var near = countNear(i);
        cell.classList.add("is-open");
        if (near > 0) {
          cell.textContent = String(near);
          cell.classList.add("n" + Math.min(near, 4));
        }
      }
      board.appendChild(cell);
    }
  }

  function buildMiniBoard() {
    document.querySelectorAll(".mine-mini").forEach(function (board) {
      var cols = 8;
      var rows = 5;
      var mines = new Set([3, 17, 22, 31]);
      var flags = new Set([17, 31]);
      var open = new Set([0, 1, 2, 8, 9, 10, 11, 16, 18, 19, 24, 25, 26, 27, 32, 33, 34, 35]);
      board.innerHTML = "";
      for (var i = 0; i < cols * rows; i += 1) {
        var cell = document.createElement("span");
        if (flags.has(i)) {
          cell.classList.add("is-flag");
          cell.textContent = "⚑";
        } else if (open.has(i)) {
          cell.classList.add("is-open");
          var row = Math.floor(i / cols);
          var col = i % cols;
          var count = 0;
          for (var r = row - 1; r <= row + 1; r += 1) {
            for (var c = col - 1; c <= col + 1; c += 1) {
              if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
              if (mines.has(r * cols + c)) count += 1;
            }
          }
          if (mines.has(i)) {
            cell.classList.add("is-mine");
            cell.textContent = "✹";
          } else if (count > 0) {
            cell.textContent = String(count);
            cell.classList.add("n" + Math.min(count, 3));
          }
        }
        board.appendChild(cell);
      }
    });
  }

  function initToTop() {
    document.querySelectorAll("[data-to-top]").forEach(function (button) {
      button.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function init() {
    applyLanguage(getLang());
    applyTheme(root.dataset.theme || "dark");
    initHeader();
    initMenu();
    initThemeButtons();
    initLanguageButtons();
    initActiveNav();
    initReveal();
    initFilters();
    initYear();
    initToTop();
    buildMineBoard();
    buildMiniBoard();
    body.classList.add("is-ready");
  }

  document.addEventListener("languagechange", function () {
    applyTheme(root.dataset.theme || "dark");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
