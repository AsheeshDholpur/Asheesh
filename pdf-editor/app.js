let pdfDoc = null;
let pageNum = 1;
let canvas = document.getElementById("pdf-canvas");
let ctx = canvas.getContext("2d");
let isDrawing = false;
let activeTool = null;

// Load PDF
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

// Render page
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

// Page navigation
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
document.getElementById("draw-btn").addEventListener("click", () => activeTool = "draw");
document.getElementById("text-btn").addEventListener("click", () => activeTool = "text");
document.getElementById("rect-btn").addEventListener("click", () => activeTool = "rect");
document.getElementById("circle-btn").addEventListener("click", () => activeTool = "circle");

// Mouse events
let startX, startY;

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
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (activeTool === "draw") {
    isDrawing = false;
  } 
  else if (activeTool === "text") {
    let text = prompt("Enter text:");
    if (text) {
      ctx.font = "20px Segoe UI";
      ctx.fillStyle = "yellow";
      ctx.fillText(text, e.offsetX, e.offsetY);
    }
  }
  else if (activeTool === "rect") {
    let width = e.offsetX - startX;
    let height = e.offsetY - startY;
    ctx.strokeStyle = "lime";
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, width, height);
  }
  else if (activeTool === "circle") {
    let radius = Math.sqrt(Math.pow(e.offsetX - startX, 2) + Math.pow(e.offsetY - startY, 2));
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(startX, startY, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
});

// Save
document.getElementById("save-btn").addEventListener("click", () => {
  let link = document.createElement("a");
  link.download = `edited-page-${pageNum}.png`;
  link.href = canvas.toDataURL();
  link.click();
});
