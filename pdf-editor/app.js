// ===== PDF.js Configuration =====
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

// ===== Application State =====
const state = {
  pdfDoc: null,
  pageNum: 1,
  canvas: document.getElementById("pdf-canvas"),
  ctx: document.getElementById("pdf-canvas").getContext("2d"),
  isDrawing: false,
  activeTool: null,
  drawColor: document.getElementById("color-picker").value,
  startX: 0,
  startY: 0
};

// ===== Event Listeners Setup =====
function initializeEventListeners() {
  // Color picker
  document.getElementById("color-picker").addEventListener("input", handleColorChange);
  
  // File input
  document.getElementById("file-input").addEventListener("change", handleFileLoad);
  
  // Navigation
  document.getElementById("prev-page").addEventListener("click", () => navigatePage(-1));
  document.getElementById("next-page").addEventListener("click", () => navigatePage(1));
  
  // Tools
  document.getElementById("draw-btn").addEventListener("click", () => setActiveTool("draw"));
  document.getElementById("text-btn").addEventListener("click", () => setActiveTool("text"));
  document.getElementById("rect-btn").addEventListener("click", () => setActiveTool("rect"));
  document.getElementById("circle-btn").addEventListener("click", () => setActiveTool("circle"));
  document.getElementById("line-btn").addEventListener("click", () => setActiveTool("line"));
  
  // Canvas interactions
  state.canvas.addEventListener("mousedown", handleMouseDown);
  state.canvas.addEventListener("mousemove", handleMouseMove);
  state.canvas.addEventListener("mouseup", handleMouseUp);
  
  // Save functionality
  document.getElementById("save-btn").addEventListener("click", savePDF);
}

// ===== Event Handlers =====
function handleColorChange(e) {
  state.drawColor = e.target.value;
}

function handleFileLoad(e) {
  const file = e.target.files[0];
  if (!file || file.type !== "application/pdf") return;
  
  const fileReader = new FileReader();
  fileReader.onload = function() {
    const typedArray = new Uint8Array(this.result);
    pdfjsLib.getDocument({ data: typedArray }).promise.then(pdf => {
      state.pdfDoc = pdf;
      state.pageNum = 1;
      renderPage(state.pageNum);
      
      // Show navigation for multi-page PDFs
      if (pdf.numPages > 1) {
        document.getElementById("nav-controls").style.display = "flex";
      }
    });
  };
  fileReader.readAsArrayBuffer(file);
}

function setActiveTool(tool) {
  state.activeTool = tool;
}

function navigatePage(direction) {
  const newPage = state.pageNum + direction;
  if (newPage < 1 || newPage > state.pdfDoc.numPages) return;
  
  state.pageNum = newPage;
  renderPage(state.pageNum);
}

// ===== Canvas Drawing Handlers =====
function handleMouseDown(e) {
  state.startX = e.offsetX;
  state.startY = e.offsetY;
  
  if (state.activeTool === "draw") {
    state.isDrawing = true;
    state.ctx.beginPath();
    state.ctx.moveTo(state.startX, state.startY);
  }
}

function handleMouseMove(e) {
  if (state.activeTool === "draw" && state.isDrawing) {
    state.ctx.lineTo(e.offsetX, e.offsetY);
    state.ctx.strokeStyle = state.drawColor;
    state.ctx.lineWidth = 2;
    state.ctx.stroke();
  }
}

function handleMouseUp(e) {
  if (state.activeTool === "draw") {
    state.isDrawing = false;
    return;
  }
  
  const drawingActions = {
    text: () => drawText(e.offsetX, e.offsetY),
    rect: () => drawRectangle(e.offsetX, e.offsetY),
    circle: () => drawCircle(e.offsetX, e.offsetY),
    line: () => drawLine(e.offsetX, e.offsetY)
  };
  
  const action = drawingActions[state.activeTool];
  if (action) action();
}

// ===== Drawing Functions =====
function drawText(x, y) {
  const text = prompt("Enter text:");
  if (!text) return;
  
  state.ctx.font = "20px Segoe UI";
  state.ctx.fillStyle = state.drawColor;
  state.ctx.fillText(text, x, y);
}

function drawRectangle(endX, endY) {
  const width = endX - state.startX;
  const height = endY - state.startY;
  
  state.ctx.strokeStyle = state.drawColor;
  state.ctx.lineWidth = 2;
  state.ctx.strokeRect(state.startX, state.startY, width, height);
}

function drawCircle(endX, endY) {
  const radius = Math.sqrt(
    Math.pow(endX - state.startX, 2) + Math.pow(endY - state.startY, 2)
  );
  
  state.ctx.strokeStyle = state.drawColor;
  state.ctx.lineWidth = 2;
  state.ctx.beginPath();
  state.ctx.arc(state.startX, state.startY, radius, 0, Math.PI * 2);
  state.ctx.stroke();
}

function drawLine(endX, endY) {
  state.ctx.strokeStyle = state.drawColor;
  state.ctx.lineWidth = 2;
  state.ctx.beginPath();
  state.ctx.moveTo(state.startX, state.startY);
  state.ctx.lineTo(endX, endY);
  state.ctx.stroke();
}

// ===== PDF Rendering =====
function renderPage(pageNumber) {
  state.pdfDoc.getPage(pageNumber).then(page => {
    const viewport = page.getViewport({ scale: 1.3 });
    
    state.canvas.height = viewport.height;
    state.canvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: state.ctx,
      viewport: viewport
    };
    
    page.render(renderContext);
    document.getElementById("page-info").textContent = 
      `Page ${pageNumber} / ${state.pdfDoc.numPages}`;
  });
}

// ===== PDF Export =====
async function savePDF() {
  if (!state.pdfDoc) return;
  
  try {
    const { PDFDocument } = PDFLib;
    const pdfBytes = await state.pdfDoc.getData();
    const existingPdf = await PDFDocument.load(pdfBytes);
    
    const page = existingPdf.getPages()[state.pageNum - 1];
    const pngDataUrl = state.canvas.toDataURL("image/png");
    const pngImage = await existingPdf.embedPng(pngDataUrl);
    
    const { width, height } = page.getSize();
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width,
      height
    });
    
    const newPdfBytes = await existingPdf.save();
    downloadFile(newPdfBytes, "edited.pdf");
  } catch (error) {
    console.error("Error saving PDF:", error);
    alert("Failed to save PDF. Please try again.");
  }
}

function downloadFile(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  
  // Clean up the object URL
  setTimeout(() => URL.revokeObjectURL(link.href), 100);
}

// ===== Initialize Application =====
document.addEventListener("DOMContentLoaded", initializeEventListeners);
