import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* Supabase の公開用設定。service_role / Database Password は絶対に入れません。 */
const SUPABASE_URL = "https://jhtybfhdzzjefwrcxqbf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-OQKnF15AmQxh0qHdsiX_w_QUVJVOzw";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/* 保存層。未ログイン時は端末内、ログイン時は端末内＋クラウドへ保存します。 */
const STORAGE_KEY = "question-zukan-data-v1";
const STATES = { unanswered: ["未解説", "○"], explained: ["解説済み", "✓"], review: ["復習したい", "↻"], mistake: ["間違えた", "!" ] };
const COLLECTIONS = ["2018年6月", "2018年11月", "2019年6月", "2019年11月", "2021年6月"];
const app = document.querySelector("#app");
const importInput = document.querySelector("#importInput");
let filter = "all";
let activeCollection = COLLECTIONS[0];
let currentUser = null;

function blankProblem(number, collection = COLLECTIONS[0]) { return { id: crypto.randomUUID(), number: String(number), collection, question: "", image: "", answer: "", explanation: "", pitfalls: "", keyPoints: "", status: "unanswered", keywords: "", updatedAt: new Date().toISOString() }; }
function seedData() { return COLLECTIONS.flatMap(collection => Array.from({ length: 35 }, (_, i) => blankProblem(i + 1, collection))); }
function isEmptyProblem(problem) { return ["question","image","answer","explanation","pitfalls","keyPoints","keywords"].every(key => !problem[key]); }
function loadData() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (!Array.isArray(saved?.problems)) return { version: 2, problems: seedData() }; if (saved.problems.every(problem => problem.collection)) return saved; /* 旧版の空データは、新しい5年分の構成へ安全に置換します。入力済みの問題は未分類として保持します。 */ if (saved.problems.every(isEmptyProblem)) return { version: 2, problems: seedData() }; return { version: 2, problems: saved.problems.map(problem => ({ ...problem, collection: problem.collection || "未分類" })) }; } catch { return { version: 2, problems: seedData() }; } }
let data = loadData();
function saveData(message = "保存しました") { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); flash(message); if (currentUser) syncToCloud(); }
function flash(message) { const el = document.querySelector("#headerMessage"); if (!el) return; el.textContent = message; setTimeout(() => { if (el.textContent === message) el.textContent = ""; }, 2600); }
function esc(text) { return String(text ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]); }
function route() { const match = location.hash.match(/^#\/problem\/(.+)$/); return match ? { page:"detail", id:decodeURIComponent(match[1]) } : { page:"list" }; }
function problemById(id) { return data.problems.find(p => p.id === id); }
// 「20-1」「練習A」も扱える表示名。数字だけのときだけ 01 のようにそろえます。
function formatNumber(n) { const text = String(n); return /^\d+$/.test(text) ? text.padStart(2, "0") : text; }
function compareProblems(a, b) { return String(a.number).localeCompare(String(b.number), "ja", { numeric: true }); }
function renderText(text) { if (!text?.trim()) return ""; const lines = text.replace(/\r/g, "").split("\n"); let html = "", list = false; const close = () => { if (list) { html += "</ul>"; list = false; } }; for (const raw of lines) { const line = raw.trim(); if (!line) { close(); continue; } if (line.startsWith("## ")) { close(); html += `<h3>${esc(line.slice(3))}</h3>`; } else if (line.startsWith("# ")) { close(); html += `<h3>${esc(line.slice(2))}</h3>`; } else if (/^[-*]\s+/.test(line)) { if (!list) { html += "<ul>"; list = true; } html += `<li>${esc(line.replace(/^[-*]\s+/, ""))}</li>`; } else { close(); html += `<p>${esc(line)}</p>`; } } close(); return html; }
function statusClass(status) { return status === "unanswered" ? "" : `state-${status}`; }

function renderList() {
  const q = (document.querySelector("#search")?.value || "").trim().toLowerCase();
  const availableCollections = [...new Set([...COLLECTIONS, ...data.problems.map(p => p.collection).filter(c => c && !COLLECTIONS.includes(c))])];
  if (!availableCollections.includes(activeCollection)) activeCollection = availableCollections[0];
  const items = data.problems.filter(p => { const text = [p.number,p.question,p.answer,p.explanation,p.pitfalls,p.keyPoints,p.keywords].join(" ").toLowerCase(); return p.collection === activeCollection && (!q || text.includes(q)) && (filter === "all" || p.status === filter); }).sort(compareProblems);
  app.innerHTML = `<section class="panel intro"><h1>${esc(activeCollection)} 問題一覧</h1><p>年度・月を選び、番号をタップして解説の登録・閲覧・復習をします。</p></section>
  <div class="filters collection-tabs">${availableCollections.map(collection => `<button class="filter ${activeCollection===collection?"active":""}" data-collection="${esc(collection)}">${esc(collection)}</button>`).join("")}</div>
  <div class="toolbar"><input id="search" class="search" type="search" placeholder="問題番号・キーワードを検索" value="${esc(q)}" aria-label="問題を検索"><div class="actions"><button class="button primary" id="addProblem">＋ 問題を追加</button><button class="button" id="exportData">書き出す</button><button class="button" id="importData">読み込む</button></div></div>
  <div class="filters">${[["all","すべて"],...Object.entries(STATES).map(([key,[label,icon]])=>[key,`${icon} ${label}`])].map(([key,label])=>`<button class="filter ${filter===key?"active":""}" data-filter="${key}">${label}</button>`).join("")}</div>
  <p class="summary">${items.length}件表示 / 全${data.problems.length}問</p><section class="problem-grid">${items.length ? items.map(p => `<button class="problem-card ${statusClass(p.status)}" data-open="${p.id}" aria-label="問題${p.number} ${STATES[p.status][0]}"><span class="problem-number">${formatNumber(p.number)}</span><span class="state-mark">${STATES[p.status][1]} ${STATES[p.status][0]}</span></button>`).join("") : "<p class=\"empty\">条件に合う問題がありません。</p>"}</section>`;
  document.querySelector("#search").addEventListener("input", renderList);
  app.querySelectorAll("[data-collection]").forEach(b => b.onclick = () => { activeCollection = b.dataset.collection; renderList(); });
  app.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { filter = b.dataset.filter; renderList(); });
  app.querySelectorAll("[data-open]").forEach(b => b.onclick = () => location.hash = `#/problem/${b.dataset.open}`);
  document.querySelector("#addProblem").onclick = addProblem;
  document.querySelector("#exportData").onclick = exportData;
  document.querySelector("#importData").onclick = () => importInput.click();
}

function renderDetail(problem) {
  if (!problem) { location.hash = "#/"; return; }
  const ordered = data.problems.filter(p => p.collection === problem.collection).sort(compareProblems); const index = ordered.findIndex(p => p.id === problem.id); const prev=ordered[index-1], next=ordered[index+1];
  const section = (title, value) => `<section class="detail-section"><h2>${title}</h2><div class="content-box">${renderText(value)}</div></section>`;
  app.innerHTML = `<div class="nav-row"><button class="button" ${!prev?"disabled":""} id="prev">← 前の問題</button><a class="button" href="#/">問題一覧</a><button class="button" ${!next?"disabled":""} id="next">次の問題 →</button></div><article class="panel"><div class="detail-top"><div><span class="state-mark">${esc(problem.collection)}</span><h1>問題 ${formatNumber(problem.number)}</h1><span class="state-mark">${STATES[problem.status][1]} ${STATES[problem.status][0]}</span></div><button class="button primary" id="edit">編集する</button></div>${section("問題文",problem.question)}${problem.image?`<section class="detail-section"><h2>問題画像</h2><img class="problem-image" src="${esc(problem.image)}" alt="問題 ${problem.number} の画像"></section>`:""}${section("正解",problem.answer)}${section("詳しい解説",problem.explanation)}${section("間違えやすいポイント",problem.pitfalls)}${section("覚えるべきポイント",problem.keyPoints)}${section("キーワード",problem.keywords)}</article>`;
  document.querySelector("#edit").onclick = () => renderEditor(problem);
  if(prev) document.querySelector("#prev").onclick = () => location.hash=`#/problem/${prev.id}`; if(next) document.querySelector("#next").onclick = () => location.hash=`#/problem/${next.id}`;
}

function renderEditor(problem) {
  app.innerHTML = `<div class="nav-row"><a class="button" href="#/problem/${problem.id}">← 戻る（保存しない）</a><a class="button" href="#/">問題一覧</a></div><form id="editor" class="panel editor"><h1>${esc(problem.collection)}・問題 ${formatNumber(problem.number)} を編集</h1>
  <div class="field"><label>年度・月</label><select name="collection">${COLLECTIONS.map(collection => `<option value="${esc(collection)}" ${collection===problem.collection?"selected":""}>${esc(collection)}</option>`).join("")}${!COLLECTIONS.includes(problem.collection)?`<option value="${esc(problem.collection)}" selected>${esc(problem.collection)}</option>`:""}</select></div><div class="field"><label>問題番号・表示名</label><input name="number" type="text" required placeholder="例：20-1、20-2、練習A" value="${esc(problem.number)}"><span class="field-hint">数字以外も使えます。問題20の(1)と(2)なら「20-1」「20-2」のように入力します。</span></div><div class="field"><label>状態</label><select name="status">${Object.entries(STATES).map(([key,[label]])=>`<option value="${key}" ${key===problem.status?"selected":""}>${label}</option>`).join("")}</select></div>
  ${field("問題文", "question", problem.question, false)}${field("正解", "answer", problem.answer, false)}${field("詳しい解説", "explanation", problem.explanation, true, "# 見出し / - 箇条書き も使えます。長文をそのまま貼り付けてOKです。")}${field("間違えやすいポイント", "pitfalls", problem.pitfalls, false)}${field("覚えるべきポイント", "keyPoints", problem.keyPoints, false)}${field("キーワード", "keywords", problem.keywords, false, "例：動詞、現在完了、図形")}
  <div class="field"><label>問題画像</label><input id="imageUrl" name="image" type="url" placeholder="画像のURL（任意）" value="${esc(problem.image)}"><input id="imageFile" type="file" accept="image/*"><span class="field-hint">公開画像のURLを貼るか、端末の画像を1枚選びます。同じページの画像を複数問題に使うこともできます。</span>${problem.image?`<img id="imagePreview" class="image-preview" src="${esc(problem.image)}" alt="現在の問題画像">`:""}</div>
  <div class="field"><button class="button" type="button" id="generateAi">✨ AIで解説を作成して保存</button><span id="aiStatus" class="field-hint">問題文または問題画像をもとに、正解・解説・ポイントを自動入力します。</span></div>
  <div class="editor-actions"><button class="button primary" type="submit">保存する</button><button class="button danger" type="button" id="delete">この問題を削除</button></div></form>`;
  document.querySelector("#editor").onsubmit = event => { event.preventDefault(); const v=Object.fromEntries(new FormData(event.currentTarget)); delete v.imageFile; const number=String(v.number).trim(); if (!number) return alert("問題番号・表示名を入力してください。"); if (data.problems.some(p => String(p.number)===number && p.collection===v.collection && p.id!==problem.id)) return alert("同じ年度・月に、同じ問題番号・表示名がすでにあります。"); Object.assign(problem, {...v, number, updatedAt:new Date().toISOString()}); activeCollection = problem.collection; saveData(); location.hash=`#/problem/${problem.id}`; };
  document.querySelector("#imageFile").onchange = event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { document.querySelector("#imageUrl").value = reader.result; let preview = document.querySelector("#imagePreview"); if (!preview) { preview = document.createElement("img"); preview.id = "imagePreview"; preview.className = "image-preview"; preview.alt = "選択した問題画像"; event.target.closest(".field").append(preview); } preview.src = reader.result; }; reader.readAsDataURL(file); };
  document.querySelector("#generateAi").onclick = () => generateExplanation();
  document.querySelector("#delete").onclick = () => { if (confirm(`問題 ${problem.number} を削除しますか？`)) { data.problems=data.problems.filter(p=>p.id!==problem.id); saveData("問題を削除しました"); location.hash="#/"; } };
}
function field(label, name, value, long=false, hint="") { return `<div class="field"><label for="${name}">${label}</label><textarea id="${name}" name="${name}" class="${long?"long":""}" placeholder="${label}を入力">${esc(value)}</textarea>${hint?`<span class="field-hint">${hint}</span>`:""}</div>`; }
function addProblem() { const numericLabels = data.problems.filter(p => p.collection === activeCollection).map(p => Number(p.number)).filter(Number.isInteger); const next = Math.max(0, ...numericLabels) + 1; const p=blankProblem(next, activeCollection); data.problems.push(p); saveData(`${activeCollection} の問題 ${next} を追加しました`); location.hash=`#/problem/${p.id}`; }
function exportData() { const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`mondai-zukan-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); flash("データを書き出しました"); }
importInput.addEventListener("change", async () => { const file=importInput.files[0]; if(!file) return; try { const imported=JSON.parse(await file.text()); if(!Array.isArray(imported.problems)) throw new Error(); if(!confirm(`${imported.problems.length}件のデータで現在のデータを置き換えますか？`)) return; data={version:1,problems:imported.problems}; saveData("データを読み込みました"); location.hash="#/"; } catch { alert("正しい問題図鑑のJSONファイルを選択してください。"); } finally { importInput.value=""; } });
function render() { const r=route(); r.page==="detail" ? renderDetail(problemById(r.id)) : renderList(); }
window.addEventListener("hashchange", render); render();

async function generateExplanation() {
  const image = document.querySelector("#imageUrl").value.trim();
  const question = document.querySelector("#question").value.trim();
  const status = document.querySelector("#aiStatus");
  if (!image && !question) return alert("問題文を入力するか、問題画像を選んでください。");
  if (!confirm("問題文・問題画像をOpenAI APIへ送信して解説を作成します。API利用料金が発生する場合があります。続けますか？")) return;
  status.textContent = "AIが解説を作成しています。少し待ってください…";
  document.querySelector("#generateAi").disabled = true;
  try {
    const { data: result, error } = await supabase.functions.invoke("generate-explanation", { body: { image, question } });
    if (error) throw error;
    if (!result?.explanation) throw new Error("AIから解説を受け取れませんでした。");
    for (const key of ["question", "answer", "explanation", "pitfalls", "keyPoints", "keywords"]) {
      if (result[key]) document.querySelector(`#${key}`).value = Array.isArray(result[key]) ? result[key].map(item => `- ${item}`).join("\n") : result[key];
    }
    if (document.querySelector("[name=status]").value === "unanswered") document.querySelector("[name=status]").value = "explained";
    status.textContent = "作成しました。内容を確認してから「保存する」を押してください。";
  } catch (error) {
    console.error(error);
    status.textContent = "作成できませんでした。OpenAIキーとEdge Functionの設定を確認してください。";
  } finally { document.querySelector("#generateAi").disabled = false; }
}

