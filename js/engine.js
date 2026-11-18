import { MAIN_DECK, STOCK_DECK, DEFAULT_RULES, cardDefinition, money } from './cards.js';

export const currentPlayer = game => game.players[game.turn];
export const marketPrice = game => (game.dice[0] + game.dice[1]) * game.rules.pricePerPip;
export const stockSupply = game => STOCK_DECK.copies - game.players.reduce((sum, player) => sum + player.stocks, 0);

// Keep randomness in the state so undo can restore dice rolls and draws exactly.
function random(game) {
  game.rng = (Math.imul(game.rng, 1664525) + 1013904223) >>> 0;
  return (game.rng >>> 0) / 4294967296;
}

function shuffle(game, cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random(game) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

function log(game, message, tone = 'neutral') {
  if (!game.recordLog) return;
  game.log.push({ message, tone, round: game.round });
  if (game.log.length > 150) game.log.shift();
}

function draw(game, player, count) {
  let drawn = 0;
  while (drawn < count) {
    // Restock a thin deck before cleanup can keep a tiny pool circulating indefinitely.
    if (game.deck.length < game.players.length && game.discard.length) {
      game.deck.push(...game.discard.splice(0));
      shuffle(game, game.deck);
      log(game, 'The discard pile was shuffled back into the main deck.');
    }
    if (!game.deck.length) break;
    player.hand.push(game.deck.pop());
    drawn++;
  }
  return drawn;
}

function roll(game) {
  game.dice = [1 + Math.floor(random(game) * 6), 1 + Math.floor(random(game) * 6)];
}

function startTurn(game) {
  game.phase = 'play';
  roll(game);
  const player = currentPlayer(game);
  const drawn = draw(game, player, 1);
  log(game, `${player.name} rolled ${game.dice.join(' + ')}. Stocks trade at ${money(marketPrice(game))}.`);
  log(game, drawn ? `${player.name} drew a card.` : 'The main deck is empty.');
  settle(game, [player]);
}

export function createGame({ mode = 'ai', playerCount = 4, rules = {}, seed = Math.floor(Math.random() * 2 ** 32), recordLog = true } = {}) {
  if (![3, 4].includes(playerCount)) throw new RangeError('Choose three or four players.');
  if (!['ai', 'pass'].includes(mode)) throw new RangeError('Choose AI or Pass & Play.');
  const names = mode === 'ai' ? ['You', 'M. B. A.', 'Max Margin', 'Cash Cow'] : ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
  const game = {
    mode, rules: { ...DEFAULT_RULES, ...rules }, rng: seed >>> 0,
    players: names.slice(0, playerCount).map((name, id) => ({ id, name, bot: mode === 'ai' && id > 0, cash: rules.startingCash ?? DEFAULT_RULES.startingCash, stocks: 0, hand: [] })),
    deck: MAIN_DECK.flatMap(card => Array.from({ length: card.copies }, (_, i) => `${card.id}:${i}`)),
    discard: [], turn: 0, round: 1, turnsCompleted: 0, dice: [1, 1], phase: 'play',
    winner: null, toiletUsedBy: null, log: [], recordLog,
  };
  shuffle(game, game.deck);
  for (const player of game.players) draw(game, player, game.rules.openingHand);
  log(game, `Everyone starts with ${money(game.rules.startingCash)}. First to $0 with no stocks wins.`);
  startTurn(game);
  return game;
}

// In a table-wide effect, everyone is affected before checking for a win.
function settle(game, affected) {
  for (const player of affected) {
    if (game.toiletUsedBy === null && player.cash >= game.rules.toiletThreshold) {
      const previousCash = player.cash;
      player.cash = game.rules.toiletReset;
      game.toiletUsedBy = player.id;
      log(game, `${player.name} flushed ${money(previousCash)} down the Golden Toilet and reset to ${money(player.cash)}.`, 'gold');
    }
  }
  const winner = affected.find(player => player.cash === 0 && player.stocks === 0);
  if (winner) {
    game.winner = winner.id;
    game.phase = 'finished';
    log(game, `${winner.name} went bankrupt and won!`, 'lose');
  }
}

export function legalTargets(game, instance) {
  const actor = currentPlayer(game);
  if (game.phase !== 'play' || !actor.hand.includes(instance)) return [];
  const card = cardDefinition(instance);
  if (actor.cash < card.requirement) return [];
  if (card.target === 'self' || card.target === 'table') return [actor.id];
  return game.players.filter(player => card.target === 'any' || player.id !== actor.id).map(player => player.id);
}

function canAffordStock(game, player, forced = false) {
  const price = marketPrice(game);
  return player.stocks < STOCK_DECK.maxHeld && stockSupply(game) > 0 && (forced
    ? player.cash >= price
    : player.cash >= price && player.cash > STOCK_DECK.buyMultiplier * price);
}

export function canBuyStock(game) {
  return game.phase === 'trade' && canAffordStock(game, currentPlayer(game));
}

function buy(game, player, limit, forced = false) {
  let count = 0;
  while (count < limit && canAffordStock(game, player, forced)) {
    player.cash -= marketPrice(game);
    player.stocks++;
    count++;
  }
  if (count) log(game, `${player.name} bought ${count} ${count === 1 ? 'stock' : 'stocks'} for ${money(count * marketPrice(game))}.`, 'lose');
  return count;
}

function sell(game, player, count) {
  if (!count) return;
  player.stocks -= count;
  const proceeds = count * marketPrice(game);
  player.cash += proceeds;
  log(game, `${player.name} sold ${count} ${count === 1 ? 'stock' : 'stocks'} for ${money(proceeds)}.`, 'gain');
}

export function playCard(game, instance, targetId = game.turn, discards = []) {
  if (!legalTargets(game, instance).includes(targetId)) return false;
  const actor = currentPlayer(game);
  const target = game.players[targetId];
  const card = cardDefinition(instance);
  if (card.id === 'reinvest' && (!Array.isArray(discards) || discards.length > game.rules.reinvestLimit || new Set(discards).size !== discards.length || discards.some(id => id === instance || !actor.hand.includes(id)))) return false;

  actor.hand.splice(actor.hand.indexOf(instance), 1);
  game.phase = 'trade';
  log(game, `${actor.name} played ${card.title}${target !== actor ? ` on ${target.name}` : ''}.`, card.category);
  let affected = [target];
  if (card.category === 'lose') {
    const loss = Math.min(actor.cash, card.amount);
    actor.cash -= loss;
    log(game, `${actor.name} lost ${money(loss)}.`, 'lose');
  } else if (card.category === 'gain') {
    target.cash += card.amount;
    log(game, `${target.name} gained ${money(card.amount)}.`, 'gain');
  } else {
    switch (card.id) {
      case 'takeover':
        [actor.hand, target.hand] = [target.hand, actor.hand];
        break;
      case 'reinvest': {
        actor.hand = actor.hand.filter(id => !discards.includes(id));
        const drawn = draw(game, actor, discards.length);
        game.discard.push(...discards);
        log(game, `${actor.name} discarded ${discards.length} and drew ${drawn}.`);
        break;
      }
      case 'advisor':
        if (!buy(game, target, game.rules.advisorLimit, true)) log(game, `${target.name} could not buy any stocks.`);
        break;
      case 'margin':
        sell(game, target, target.stocks);
        break;
      case 'depression':
        affected = Array.from({ length: game.players.length }, (_, i) => game.players[(game.turn + i) % game.players.length]);
        for (const player of affected) sell(game, player, player.stocks);
        break;
      case 'insider': roll(game); break;
      case 'inflation': game.dice = [6, 6]; break;
      case 'deflation': game.dice = [1, 1]; break;
    }
    if (['insider', 'inflation', 'deflation'].includes(card.id)) log(game, `Stocks now trade at ${money(marketPrice(game))}.`);
  }
  game.discard.push(instance);
  settle(game, affected);
  return true;
}

export function skipCard(game) {
  if (game.phase !== 'play') return false;
  game.phase = 'trade';
  log(game, `${currentPlayer(game).name} passed on playing a card.`);
  return true;
}

export function buyStock(game) {
  if (!canBuyStock(game)) return false;
  const player = currentPlayer(game);
  buy(game, player, 1);
  settle(game, [player]);
  return true;
}

export function sellStocks(game, count = currentPlayer(game).stocks) {
  const player = currentPlayer(game);
  if (game.phase !== 'trade' || !Number.isInteger(count) || count < 1 || count > player.stocks) return false;
  sell(game, player, count);
  settle(game, [player]);
  return true;
}

export function cleanupCount(game) {
  return Math.max(0, currentPlayer(game).hand.length - game.rules.handLimit);
}

export function endTurn(game, returnCards = []) {
  if (game.phase !== 'trade') return false;
  const player = currentPlayer(game);
  if (!Array.isArray(returnCards) || returnCards.length !== cleanupCount(game) || new Set(returnCards).size !== returnCards.length || returnCards.some(id => !player.hand.includes(id))) return false;

  if (player.stocks && game.rules.dividend) {
    const dividend = player.stocks * game.rules.dividend;
    player.cash += dividend;
    log(game, `${player.name} received ${money(dividend)} in dividends.`, 'gain');
  }
  if (returnCards.length) {
    player.hand = player.hand.filter(id => !returnCards.includes(id));
    game.deck.push(...returnCards);
    shuffle(game, game.deck);
    log(game, `${player.name} shuffled ${returnCards.length} ${returnCards.length === 1 ? 'card' : 'cards'} back into the main deck.`);
  }
  game.turnsCompleted++;
  settle(game, [player]);
  if (game.winner !== null) return true;
  game.turn = (game.turn + 1) % game.players.length;
  if (game.turn === 0) game.round++;
  startTurn(game);
  return true;
}
