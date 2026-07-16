import { useEffect, useMemo, useRef, useState } from 'react';
import TableCenter from './TableCenter';
import Hand from './Hand';
import OpponentArea from './OpponentArea';
import MeldTable from './MeldTable';
import CekiButton from './CekiButton';
import ScoreBoard from './ScoreBoard';
import MiniScoreboard from './MiniScoreboard';
import VoiceBar from './VoiceBar';
import { findPerfectPartition, findClosablePartition } from '../../shared/combinations';
import { SUIT_SYMBOLS, RANK_LABELS } from '../../shared/constants';
import { sfx, setMuted, loadMuted } from '../lib/sound';

// Seats opponents clockwise around the table starting from the viewer
// (always "south"): 1 opponent -> north; 2 opponents -> west/east
// (symmetric); 3 opponents -> west/north/east following turn order.
function computeSeats(players, viewerId) {
  const viewerIndex = players.findIndex((p) => p.id === viewerId);
  if (viewerIndex === -1) return {};

  const orderedOthers = [];
  for (let i = 1; i < players.length; i++) {
    orderedOthers.push(players[(viewerIndex + i) % players.length]);
  }

  let seatNames;
  if (orderedOthers.length === 1) seatNames = ['top'];
  else if (orderedOthers.length === 2) seatNames = ['left', 'right'];
  else seatNames = ['left', 'top', 'right'];

  const seats = {};
  orderedOthers.forEach((p, idx) => {
    seats[seatNames[idx]] = p;
  });
  return seats;
}

