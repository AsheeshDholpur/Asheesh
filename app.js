document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ app.js loaded");

  const socket = io("https://webrtc-signaling-server-6uvt.onrender.com");

  const connectBtn = document.getElementById("connect-btn");
  const sendBtn = document.getElementById("send-btn");
  const fileInput = document.getElementById("file-input");
  const statusMsg = document.getElementById("status-message");
  const fileSection = document.getElementById("file-section");

  let peerConnection;
  let dataChannel;
  let receivedBuffers = [];
  let isInitiator = false;
  let room = "";

  const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  };

  connectBtn.onclick = () => {
    room = document.getElementById("room-id").value;
    if (!room) return alert("Enter a room code");

    socket.emit("join", room);
    console.log("Joining room:", room);
    statusMsg.textContent = "Waiting for another peer to join...";

    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = e => {
      if (e.candidate) socket.emit("signal", { room, data: { candidate: e.candidate } });
    };

    peerConnection.ondatachannel = event => {
      const receiveChannel = event.channel;
      statusMsg.textContent = "Connected! Waiting for file...";
      fileSection.style.display = "block";

      receiveChannel.onmessage = e => receivedBuffers.push(e.data);
      receiveChannel.onclose = () => {
        const received = new Blob(receivedBuffers);
        const link = document.getElementById("download-link");
        link.href = URL.createObjectURL(received);
        link.download = "received_file";
        link.style.display = "block";
        link.textContent = "Download File";
        statusMsg.textContent = "✅ File received!";
      };
    };
  };

  socket.on("created", () => {
    isInitiator = true;
    console.log("You created the room, waiting for peer...");
  });

  socket.on("ready", async () => {
    if (isInitiator) {
      dataChannel = peerConnection.createDataChannel("file");
      dataChannel.onopen = () => {
        statusMsg.textContent = "Connected! You can now send a file.";
        fileSection.style.display = "block";
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("signal", { room, data: { offer } });
    }
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
        console.error("ICE candidate error", e);
      }
    }
  });

  sendBtn.onclick = () => {
    const file = fileInput.files[0];
    if (!file || !dataChannel || dataChannel.readyState !== "open") {
      return alert("No file or connection not ready.");
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
