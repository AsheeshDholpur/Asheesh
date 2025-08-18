let pdfDoc = null;
let pageNum = 1;
let canvas = document.getElementById("pdf-canvas");
let ctx = canvas.getContext("2d");
let isDrawing = false;

// File Upload
document.getElementById("file-input").addEventListener("change", (e) => {
  let file = e.target.files[0];
  if (file && file.type === "application/pdf") {
    let fileReader = new FileReader();
    fileReader.onload = function () {
      let typedArray = new Uint8Array(this.result);
      pdfjsLib.getDocument(typedArray).promise.then((pdf) => {
        pdfDoc = pdf;
        pageNum = 1;
        renderPage(pageNum);
      });
    };
    fileReader.readAsArrayBuffer(file);
  }
});

// Render PDF Page
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

    // Update page info
    document.getElementById("page-info").textContent = `Page ${num} / ${pdfDoc.numPages}`;
  });
}

// Prev / Next Buttons
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

// Drawing Tool
document.getElementById("draw-btn").addEventListener("click", () => {
  canvas.addEventListener("mousedown", startDrawing);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", stopDrawing);
});

function startDrawing(e) {
  isDrawing = true;
  ctx.beginPath();
  ctx.moveTo(e.offsetX, e.offsetY);
}

function draw(e) {
  if (!isDrawing) return;
  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function stopDrawing() {
  isDrawing = false;
}

// Save Edited Canvas
document.getElementById("save-btn").addEventListener("click", () => {
  let link = document.createElement("a");
  link.download = `edited-page-${pageNum}.png`;
  link.href = canvas.toDataURL();
  link.click();
});
