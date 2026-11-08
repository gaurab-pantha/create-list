const $ = (id) => document.getElementById(id);

const TOOLS = [
  ["qr", "▦", "QR Code Generator", "Text or link to QR"],
  ["mp3", "♫", "MP4 to MP3", "Pull audio from video"],
  ["bg", "✂", "Background Remover", "Cut out subjects with AI"],
  ["img", "🖼", "Image Converter", "PNG · JPG · WEBP + compress"],
  ["pw", "🔑", "Password Generator", "Strong and random"],
  ["words", "T", "Word Counter", "Words, characters, reading time"],
  ["pdf", "📄", "PDF Merge & Split", "Combine or extract pages"],
  ["age", "📅", "Age & Date Calculator", "Age and add days"],
];

function drawGrid(q = "") {
  $("grid").innerHTML = TOOLS.filter((t) => (t[2] + t[3]).toLowerCase().includes(q.toLowerCase()))
    .map(([id, ic, n, d]) => `<a class="card" href="#${id}"><span class="ic">${ic}</span><b>${n}</b><small>${d}</small></a>`)
    .join("");
}
drawGrid();
$("search").oninput = (e) => drawGrid(e.target.value);

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const base = (n) => n.replace(/\.[^.]+$/, "");
const size = (n) => (n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB");

/* ---------- QR ---------- */
let QR;
async function drawQR() {
  QR ??= (await import("https://esm.sh/qrcode@1.5.4")).default;
  const text = $("qrText").value || " ";
  await QR.toCanvas($("qrCanvas"), text, {
    width: +$("qrSize").value, margin: 2,
    color: { dark: $("qrColor").value, light: $("qrBg").value },
  });
  $("qrCanvas").style.width = "240px"; $("qrCanvas").style.height = "240px";
}
["qrText", "qrColor", "qrBg", "qrSize"].forEach((id) => ($(id).oninput = drawQR));
$("qrDl").onclick = () => $("qrCanvas").toBlob((b) => download(b, "qr-code.png"));
drawQR();

/* ---------- MP4 to MP3 ---------- */
$("mp3Go").onclick = async () => {
  const file = $("mp3File").files[0];
  if (!file) return ($("mp3Status").textContent = "Choose a file first.");
  $("mp3Go").disabled = true;
  try {
    $("mp3Status").textContent = "Reading audio…";
    const ctx = new AudioContext();
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const { Mp3Encoder } = await import("https://esm.sh/@breezystack/lamejs@1.2.7");
    const ch = Math.min(2, audio.numberOfChannels);
    const enc = new Mp3Encoder(ch, audio.sampleRate, +$("mp3Rate").value);
    const toInt = (f) => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) o[i] = Math.max(-1, Math.min(1, f[i])) * 32767; return o; };
    const L = toInt(audio.getChannelData(0));
    const R = ch > 1 ? toInt(audio.getChannelData(1)) : null;
    const parts = [];
    for (let i = 0; i < L.length; i += 1152) {
      const buf = R ? enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152)) : enc.encodeBuffer(L.subarray(i, i + 1152));
      if (buf.length) parts.push(new Uint8Array(buf));
      if (i % (1152 * 500) === 0) {
        $("mp3Status").textContent = `Converting ${Math.round((i / L.length) * 100)}%`;
        await new Promise((r) => setTimeout(r));
      }
    }
    parts.push(new Uint8Array(enc.flush()));
    const blob = new Blob(parts, { type: "audio/mpeg" });
    $("mp3Audio").src = URL.createObjectURL(blob);
    $("mp3Audio").hidden = false;
    $("mp3Status").textContent = `Done · ${size(blob.size)}`;
    download(blob, base(file.name) + ".mp3");
  } catch {
    $("mp3Status").textContent = "Could not read audio from this file.";
  }
  $("mp3Go").disabled = false;
};

/* ---------- Background remover ---------- */
$("bgGo").onclick = async () => {
  const file = $("bgFile").files[0];
  if (!file) return ($("bgStatus").textContent = "Choose an image first.");
  $("bgGo").disabled = true;
  try {
    $("bgStatus").textContent = "Loading AI model… (first time can take a minute)";
    const { removeBackground } = await import("https://esm.sh/@imgly/background-removal@1.7.0");
    $("bgStatus").textContent = "Removing background…";
    const blob = await removeBackground(file);
    $("bgOut").src = URL.createObjectURL(blob);
    $("bgOut").hidden = false;
    $("bgStatus").textContent = "Done";
    download(blob, base(file.name) + "-no-bg.png");
  } catch {
    $("bgStatus").textContent = "Something went wrong. Try a smaller image.";
  }
  $("bgGo").disabled = false;
};

