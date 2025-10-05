// ===== PDF.js Configuration =====
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

// ===== Application State =====
const state = {
  pdfDoc: null,
  pageNum: 1,
  canvas: null,
  ctx: null,
  isDrawing: false,
  activeTool: null,
  drawColor: "#000000",
  startX: 0,
  startY: 0
};

// ===== Initialize Canvas =====
function initializeCanvas() {
  state.canvas = document.getElementById("pdf-canvas");
  if (!state.canvas) {
    console.error("Canvas element not found!");
    return false;
  }
  state.ctx = state.canvas.getContext("2d");
  return true;
}

// ===== Event Listeners Setup =====
function initializeEventListeners() {
  // Initialize canvas first
  if (!initializeCanvas()) {
    console.error("Failed to initialize canvas");
    return;
  }

  // Color picker
  const colorPicker = document.getElementById("color-picker");
  if (colorPicker) {
    state.drawColor = colorPicker.value;
    colorPicker.addEventListener("input", handleColorChange);
  }
  
  // File input
  const fileInput = document.getElementById("file-input");
  if (fileInput) {
    fileInput.addEventListener("change", handleFileLoad);
  }
  
  // Navigation
  const prevBtn = document.getElementById("prev-page");
  const nextBtn = document.getElementById("next-page");
  if (prevBtn) prevBtn.addEventListener("click", () => navigatePage(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => navigatePage(1));
  
  // Tools
  const toolButtons = [
    { id: "draw-btn", tool: "draw" },
    { id: "text-btn", tool: "text" },
    { id: "rect-btn", tool: "rect" },
    { id: "circle-btn", tool: "circle" },
    { id: "line-btn", tool: "line" }
  ];
  
  toolButtons.forEach(({ id, tool }) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", () => setActiveTool(tool));
  });
  
  // Canvas interactions
  if (state.canvas) {
    state.canvas.addEventListener("mousedown", handleMouseDown);
    state.canvas.addEventListener("mousemove", handleMouseMove);
    state.canvas.addEventListener("mouseup", handleMouseUp);
  }
  
  // Save functionality
  const saveBtn = document.getElementById("save-btn");
  if (saveBtn) saveBtn.addEventListener("click", savePDF);
}

// ===== Event Handlers =====
function handleColorChange(e) {
  state.drawColor = e.target.value;
}

function handleFileLoad(e) {
  const file = e.target.files[0];
  if (!file) {
    console.log("No file selected");
    return;
  }
  
  if (file.type !== "application/pdf") {
    alert("Please select a PDF file");
    return;
  }
  
  console.log("Loading PDF file:", file.name);
  
  const fileReader = new FileReader();
  fileReader.onload = function() {
    try {
      const typedArray = new Uint8Array(this.result);
      console.log("File loaded, size:", typedArray.length);
      
      pdfjsLib.getDocument({ 
        data: typedArray,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
        cMapPacked: true
      }).promise.then(pdf => {
        console.log("PDF loaded successfully, pages:", pdf.numPages);
        state.pdfDoc = pdf;
        state.pageNum = 1;
        renderPage(state.pageNum);
        
        // Show navigation for multi-page PDFs
        const navControls = document.getElementById("nav-controls");
        if (pdf.numPages > 1 && navControls) {
          navControls.style.display = "flex";
        }
      }).catch(error => {
        console.error("Error loading PDF:", error);
        alert("Failed to load PDF. Please make sure it's a valid PDF file.");
      });
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Failed to read the file. Please try again.");
    }
  };
  
  fileReader.onerror = function() {
    console.error("FileReader error");
    alert("Failed to read the file. Please try again.");
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
  if (!state.pdfDoc) {
    console.error("No PDF document loaded");
    return;
  }
  
  console.log("Rendering page:", pageNumber);
  
  state.pdfDoc.getPage(pageNumber).then(page => {
    console.log("Page loaded, rendering...");
    
    const viewport = page.getViewport({ scale: 1.3 });
    
    // Clear canvas first
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    
    // Set canvas dimensions
    state.canvas.height = viewport.height;
    state.canvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: state.ctx,
      viewport: viewport
    };
    
    // Render the page
    page.render(renderContext).promise.then(() => {
      console.log("Page rendered successfully");
      const pageInfo = document.getElementById("page-info");
      if (pageInfo) {
        pageInfo.textContent = `Page ${pageNumber} / ${state.pdfDoc.numPages}`;
      }
    }).catch(error => {
      console.error("Error rendering page:", error);
      alert("Failed to render PDF page. Please try again.");
    });
  }).catch(error => {
    console.error("Error getting page:", error);
    alert("Failed to load PDF page. Please try again.");
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
