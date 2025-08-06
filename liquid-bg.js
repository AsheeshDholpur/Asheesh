const canvas = document.getElementById('liquid-bg');
const ctx = canvas.getContext('2d');
let width = window.innerWidth, height = window.innerHeight;
canvas.width = width;
canvas.height = height;

// Watery blobs
const blobs = [];
for (let i = 0; i < 7; i++) {
  blobs.push({
    x: Math.random() * width,
    y: Math.random() * height,
    r: 110 + Math.random() * 60,
    dx: (Math.random() - 0.5) * 1.2,
    dy: (Math.random() - 0.5) * 1.2
  });
}

let cursor = { x: width / 2, y: height / 2, r: 170 };
window.addEventListener('mousemove', e => {
  cursor.x = e.clientX;
  cursor.y = e.clientY;
});

// Resize
window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
});

function drawBlob(b) {
  const gradient = ctx.createRadialGradient(
    b.x, b.y, 18, b.x, b.y, b.r
  );
  gradient.addColorStop(0, "rgba(0,255,255,0.18)");
  gradient.addColorStop(0.55, "rgba(0,255,170,0.12)");
  gradient.addColorStop(1, "rgba(0,0,10,0.01)");
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, 2 * Math.PI);
  ctx.fillStyle = gradient;
  ctx.fill();
}

function animate() {
  ctx.clearRect(0, 0, width, height);
  blobs.forEach(b => {
    // Float around
    b.x += b.dx; b.y += b.dy;
    if (b.x - b.r < 0 || b.x + b.r > width) b.dx *= -1;
    if (b.y - b.r < 0 || b.y + b.r > height) b.dy *= -1;
    drawBlob(b);
  });

  // Draw mouse-following big blob
  drawBlob(cursor);

  requestAnimationFrame(animate);
}
animate();
