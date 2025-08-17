console.log("✅ app.js loaded");

const socket = io("https://webrtc-signaling-server-6uvt.onrender.com"); // Use your Render URL

let peerConnection;
let dataChannel;
let receivedBuffers = [];
let incomingFileInfo = null;

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

const statusEl = document.getElementById("status");
function showStatus(message) {
  statusEl.textContent = message;
  setTimeout(() => {
    if (statusEl.textContent === message) statusEl.textContent = "";
  }, 5000);
}

function showProgress(type, percent, text) {
  if (type === "send") {
    document.getElementById("send-progress-group").style.display = "block";
    document.getElementById("send-progress").value = percent;
    document.getElementById("send-progress-text").textContent = text;
  } else if (type === "receive") {
    document.getElementById("receive-progress-group").style.display = "block";
    document.getElementById("receive-progress").value = percent;
    document.getElementById("receive-progress-text").textContent = text;
  }
}
function hideProgress(type) {
  if (type === "send") {
    document.getElementById("send-progress-group").style.display = "none";
  } else if (type === "receive") {
    document.getElementById("receive-progress-group").style.display = "none";
  }
}

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
    hideProgress("send");
  };

  dataChannel.onerror = err => {
    console.error("DataChannel error:", err);
    showStatus("❌ Data channel error");
    hideProgress("send");
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
          showProgress("receive", 0, `📥 Receiving: 0%`);
        } catch (err) {
          console.error("Invalid metadata:", err);
        }
        return;
      }

      receivedBuffers.push(e.data);

      if (incomingFileInfo && incomingFileInfo.fileSize) {
        let receivedBytes = receivedBuffers.reduce((acc, curr) => acc + curr.byteLength, 0);
        let percent = ((receivedBytes / incomingFileInfo.fileSize) * 100).toFixed(1);
        showProgress("receive", percent, `📥 Receiving: ${percent}%`);
      }
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
      hideProgress("receive");

      receivedBuffers = [];
      incomingFileInfo = null;
    };

    receiveChannel.onerror = err => {
      console.error("ReceiveChannel error:", err);
      showStatus("❌ Receive channel error");
      hideProgress("receive");
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

// File sender with safe fast (not excessive) speed
async function sendFile(file) {
  if (!dataChannel || dataChannel.readyState !== "open") {
    showStatus("❌ Data channel not open.");
    console.warn("Data channel not open");
    hideProgress("send");
    return;
  }

  try {
    // Send metadata first
    dataChannel.send(JSON.stringify({ fileName: file.name, fileSize: file.size }));

    // Fast and safe
    const chunkSize = 256 * 1024; // 256 KB
    dataChannel.bufferedAmountLowThreshold = chunkSize * 10; // 2.5 MB

    let offset = 0;

    function waitForBufferLow() {
      return new Promise(resolve => {
        if (dataChannel.readyState !== "open") {
          throw new Error("Data channel closed prematurely in waitForBufferLow()");
        }
        if (dataChannel.bufferedAmount < chunkSize * 10) {
          resolve();
        } else {
          dataChannel.onbufferedamountlow = () => {
            dataChannel.onbufferedamountlow = null;
            if (dataChannel.readyState !== "open") {
              throw new Error("Data channel closed prematurely in onbufferedamountlow()");
            }
            resolve();
          };
        }
      });
    }

    showProgress("send", 0, `📤 Sending: 0%`);

    while (offset < file.size) {
      if (dataChannel.readyState !== "open") {
        throw new Error("Data channel closed prematurely (in send loop).");
      }

      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();

      await waitForBufferLow();

      if (dataChannel.readyState !== "open") {
        throw new Error("Data channel closed prematurely (before send).");
      }

      dataChannel.send(buffer);
      offset += chunkSize;

      let percent = ((offset / file.size) * 100).toFixed(1);
      showProgress("send", percent, `📤 Sending: ${percent}%`);
    }

    while (dataChannel.bufferedAmount > 0) {
      if (dataChannel.readyState !== "open") {
        throw new Error("Data channel closed before all data sent (after loop).");
      }
      await new Promise(r => setTimeout(r, 100));
    }

    showStatus("✅ File fully sent. Closing channel...");
    hideProgress("send");
    dataChannel.close();

  } catch (err) {
    console.error("❌ Send error:", err);
    showStatus("❌ Failed to send file: " + err.message);
    hideProgress("send");
  } finally {
    document.getElementById("file-input").value = "";
    hideProgress("send");
  }
}