export default function GameBoard({ room, game, playerId, actions, socketRef, roundResult, gameOverInfo }) {
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [pendingMeld, setPendingMeld] = useState(null); // { count, supportingIds: [] }
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setMutedState(loadMuted());
  }, []);

  function toggleMute() {
    setMutedState((m) => {
      const next = !m;
      setMuted(next);
      return next;
    });
  }

  const me = room.players.find((p) => p.id === playerId);
  const seats = useMemo(() => computeSeats(room.players, playerId), [room.players, playerId]);
  const isMyTurn = game.turnPlayerId === playerId;
  const canDraw = isMyTurn && !game.hasDrawnThisTurn && !pendingMeld;
  const canDiscard = isMyTurn && game.hasDrawnThisTurn;
  const iAnnouncedCeki = !!game.ceki[playerId];
  const cekiEligible = !!game.cekiEligible[playerId];
  const myTableMelds = (game.tableMelds && game.tableMelds[playerId]) || [];
  const discardUnlocked = !!(game.discardMeldUnlocked && game.discardMeldUnlocked[playerId]);

  const topDiscard = game.discardPile.length ? game.discardPile[game.discardPile.length - 1] : null;

  // Reset any in-progress meld-selection if the turn or discard pile changes
  // out from under us (e.g. someone else acted, or our own draw resolved).
  useEffect(() => {
    setPendingMeld(null);
  }, [isMyTurn, game.hasDrawnThisTurn, game.discardPile.length]);

  // Play sound effects by diffing game state between renders.
  const prevSnap = useRef(null);
  useEffect(() => {
    const totalMelds = Object.values(game.tableMelds || {}).reduce((s, m) => s + m.length, 0);
    const cekiCount = Object.values(game.ceki || {}).filter(Boolean).length;
    const snap = {
      discardLen: game.discardPile.length,
      drawCount: game.drawPileCount,
      turnPlayerId: game.turnPlayerId,
      totalMelds,
      cekiCount,
    };
    const p = prevSnap.current;
    if (p) {
      if (snap.totalMelds > p.totalMelds) sfx.meld();
      else if (snap.discardLen > p.discardLen) sfx.discard();
      else if (snap.drawCount < p.drawCount) sfx.draw();
      if (snap.cekiCount > p.cekiCount) sfx.ceki();
      if (snap.turnPlayerId && snap.turnPlayerId !== p.turnPlayerId) {
        snap.turnPlayerId === playerId ? sfx.myturn() : sfx.turn();
      }
    }
    prevSnap.current = snap;
  }, [game, playerId]);

  // Round-end / game-over stingers.
  useEffect(() => {
    if (!roundResult) return;
    const scores = roundResult.result?.scores || {};
    const myScore = scores[playerId] || 0;
    const isCloser = roundResult.result?.closerId === playerId;
    if (isCloser || myScore >= 0) sfx.win();
    else sfx.lose();
  }, [roundResult, playerId]);

  useEffect(() => {
    if (!gameOverInfo) return;
    gameOverInfo.winnerId === playerId ? sfx.win() : sfx.lose();
  }, [gameOverInfo, playerId]);

  // Reactive ceburan: taking the top discard closes the hand AND that card is
  // genuinely used in a meld (leftover, if any, must be a different card).
  const canCloseFromDiscard = useMemo(() => {
    if (!iAnnouncedCeki || !topDiscard) return false;
    const trial = [...game.myHand, topDiscard];
    return !!(findClosablePartition(trial, topDiscard.id) || findPerfectPartition(trial));
  }, [iAnnouncedCeki, topDiscard, game.myHand]);

  const topDiscardLabel = topDiscard
    ? topDiscard.isJoker
      ? '🃏'
      : `${RANK_LABELS[topDiscard.rank] || topDiscard.rank}${SUIT_SYMBOLS[topDiscard.suit]}`
    : '';

  const selectedCard = game.myHand.find((c) => c.id === selectedCardId);

  // Tutupan close: after drawing, if discarding the selected card leaves a
  // perfect meld partition, offer to close (the selected card is the tutupan).
  const canCloseByDiscardingSelected = useMemo(() => {
    if (!iAnnouncedCeki || !canDiscard || !selectedCard || selectedCard.isJoker) return false;
    const rest = game.myHand.filter((c) => c.id !== selectedCard.id);
    return !!findPerfectPartition(rest);
  }, [iAnnouncedCeki, canDiscard, selectedCard, game.myHand]);

  function handleSelectCard(cardId) {
    setSelectedCardId((prev) => (prev === cardId ? null : cardId));
  }

  function confirmDiscard() {
    if (!selectedCard) return;
    actions.discardCard(selectedCard.id);
    setSelectedCardId(null);
  }

  function handlePickDepth(depth) {
    setPendingMeld({ count: depth, supportingIds: [] });
  }

  function toggleSupportId(cardId) {
    setPendingMeld((prev) => {
      if (!prev) return prev;
      const has = prev.supportingIds.includes(cardId);
      return {
        ...prev,
        supportingIds: has ? prev.supportingIds.filter((id) => id !== cardId) : [...prev.supportingIds, cardId],
      };
    });
  }

  function confirmMeld() {
    if (!pendingMeld || pendingMeld.supportingIds.length < 2) return;
    actions.drawFromDiscard({ count: pendingMeld.count, supportingCardIds: pendingMeld.supportingIds });
    setPendingMeld(null);
  }

  function renderSeat(seatPlayer, orientation = 'horizontal') {
    if (!seatPlayer) return null;
    return (
      <div className="flex flex-col items-center gap-1">
        <OpponentArea
          player={seatPlayer}
          cardCount={game.handCounts[seatPlayer.id] || 0}
          isTurn={game.turnPlayerId === seatPlayer.id}
          ceki={!!game.ceki[seatPlayer.id]}
          connected={seatPlayer.connected}
          orientation={orientation}
        />
        <MeldTable melds={(game.tableMelds && game.tableMelds[seatPlayer.id]) || []} />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-felt flex flex-col text-white overflow-hidden w-full">
      <header className="flex items-center justify-between px-3 py-2 bg-black/20 gap-2">
        <span className="font-bold tracking-widest text-sm">{room.code}</span>
        <span className="text-sm font-medium truncate">
          {isMyTurn ? 'Giliranmu!' : `Giliran ${room.players.find((p) => p.id === game.turnPlayerId)?.name || ''}`}
        </span>
        <div className="flex items-center gap-2">
          <VoiceBar socketRef={socketRef} players={room.players} playerId={playerId} />
          <button
            className="text-sm bg-white/10 w-8 h-8 rounded-full flex items-center justify-center"
            onClick={toggleMute}
            title={muted ? 'Bunyikan efek suara' : 'Bisukan efek suara'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button className="text-xs bg-white/10 px-3 py-1.5 rounded-full" onClick={() => setScoreboardOpen(true)}>
            Skor
          </button>
        </div>
      </header>

      {/* Draggable, collapsible ranking widget. */}
      <MiniScoreboard
        players={room.players}
        cumulativeScores={room.cumulativeScores}
        targetScore={room.settings.targetScore}
        onOpenFull={() => setScoreboardOpen(true)}
      />

      {/* Full-width table: opponents seated at the edges (top / left / right
          depending on player count) with the deck + discard spiral centered,
          filling the whole desktop width. */}
      <div
        className="flex-1 grid items-center justify-items-center gap-0.5 px-0.5 py-3 min-h-[380px] sm:gap-2 sm:px-3"
        style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gridTemplateRows: 'auto 1fr' }}
      >
        <div className="col-start-2 row-start-1">{renderSeat(seats.top, 'horizontal')}</div>
        <div className="col-start-1 row-start-2">{renderSeat(seats.left, 'vertical')}</div>
        <div className="col-start-3 row-start-2">{renderSeat(seats.right, 'vertical')}</div>

        <div className="col-start-2 row-start-2">
          <TableCenter
            pile={game.discardPile}
            canPick={canDraw}
            onPickDepth={handlePickDepth}
            pendingCount={pendingMeld?.count}
            selectedIds={pendingMeld?.supportingIds}
            onToggleId={toggleSupportId}
            drawPileCount={game.drawPileCount}
            canDrawDeck={canDraw}
            onDrawDeck={actions.drawCard}
          />
        </div>
      </div>

      {pendingMeld && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 bg-white text-feltDark rounded-xl shadow-xl p-3 flex flex-col items-center gap-2 z-20 w-72">
          <p className="text-xs text-center font-medium">
            Pilih minimal 2 kartu di tanganmu yang membentuk kombinasi dengan kartu buangan ({pendingMeld.count} kartu
            terambil)
          </p>
          {!discardUnlocked && (
            <p className="text-[0.65rem] text-amber-600 text-center">
              Ambilan pertamamu harus run (urut), kecuali kombinasinya mengandung As.
            </p>
          )}
          <p className="text-xs text-gray-500">Terpilih: {pendingMeld.supportingIds.length}</p>
          <div className="flex gap-2 w-full">
            <button type="button" className="flex-1 text-sm py-1.5 rounded bg-gray-100" onClick={() => setPendingMeld(null)}>
              Batal
            </button>
            <button
              type="button"
              disabled={pendingMeld.supportingIds.length < 2}
              className="flex-1 text-sm py-1.5 rounded bg-yellow-400 font-semibold disabled:opacity-40"
              onClick={confirmMeld}
            >
              Bentuk Kombinasi
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-2 pb-3">
        {canDraw && !pendingMeld && (
          <p className="text-[0.7rem] text-white/60 text-center px-4">
            Ketuk kartu di deck untuk ambil, atau ketuk kartu buangan yang kamu butuhkan (kartu di atasnya ikut
            terambil, maks. 7 kartu)
          </p>
        )}
        {/* Reactive ceburan: the card you need is on top of the discard pile
            and taking it (used in a meld) closes your hand. */}
        {canCloseFromDiscard && (
          <button
            className="px-5 py-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-feltDark font-bold shadow-xl animate-pulse"
            onClick={() => actions.closeCard('discard')}
          >
            🎯 Ceburan! Ambil {topDiscardLabel} & tutup
          </button>
        )}
        {/* Tutupan: after drawing, discarding the selected card leaves a
            perfect meld partition, so this discard closes the round. */}
        {canDiscard && !pendingMeld && canCloseByDiscardingSelected && (
          <button
            className="px-5 py-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-feltDark font-bold shadow-xl animate-pulse"
            onClick={() => {
              actions.closeCard('leftover', selectedCard.id);
              setSelectedCardId(null);
            }}
          >
            🎯 Tutup! (buang {selectedCard && (selectedCard.isJoker ? '🃏' : `${RANK_LABELS[selectedCard.rank] || selectedCard.rank}${SUIT_SYMBOLS[selectedCard.suit]}`)} sebagai tutupan)
          </button>
        )}
        {canDiscard && !pendingMeld && selectedCard && !canCloseByDiscardingSelected && (
          <button
            className={`px-4 py-2 rounded-full font-bold shadow-lg ${
              selectedCard.isJoker ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-red-500 text-white'
            }`}
            disabled={selectedCard.isJoker}
            onClick={confirmDiscard}
          >
            {selectedCard.isJoker ? 'Joker tidak bisa dibuang' : 'Buang kartu ini'}
          </button>
        )}
        {canDiscard && !pendingMeld && !selectedCard && (
          <p className="text-xs text-white/70">
            {iAnnouncedCeki ? 'Pilih kartu untuk dibuang / ditutup' : 'Pilih kartu untuk dibuang'}
          </p>
        )}
      </div>

      <div className={`border-t-2 ${isMyTurn ? 'border-yellow-400' : 'border-white/10'} bg-black/10`}>
        <div className="flex items-center justify-between px-3 pt-2">
          <span className="text-xs text-white/70">
            {me?.name} (kamu) — {game.myHand.length} kartu
          </span>
        </div>
        <MeldTable melds={myTableMelds} label="Meja kamu" />
        <Hand
          cards={game.myHand}
          mode={pendingMeld ? 'support' : 'discard'}
          selectedCardId={selectedCardId}
          onSelectCard={handleSelectCard}
          selectedIds={pendingMeld?.supportingIds}
          onToggleId={toggleSupportId}
        />
      </div>

      <CekiButton eligible={cekiEligible} announced={iAnnouncedCeki} onAnnounce={actions.announceCeki} />

      <ScoreBoard
        open={scoreboardOpen}
        onClose={() => setScoreboardOpen(false)}
        players={room.players}
        cumulativeScores={room.cumulativeScores}
        targetScore={room.settings.targetScore}
        scoreHistory={room.scoreHistory}
      />
    </div>
  );
}
