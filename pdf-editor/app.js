// PDF.js config
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

let pdfDoc = null;
let pageNum = 1;
let canvas = document.getElementById("pdf-canvas");
let ctx = canvas.getContext("2d");
let isDrawing = false;
let activeTool = null;
let drawColor = document.getElementById("color-picker").value;

// Color Picker
document.getElementById("color-picker").addEventListener("input", (e) => {
  drawColor = e.target.value;
});

// Load PDF
document.getElementById("file-input").addEventListener("change", (e) => {
  let file = e.target.files[0];
  if (file && file.type === "application/pdf") {
    let fileReader = new FileReader();
    fileReader.onload = function () {
      let typedArray = new Uint8Array(this.result);
      pdfjsLib.getDocument({ data: typedArray }).promise.then((pdf) => {
        pdfDoc = pdf;
        pageNum = 1;
        renderPage(pageNum);

        // Show navigation if multiple pages
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
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    let renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };
    page.render(renderContext);

    document.getElementById("page-info").textContent = `Page ${num} / ${pdfDoc.numPages}`;
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

// Tools
document.getElementById("draw-btn").addEventListener("click", () => (activeTool = "draw"));
document.getElementById("text-btn").addEventListener("click", () => (activeTool = "text"));
document.getElementById("rect-btn").addEventListener("click", () => (activeTool = "rect"));
document.getElementById("circle-btn").addEventListener("click", () => (activeTool = "circle"));
document.getElementById("line-btn").addEventListener("click", () => (activeTool = "line"));

let startX, startY;

// Mouse Actions
canvas.addEventListener("mousedown", (e) => {
  startX = e.offsetX;
  startY = e.offsetY;

  if (activeTool === "draw") {
    isDrawing = true;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (activeTool === "draw" && isDrawing) {
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (activeTool === "draw") {
    isDrawing = false;
  } else if (activeTool === "text") {
    let text = prompt("Enter text:");
    if (text) {
      ctx.font = "20px Segoe UI";
      ctx.fillStyle = drawColor;
      ctx.fillText(text, e.offsetX, e.offsetY);
    }
  } else if (activeTool === "rect") {
    let width = e.offsetX - startX;
    let height = e.offsetY - startY;
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, width, height);
  } else if (activeTool === "circle") {
    let radius = Math.sqrt(
      Math.pow(e.offsetX - startX, 2) + Math.pow(e.offsetY - startY, 2)
    );
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(startX, startY, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (activeTool === "line") {
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
  }
});

// Save PDF
document.getElementById("save-btn").addEventListener("click", async () => {
  if (!pdfDoc) return;

  const { PDFDocument } = PDFLib;
  const pdfBytes = await pdfDoc.getData();
  const existingPdf = await PDFDocument.load(pdfBytes);

  const page = existingPdf.getPages()[pageNum - 1];
  const pngDataUrl = canvas.toDataURL("image/png");
  const pngImage = await existingPdf.embedPng(pngDataUrl);

  const { width, height } = page.getSize();
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: width,
    height: height,
  });

  const newPdfBytes = await existingPdf.save();
  const blob = new Blob([newPdfBytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "edited.pdf";
  link.click();
});
