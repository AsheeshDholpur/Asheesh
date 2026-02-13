console.log("✅ app.js loaded");

// ================= SOCKET =================

const socket = io("https://webrtc-signaling-server-6uvt.onrender.com");

// ================= GLOBAL STATE =================

let peerConnection;
let dataChannel;

let receivedBuffers = [];
let receivedSize = 0;
let incomingFileInfo = null;
let sendStartTime = 0;

let currentRoom = null;
let pendingCandidates = [];
let transferActive = false;

function waitForDataChannelOpen(channel) {
  return new Promise((resolve, reject) => {
    if (channel.readyState === "open") return resolve();
    channel.onopen = () => resolve();
    channel.onerror = (err) => reject(err);
  });
}

// ================= RTC CONFIG =================

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require"
};


// ================= UI HELPERS =================

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
  }

  if (type === "receive") {
    document.getElementById("receive-progress-group").style.display = "block";
    document.getElementById("receive-progress").value = percent;
    document.getElementById("receive-progress-text").textContent = text;
  }
}

function hideProgress(type) {

  if (type === "send") {
    document.getElementById("send-progress-group").style.display = "none";
  }

  if (type === "receive") {
    document.getElementById("receive-progress-group").style.display = "none";
  }
}

function showDisconnect(type) {

  if (type === "send") {
    showStatus("❌ Transfer interrupted.");
    hideProgress("send");
  }

  if (type === "receive") {
    showStatus("❌ Transfer interrupted.");
    hideProgress("receive");
  }
}

// ================= SEND =================

document.getElementById("send-btn").onclick = async () => {
  if (transferActive) {
  alert("Transfer already in progress.");
  return;
}

transferActive = true;

  const room = document.getElementById("send-room").value.trim();
  const file = document.getElementById("file-input").files[0];
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

if (file.size > MAX_FILE_SIZE) {
  alert("File too large (Max 2GB allowed).");
  return;
}

  if (!room || !file) {
    alert("Room ID and file required.");
    return;
  }

  currentRoom = room;

  peerConnection = new RTCPeerConnection(config);
  peerConnection.onconnectionstatechange = () => {
  showStatus(`🔗 Connection: ${peerConnection.connectionState}`);
};

  dataChannel = peerConnection.createDataChannel("file", {
  ordered: true,
  maxRetransmits: null
});

// Increase internal buffer threshold
dataChannel.bufferedAmountLowThreshold = 4 * 1024 * 1024; // 4MB


  dataChannel.onopen = async () => {
  try {
    showStatus("✅ Peer connected. Sending file...");
    await waitForDataChannelOpen(dataChannel);
    await sendFile(file);
  } catch (err) {
    console.error("DataChannel open failed:", err);
    showDisconnect("send");
    transferActive = false;
  }
};

  dataChannel.onclose = () => {
  transferActive = false;
  showStatus("✅ Transfer finished.");
  hideProgress("send");
};

  dataChannel.onerror = err => {
  console.error("DataChannel error:", err);
  transferActive = false;
  showDisconnect("send");
};

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("signal", { room: currentRoom, data: { candidate: e.candidate } });
    }
  };

  socket.emit("join", currentRoom);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("signal", { room: currentRoom, data: { offer } });
};

// ================= RECEIVE =================

