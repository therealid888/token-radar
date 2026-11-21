// app.js — token radar dashboard. Renders window.TOKEN_RADAR into a sortable,
// filterable board with a per-protocol detail view. No network: all data is local.

(function () {
  var DATA = window.TOKEN_RADAR || { rows: [], calibration: { global: 0, byCategory: {} } };
  var rows = DATA.rows || [];

  var state = { q: "", cat: "", chain: "", scope: "all", sortKey: "rank", sortDir: 1, selected: null };

  var $ = function (id) { return document.getElementById(id); };

  function fmtMoney(n) {
    if (n >= 1e9) return "$" + trim((n / 1e9).toFixed(2)) + "B";
    if (n >= 1e6) return "$" + trim((n / 1e6).toFixed(1)) + "M";
    if (n >= 1e3) return "$" + trim((n / 1e3).toFixed(1)) + "K";
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function trim(s) { return s.indexOf(".") >= 0 ? s.replace(/0+$/, "").replace(/\.$/, "") : s; }
  function fmtPct(v) {
    if (v === null || v === undefined) return "n/a";
    return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return "n/a";
    if (days < 365) return days + "d";
    var y = (days / 365).toFixed(1);
    return y.replace(/\.0$/, "") + "y";
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.scope === "watchlist" && !r.watchlist) return false;
      if (state.scope === "below" && r.watchlist) return false;
      if (state.cat && (r.category || "Uncategorized") !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function sorted(list) {
    var k = state.sortKey, d = state.sortDir;
    var num = { rank: 1, tvl_usd: 1, change_7d: 1, age_days: 1, implied_value_usd: 1 };
    return list.slice().sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (num[k]) {
        av = av === null || av === undefined ? -Infinity : av;
        bv = bv === null || bv === undefined ? -Infinity : bv;
        return (av - bv) * d;
      }
      if (k === "chains") { av = (a.chains || []).join(", "); bv = (b.chains || []).join(", "); }
      if (k === "category") { av = a.category || "Uncategorized"; bv = b.category || "Uncategorized"; }
      return String(av).localeCompare(String(bv)) * d;
    });
  }

  function renderRows() {
    var list = sorted(filtered());
    var tb = $("rows");
    var html = "";
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var chg = r.change_7d === null ? '<span class="neg">n/a</span>'
        : '<span class="' + (r.change_7d >= 0 ? "pos" : "neg") + '">' + fmtPct(r.change_7d) + "</span>";
      var chainList = r.chains || [];
      var chainText = chainList.slice(0, 3).join(", ") +
        (chainList.length > 3 ? " +" + (chainList.length - 3) : "");
      html += '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : "") + ">" +
        '<td class="num">' + r.rank + "</td>" +
        '<td><span class="name">' + esc(r.name) + "</span>" +
        (r.watchlist ? '<span class="badge">WATCHLIST</span>' : "") +
        '<br><span class="slug">' + esc(r.slug) + "</span></td>" +
        "<td>" + esc(r.category || "Uncategorized") + "</td>" +
        "<td>" + esc(chainText) + "</td>" +
        '<td class="num">' + fmtMoney(r.tvl_usd) + "</td>" +
        '<td class="num">' + chg + "</td>" +
        '<td class="num">' + fmtAge(r.age_days) + "</td>" +
        '<td class="num"><strong>' + fmtMoney(r.implied_value_usd) + "</strong></td></tr>";
    }
    tb.innerHTML = html;
    $("count").textContent = list.length + " of " + rows.length + " protocols · sorted by " + state.sortKey + (state.sortDir < 0 ? " ↓" : " ↑");
    var heads = document.querySelectorAll("#board thead th");
    for (var h = 0; h < heads.length; h++) {
      var th = heads[h];
      th.classList.toggle("sorted", th.getAttribute("data-k") === state.sortKey);
    }
  }

  function renderDetail() {
    var box = $("detail");
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === state.selected) { r = rows[i]; break; }
    if (!r) { box.hidden = true; box.innerHTML = ""; return; }
    var steps = "";
    for (var s = 0; s < r.farm_steps.length; s++) steps += "<li>" + esc(r.farm_steps[s]) + "</li>";
    box.innerHTML =
      "<h2>" + esc(r.name) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : "") + "</h2>" +
      '<p class="sub">rank #' + r.rank + " · " + esc(r.slug) + " · " + esc(r.category || "Uncategorized") + " · " + esc((r.chains || []).join(", ")) + "</p>" +
      '<div class="facts">' +
      fact("TVL", fmtMoney(r.tvl_usd)) +
      fact("7d change", fmtPct(r.change_7d)) +
      fact("Age", fmtAge(r.age_days) + (r.listed_at ? " · since " + esc(r.listed_at) : "")) +
      fact("Implied value", fmtMoney(r.implied_value_usd)) +
      "</div>" +
      '<p class="breakdown">' + esc(fmtMoney(r.tvl_usd)) + " × " + esc(r.category || "Uncategorized") +
      " ratio " + r.ratio_used.toFixed(3) + " × growth " + r.growth_factor.toFixed(2) +
      " × age " + r.age_factor.toFixed(2) + " = <b>" + esc(fmtMoney(r.implied_value_usd)) + "</b></p>" +
      '<p class="why"><b>Why:</b> ' + esc(r.why) + "</p>" +
      "<h3>Farm plan</h3><ol>" + steps + "</ol>" +
      '<button class="back" id="backBtn">← Back to board</button>';
    box.hidden = false;
    $("backBtn").addEventListener("click", function () { select(null); });
  }

  function fact(k, v) {
    return '<div class="fact"><div class="k">' + esc(k) + '</div><div class="v">' + v + "</div></div>";
  }

  function renderCalibration() {
    var cal = DATA.calibration || { global: 0, byCategory: {} };
    var cats = Object.keys(cal.byCategory || {}).sort();
    var html = '<div class="calib">';
    html += fact("Global median mcap/TVL", (cal.global || 0).toFixed(3));
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      html += fact(c + " median mcap/TVL", (cal.byCategory[c] || 0).toFixed(3));
    }
    html += "</div>";
    $("calibration").innerHTML = html;
  }

  function fillSelects() {
    var cats = {}, chains = {};
    for (var i = 0; i < rows.length; i++) {
      cats[rows[i].category || "Uncategorized"] = 1;
      for (var j = 0; j < (rows[i].chains || []).length; j++) chains[rows[i].chains[j]] = 1;
    }
    var co = Object.keys(cats).sort(), cho = Object.keys(chains).sort();
    var cs = $("cat"), hs = $("chain");
    for (var a = 0; a < co.length; a++) { var o1 = document.createElement("option"); o1.value = co[a]; o1.textContent = co[a]; cs.appendChild(o1); }
    for (var b = 0; b < cho.length; b++) { var o2 = document.createElement("option"); o2.value = cho[b]; o2.textContent = cho[b]; hs.appendChild(o2); }
  }

  function select(slug) {
    state.selected = slug;
    renderRows();
    renderDetail();
    syncUrl();
    if (slug) {
      var el = $("detail");
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" });
    }
  }

  // Keep the URL in step with the view, so a detail or filtered view is shareable.
  function syncUrl() {
    var p = new URLSearchParams();
    if (state.selected) p.set("protocol", state.selected);
    if (state.scope !== "all") p.set("filter", state.scope);
    if (state.cat) p.set("category", state.cat);
    if (state.chain) p.set("chain", state.chain);
    if (state.q) p.set("q", state.q);
    var qs = p.toString();
    var url = window.location.pathname + (qs ? "?" + qs : "");
    if (window.history && window.history.replaceState) window.history.replaceState(null, "", url);
  }

  function render() { renderRows(); renderDetail(); }

  function init() {
    var params = new URLSearchParams(window.location.search);
    if (params.get("protocol")) state.selected = params.get("protocol");
    if (params.get("filter") === "watchlist") state.scope = "watchlist";
    if (params.get("category")) state.cat = params.get("category");
    if (params.get("chain")) state.chain = params.get("chain");
    if (params.get("q")) state.q = params.get("q");

    $("meta").textContent = "snapshot " + (DATA.as_of || "") + " · " + rows.length +
      " pre-token protocols · " + (DATA.watchlist_count || 0) + " on the watchlist · floor " + fmtMoney(DATA.floor_usd || 0);

    fillSelects();
    $("q").value = state.q;
    $("cat").value = state.cat;
    $("chain").value = state.chain;
    $("scope").value = state.scope;

    $("q").addEventListener("input", function (e) { state.q = e.target.value; renderRows(); });
    $("cat").addEventListener("change", function (e) { state.cat = e.target.value; renderRows(); });
    $("chain").addEventListener("change", function (e) { state.chain = e.target.value; renderRows(); });
    $("scope").addEventListener("change", function (e) { state.scope = e.target.value; renderRows(); });

    var heads = document.querySelectorAll("#board thead th");
    for (var h = 0; h < heads.length; h++) {
      (function (th) {
        th.addEventListener("click", function () {
          var k = th.getAttribute("data-k");
          if (state.sortKey === k) state.sortDir = -state.sortDir;
          else { state.sortKey = k; state.sortDir = k === "name" || k === "category" || k === "chains" ? 1 : -1; }
          renderRows();
        });
      })(heads[h]);
    }

    $("rows").addEventListener("click", function (e) {
      var tr = e.target.closest ? e.target.closest("tr[data-slug]") : null;
      if (tr) select(tr.getAttribute("data-slug"));
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.selected) select(null);
    });

    renderCalibration();
    render();
    window.__shotReady = true;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
