// Minimal PDF Annotator using PDF.js for rendering and pdf-lib for export

/* global pdfjsLib, PDFLib */

(function () {
    // DOM references
    const fileInput = document.getElementById('file-input');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    const modeDrawBtn = document.getElementById('mode-draw');
    const modeTextBtn = document.getElementById('mode-text');
    const downloadBtn = document.getElementById('download');
    const pdfCanvas = document.getElementById('pdf-canvas');
    const overlayCanvas = document.getElementById('overlay-canvas');
    const textInput = document.getElementById('text-input');
    const wrap = document.getElementById('canvas-wrap');

    const pdfCtx = pdfCanvas.getContext('2d');
    const overlayCtx = overlayCanvas.getContext('2d');

    // PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js';

    // State
    let pdfDoc = null;
    let currentPage = 1;
    let pageViewport = null; // last rendered viewport
    let currentMode = null; // 'draw' | 'text' | null
    let isDrawing = false;
    let startPoint = null;
    let currentAnnotations = {}; // { [pageNumber]: Array<Annotation> }
    let shiftKeyDown = false; // if true draw straight line instead of rectangle
    let loadedPdfBytes = null; // original PDF bytes for export base

    // Annotation types
    // Rectangle: { type: 'rect', x, y, w, h, color }
    // Line: { type: 'line', x1, y1, x2, y2, color, width }
    // Text: { type: 'text', x, y, text, color, fontSize }

    function setButtonsEnabled(enabled) {
        prevBtn.disabled = !enabled;
        nextBtn.disabled = !enabled;
        modeDrawBtn.disabled = !enabled;
        modeTextBtn.disabled = !enabled;
        downloadBtn.disabled = !enabled;
    }

    function clearOverlay() {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }

    function sizeCanvasesToViewport(viewport) {
        pdfCanvas.width = Math.floor(viewport.width);
        pdfCanvas.height = Math.floor(viewport.height);
        overlayCanvas.width = pdfCanvas.width;
        overlayCanvas.height = pdfCanvas.height;
        wrap.style.width = pdfCanvas.width + 'px';
        wrap.style.height = pdfCanvas.height + 'px';
    }

    async function renderPage(pageNumber) {
        clearOverlay();
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        pageViewport = viewport;
        sizeCanvasesToViewport(viewport);

        const renderContext = {
            canvasContext: pdfCtx,
            viewport
        };
        await page.render(renderContext).promise;

        drawAllAnnotationsForPage(pageNumber);
        updatePageInfo();
    }

    function updatePageInfo() {
        pageInfo.textContent = `${currentPage} / ${pdfDoc ? pdfDoc.numPages : '-'}`;
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = pdfDoc ? currentPage >= pdfDoc.numPages : true;
    }

    function getPageAnnotations(pageNumber) {
        if (!currentAnnotations[pageNumber]) currentAnnotations[pageNumber] = [];
        return currentAnnotations[pageNumber];
    }

    function drawAllAnnotationsForPage(pageNumber) {
        clearOverlay();
        const annotations = getPageAnnotations(pageNumber);
        for (const ann of annotations) {
            drawAnnotation(ann, overlayCtx);
        }
    }

    function drawAnnotation(ann, ctx) {
        ctx.save();
        if (ann.type === 'rect') {
            ctx.strokeStyle = ann.color || '#ff3b81';
            ctx.lineWidth = ann.width || 2;
            ctx.strokeRect(ann.x, ann.y, ann.w, ann.h);
        } else if (ann.type === 'line') {
            ctx.strokeStyle = ann.color || '#4bd1ff';
            ctx.lineWidth = ann.width || 2;
            ctx.beginPath();
            ctx.moveTo(ann.x1, ann.y1);
            ctx.lineTo(ann.x2, ann.y2);
            ctx.stroke();
        } else if (ann.type === 'text') {
            ctx.fillStyle = ann.color || '#17ff9e';
            const fontSize = ann.fontSize || 16;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textBaseline = 'top';
            wrapText(ctx, ann.text, ann.x, ann.y, overlayCanvas.width - ann.x - 8, fontSize * 1.3);
        }
        ctx.restore();
    }

    function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = String(text).split(/\s+/);
        let line = '';
        for (let i = 0; i < words.length; i++) {
            const testLine = line ? line + ' ' + words[i] : words[i];
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && i > 0) {
                ctx.fillText(line, x, y);
                line = words[i];
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        if (line) ctx.fillText(line, x, y);
    }

    // Coordinate helpers
    function getCanvasPoint(evt) {
        const rect = overlayCanvas.getBoundingClientRect();
        return {
            x: (evt.clientX - rect.left) * (overlayCanvas.width / rect.width),
            y: (evt.clientY - rect.top) * (overlayCanvas.height / rect.height)
        };
    }

    // Modes
    function setMode(mode) {
        currentMode = mode;
        document.body.classList.toggle('mode-draw', mode === 'draw');
        document.body.classList.toggle('mode-text', mode === 'text');
        if (mode !== 'text') hideTextInput();
    }

    function hideTextInput() {
        textInput.style.top = '-1000px';
        textInput.style.left = '-1000px';
        textInput.value = '';
    }

    function showTextInputAt(x, y) {
        // place input relative to viewport position
        const rect = overlayCanvas.getBoundingClientRect();
        const sx = rect.left + (x / overlayCanvas.width) * rect.width;
        const sy = rect.top + (y / overlayCanvas.height) * rect.height;
        textInput.style.left = `${Math.round(sx)}px`;
        textInput.style.top = `${Math.round(sy)}px`;
        textInput.value = '';
        textInput.focus();
    }

    // Mouse handlers
    overlayCanvas.addEventListener('mousedown', (e) => {
        if (!currentMode) return;
        const pt = getCanvasPoint(e);
        if (currentMode === 'draw') {
            isDrawing = true;
            startPoint = pt;
        } else if (currentMode === 'text') {
            // Show input, on Enter create text
            showTextInputAt(pt.x, pt.y);
            textInput.onkeydown = (ke) => {
                if (ke.key === 'Enter') {
                    const text = textInput.value.trim();
                    if (text) {
                        getPageAnnotations(currentPage).push({
                            type: 'text', x: pt.x, y: pt.y, text, color: '#17ff9e', fontSize: 16
                        });
                        drawAllAnnotationsForPage(currentPage);
                        downloadBtn.disabled = false;
                    }
                    hideTextInput();
                } else if (ke.key === 'Escape') {
                    hideTextInput();
                }
            };
        }
    });

    overlayCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || currentMode !== 'draw' || !startPoint) return;
        const pt = getCanvasPoint(e);
        clearOverlay();
        drawAllAnnotationsForPage(currentPage); // redraw existing
        overlayCtx.save();
        overlayCtx.setLineDash([6, 4]);
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeStyle = shiftKeyDown ? '#4bd1ff' : '#ff3b81';
        if (shiftKeyDown) {
            overlayCtx.beginPath();
            overlayCtx.moveTo(startPoint.x, startPoint.y);
            overlayCtx.lineTo(pt.x, pt.y);
            overlayCtx.stroke();
        } else {
            overlayCtx.strokeRect(startPoint.x, startPoint.y, pt.x - startPoint.x, pt.y - startPoint.y);
        }
        overlayCtx.restore();
    });

    overlayCanvas.addEventListener('mouseup', (e) => {
        if (!isDrawing || currentMode !== 'draw' || !startPoint) return;
        const pt = getCanvasPoint(e);
        if (shiftKeyDown) {
            getPageAnnotations(currentPage).push({
                type: 'line', x1: startPoint.x, y1: startPoint.y, x2: pt.x, y2: pt.y, color: '#4bd1ff', width: 2
            });
        } else {
            const w = pt.x - startPoint.x;
            const h = pt.y - startPoint.y;
            getPageAnnotations(currentPage).push({
                type: 'rect', x: startPoint.x, y: startPoint.y, w, h, color: '#ff3b81', width: 2
            });
        }
        isDrawing = false;
        startPoint = null;
        drawAllAnnotationsForPage(currentPage);
        downloadBtn.disabled = false;
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') shiftKeyDown = true;
        if (e.key === 'Escape') {
            isDrawing = false;
            startPoint = null;
            hideTextInput();
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') shiftKeyDown = false;
    });

    // Controls
    modeDrawBtn.addEventListener('click', () => setMode(currentMode === 'draw' ? null : 'draw'));
    modeTextBtn.addEventListener('click', () => setMode(currentMode === 'text' ? null : 'text'));

    prevBtn.addEventListener('click', async () => {
        if (!pdfDoc || currentPage <= 1) return;
        currentPage -= 1;
        await renderPage(currentPage);
    });

    nextBtn.addEventListener('click', async () => {
        if (!pdfDoc || currentPage >= pdfDoc.numPages) return;
        currentPage += 1;
        await renderPage(currentPage);
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        loadedPdfBytes = new Uint8Array(await file.arrayBuffer());

        const loadingTask = pdfjsLib.getDocument({ data: loadedPdfBytes });
        pdfDoc = await loadingTask.promise;
        currentPage = 1;
        await renderPage(currentPage);
        setButtonsEnabled(true);
        setMode('draw');
    });

    // Export with pdf-lib: draw annotations on each page
    downloadBtn.addEventListener('click', async () => {
        if (!loadedPdfBytes) return;
        const { PDFDocument, rgb, StandardFonts } = PDFLib;
        const pdf = await PDFDocument.load(loadedPdfBytes);
        const font = await pdf.embedFont(StandardFonts.Helvetica);

        for (let p = 1; p <= pdf.getPageCount(); p++) {
            const page = pdf.getPage(p - 1);
            const pageSize = page.getSize();
            const anns = getPageAnnotations(p);
            if (!anns.length) continue;

            // Map canvas coords to PDF coords; both canvases match viewport width/height.
            // PDF-lib origin is bottom-left; our canvas origin is top-left.
            for (const ann of anns) {
                if (ann.type === 'rect') {
                    const x = (ann.x / overlayCanvas.width) * pageSize.width;
                    const yTop = (ann.y / overlayCanvas.height) * pageSize.height;
                    const w = (ann.w / overlayCanvas.width) * pageSize.width;
                    const h = (ann.h / overlayCanvas.height) * pageSize.height;
                    const y = pageSize.height - yTop - h;
                    const color = hexToRgb(ann.color || '#ff3b81');
                    page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(color.r, color.g, color.b), borderWidth: ann.width || 2, color: undefined });
                } else if (ann.type === 'line') {
                    const x1 = (ann.x1 / overlayCanvas.width) * pageSize.width;
                    const y1Top = (ann.y1 / overlayCanvas.height) * pageSize.height;
                    const x2 = (ann.x2 / overlayCanvas.width) * pageSize.width;
                    const y2Top = (ann.y2 / overlayCanvas.height) * pageSize.height;
                    const y1 = pageSize.height - y1Top;
                    const y2 = pageSize.height - y2Top;
                    const color = hexToRgb(ann.color || '#4bd1ff');
                    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: ann.width || 2, color: rgb(color.r, color.g, color.b) });
                } else if (ann.type === 'text') {
                    const x = (ann.x / overlayCanvas.width) * pageSize.width;
                    const yTop = (ann.y / overlayCanvas.height) * pageSize.height;
                    const y = pageSize.height - yTop - (ann.fontSize || 16);
                    const color = hexToRgb(ann.color || '#17ff9e');
                    page.drawText(String(ann.text), { x, y, size: ann.fontSize || 16, font, color: rgb(color.r, color.g, color.b) });
                }
            }
        }

        const bytes = await pdf.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'annotated.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    });

    function hexToRgb(hex) {
        const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '#ffffff');
        const r = m ? parseInt(m[1], 16) / 255 : 1;
        const g = m ? parseInt(m[2], 16) / 255 : 1;
        const b = m ? parseInt(m[3], 16) / 255 : 1;
        return { r, g, b };
    }
})();