/* ---- クラウド同期とログイン ---- */
function refreshAuthButton() { const button = document.querySelector("#authButton"); if (!button) return; button.textContent = currentUser ? "☁ 同期中" : "☁ 同期を設定"; button.onclick = currentUser ? signOut : showAuthDialog; }
async function syncToCloud() {
  const { error } = await supabase.from("user_data").upsert({ user_id: currentUser.id, data, updated_at: new Date().toISOString() });
  if (error) { console.error(error); flash("クラウド保存に失敗しました"); } else { flash("端末とクラウドに保存しました"); }
}
async function loadFromCloud() {
  const { data: remote, error } = await supabase.from("user_data").select("data").eq("user_id", currentUser.id).maybeSingle();
  if (error) { console.error(error); flash("クラウドの読み込みに失敗しました"); return; }
  if (remote?.data?.problems) { data = remote.data; localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); flash("クラウドのデータを読み込みました"); render(); }
  else syncToCloud();
}
function closeAuthDialog() { document.querySelector("#authModal")?.remove(); }
function showAuthDialog() {
  document.body.insertAdjacentHTML("beforeend", `<div id="authModal" class="modal-backdrop"><form id="authForm" class="modal"><h2>自動同期を設定</h2><p class="help">同じメールアドレスでログインすると、PCとスマホのデータが自動でそろいます。</p><div class="field"><label>メールアドレス</label><input name="email" type="email" required autocomplete="email"></div><div class="field"><label>パスワード</label><input name="password" type="password" required minlength="6" autocomplete="current-password"><span class="field-hint">6文字以上で設定します。</span></div><p id="authMessage" class="help"></p><div class="modal-actions"><button class="button" type="button" id="closeAuth">閉じる</button><button class="button" type="button" id="signUp">初めて使う</button><button class="button primary" type="submit">ログイン</button></div></form></div>`);
  const form = document.querySelector("#authForm"); const message = document.querySelector("#authMessage");
  document.querySelector("#closeAuth").onclick = closeAuthDialog;
  document.querySelector("#signUp").onclick = async () => { if (!form.reportValidity()) return; const v = Object.fromEntries(new FormData(form)); const { error } = await supabase.auth.signUp({ email:v.email, password:v.password, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } }); message.textContent = error ? `登録できませんでした：${error.message}` : "確認メールを送りました。メール内のリンクを開いた後、ログインしてください。"; };
  form.onsubmit = async event => { event.preventDefault(); const v = Object.fromEntries(new FormData(form)); const { error } = await supabase.auth.signInWithPassword({ email:v.email, password:v.password }); message.textContent = error ? "メールアドレスまたはパスワードを確認してください。" : "ログインしました。"; };
}
async function signOut() { await supabase.auth.signOut(); currentUser = null; refreshAuthButton(); flash("この端末からログアウトしました"); }
async function initializeSync() { const { data: { session } } = await supabase.auth.getSession(); currentUser = session?.user ?? null; refreshAuthButton(); if (currentUser) loadFromCloud(); supabase.auth.onAuthStateChange((_event, session) => { const wasLoggedIn = Boolean(currentUser); currentUser = session?.user ?? null; refreshAuthButton(); if (currentUser && !wasLoggedIn) { closeAuthDialog(); loadFromCloud(); } }); }
initializeSync();
