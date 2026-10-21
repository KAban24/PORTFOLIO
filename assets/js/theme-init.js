(function () {
  try {
    var theme = localStorage.getItem("kaban-theme");
    if (theme !== "light" && theme !== "dark") {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.dataset.theme = theme;

    var lang = localStorage.getItem("kaban-lang");
    if (lang !== "ru" && lang !== "en" && lang !== "uk") {
      var nav = (navigator.language || "ru").toLowerCase();
      lang = nav.indexOf("uk") === 0 ? "uk" : nav.indexOf("en") === 0 ? "en" : "ru";
    }
    document.documentElement.lang = lang;
  } catch (error) {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.lang = "ru";
  }
})();
