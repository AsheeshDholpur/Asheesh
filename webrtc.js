/* ================================================================
   WEBRTC FILE TRANSFER ENGINE
   Uses Firebase Realtime Database for signaling
   Supports multiple files, progress tracking, 100MB limit
================================================================ */

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const CHUNK_SIZE    = 64 * 1024;          // 64KB chunks
const ICE_SERVERS   = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// ── State ────────────────────────────────────────────────────────
let rtcDb         = null;   // Firebase Realtime DB reference
let peerConn      = null;   // RTCPeerConnection
let dataChannel   = null;   // RTCDataChannel
let roomRef       = null;   // Firebase room reference
let currentRole   = null;   // 'sender' | 'receiver'
let roomId        = null;

// Send queue
let sendQueue     = [];     // [{file, name, size, type}]
let sendIndex     = 0;      // current file index
let sendOffset    = 0;      // byte offset in current file

// Receive state
let recvMeta      = null;   // {name, size, type}
let recvBuffer    = [];     // received chunks
let recvBytes     = 0;

// ── Init ─────────────────────────────────────────────────────────
function initWebRTC() {
  if (!firebase.apps.length) return;
  rtcDb = firebase.database();
}

// ── Room ID generator ─────────────────────────────────────────────
function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) id += '-';
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ── Cleanup ───────────────────────────────────────────────────────
function cleanupRoom() {
  if (roomRef) roomRef.remove().catch(() => {});
  if (dataChannel) { try { dataChannel.close(); } catch(e) {} }
  if (peerConn)    { try { peerConn.close();    } catch(e) {} }
  roomRef = dataChannel = peerConn = null;
  sendQueue = []; sendIndex = 0; sendOffset = 0;
  recvMeta = null; recvBuffer = []; recvBytes = 0;
}

