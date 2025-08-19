let pdfDoc = null;
let originalPdfBytes = null; // store uploaded file
let pageNum = 1;

let pdfCanvas = document.getElementById("pdf-canvas");
let overlayCanvas = document.getElementById("overlay-canvas");
let pdfCtx = pdfCanvas.getContext("2d");
let overlayCtx = overlayCanvas.getContext("2d");

let drawColor = document.getElementById("color-picker").value;
let activeTool = null;
let isDrawing = false;
let startX, startY;

let annotations = {}; // per-page storage
let undoStack = [];

const textInput = document.getElementById("text-input");

// Color Picker
document.getElementById("color-picker").addEventListener("input", (e) => {
  drawColor = e.target.value;
});

// Upload & load PDF
document.getElementById("file-input").addEventListener("change", (e) => {
  let file = e.target.files[0];
  if (file && file.type === "application/pdf") {
    let fileReader = new FileReader();
    fileReader.onload = function () {
      originalPdfBytes = new Uint8Array(this.result); // save file
      pdfjsLib.getDocument(originalPdfBytes).promise.then((pdf) => {
        pdfDoc = pdf;
        pageNum = 1;
        renderPage(pageNum);

        if (pdfDoc.numPages > 1) {
          document.getElementById("nav-controls").style.display = "flex";
        }
      });
    };
    fileReader.readAsArrayBuffer(file);
  }
});

// Render Page
function renderPage(num) {
  pdfDoc.getPage(num).then((page) => {
    let viewport = page.getViewport({ scale: 1.3 });
    pdfCanvas.height = viewport.height;
    pdfCanvas.width = viewport.width;
    overlayCanvas.height = viewport.height;
    overlayCanvas.width = viewport.width;

    let renderContext = { canvasContext: pdfCtx, viewport: viewport };
    page.render(renderContext);

    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (annotations[num]) {
      annotations[num].forEach(drawAnnotation);
    }

    document.getElementById("page-info").textContent =
      `Page ${num} / ${pdfDoc.numPages}`;
  });
}

// Navigation
document.getElementById("prev-page").addEventListener("click", () => {
  if (pageNum <= 1) return;
  pageNum--;
  renderPage(pageNum);
});

document.getElementById("next-page").addEventListener("click", () => {
  if (pageNum >= pdfDoc.numPages) return;
  pageNum++;
  renderPage(pageNum);
});

// Tool Buttons
function setTool(tool) {
  activeTool = tool;
  document.querySelectorAll(".btn").forEach(b => b.classList.remove("active"));
  if (tool) document.getElementById(tool + "-btn").classList.add("active");
}

document.getElementById("draw-btn").addEventListener("click", () => setTool("draw"));
document.getElementById("text-btn").addEventListener("click", () => setTool("text"));
document.getElementById("rect-btn").addEventListener("click", () => setTool("rect"));
document.getElementById("circle-btn").addEventListener("click", () => setTool("circle"));
document.getElementById("line-btn").addEventListener("click", () => setTool("line"));

// Mouse Events
overlayCanvas.addEventListener("mousedown", (e) => {
  startX = e.offsetX;
  startY = e.offsetY;

  if (activeTool === "draw") {
    isDrawing = true;
    overlayCtx.beginPath();
    overlayCtx.moveTo(startX, startY);
  } else if (activeTool === "text") {
    let rect = overlayCanvas.getBoundingClientRect();
    textInput.style.left = e.pageX + "px";
    textInput.style.top = e.pageY + "px";
    textInput.style.display = "block";
    textInput.focus();
  }
});

overlayCanvas.addEventListener("mousemove", (e) => {
  if (activeTool === "draw" && isDrawing) {
    overlayCtx.lineTo(e.offsetX, e.offsetY);
    overlayCtx.strokeStyle = drawColor;
    overlayCtx.lineWidth = 2;
    overlayCtx.stroke();
  }
});

overlayCanvas.addEventListener("mouseup", (e) => {
  if (activeTool === "draw") {
    isDrawing = false;
    saveAnnotation({ type: "path", color: drawColor, data: overlayCanvas.toDataURL() });
  } else if (activeTool === "rect") {
    let width = e.offsetX - startX;
    let height = e.offsetY - startY;
    overlayCtx.strokeStyle = drawColor;
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(startX, startY, width, height);
    saveAnnotation({ type: "rect", color: drawColor, x: startX, y: startY, w: width, h: height });
  } else if (activeTool === "circle") {
    let radius = Math.sqrt((e.offsetX - startX) ** 2 + (e.offsetY - startY) ** 2);
    overlayCtx.strokeStyle = drawColor;
    overlayCtx.lineWidth = 2;
    overlayCtx.beginPath();
    overlayCtx.arc(startX, startY, radius, 0, Math.PI * 2);
    overlayCtx.stroke();
    saveAnnotation({ type: "circle", color: drawColor, x: startX, y: startY, r: radius });
  } else if (activeTool === "line") {
    overlayCtx.strokeStyle = drawColor;
    overlayCtx.lineWidth = 2;
    overlayCtx.beginPath();
    overlayCtx.moveTo(startX, startY);
    overlayCtx.lineTo(e.offsetX, e.offsetY);
    overlayCtx.stroke();
    saveAnnotation({ type: "line", color: drawColor, x1: startX, y1: startY, x2: e.offsetX, y2: e.offsetY });
  }
});

