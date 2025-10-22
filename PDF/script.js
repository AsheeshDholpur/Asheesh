let images = [];
let currentCanvas = null;

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  document.getElementById('camera').srcObject = stream;
}

function capturePhoto() {
  const video = document.getElementById('camera');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  images.push(canvas);
  displayPreview(canvas);
}

function displayPreview(canvas) {
  const container = document.createElement('div');
  container.appendChild(canvas);
  
  // Crop Button
  const cropBtn = document.createElement('button');
  cropBtn.innerText = '✂️ Crop';
  cropBtn.onclick = () => cropImage(canvas);
  container.appendChild(cropBtn);

  document.getElementById('preview-area').appendChild(container);
}

function enhanceCurrentImage() {
  if (images.length === 0) return alert("No image to enhance!");
  const canvas = images[images.length - 1];
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Simple brightness/contrast enhancement
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * 1.1 + 10);     // R
    data[i + 1] = Math.min(255, data[i + 1] * 1.1 + 10); // G
    data[i + 2] = Math.min(255, data[i + 2] * 1.1 + 10); // B
  }

  ctx.putImageData(imageData, 0, 0);
}

function cropImage(canvas) {
  const cropX = prompt("Enter X (start) for crop:", 50);
  const cropY = prompt("Enter Y (start) for crop:", 50);
  const cropWidth = prompt("Enter Width for crop:", canvas.width - 100);
  const cropHeight = prompt("Enter Height for crop:", canvas.height - 100);

  const ctx = canvas.getContext('2d');
  const cropped = ctx.getImageData(cropX, cropY, cropWidth, cropHeight);

  canvas.width = cropWidth;
  canvas.height = cropHeight;
  ctx.putImageData(cropped, 0, 0);
}

async function exportPDF() {
  const docName = prompt("Enter document name:", "MyDocument");
  if (!docName) return;

  const pdfDoc = await PDFLib.PDFDocument.create();

  for (const canvas of images) {
    const imgData = canvas.toDataURL('image/jpeg', 0.5); // Compress here
    const imgBytes = await fetch(imgData).then(res => res.arrayBuffer());
    const jpgImage = await pdfDoc.embedJpg(imgBytes);
    const page = pdfDoc.addPage([jpgImage.width, jpgImage.height]);
    page.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: jpgImage.width,
      height: jpgImage.height
    });
  }

  const pdfBytes = await pdfDoc.save();

  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${docName}.pdf`;
  link.click();
}

startCamera();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW registered: ', reg.scope))
      .catch(err => console.error('SW registration failed: ', err));
  });
}