// ================================================================
//  SENDER FLOW
// ================================================================
async function startSend(files) {
  if (!rtcDb) { initWebRTC(); }

  cleanupRoom();
  currentRole = 'sender';

  // Validate files
  const validFiles = [];
  for (const f of files) {
    if (f.size > MAX_FILE_SIZE) {
      updateSendStatus(`"${f.name}" exceeds 100MB limit — skipped`, 'error');
      continue;
    }
    validFiles.push(f);
  }
  if (validFiles.length === 0) return;

  sendQueue = validFiles;

  // Generate Room ID and show it
  roomId = generateRoomId();
  document.getElementById('sendRoomId').value = roomId;
  updateSendStatus(`Room created: ${roomId} — waiting for receiver…`, 'info');
  showSendProgress(false);

  // Create Firebase room
  roomRef = rtcDb.ref(`rooms/${roomId}`);
  await roomRef.set({ created: Date.now(), status: 'waiting' });

  // Remove room on disconnect
  roomRef.onDisconnect().remove();

  // Create peer connection
  peerConn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // Create data channel
  dataChannel = peerConn.createDataChannel('fileTransfer', {
    ordered: true
  });
  dataChannel.binaryType = 'arraybuffer';
  setupSenderChannel();

  // Handle ICE candidates
  peerConn.onicecandidate = async (e) => {
    if (e.candidate) {
      await roomRef.child('senderCandidates').push(e.candidate.toJSON());
    }
  };

  // Create offer
  const offer = await peerConn.createOffer();
  await peerConn.setLocalDescription(offer);
  await roomRef.child('offer').set({ sdp: offer.sdp, type: offer.type });

  // Listen for answer
  roomRef.child('answer').on('value', async (snap) => {
    const answer = snap.val();
    if (answer && !peerConn.remoteDescription) {
      await peerConn.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  // Listen for receiver ICE candidates
  roomRef.child('receiverCandidates').on('child_added', async (snap) => {
    const candidate = snap.val();
    if (candidate && peerConn.remoteDescription) {
      try { await peerConn.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch(e) {}
    }
  });
}

function setupSenderChannel() {
  dataChannel.onopen = () => {
    updateSendStatus('Connected! Sending files…', 'success');
    showSendProgress(true);
    sendNextFile();
  };

  dataChannel.onerror = (e) => {
    updateSendStatus('Connection error. Try again.', 'error');
  };

  dataChannel.onclose = () => {
    if (sendIndex >= sendQueue.length) {
      updateSendStatus('✓ All files sent successfully!', 'success');
    }
  };
}

function sendNextFile() {
  if (sendIndex >= sendQueue.length) {
    // All done — send completion signal
    dataChannel.send(JSON.stringify({ type: 'done' }));
    updateSendStatus('✓ All files sent!', 'success');
    return;
  }

  const file = sendQueue[sendIndex];
  sendOffset = 0;

  // Send file metadata
  dataChannel.send(JSON.stringify({
    type: 'meta',
    name: file.name,
    size: file.size,
    fileType: file.type,
    index: sendIndex,
    total: sendQueue.length
  }));

  // Update UI
  updateSendFileInfo(file.name, sendIndex, sendQueue.length);
  sendChunk(file);
}

function sendChunk(file) {
  if (!dataChannel || dataChannel.readyState !== 'open') return;

  // Throttle if buffer is full
  if (dataChannel.bufferedAmount > CHUNK_SIZE * 8) {
    setTimeout(() => sendChunk(file), 50);
    return;
  }

  const slice = file.slice(sendOffset, sendOffset + CHUNK_SIZE);
  const reader = new FileReader();
  reader.onload = (e) => {
    if (!dataChannel || dataChannel.readyState !== 'open') return;
    dataChannel.send(e.target.result);
    sendOffset += e.target.result.byteLength;

    // Update progress
    const pct = Math.round((sendOffset / file.size) * 100);
    updateSendProgress(pct, sendOffset, file.size);

    if (sendOffset < file.size) {
      sendChunk(file);
    } else {
      // File complete
      sendIndex++;
      setTimeout(sendNextFile, 100);
    }
  };
  reader.readAsArrayBuffer(slice);
}

// ================================================================
//  RECEIVER FLOW
// ================================================================
async function startReceive(rid) {
  if (!rtcDb) { initWebRTC(); }

  cleanupRoom();
  currentRole = 'receiver';
  roomId = rid.trim();

  updateRecvStatus('Connecting to room…', 'info');

  roomRef = rtcDb.ref(`rooms/${roomId}`);
  const snap = await roomRef.once('value');
  if (!snap.exists()) {
    updateRecvStatus('Room not found. Check the Room ID.', 'error');
    return;
  }

  // Create peer connection
  peerConn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // Handle incoming data channel
  peerConn.ondatachannel = (e) => {
    dataChannel = e.channel;
    dataChannel.binaryType = 'arraybuffer';
    setupReceiverChannel();
  };

  // Handle ICE candidates
  peerConn.onicecandidate = async (e) => {
    if (e.candidate) {
      await roomRef.child('receiverCandidates').push(e.candidate.toJSON());
    }
  };

  // Get offer
  const offerSnap = await roomRef.child('offer').once('value');
  const offer = offerSnap.val();
  await peerConn.setRemoteDescription(new RTCSessionDescription(offer));

  // Create answer
  const answer = await peerConn.createAnswer();
  await peerConn.setLocalDescription(answer);
  await roomRef.child('answer').set({ sdp: answer.sdp, type: answer.type });

  // Listen for sender ICE candidates
  roomRef.child('senderCandidates').on('child_added', async (snap) => {
    const candidate = snap.val();
    if (candidate) {
      try { await peerConn.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch(e) {}
    }
  });

  updateRecvStatus('Waiting for sender to start…', 'info');
}

function setupReceiverChannel() {
  updateRecvStatus('Connected! Ready to receive files.', 'success');
  showRecvProgress(true);

  dataChannel.onmessage = (e) => {
    if (typeof e.data === 'string') {
      const msg = JSON.parse(e.data);

      if (msg.type === 'meta') {
        // New file incoming
        recvMeta   = { name: msg.name, size: msg.size, type: msg.fileType };
        recvBuffer = [];
        recvBytes  = 0;
        updateRecvFileInfo(msg.name, msg.index, msg.total);
        updateRecvProgress(0, 0, msg.size);

      } else if (msg.type === 'done') {
        updateRecvStatus('✓ All files received!', 'success');
      }

    } else {
      // Binary chunk
      recvBuffer.push(e.data);
      recvBytes += e.data.byteLength;

      const pct = Math.round((recvBytes / recvMeta.size) * 100);
      updateRecvProgress(pct, recvBytes, recvMeta.size);

      if (recvBytes >= recvMeta.size) {
        // File complete — trigger download
        const blob = new Blob(recvBuffer, { type: recvMeta.type });
        triggerDownload(blob, recvMeta.name);
        recvBuffer = [];
        recvBytes  = 0;
      }
    }
  };

  dataChannel.onerror = () => updateRecvStatus('Connection error.', 'error');
  dataChannel.onclose = () => {
    if (recvBytes === 0) updateRecvStatus('Sender disconnected.', 'error');
  };
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ================================================================
//  UI HELPERS
// ================================================================
function formatBytes(b) {
  if (b < 1024)        return b + ' B';
  if (b < 1048576)     return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824)  return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(1) + ' GB';
}

// Send UI
function updateSendStatus(msg, type) {
  const el = document.getElementById('sendStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status ' + type;
}
function updateSendProgress(pct, bytes, total) {
  const bar  = document.getElementById('sendProgressBar');
  const text = document.getElementById('sendProgressText');
  if (bar)  bar.style.width = pct + '%';
  if (text) text.textContent = `${formatBytes(bytes)} / ${formatBytes(total)} (${pct}%)`;
}
function updateSendFileInfo(name, index, total) {
  const el = document.getElementById('sendFileInfo');
  if (el) el.textContent = `File ${index + 1} of ${total}: ${name}`;
}
function showSendProgress(show) {
  const el = document.getElementById('sendProgressWrap');
  if (el) el.style.display = show ? 'block' : 'none';
}

// Receive UI
function updateRecvStatus(msg, type) {
  const el = document.getElementById('recvStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status ' + type;
}
function updateRecvProgress(pct, bytes, total) {
  const bar  = document.getElementById('recvProgressBar');
  const text = document.getElementById('recvProgressText');
  if (bar)  bar.style.width = pct + '%';
  if (text) text.textContent = `${formatBytes(bytes)} / ${formatBytes(total)} (${pct}%)`;
}
function updateRecvFileInfo(name, index, total) {
  const el = document.getElementById('recvFileInfo');
  if (el) el.textContent = `Receiving ${index + 1} of ${total}: ${name}`;
}
function showRecvProgress(show) {
  const el = document.getElementById('recvProgressWrap');
  if (el) el.style.display = show ? 'block' : 'none';
}
