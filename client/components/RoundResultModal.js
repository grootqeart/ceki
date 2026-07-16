import Card from './Card';
import { cardValue } from '../../shared/cardUtils';
import { SUIT_SYMBOLS, RANK_LABELS } from '../../shared/constants';

function cardShort(c) {
  if (!c) return '';
  if (c.isJoker) return '🃏';
  return `${RANK_LABELS[c.rank] || c.rank}${SUIT_SYMBOLS[c.suit]}`;
}

// Normal-tariff value of one meld ({ cards, meld }), impersonating jokers as
// the rank they represent within the meld.
function meldNormalValue(m) {
  return m.cards.reduce((sum, c) => {
    if (c.isJoker) {
      const a = m.meld?.jokerAssignments?.find((j) => j.jokerId === c.id);
      return sum + cardValue(c, 'normal', a ? a.rank : undefined);
    }
    return sum + cardValue(c, 'normal');
  }, 0);
}

// Builds the itemized score breakdown for one player from their round detail.
function computeBreakdown(detail) {
  if (!detail) return null;
  const tableMelds = detail.tableMelds || [];
  const melds = detail.melds || [];
  const combos = [...tableMelds, ...melds].reduce((s, m) => s + meldNormalValue(m), 0);
  const tutupan = detail.tutupanCard ? cardValue(detail.tutupanCard, 'high') : 0;
  const minus = (detail.unmeldedCards || []).reduce((s, c) => s + cardValue(c, 'normal'), 0);
  const kejebur = detail.kejeburPenalty || 0;
  return {
    combos,
    tutupan,
    minus,
    kejebur,
    hasTutupan: !!detail.tutupanCard,
    hasCeburan: !!detail.ceburanCard,
  };
}

function reasonLabel(reason) {
  switch (reason) {
    case 'closed-tutupan':
      return 'Closed Card — Tutupan';
    case 'closed-ceburan':
      return 'Closed Card — Kejebur (Ceburan)';
    case 'deck-empty':
      return 'Deck Habis';
    case 'closed-meja':
      return 'Closed Card — Habis di Meja';
    case 'joker-discarded':
      return 'Joker Dibuang — Ronde Batal';
    default:
      return reason;
  }
}

export default function RoundResultModal({ result, players, isHost, onNextRound, gameOver, onClose }) {
  if (!result) return null;
  const closer = result.closerId ? players.find((p) => p.id === result.closerId) : null;

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto p-5 text-feltDark">
        <h2 className="font-bold text-lg mb-1">{reasonLabel(result.reason)}</h2>
        {closer && <p className="text-sm text-gray-600 mb-3">{closer.name} berhasil closed card!</p>}

        <div className="flex flex-col gap-3 mb-4">
          {players.map((p) => {
            const detail = result.details && result.details[p.id];
            const score = (result.scores && result.scores[p.id]) || 0;
            const bd = computeBreakdown(detail);
            return (
              <div key={p.id} className="border border-gray-200 rounded-lg p-2">
                <div className="flex justify-between font-semibold text-sm mb-1">
                  <span>{p.name}</span>
                  <span className={score >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                    {score >= 0 ? '+' : ''}
                    {score}
                  </span>
                </div>
                {bd && (bd.combos > 0 || bd.minus > 0 || bd.hasTutupan || bd.kejebur > 0) && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[0.65rem] text-gray-600 mb-1">
                    {bd.combos > 0 && <span>Kombinasi +{bd.combos}</span>}
                    {bd.hasTutupan && (
                      <span className="text-amber-600">
                        Tutupan {cardShort(detail.tutupanCard)} +{bd.tutupan} (tinggi)
                      </span>
                    )}
                    {bd.hasCeburan && <span>Ceburan {cardShort(detail.ceburanCard)} (normal)</span>}
                    {bd.minus > 0 && <span className="text-red-500">Tidak jadi −{bd.minus}</span>}
                    {bd.kejebur > 0 && (
                      <span className="text-red-500">Kena kejebur −{bd.kejebur}</span>
                    )}
                    <span className="font-semibold text-gray-800">= {score >= 0 ? '+' : ''}{score}</span>
                  </div>
                )}
                {detail && detail.tableMelds && detail.tableMelds.length > 0 && (
                  <div className="mb-1">
                    <span className="text-[0.65rem] text-gray-500">Meja:</span>
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      {detail.tableMelds.map((m) => (
                        <div key={m.id} className="flex gap-0.5 bg-emerald-50 rounded p-1">
                          {m.cards.map((c) => (
                            <Card key={c.id} card={c} small />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detail && detail.melds && detail.melds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-1">
                    {detail.melds.map((m, i) => (
                      <div key={i} className="flex gap-0.5 bg-gray-50 rounded p-1">
                        {m.cards.map((c) => (
                          <Card key={c.id} card={c} small />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {detail && detail.unmeldedCards && detail.unmeldedCards.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[0.65rem] text-gray-500 self-center">Tidak jadi:</span>
                    {detail.unmeldedCards.map((c) => (
                      <Card key={c.id} card={c} small />
                    ))}
                  </div>
                )}
                {detail && detail.tutupanCard && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[0.65rem] text-gray-500">Tutupan:</span>
                    <Card card={detail.tutupanCard} small />
                  </div>
                )}
                {detail && detail.ceburanCard && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[0.65rem] text-gray-500">Ceburan:</span>
                    <Card card={detail.ceburanCard} small />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {gameOver ? (
          <button className="w-full py-2 rounded-lg bg-feltDark text-white font-semibold" onClick={onClose}>
            Lihat Skor Akhir
          </button>
        ) : isHost ? (
          <button className="w-full py-2 rounded-lg bg-yellow-400 text-feltDark font-bold" onClick={onNextRound}>
            Mulai Ronde Berikutnya
          </button>
        ) : (
          <p className="text-center text-sm text-gray-500">Menunggu host memulai ronde berikutnya...</p>
        )}
      </div>
    </div>
  );
}