// Text Tool
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    let text = textInput.value;
    if (text) {
      let rect = overlayCanvas.getBoundingClientRect();
      let x = parseInt(textInput.style.left) - rect.left;
      let y = parseInt(textInput.style.top) - rect.top;
      overlayCtx.font = "20px Segoe UI";
      overlayCtx.fillStyle = drawColor;
      overlayCtx.fillText(text, x, y);
      saveAnnotation({ type: "text", color: drawColor, text, x, y });
    }
    textInput.value = "";
    textInput.style.display = "none";
  }
});

// Save annotation
function saveAnnotation(ann) {
  if (!annotations[pageNum]) annotations[pageNum] = [];
  annotations[pageNum].push(ann);
  undoStack.push({ page: pageNum, ann });
}

// Draw annotation
function drawAnnotation(ann) {
  overlayCtx.strokeStyle = ann.color;
  overlayCtx.fillStyle = ann.color;
  overlayCtx.lineWidth = 2;

  switch (ann.type) {
    case "rect": overlayCtx.strokeRect(ann.x, ann.y, ann.w, ann.h); break;
    case "circle": overlayCtx.beginPath(); overlayCtx.arc(ann.x, ann.y, ann.r, 0, Math.PI*2); overlayCtx.stroke(); break;
    case "line": overlayCtx.beginPath(); overlayCtx.moveTo(ann.x1, ann.y1); overlayCtx.lineTo(ann.x2, ann.y2); overlayCtx.stroke(); break;
    case "text": overlayCtx.font = "20px Segoe UI"; overlayCtx.fillText(ann.text, ann.x, ann.y); break;
    case "path":
      let img = new Image();
      img.src = ann.data;
      img.onload = () => overlayCtx.drawImage(img, 0, 0);
      break;
  }
}

// Undo
document.getElementById("undo-btn").addEventListener("click", () => {
  if (!undoStack.length) return;
  let last = undoStack.pop();
  annotations[last.page].pop();
  renderPage(pageNum);
});

// Clear
document.getElementById("clear-btn").addEventListener("click", () => {
  annotations[pageNum] = [];
  undoStack = undoStack.filter(a => a.page !== pageNum);
  renderPage(pageNum);
});

// Save PDF
document.getElementById("save-btn").addEventListener("click", async () => {
  const { PDFDocument, rgb } = PDFLib;
  if (!originalPdfBytes) return alert("No PDF loaded!");

  const existingPdf = await PDFDocument.load(originalPdfBytes);

  for (let i = 1; i <= existingPdf.getPages().length; i++) {
    const page = existingPdf.getPages()[i - 1];
    const { width, height } = page.getSize();

    if (annotations[i]) {
      annotations[i].forEach(ann => {
        switch (ann.type) {
          case "rect":
            page.drawRectangle({ x: ann.x, y: height - ann.y - ann.h, width: ann.w, height: ann.h, borderColor: rgbHex(ann.color) });
            break;
          case "circle":
            page.drawEllipse({ x: ann.x, y: height - ann.y, xScale: ann.r, yScale: ann.r, borderColor: rgbHex(ann.color) });
            break;
          case "line":
            page.drawLine({ start: {x: ann.x1, y: height - ann.y1}, end: {x: ann.x2, y: height - ann.y2}, color: rgbHex(ann.color) });
            break;
          case "text":
            page.drawText(ann.text, { x: ann.x, y: height - ann.y, size: 20, color: rgbHex(ann.color) });
            break;
        }
      });
    }
  }

  const newPdfBytes = await existingPdf.save();
  const blob = new Blob([newPdfBytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "edited.pdf";
  link.click();
});

// Convert HEX → rgb()
function rgbHex(hex) {
  let bigint = parseInt(hex.slice(1), 16);
  return PDFLib.rgb(
    ((bigint >> 16) & 255) / 255,
    ((bigint >> 8) & 255) / 255,
    (bigint & 255) / 255
  );
}
