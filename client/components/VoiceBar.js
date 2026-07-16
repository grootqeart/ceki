import { useVoice } from '../hooks/useVoice';

// Voice-chat controls in the header. When off, a single button asks to join
// voice (prompts for mic permission). When on, shows a mic mute toggle, the
// number of connected peers, and a leave button.
export default function VoiceBar({ socketRef }) {
  const { active, micOn, peerCount, start, stop, toggleMic } = useVoice(socketRef);

  if (!active) {
    return (
      <button
        className="text-sm bg-white/10 hover:bg-white/20 w-8 h-8 rounded-full flex items-center justify-center"
        onClick={start}
        title="Gabung voice chat"
      >
        🎙️
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 bg-white/10 rounded-full pl-1 pr-2 py-0.5">
      <button
        className={`w-7 h-7 rounded-full flex items-center justify-center ${micOn ? 'bg-emerald-500' : 'bg-red-500'}`}
        onClick={toggleMic}
        title={micOn ? 'Bisukan mikrofon' : 'Aktifkan mikrofon'}
      >
        {micOn ? '🎤' : '🔕'}
      </button>
      <span className="text-[0.65rem] text-white/80 font-medium">{peerCount}</span>
      <button className="text-[0.65rem] text-white/70 hover:text-white" onClick={stop} title="Keluar voice chat">
        ✕
      </button>
    </div>
  );
}
