console.log("✅ app.js loaded");

// ================= CONFIG =================

const socket = io("https://webrtc-signaling-server-6uvt.onrender.com");

let peerConnection;
let dataChannel;

let receivedBuffers = [];
let incomingFileInfo = null;

let currentRoom = null;
let pendingCandidates = [];

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" }
  ]
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
    showStatus("❌ Transfer interrupted or receiver disconnected.");
    hideProgress("send");
  }

  if (type === "receive") {
    showStatus("❌ Transfer interrupted or sender disconnected.");
    hideProgress("receive");
  }
}

// ================= SEND =================

document.getElementById("send-btn").onclick = async () => {

  const room = document.getElementById("send-room").value.trim();
  const file = document.getElementById("file-input").files[0];

  if (!room || !file) {
    alert("Room ID and file are required.");
    return;
  }

  currentRoom = room;

  peerConnection = new RTCPeerConnection(config);
  dataChannel = peerConnection.createDataChannel("file");

  dataChannel.onopen = () => {
    showStatus("✅ Connected. Sending file...");
    sendFile(file);
  };

  dataChannel.onclose = () => {
    showStatus("✅ Transfer complete.");
    hideProgress("send");
  };

  dataChannel.onerror = err => {
    console.error("DataChannel error:", err);
    showStatus("❌ Network error during transfer.");
    hideProgress("send");
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

  peerConnection.ondatachannel = event => {

    const receiveChannel = event.channel;

    receiveChannel.onmessage = e => {

      if (typeof e.data === "string") {

        try {
          incomingFileInfo = JSON.parse(e.data);
          receivedBuffers = [];

          document.getElementById("download-link").style.display = "none";

          showProgress("receive", 0, "📥 Receiving: 0%");
        } catch (err) {
          console.error("Metadata parse error:", err);
        }

        return;
      }

      receivedBuffers.push(e.data);

      if (incomingFileInfo?.fileSize) {

        const receivedBytes = receivedBuffers.reduce(
          (acc, curr) => acc + curr.byteLength,
          0
        );

        const percent = ((receivedBytes / incomingFileInfo.fileSize) * 100).toFixed(1);

        showProgress("receive", percent, `📥 Receiving: ${percent}%`);
      }
    };

    receiveChannel.onclose = () => {

      if (receivedBuffers.length && incomingFileInfo?.fileSize) {

        const receivedBlob = new Blob(receivedBuffers);
        const fileName = incomingFileInfo.fileName || "received_file";

        const downloadLink = document.getElementById("download-link");

        downloadLink.href = URL.createObjectURL(receivedBlob);
        downloadLink.download = fileName;
        downloadLink.textContent = `⬇️ Download ${fileName}`;
        downloadLink.style.display = "block";

        showStatus("✅ File received successfully.");
      } else {
        showStatus("❌ Transfer interrupted.");
      }

      hideProgress("receive");

      receivedBuffers = [];
      incomingFileInfo = null;
    };

    receiveChannel.onerror = err => {
      console.error("ReceiveChannel error:", err);
      showStatus("❌ Network error during receive.");
      hideProgress("receive");
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

        // Apply queued ICE
        for (const c of pendingCandidates) {
          await peerConnection.addIceCandidate(c);
        }
        pendingCandidates = [];

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit("signal", {
          room: currentRoom,
          data: { answer }
        });
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

    console.error("❌ Signaling error:", err);
    showStatus("❌ Connection error. Please retry.");
  }

});

// ================= FILE SENDER =================

async function sendFile(file) {

  if (!dataChannel || dataChannel.readyState !== "open") {
    showStatus("❌ Connection not ready.");
    hideProgress("send");
    return;
  }

  try {

    // Send metadata
    dataChannel.send(JSON.stringify({
      fileName: file.name,
      fileSize: file.size
    }));

    const chunkSize = 256 * 1024;
    dataChannel.bufferedAmountLowThreshold = chunkSize * 10;

    let offset = 0;

    function waitForBufferLow() {

      return new Promise(resolve => {

        if (dataChannel.bufferedAmount < chunkSize * 10) {
          resolve();
        } else {
          dataChannel.onbufferedamountlow = () => {
            dataChannel.onbufferedamountlow = null;
            resolve();
          };
        }
      });
    }

    showProgress("send", 0, "📤 Sending: 0%");

    while (offset < file.size) {

      if (dataChannel.readyState !== "open") {
        showDisconnect("send");
        return;
      }

      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();

      await waitForBufferLow();

      dataChannel.send(buffer);

      offset += chunkSize;

      const percent = ((offset / file.size) * 100).toFixed(1);

      showProgress("send", percent, `📤 Sending: ${percent}%`);
    }

    // Flush buffer safely
    while (dataChannel.bufferedAmount > 0) {
      await new Promise(r => setTimeout(r, 100));
    }

    showStatus("✅ File fully sent.");

    setTimeout(() => {
      if (dataChannel && dataChannel.readyState === "open") {
        dataChannel.close();
      }
    }, 800);

  } catch (err) {

    console.error("Send error:", err);
    showDisconnect("send");

  } finally {

    document.getElementById("file-input").value = "";
    hideProgress("send");

  }
}
