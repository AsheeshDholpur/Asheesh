document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ app.js loaded");

  const socket = io("https://webrtc-signaling-server-6uvt.onrender.com"); // 👈 your Render URL

  let peerConnection;
  let dataChannel;
  let receivedBuffers = [];

  const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  };

  document.getElementById("send-btn").onclick = async () => {
    console.log("📤 Send button clicked");
    const room = document.getElementById("send-room").value;
    const file = document.getElementById("file-input").files[0];
    if (!room || !file) return alert("Room and file are required.");

    console.log("Joining room:", room);
    socket.emit("join", room);

    peerConnection = new RTCPeerConnection(config);
    dataChannel = peerConnection.createDataChannel("file");

    dataChannel.onopen = () => {
      console.log("✅ Data channel open, sending file...");
      sendFile(file);
    };

    peerConnection.onicecandidate = e => {
      if (e.candidate) socket.emit("signal", { room, data: { candidate: e.candidate } });
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("signal", { room, data: { offer } });
  };

  document.getElementById("receive-btn").onclick = () => {
    console.log("📥 Receive button clicked");
    const room = document.getElementById("receive-room").value;
    if (!room) return alert("Enter room code.");

    console.log("Joining room:", room);
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
        console.log("✅ File received and ready to download");
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
});
