import Card from './Card';

export default function MeldTable({ melds, label }) {
  if (!melds || melds.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 items-center">
      {label && <span className="text-[0.6rem] text-white/60">{label}</span>}
      <div className="flex flex-wrap gap-1.5 justify-center">
        {melds.map((m) => (
          <div key={m.id} className="flex -space-x-4 bg-black/20 rounded-lg p-1">
            {m.cards.map((c) => (
              <Card key={c.id} card={c} small />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
