console.log("✅ app.js loaded");
const socket = io("https://webrtc-signaling-server-6uvt.onrender.com"); // replace if different

let peerConnection;
let dataChannel;
let receivedBuffers = [];
let incomingFileInfo = null;

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// Sender
document.getElementById("send-btn").onclick = async () => {
  const room = document.getElementById("send-room").value;
  const file = document.getElementById("file-input").files[0];
  if (!room || !file) return alert("Room and file are required.");

  socket.emit("join", room);

  peerConnection = new RTCPeerConnection(config);
  dataChannel = peerConnection.createDataChannel("file");

  dataChannel.onopen = () => {
    console.log("✅ DataChannel open");
    sendFile(file);
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) socket.emit("signal", { room, data: { candidate: e.candidate } });
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("signal", { room, data: { offer } });
};

// Receiver
document.getElementById("receive-btn").onclick = () => {
  const room = document.getElementById("receive-room").value;
  if (!room) return alert("Enter room code.");

  socket.emit("join", room);

  peerConnection = new RTCPeerConnection(config);

  peerConnection.ondatachannel = event => {
    const receiveChannel = event.channel;

    receiveChannel.onmessage = e => {
      if (typeof e.data === "string") {
        try {
          incomingFileInfo = JSON.parse(e.data);
        } catch (err) {
          console.error("Invalid metadata:", err);
        }
        return;
      }
      receivedBuffers.push(e.data);
    };

    receiveChannel.onclose = () => {
      const received = new Blob(receivedBuffers);
      const downloadLink = document.getElementById("download-link");
      downloadLink.href = URL.createObjectURL(received);
      downloadLink.download = incomingFileInfo?.fileName || "received_file";
      downloadLink.style.display = "block";
      downloadLink.textContent = `⬇️ Download ${downloadLink.download}`;
    };
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) socket.emit("signal", { room, data: { candidate: e.candidate } });
  };
};

// Signaling
socket.on("signal", async data => {
  try {
    if (data.offer) {
      if (!peerConnection.currentRemoteDescription) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("signal", { room: document.getElementById("receive-room").value, data: { answer } });
      }
    } else if (data.answer && !peerConnection.currentRemoteDescription) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  } catch (err) {
    console.error("❌ Signaling error:", err);
  }
});

// Safe File Sender with Rate Limit
async function sendFile(file) {
  if (!dataChannel || dataChannel.readyState !== "open") {
    console.warn("❌ Data channel not open.");
    return;
  }

  // Send metadata
  dataChannel.send(JSON.stringify({ fileName: file.name, fileSize: file.size }));

  const chunkSize = 16 * 1024;
  let offset = 0;

  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkSize);
    const buffer = await slice.arrayBuffer();

    try {
      while (dataChannel.bufferedAmount > 16 * chunkSize) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      dataChannel.send(buffer);
      offset += chunkSize;

    } catch (err) {
      console.error("❌ Send error:", err);
      break;
    }
  }

  console.log("✅ File sent, closing channel.");
  dataChannel.close();
}

// Fancy cursor
const cursor = document.querySelector('.cursor');
document.addEventListener('mousemove', e => {
  cursor.style.left = `${e.clientX}px`;
  cursor.style.top = `${e.clientY}px`;
});
