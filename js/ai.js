import { BOT_RULES, STOCK_DECK, cardDefinition } from './cards.js';
import {
  buyStock, canBuyStock, cleanupCount, currentPlayer, endTurn, legalTargets,
  marketPrice, playCard, sellStocks, skipCard, stockSupply,
} from './engine.js';

// Prefer keeping cards that can help this player at their current cash level.
function keepValue(instance, cash) {
  const card = cardDefinition(instance);
  if (card.category === 'lose') return cash < card.requirement ? 5 : 100 + Math.min(cash, card.amount);
  if (card.category === 'gain') return 30 + card.amount / 5;
  if (card.id === 'margin') return 75;
  if (card.id === 'reinvest') return 28;
  return 35;
}

function weakestCards(player, count, exclude) {
  return player.hand.filter(id => id !== exclude)
    .sort((a, b) => keepValue(a, player.cash) - keepValue(b, player.cash)).slice(0, count);
}

export function chooseCard(game) {
  const player = currentPlayer(game);
  const options = player.hand.filter(id => legalTargets(game, id).length);
  const losses = options.filter(id => cardDefinition(id).category === 'lose')
    .sort((a, b) => cardDefinition(b).amount - cardDefinition(a).amount);
  if (losses.length) return { instance: losses[0], target: player.id };

  const opponents = game.players.filter(other => other !== player)
    .sort((a, b) => a.cash - b.cash || a.stocks - b.stocks);
  const leader = opponents[0];
  const price = marketPrice(game);
  const attacks = options.flatMap(instance => {
    const card = cardDefinition(instance);
    const amount = card.category === 'gain' ? card.amount : card.id === 'margin' ? leader.stocks * price : 0;
    if (!amount || (game.toiletUsedBy === null && leader.cash + amount >= game.rules.toiletThreshold)) return [];
    const value = card.id === 'margin' ? amount - leader.stocks * game.rules.dividend : amount;
    return [{ instance, target: leader.id, value }];
  }).sort((a, b) => b.value - a.value);

  for (const id of ['advisor', 'depression', 'inflation', 'deflation', 'takeover', 'reinvest', 'insider']) {
    const instance = options.find(option => cardDefinition(option).id === id);
    if (!instance) continue;
    switch (id) {
      case 'advisor': {
        const count = Math.min(game.rules.advisorLimit, stockSupply(game), STOCK_DECK.maxHeld - leader.stocks, Math.floor(leader.cash / price));
        if (count && (price <= BOT_RULES.maxBuyPrice || leader.cash <= price * count + 20)) return { instance, target: leader.id };
        break;
      }
      case 'depression':
        if (!player.stocks && opponents.some(other => other.stocks && (game.toiletUsedBy !== null || other.cash + other.stocks * price < game.rules.toiletThreshold))) {
          return { instance, target: player.id };
        }
        break;
      case 'inflation':
        if (player.stocks && player.cash + player.stocks * 12 * game.rules.pricePerPip >= game.rules.toiletThreshold && game.toiletUsedBy === null) {
          return { instance, target: player.id };
        }
        break;
      case 'deflation':
        if (player.cash > BOT_RULES.buyAboveCash && canBuyAfterPriceChange(game, player) && price > BOT_RULES.maxBuyPrice) {
          return { instance, target: player.id };
        }
        break;
      case 'takeover': {
        const opponent = opponents.find(other => other.hand.length > player.hand.length);
        if (opponent) return { instance, target: opponent.id };
        break;
      }
      case 'reinvest': {
        const discards = weakestCards(player, game.rules.reinvestLimit, instance)
          .filter(card => keepValue(card, player.cash) < 70);
        if (discards.length) return { instance, target: player.id, discards };
        break;
      }
      case 'insider':
        if ((player.stocks && price < BOT_RULES.sellAtPrice) ||
            (player.cash > BOT_RULES.buyAboveCash && price > BOT_RULES.maxBuyPrice && canBuyAfterPriceChange(game, player))) {
          return { instance, target: player.id };
        }
        break;
    }
  }
  // Protect a lead while there is still room for meaningful swings. Late-game
  // pile-ons repeatedly reset the race, so save attacks when cash is very low.
  if (player.cash <= leader.cash && player.cash >= BOT_RULES.defendLeadAtCash &&
      attacks.length && attacks[0].value > 0) return attacks[0];

  // With no stocks in play, these cards can open space for a future draw
  // without changing anyone’s balance.
  if (game.players.every(other => !other.stocks)) {
    const neutral = ['reinvest', 'margin', 'depression'];
    const cheapMarket = player.cash > BOT_RULES.buyAboveCash &&
      price >= BOT_RULES.minBuyPrice && price <= BOT_RULES.maxBuyPrice;
    if (!cheapMarket) neutral.push('insider', 'inflation', 'deflation');
    const cycle = options.find(instance => neutral.includes(cardDefinition(instance).id));
    if (cycle) {
      const target = cardDefinition(cycle).target === 'opponent' ? leader.id : player.id;
      return { instance: cycle, target };
    }
  }
  return null;
}

function canBuyAfterPriceChange(game, player) {
  return player.stocks < STOCK_DECK.maxHeld && stockSupply(game) > 0;
}

// The simulator also uses this decision loop for the human seat.
export function takeBotTurn(game) {
  if (game.phase === 'finished') return;
  if (game.phase === 'play') {
    const move = chooseCard(game);
    if (move) playCard(game, move.instance, move.target, move.discards);
    else skipCard(game);
  }
  if (game.phase !== 'trade') return;

  const player = currentPlayer(game);
  const price = marketPrice(game);
  if (player.stocks && price >= BOT_RULES.sellAtPrice) sellStocks(game);
  if (price >= BOT_RULES.minBuyPrice && price <= BOT_RULES.maxBuyPrice) {
    while (player.cash > BOT_RULES.buyAboveCash && canBuyStock(game)) buyStock(game);
  }
  if (game.phase === 'trade') endTurn(game, weakestCards(player, cleanupCount(game)));
}
