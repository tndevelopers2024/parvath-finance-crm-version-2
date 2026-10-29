(function () {
  try {
    var t = localStorage.getItem("theme");
    var isDark = t === "dark";
    if (isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch {
    // Storage may be unavailable; the default theme still works.
  }
})();