/* ---------- Image converter ---------- */
$("imgQ").oninput = () => ($("imgQv").textContent = $("imgQ").value);
$("imgGo").onclick = async () => {
  const file = $("imgFile").files[0];
  if (!file) return ($("imgStatus").textContent = "Choose an image first.");
  const bmp = await createImageBitmap(file);
  const maxW = +$("imgW").value || bmp.width;
  const scale = Math.min(1, maxW / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext("2d");
  const fmt = $("imgFmt").value;
  if (fmt === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(bmp, 0, 0, c.width, c.height);
  c.toBlob((b) => {
    $("imgStatus").textContent = `${size(file.size)} → ${size(b.size)}`;
    download(b, base(file.name) + "." + fmt.split("/")[1].replace("jpeg", "jpg"));
  }, fmt, $("imgQ").value / 100);
};

/* ---------- Password ---------- */
const SETS = { pwLower: "abcdefghijklmnopqrstuvwxyz", pwUpper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", pwDigits: "0123456789", pwSym: "!@#$%^&*()-_=+[]{};:,.?" };
function newPw() {
  const chars = Object.keys(SETS).filter((k) => $(k).checked).map((k) => SETS[k]).join("");
  const len = +$("pwLen").value;
  $("pwLv").textContent = len;
  if (!chars) return ($("pwOut").textContent = "Pick at least one option");
  const r = crypto.getRandomValues(new Uint32Array(len));
  $("pwOut").textContent = Array.from(r, (n) => chars[n % chars.length]).join("");
}
["pwLen", "pwLower", "pwUpper", "pwDigits", "pwSym"].forEach((id) => ($(id).oninput = newPw));
$("pwNew").onclick = newPw;
$("pwCopy").onclick = () => navigator.clipboard.writeText($("pwOut").textContent).then(() => ($("pwCopy").textContent = "Copied!"));
newPw();

/* ---------- Word counter ---------- */
function countWords() {
  const t = $("wText").value;
  const words = (t.match(/\S+/g) || []).length;
  const stats = {
    Words: words,
    Characters: t.length,
    "No spaces": t.replace(/\s/g, "").length,
    Sentences: (t.match(/[^.!?]+[.!?]+/g) || []).length,
    Paragraphs: t.split(/\n\s*\n/).filter((p) => p.trim()).length,
    "Reading time": Math.ceil(words / 200) + " min",
  };
  $("wStats").innerHTML = Object.entries(stats).map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join("");
}
$("wText").oninput = countWords;
countWords();

/* ---------- PDF ---------- */
const pdfLib = () => import("https://esm.sh/pdf-lib@1.17.1");
$("pdfMergeGo").onclick = async () => {
  const files = [...$("pdfMerge").files];
  if (files.length < 2) return ($("pdfStatus").textContent = "Choose 2 or more PDFs.");
  try {
    const { PDFDocument } = await pdfLib();
    const out = await PDFDocument.create();
    for (const f of files) {
      const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
      (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
    }
    download(new Blob([await out.save()], { type: "application/pdf" }), "merged.pdf");
    $("pdfStatus").textContent = "Merged!";
  } catch {
    $("pdfStatus").textContent = "Could not read one of the PDFs.";
  }
};
$("pdfSplitGo").onclick = async () => {
  const file = $("pdfSplit").files[0];
  if (!file) return ($("pdfStatus").textContent = "Choose a PDF first.");
  try {
    const { PDFDocument } = await pdfLib();
    const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const total = src.getPageCount();
    const input = $("pdfRanges").value.trim() || `1-${total}`;
    for (const part of input.split(",").map((s) => s.trim()).filter(Boolean)) {
      const [a, b] = part.includes("-") ? part.split("-") : [part, part];
      const start = +a || 1, end = +b || total;
      if (start < 1 || end > total || start > end) throw new Error(`"${part}" is outside 1–${total}`);
      const out = await PDFDocument.create();
      const idx = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
      (await out.copyPages(src, idx)).forEach((p) => out.addPage(p));
      download(new Blob([await out.save()], { type: "application/pdf" }), `${base(file.name)}-p${start}-${end}.pdf`);
    }
    $("pdfStatus").textContent = "Done!";
  } catch (e) {
    $("pdfStatus").textContent = e.message || "Split failed.";
  }
};

/* ---------- Age & date ---------- */
const parse = (v) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (d) => d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "long", day: "numeric" });
const dayDiff = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
function addMonths(d, m) {
  const y = d.getFullYear() + Math.floor((d.getMonth() + m) / 12), mo = (d.getMonth() + m) % 12;
  return new Date(y, mo, Math.min(d.getDate(), new Date(y, mo + 1, 0).getDate()));
}
const today = new Date().toISOString().slice(0, 10);
$("aTo").value = today;
$("dStart").value = today;

function calcAge() {
  if (!$("aFrom").value || !$("aTo").value) return;
  const from = parse($("aFrom").value), to = parse($("aTo").value);
  if (to < from) return ($("aStats").innerHTML = "<div>Until date is before birth date</div>");
  let m = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  if (dayDiff(addMonths(from, m), to) < 0) m--;
  const days = dayDiff(addMonths(from, m), to), total = dayDiff(from, to);
  const stats = { Years: Math.floor(m / 12), Months: m % 12, Days: days, "Total days": total, "Total weeks": Math.floor(total / 7) };
  $("aStats").innerHTML = Object.entries(stats).map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join("");
}
function calcAdd() {
  if (!$("dStart").value) return;
  const d = parse($("dStart").value);
  d.setDate(d.getDate() + (+$("dDays").value || 0));
  $("dOut").textContent = fmt(d);
}
["aFrom", "aTo"].forEach((id) => ($(id).oninput = calcAge));
["dStart", "dDays"].forEach((id) => ($(id).oninput = calcAdd));
calcAge();
calcAdd();
