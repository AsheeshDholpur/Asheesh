document.addEventListener("DOMContentLoaded", () => {
  const socket = io("https://webrtc-signaling-server-6uvt.onrender.com");

  const createBtn = document.getElementById("create-btn");
  const joinBtn = document.getElementById("join-btn");
  const connectBtn = document.getElementById("connect-btn");
  const fileInput = document.getElementById("file-input");
  const sendBtn = document.getElementById("send-btn");
  const statusMsg = document.getElementById("status-message");
  const fileSection = document.getElementById("file-section");
  const roomInput = document.getElementById("room-input");
  const downloadLink = document.getElementById("download-link");

  let peerConnection;
  let dataChannel;
  let receivedBuffers = [];
  let room = "";
  let isInitiator = false;

  const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  };

  createBtn.onclick = () => {
    isInitiator = true;
    roomInput.style.display = "block";
    statusMsg.textContent = "Enter a room name to create";
  };

  joinBtn.onclick = () => {
    isInitiator = false;
    roomInput.style.display = "block";
    statusMsg.textContent = "Enter a room name to join";
  };

  connectBtn.onclick = () => {
    room = document.getElementById("room-id").value.trim();
    if (!room) return alert("Please enter a room ID");

    socket.emit("join", room);
    statusMsg.textContent = "Connecting...";
    setupPeer();
  };

  function setupPeer() {
    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = e => {
      if (e.candidate) {
        socket.emit("signal", { room, data: { candidate: e.candidate } });
      }
    };

    peerConnection.ondatachannel = event => {
      const receiveChannel = event.channel;
      statusMsg.textContent = "🟢 Connected! Ready to receive file.";
      fileSection.style.display = "block";

      receiveChannel.onmessage = e => receivedBuffers.push(e.data);
      receiveChannel.onclose = () => {
        const blob = new Blob(receivedBuffers);
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = "received_file";
        downloadLink.style.display = "block";
        downloadLink.textContent = "⬇️ Download File";
        statusMsg.textContent = "✅ File received!";
      };
    };
  }

  socket.on("created", () => {
    if (isInitiator) {
      dataChannel = peerConnection.createDataChannel("file");
      setupDataChannel();

      peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
          socket.emit("signal", { room, data: { offer: peerConnection.localDescription } });
        });
    }
  });

  socket.on("ready", () => {
    if (isInitiator) return;

    statusMsg.textContent = "🔗 Peer joined. Waiting for connection...";
  });

  socket.on("signal", async ({ data }) => {
    if (data.offer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("signal", { room, data: { answer } });
    } else if (data.answer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error("ICE error:", e);
      }
    }
  });

  function setupDataChannel() {
    dataChannel.onopen = () => {
      statusMsg.textContent = "🟢 Connected! You can now send files.";
      fileSection.style.display = "block";
    };

    dataChannel.onclose = () => console.log("Data channel closed");
  }

  sendBtn.onclick = () => {
    const file = fileInput.files[0];
    if (!file || !dataChannel || dataChannel.readyState !== "open") {
      return alert("Connection not ready or no file selected");
    }

    const chunkSize = 16 * 1024;
    const reader = new FileReader();
    let offset = 0;

    reader.onload = e => {
      dataChannel.send(e.target.result);
      offset += e.target.result.byteLength;
      if (offset < file.size) {
        readSlice(offset);
      } else {
        dataChannel.close();
        statusMsg.textContent = "✅ File sent!";
      }
    };

    const readSlice = o => {
      const slice = file.slice(offset, o + chunkSize);
      reader.readAsArrayBuffer(slice);
    };

    readSlice(0);
  };
});
