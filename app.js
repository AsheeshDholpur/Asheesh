const socket = io("https://webrtc-signaling-server-6uvt.onrender.com"); // 👈 use your Render URL here

let peerConnection;
let dataChannel;
let fileReader;
let receivedBuffers = [];

// STUN for P2P
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
      receivedBuffers.push(e.data);
    };
    receiveChannel.onclose = () => {
      const received = new Blob(receivedBuffers);
      const downloadLink = document.getElementById("download-link");
      downloadLink.href = URL.createObjectURL(received);
      downloadLink.download = "received_file";
      downloadLink.style.display = "block";
      downloadLink.textContent = "Download File";
    };
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) socket.emit("signal", { room, data: { candidate: e.candidate } });
  };
};

socket.on("signal", async data => {
  if (data.offer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("signal", { room: document.getElementById("receive-room").value, data: { answer } });
  } else if (data.answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  } else if (data.candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.error("Error adding ICE candidate", e);
    }
  }
});

function sendFile(file) {
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
    }
  };

  const readSlice = o => {
    const slice = file.slice(offset, o + chunkSize);
    reader.readAsArrayBuffer(slice);
  };

  readSlice(0);
}
