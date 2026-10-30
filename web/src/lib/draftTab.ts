import eagle from "../assets/ear-eagle.png";

/**
 * Aba de espera do rascunho: abre no clique (senão o navegador bloqueia o pop-up),
 * mostra uma tela animada enquanto o servidor salva o registro e, quando o link chega,
 * leva para o Gmail.
 */
export interface DraftTabTexts { title: string; subtitle: string; steps: [string, string, string]; error: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(t: DraftTabTexts, logo: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.title)}</title>
<style>
:root{--ink:#0d1a2d;--muted:#5a6a80;--brand:#1d5bd8;--good:#1d6fe0;--bad:#d92d2d}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{display:grid;place-items:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#fff;overflow:hidden}
.bg{position:fixed;inset:0;z-index:-1}
.bg i{position:absolute;width:46vmax;height:46vmax;border-radius:50%;filter:blur(90px);opacity:.14;animation:d 14s ease-in-out infinite alternate}
.bg i:nth-child(1){background:#1d5bd8;top:-20vmax;left:-14vmax}
.bg i:nth-child(2){background:#d92d2d;bottom:-24vmax;right:-14vmax;opacity:.08;animation-duration:18s}
.bg i:nth-child(3){background:#eab308;bottom:-20vmax;left:20vw;opacity:.1;animation-duration:22s}
@keyframes d{to{transform:translate(8vw,6vh) scale(1.1)}}
.card{width:min(28rem,92vw);padding:2.2rem 2rem;border-radius:24px;background:rgba(255,255,255,.88);backdrop-filter:blur(18px);
  border:1px solid rgba(13,26,45,.08);box-shadow:0 30px 60px -30px rgba(13,26,45,.35);text-align:center;animation:in .6s cubic-bezier(.16,1,.3,1)}
@keyframes in{from{opacity:0;transform:translateY(16px) scale(.98)}}
.logo{width:56px;opacity:.9;margin-bottom:.4rem}
.env{position:relative;width:120px;height:96px;margin:.6rem auto 1.2rem;animation:float 2.6s ease-in-out infinite}
@keyframes float{50%{transform:translateY(-8px)}}
.env .back{position:absolute;inset:22px 0 0;border-radius:12px;background:linear-gradient(160deg,#2f6fe8,#1d4fb8)}
.env .paper{position:absolute;left:14px;right:14px;top:6px;height:64px;border-radius:8px;background:#fff;box-shadow:0 6px 14px -8px rgba(0,0,0,.4);animation:paper 2.6s ease-in-out infinite}
.env .paper:before,.env .paper:after{content:"";position:absolute;left:12px;right:22px;height:6px;border-radius:3px;background:#dbe4f3;top:14px}
.env .paper:after{top:28px;right:38px}
@keyframes paper{0%,100%{transform:translateY(0)}50%{transform:translateY(10px)}}
.env .front{position:absolute;inset:22px 0 0;border-radius:12px;background:linear-gradient(160deg,#3b7cf0,#2459c9);clip-path:polygon(0 30%,50% 72%,100% 30%,100% 100%,0 100%)}
.env .spark{position:absolute;width:8px;height:8px;border-radius:50%;background:#eab308;animation:sp 2.2s ease-in-out infinite}
.env .spark:nth-child(4){top:0;right:-8px}.env .spark:nth-child(5){bottom:6px;left:-12px;background:#1d6fe0;animation-delay:.7s}
@keyframes sp{0%,100%{transform:scale(.4);opacity:.2}50%{transform:scale(1);opacity:1}}
h1{font-size:1.45rem;letter-spacing:-.02em;margin:0 0 .35rem}
p.sub{margin:0 0 1.4rem;color:var(--muted)}
ol{list-style:none;margin:0;padding:0;display:grid;gap:.55rem;text-align:left}
li{display:flex;align-items:center;gap:.7rem;padding:.65rem .8rem;border-radius:12px;background:rgba(13,26,45,.04);color:var(--muted);font-weight:600;transition:all .35s}
li .ic{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid rgba(13,26,45,.18);display:grid;place-items:center;transition:all .35s}
li.now{color:var(--ink);background:rgba(29,91,216,.08)}
li.now .ic{border-color:rgba(29,91,216,.25);border-top-color:var(--brand);animation:spin .8s linear infinite}
li.done{color:var(--ink)}
li.done .ic{border-color:var(--good);background:var(--good)}
li.done .ic:after{content:"";width:6px;height:10px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg) translate(-1px,-1px)}
@keyframes spin{to{transform:rotate(360deg)}}
.bar{height:4px;border-radius:4px;background:rgba(13,26,45,.06);overflow:hidden;margin-top:1.3rem}
.bar i{display:block;height:100%;width:30%;border-radius:4px;background:linear-gradient(90deg,#1d5bd8,#eab308);animation:load 1.4s ease-in-out infinite}
@keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(340%)}}
.err{display:none;margin-top:1rem;padding:.8rem;border-radius:12px;background:rgba(217,45,45,.1);color:var(--bad);font-weight:600}
body.failed .err{display:block}body.failed .bar,body.failed .env{display:none}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body>
<div class="bg"><i></i><i></i><i></i></div>
<main class="card">
  <img class="logo" src="${esc(logo)}" alt="">
  <div class="env" aria-hidden="true"><div class="back"></div><div class="paper"></div><div class="front"></div><span class="spark"></span><span class="spark"></span></div>
  <h1>${esc(t.title)}</h1>
  <p class="sub">${esc(t.subtitle)}</p>
  <ol>${t.steps.map((s, i) => `<li id="s${i}" class="${i === 0 ? "now" : ""}"><span class="ic"></span>${esc(s)}</li>`).join("")}</ol>
  <div class="bar"><i></i></div>
  <div class="err" role="alert">${esc(t.error)}</div>
</main></body></html>`;
}

export function openDraftTab(t: DraftTabTexts) {
  const tab = window.open("about:blank", "_blank");
  if (!tab) return null;
  try {
    tab.document.open();
    tab.document.write(page(t, new URL(eagle, window.location.href).href));
    tab.document.close();
  } catch { /* segue mesmo sem a tela */ }
  const set = (i: number, cls: string) => { try { const el = tab.document.getElementById(`s${i}`); if (el) el.className = cls; } catch { /* aba fechada */ } };
  const timer = window.setTimeout(() => { set(0, "done"); set(1, "now"); }, 900);

  return {
    /** A aba aberta (o sistema pode focá-la ou fechá-la depois). */
    window: tab,
    /** Link pronto: marca as etapas e leva ao Gmail. */
    go(url: string) {
      window.clearTimeout(timer);
      set(0, "done"); set(1, "done"); set(2, "now");
      window.setTimeout(() => { try { tab.opener = null; tab.location.replace(url); } catch { window.open(url, "_blank", "noopener,noreferrer"); } }, 550);
    },
    /** Falhou: mostra o erro na aba e fecha sozinha. */
    fail() {
      window.clearTimeout(timer);
      try { tab.document.body.classList.add("failed"); } catch { /* ok */ }
      window.setTimeout(() => { try { tab.close(); } catch { /* ok */ } }, 3500);
    },
  };
}