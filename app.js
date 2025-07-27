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
    console.log("📴 Data channel closed after sending.");
    showStatus("📴 Transfer complete. Channel closed.");
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
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("signal", {
        room: document.getElementById("receive-room").value.trim(),
        data: { answer }
      });
    } else if (data.answer && !peerConnection.currentRemoteDescription && peerConnection.signalingState === "have-local-offer") {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  } catch (err) {
    console.error("❌ Signaling error:", err);
  }
});

// File sender
async function sendFile(file) {
  if (!dataChannel || dataChannel.readyState !== "open") {
    console.warn("❌ Data channel not open.");
    return;
  }

  try {
    // Send file metadata first
    dataChannel.send(JSON.stringify({ fileName: file.name, fileSize: file.size }));

    const chunkSize = 16 * 1024;
    let offset = 0;

    while (offset < file.size) {
      if (dataChannel.readyState !== "open") {
        throw new Error("Data channel closed before sending finished.");
      }

      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();

      // Avoid flooding the buffer
      while (dataChannel.bufferedAmount > 4 * chunkSize) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      dataChannel.send(buffer);
      offset += chunkSize;
    }

    showStatus("✅ File fully sent. Closing channel...");
    setTimeout(() => {
      if (dataChannel.readyState === "open") {
        dataChannel.close();
      }
    }, 500); // Let last chunk flush

  } catch (err) {
    console.error("❌ Send error:", err);
    showStatus("❌ Failed to send file. Try again.");
  } finally {
    document.getElementById("file-input").value = "";
  }
}
