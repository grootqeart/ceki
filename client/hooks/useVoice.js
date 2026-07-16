import { useCallback, useEffect, useRef, useState } from 'react';

const ICE_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

// Manages a small mesh of WebRTC audio connections between everyone in the
// room who has enabled voice. Signaling (SDP + ICE) is relayed through the
// existing Socket.IO connection via the `voice-*` events.
export function useVoice(socketRef) {
  const [active, setActive] = useState(false); // have we joined voice + granted mic
  const [micOn, setMicOn] = useState(true); // local mic un-muted
  const [peerIds, setPeerIds] = useState([]); // socketIds we're connected to (for UI)

  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // socketId -> { pc, audioEl }
  const activeRef = useRef(false);

  const emit = useCallback(
    (event, payload) => {
      const s = socketRef.current;
      if (s) s.emit(event, payload);
    },
    [socketRef]
  );

  const closePeer = useCallback((socketId) => {
    const entry = peersRef.current.get(socketId);
    if (!entry) return;
    try {
      entry.pc.close();
    } catch (e) {
      /* ignore */
    }
    if (entry.audioEl) {
      entry.audioEl.srcObject = null;
      entry.audioEl.remove();
    }
    peersRef.current.delete(socketId);
    setPeerIds(Array.from(peersRef.current.keys()));
  }, []);

  const createPeer = useCallback(
    (socketId) => {
      if (peersRef.current.has(socketId)) return peersRef.current.get(socketId).pc;
      const pc = new RTCPeerConnection(ICE_CONFIG);

      const stream = localStreamRef.current;
      if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) emit('voice-signal', { to: socketId, data: { candidate: e.candidate } });
      };

      pc.ontrack = (e) => {
        let entry = peersRef.current.get(socketId);
        if (entry && !entry.audioEl) {
          const audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.srcObject = e.streams[0];
          document.body.appendChild(audioEl);
          entry.audioEl = audioEl;
        }
      };

      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          closePeer(socketId);
        }
      };

      peersRef.current.set(socketId, { pc, audioEl: null });
      setPeerIds(Array.from(peersRef.current.keys()));
      return pc;
    },
    [emit, closePeer]
  );

  // Register signaling listeners once.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return undefined;

    const onPeerJoin = async ({ socketId }) => {
      if (!activeRef.current) return;
      // We're an existing participant -> initiate the offer to the newcomer.
      const pc = createPeer(socketId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      emit('voice-signal', { to: socketId, data: { sdp: pc.localDescription } });
    };

    const onSignal = async ({ from, data }) => {
      if (!activeRef.current) return;
      let pc = peersRef.current.get(from)?.pc;
      if (data.sdp) {
        if (!pc) pc = createPeer(from);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          emit('voice-signal', { to: from, data: { sdp: pc.localDescription } });
        }
      } else if (data.candidate && pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          /* ignore late candidates */
        }
      }
    };

    const onPeerLeave = ({ socketId }) => closePeer(socketId);

    socket.on('voice-peer-join', onPeerJoin);
    socket.on('voice-signal', onSignal);
    socket.on('voice-peer-leave', onPeerLeave);

    return () => {
      socket.off('voice-peer-join', onPeerJoin);
      socket.off('voice-signal', onSignal);
      socket.off('voice-peer-leave', onPeerLeave);
    };
  }, [socketRef, createPeer, closePeer, emit]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      activeRef.current = true;
      setActive(true);
      setMicOn(true);
      emit('voice-join'); // existing peers will send us offers
    } catch (e) {
      alert('Tidak bisa mengakses mikrofon. Pastikan izin mikrofon diberikan.');
    }
  }, [emit]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    emit('voice-leave');
    activeRef.current = false;
    setActive(false);
    Array.from(peersRef.current.keys()).forEach((id) => closePeer(id));
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, [emit, closePeer]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    setMicOn((on) => {
      const next = !on;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
      return next;
    });
  }, []);

  // Clean up on unmount.
  useEffect(() => () => stop(), [stop]);

  return { active, micOn, peerCount: peerIds.length, start, stop, toggleMic };
}