document.getElementById("receive-btn").onclick = () => {

  const room = document.getElementById("receive-room").value.trim();

  if (!room) {
    alert("Enter room ID.");
    return;
  }

  currentRoom = room;

  peerConnection = new RTCPeerConnection(config);
  peerConnection.onconnectionstatechange = () => {
  showStatus(`🔗 Connection: ${peerConnection.connectionState}`);
};

  peerConnection.ondatachannel = event => {

    const receiveChannel = event.channel;

    receiveChannel.onmessage = e => {

      if (typeof e.data === "string") {

        try {

          const meta = JSON.parse(e.data);

if (!meta.fileName || !meta.fileSize) return;

incomingFileInfo = meta;

          receivedBuffers = [];
          receivedSize = 0;

          document.getElementById("download-link").style.display = "none";

          showProgress("receive", 0, "📥 Receiving: 0%");

        } catch (err) {
          console.error("Metadata error:", err);
        }

        return;
      }

      receivedBuffers.push(e.data);
      receivedSize += e.data.byteLength;

      if (incomingFileInfo?.fileSize) {

        const percent = ((receivedSize / incomingFileInfo.fileSize) * 100).toFixed(1);

        showProgress("receive", percent, `📥 Receiving: ${percent}%`);
      }
    };

    receiveChannel.onclose = () => {

      if (receivedBuffers.length && incomingFileInfo) {

        const blob = new Blob(receivedBuffers);
        const fileName = incomingFileInfo.fileName || "received_file";

        const link = document.getElementById("download-link");

        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.textContent = `⬇️ Download ${fileName}`;
        link.style.display = "block";
        setTimeout(() => {
  URL.revokeObjectURL(link.href);
}, 60000);


        showStatus("✅ File received successfully.");

      } else {
        showDisconnect("receive");
      }

      hideProgress("receive");

      receivedBuffers = [];
      incomingFileInfo = null;
    };

    receiveChannel.onerror = err => {
      console.error("ReceiveChannel error:", err);
      showDisconnect("receive");
    };
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("signal", { room: currentRoom, data: { candidate: e.candidate } });
    }
  };

  socket.emit("join", currentRoom);
};

// ================= SIGNALING =================

socket.on("signal", async payload => {

  try {

    const data = payload.data || payload;

    if (data.offer) {

      if (!peerConnection.remoteDescription) {

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );

        for (const c of pendingCandidates) {
          await peerConnection.addIceCandidate(c);
        }
        pendingCandidates = [];

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit("signal", { room: currentRoom, data: { answer } });
      }
    }

    else if (data.answer) {

      if (!peerConnection.remoteDescription) {

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );

        for (const c of pendingCandidates) {
          await peerConnection.addIceCandidate(c);
        }
        pendingCandidates = [];
      }
    }

    else if (data.candidate) {

      const candidate = new RTCIceCandidate(data.candidate);

      if (peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(candidate);
      } else {
        pendingCandidates.push(candidate);
      }
    }

  } catch (err) {

    console.error("Signaling error:", err);
    showStatus("❌ Connection failed. Try again.");
  }

});

// ================= FILE SENDER =================

async function sendFile(file) {

  if (!dataChannel || dataChannel.readyState !== "open") {
    showDisconnect("send");
    return;
  }

  try {

    // Send metadata
    dataChannel.send(JSON.stringify({
      fileName: file.name,
      fileSize: file.size
    }));

    const chunkSize = 512 * 1024; // 512KB (much faster)
const MAX_BUFFER = 32 * 1024 * 1024; // 32MB buffer window

    let offset = 0;
    sendStartTime = Date.now();
    showProgress("send", 0, "📤 Sending: 0%");

    while (offset < file.size) {

      if (dataChannel.readyState !== "open") {
        showDisconnect("send");
        return;
      }

      if (dataChannel.bufferedAmount > MAX_BUFFER) {
  await new Promise(resolve => {
    dataChannel.onbufferedamountlow = resolve;
  });
}

      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();

      dataChannel.send(buffer);

      offset += chunkSize;

      const percent = ((offset / file.size) * 100).toFixed(1);

      const elapsed = (Date.now() - sendStartTime) / 1000;
const speedMbps = ((offset * 8) / elapsed / 1e6).toFixed(1);

showProgress(
  "send",
  percent,
  `📤 ${percent}% • ${speedMbps} Mbps`
);
    }

    while (dataChannel.bufferedAmount > 0) {
      await new Promise(r => setTimeout(r, 80));
    }

    showStatus("✅ File fully sent.");

    if (dataChannel.readyState === "open") {
  dataChannel.close();
}

  } catch (err) {

    console.error("Send error:", err);
    showDisconnect("send");

  } finally {
transferActive = false;
    document.getElementById("file-input").value = "";
    hideProgress("send");

  }
}
window.addEventListener("beforeunload", () => {
  if (peerConnection) peerConnection.close();
  socket.disconnect();
});
