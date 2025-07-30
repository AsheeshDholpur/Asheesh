console.log("✅ app.js loaded");

const socket = io("https://webrtc-signaling-server-6uvt.onrender.com");

let peerConnection;
let dataChannel;
let receivedBuffers = [];
let incomingFileInfo = null;

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// Status helper
const statusEl = document.getElementById("status");
function showStatus(message) {
  statusEl.textContent = message;
  setTimeout(() => {
    if (statusEl.textContent === message) statusEl.textContent = "";
  }, 5000);
}

// === Enhanced Cursor: Squishy/Liquid Animation ===
const cursor = document.querySelector('.cursor');
let mouseX = 0, mouseY = 0;
let currentX = 0, currentY = 0;

function animateCursor() {
  // Lerp for smooth movement
  currentX += (mouseX - currentX) * 0.2;
  currentY += (mouseY - currentY) * 0.2;
  cursor.style.transform = `translate(${currentX - 24}px, ${currentY - 24}px) scale(1.05)`;
  requestAnimationFrame(animateCursor);
}

// Mouse coordinates capture
document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  cursor.style.opacity = 0.68;
});
animateCursor();

// Optional: Hide cursor when pointer leaves screen
document.addEventListener('mouseleave', ()=> {
  cursor.style.opacity = 0;
});
document.addEventListener('mouseenter', ()=> {
  cursor.style.opacity = 0.68;
});

// ==== Liquid/Blob Animated Background (using Canvas) ====

const canvas = document.createElement('canvas');
canvas.id = 'liquid-bg';
canvas.style.cssText = `
  position:fixed;z-index:0;top:0;left:0;width:100vw;height:100vh;pointer-events:none;
  background: none;display:block;
`;
document.body.appendChild(canvas);

const ctx = canvas.getContext('2d');
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

let t = 0;
function drawLiquidGradient() {
  resizeCanvas();
  const w = canvas.width, h = canvas.height, dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0,0,w,h);

  // 3 Animated blobs
  for(let i=0; i<3; i++) {
    const r = 220 + 60 * Math.sin(t + i * 1.5 + t*.5);
    const x = w/2 + (w/2-140*dpr) * Math.sin(t*0.77 + i*2.2 + t*0.2);
    const y = h/2 + (h/2-120*dpr) * Math.cos(t*0.62 + i*2.5 - t*0.24);

    const gradient = ctx.createRadialGradient(
      x, y, 0,
      x, y, r
    );
    if(i === 0) gradient.addColorStop(0, '#a081faa5');
    if(i === 1) gradient.addColorStop(0, '#89d4e9a4');
    if(i === 2) gradient.addColorStop(0, '#5b68df88');
    gradient.addColorStop(1, '#fff0');

    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.78;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  t += 0.0059 + Math.sin(t)*0.0006;
  requestAnimationFrame(drawLiquidGradient);
}
drawLiquidGradient();

// ==== APP FUNCTIONALITY (unchanged logic) ====

// Sender
document.getElementById("send-btn").onclick = async () => {
  const room = document.getElementById("send-room").value.trim();
  const file = document.getElementById("file-input").files[0];
  if (!room || !file) return alert("Room and file are required.");

  peerConnection = new RTCPeerConnection(config);
  dataChannel = peerConnection.createDataChannel("file");

  dataChannel.onopen = () => {
    showStatus("✅ Connection open, sending file...");
    sendFile(file);
  };
  dataChannel.onclose = () => showStatus("🔒 Data channel closed");
  dataChannel.onerror = err => {
    console.error("DataChannel error:", err);
    showStatus("❌ Data channel error");
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) socket.emit("signal", { room, data: { candidate: e.candidate } });
  };

  socket.emit("join", room);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("signal", { room, data: { offer } });
};

// Receiver
document.getElementById("receive-btn").onclick = () => {
  const room = document.getElementById("receive-room").value.trim();
  if (!room) return alert("Enter room code.");

  peerConnection = new RTCPeerConnection(config);

  peerConnection.ondatachannel = event => {
    const receiveChannel = event.channel;
    receiveChannel.onmessage = e => {
      if (typeof e.data === "string") {
        try {
          incomingFileInfo = JSON.parse(e.data);
          receivedBuffers = [];
          document.getElementById("download-link").style.display = "none";
        } catch (err) {
          console.error("Invalid metadata:", err);
        }
        return;
      }
      receivedBuffers.push(e.data);
    };
    receiveChannel.onclose = () => {
      const received = new Blob(receivedBuffers);
      const fileName = incomingFileInfo?.fileName || "received_file";
      const downloadLink = document.getElementById("download-link");
      downloadLink.href = URL.createObjectURL(received);
      downloadLink.download = fileName;
      downloadLink.textContent = `⬇️ Download ${fileName}`;
      downloadLink.style.display = "block";
      showStatus(`✅ File received: ${fileName}`);
      receivedBuffers = [];
      incomingFileInfo = null;
    };
    receiveChannel.onerror = err => {
      console.error("ReceiveChannel error:", err);
      showStatus("❌ Receive channel error");
    };
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) socket.emit("signal", { room, data: { candidate: e.candidate } });
  };

  socket.emit("join", room);
};

// Signaling
socket.on("signal", async data => {
  try {
    if (data.offer) {
      if (!peerConnection.currentRemoteDescription) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("signal", {
          room: document.getElementById("receive-room").value.trim(),
          data: { answer }
        });
      }
    } else if (data.answer && !peerConnection.currentRemoteDescription) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  } catch (err) {
    console.error("❌ Signaling error:", err);
    showStatus("❌ Signaling error: " + err.message);
  }
});

// File sender with backpressure handling & readyState checks
async function sendFile(file) {
  if (!dataChannel || dataChannel.readyState !== "open") {
    showStatus("❌ Data channel not open.");
    console.warn("Data channel not open");
    return;
  }
  try {
    // Send metadata
    dataChannel.send(JSON.stringify({ fileName: file.name, fileSize: file.size }));
    const chunkSize = 16 * 1024;
    let offset = 0;

    function waitForBufferLow() {
      return new Promise(resolve => {
        if (dataChannel.bufferedAmount < chunkSize * 4) {
          resolve();
        } else {
          dataChannel.onbufferedamountlow = () => {
            dataChannel.onbufferedamountlow = null;
            resolve();
          };
        }
      });
    }

    while (offset < file.size) {
      if (dataChannel.readyState !== "open") {
        throw new Error("Data channel closed prematurely.");
      }
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      await waitForBufferLow();
      if (dataChannel.readyState !== "open") {
        throw new Error("Data channel closed prematurely.");
      }
      dataChannel.send(buffer);
      offset += chunkSize;

      // Optional: show progress
      showStatus(`📤 Sending: ${((offset / file.size) * 100).toFixed(1)}%`);
    }
    // Wait for remaining in buffer
    while (dataChannel.bufferedAmount > 0) {
      if (dataChannel.readyState !== "open") {
        throw new Error("Data channel closed before all data sent.");
      }
      await new Promise(r => setTimeout(r, 100));
    }
    showStatus("✅ File fully sent. Closing channel...");
    dataChannel.close();
  } catch (err) {
    console.error("❌ Send error:", err);
    showStatus("❌ Failed to send file: " + err.message);
  } finally {
    document.getElementById("file-input").value = "";
  }
}
