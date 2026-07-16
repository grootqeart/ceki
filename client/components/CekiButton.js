export default function CekiButton({ eligible, announced, onAnnounce }) {
  if (announced) {
    return (
      <span className="absolute bottom-28 right-4 bg-yellow-400 text-feltDark font-bold px-4 py-2 rounded-full shadow-lg animate-pulse z-10">
        CEKI!
      </span>
    );
  }

  if (!eligible) return null;

  return (
    <button
      type="button"
      onClick={onAnnounce}
      className="absolute bottom-28 right-4 bg-red-500 hover:bg-red-400 text-white font-bold px-5 py-3 rounded-full shadow-xl z-10 animate-bounce"
    >
      Ceki!
    </button>
  );
}
