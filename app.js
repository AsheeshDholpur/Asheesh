console.log("✅ app.js loaded");

const socket = io("https://webrtc-signaling-server-6uvt.onrender.com"); // Use your Render URL

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

// Custom cursor
const cursor = document.querySelector('.cursor');
document.addEventListener('mousemove', e => {
  cursor.style.left = `${e.clientX}px`;
  cursor.style.top = `${e.clientY}px`;
});

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

  dataChannel.onclose = () => {
    showStatus("🔒 Data channel closed");
  };

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

      // Cleanup
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
    // Send metadata first
    dataChannel.send(JSON.stringify({ fileName: file.name, fileSize: file.size }));

    const chunkSize = 16 * 1024; // 16 KB chunks
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

    // Wait for buffered data to be sent before closing
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
