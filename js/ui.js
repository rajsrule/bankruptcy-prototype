import { cardDefinition, DEFAULT_RULES, money, STOCK_DECK } from './cards.js';
import {
  createGame, currentPlayer, marketPrice, stockSupply, legalTargets, playCard,
  skipCard, canBuyStock, buyStock, sellStocks, cleanupCount, endTurn,
} from './engine.js';
import { takeBotTurn } from './ai.js';
import { ROUND_LIMIT, SIMULATION_GAMES, simulateAsync } from './simulator.js';

const $ = id => document.getElementById(id);
const category = { lose: 'Lose money', gain: 'Gain money', action: 'Action' };
const glyph = { lose: '−', gain: '+', action: '✦', gold: '★', neutral: '•' };
const dicePips = [[5], [1, 9], [1, 5, 9], [1, 3, 7, 9], [1, 3, 5, 7, 9], [1, 3, 4, 6, 7, 9]];
const ruleInputs = [...document.querySelectorAll('[data-rule]')];
const seatNames = ['01', '02', '03', '04'];

let nextRules = { ...DEFAULT_RULES };
let game;
let selection;
let privateHand = false;
let history = [];
let botTimer;
let simulation;
let shownLog;
let shownRound;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isHumanTurn() {
  return game.phase !== 'finished' && !privateHand && !currentPlayer(game).bot;
}

function recordMove(move) {
  const before = structuredClone(game);
  if (!move()) return false;
  history.push(before);
  if (history.length > 100) history.shift();
  selection = null;
  return true;
}

function openDialog(dialog) {
  selection = null;
  render();
  dialog.showModal();
}

function startGame(mode, playerCount) {
  clearTimeout(botTimer);
  game = createGame({ mode, playerCount, rules: nextRules });
  history = [];
  selection = null;
  shownLog = null;
  shownRound = null;
  privateHand = game.mode === 'pass' && game.winner === null;
  render();
  if (privateHand) showHandoff();
  else if (game.winner !== null) showWinner();
}

function showHandoff() {
  $('pass-title').textContent = currentPlayer(game).name + '’s turn';
  if (!$('pass-dialog').open) $('pass-dialog').showModal();
}

function showWinner() {
  const winner = game.players[game.winner];
  $('win-title').textContent = winner.name === 'You' ? 'You went bankrupt!' : `${winner.name} went bankrupt!`;
  $('win-detail').textContent = `No stocks. No cash. Winner in round ${game.round}.`;
  if (!$('win-dialog').open) $('win-dialog').showModal();
}

function scheduleBot() {
  clearTimeout(botTimer);
  if (game.winner !== null || !currentPlayer(game).bot) return;
  botTimer = setTimeout(() => {
    takeBotTurn(game);
    render();
    if (game.winner !== null) showWinner();
    else scheduleBot();
  }, $('fast-ai').checked ? 35 : 650);
}

function targetCard(player, instance) {
  if (!recordMove(() => playCard(game, instance, player))) return;
  render();
  if (game.winner !== null) showWinner();
  else $('end-button').focus({ preventScroll: true });
}

function selectCard(instance) {
  if (!isHumanTurn()) return;
  if (selection?.type === 'reinvest' || selection?.type === 'cleanup') {
    if (instance === selection.instance) return;
    if (selection.cards.has(instance)) selection.cards.delete(instance);
    else if (selection.cards.size < selection.limit) selection.cards.add(instance);
    render();
    return;
  }
  if (selection?.instance === instance) {
    selection = null;
    render();
    return;
  }
  const targets = legalTargets(game, instance);
  if (!targets.length) return;
  const card = cardDefinition(instance);
  if (card.id === 'reinvest') {
    selection = { type: 'reinvest', instance, cards: new Set(), limit: game.rules.reinvestLimit };
  } else if (card.target === 'any' || card.target === 'opponent') {
    selection = { type: 'target', instance };
  } else {
    targetCard(game.turn, instance);
    return;
  }
  render();
}

function finishTurn(cards = []) {
  if (!isHumanTurn()) return;
  const previousTurn = game.turn;
  const changed = recordMove(() => {
    if (cards.length !== cleanupCount(game)) return false;
    if (game.phase === 'play') skipCard(game);
    return endTurn(game, cards);
  });
  if (!changed) return;
  if (game.mode === 'pass' && game.winner === null && game.turn !== previousTurn) {
    // Undo history never crosses a Pass & Play handoff.
    history = [];
    privateHand = true;
  }
  render();
  if (game.winner !== null) showWinner();
  else if (privateHand) showHandoff();
  else scheduleBot();
}

function askToEndTurn() {
  if (!isHumanTurn()) return;
  const excess = cleanupCount(game);
  if (excess) {
    selection = { type: 'cleanup', cards: new Set(), limit: excess };
    render();
  } else finishTurn();
}

function renderSeat(player, targetable, local = false) {
  const seat = element(targetable ? 'button' : 'div', local ? 'seat home-seat' : 'seat');
  if (player.id === game.turn) seat.classList.add('active-seat');
  if (game.winner === player.id) seat.classList.add('winner-seat');
  if (targetable) {
    seat.type = 'button';
    seat.classList.add('target-seat');
    seat.dataset.target = player.id;
    seat.setAttribute('aria-label', `Target ${player.name}`);
    seat.addEventListener('click', () => targetCard(player.id, selection.instance));
  }
  const avatar = element('span', `avatar avatar-${player.id}`, seatNames[player.id]);
  avatar.setAttribute('aria-hidden', 'true');
  const info = element('span', 'seat-info');
  const name = element('strong', 'seat-name', player.name);
  const sub = [local ? null : player.bot ? 'BOT' : null, local ? null : `${player.hand.length} in hand`, `${player.stocks} ${player.stocks === 1 ? 'stock' : 'stocks'}`].filter(Boolean);
  info.append(name, element('small', 'seat-sub', sub.join(' · ')));
  const value = element('strong', 'seat-cash', money(player.cash));
  seat.append(avatar, info, value);
  return seat;
}

function renderDice() {
  $('dice').replaceChildren(...game.dice.map((value, idx) => {
    const die = element('div', 'die');
    die.setAttribute('role', 'img');
    die.setAttribute('aria-label', `Die ${idx + 1}: ${value}`);
    for (const position of dicePips[value - 1]) {
      const pip = element('span', 'pip');
      pip.style.gridArea = `${Math.ceil(position / 3)} / ${1 + (position - 1) % 3}`;
      die.append(pip);
    }
    return die;
  }));
}

function renderHand(player, human) {
  const hand = $('hand');
  $('hand-heading').textContent = privateHand ? 'Hand hidden' : game.mode === 'ai' ? 'Your hand' : `${player.name}’s hand`;
  $('hand-count').textContent = privateHand ? '—' : player.hand.length;
  const cards = privateHand ? [] : player.hand;
  hand.classList.toggle('selecting', Boolean(selection));
  hand.replaceChildren(...cards.map((instance, i) => {
    const card = cardDefinition(instance);
    const button = element('button', `playing-card card-${card.category}`);
    button.type = 'button';
    button.dataset.card = instance;
    button.style.setProperty('--tilt', `${(i - (cards.length - 1) / 2) * 2.2}deg`);
    button.style.setProperty('--lift', `${Math.abs(i - (cards.length - 1) / 2) * 2}px`);
    const canPlay = human && legalTargets(game, instance).length !== 0;
    const choosingCards = selection?.type === 'reinvest' || selection?.type === 'cleanup';
    const picked = Boolean(selection?.cards?.has(instance) || selection?.instance === instance);
    button.classList.toggle('picked', picked);
    button.disabled = choosingCards ? instance === selection.instance : !canPlay;
    if (selection) button.setAttribute('aria-pressed', String(picked));
    if (human && game.phase === 'play' && player.cash < card.requirement && !choosingCards) {
      button.classList.add('unplayable');
    }
    button.addEventListener('click', () => selectCard(instance));

    const face = element('span', 'card-face');
    const icon = card.category === 'action'
      ? element('span', 'card-icon', glyph.action)
      : element('span', `card-icon trend-${card.category === 'lose' ? 'down' : 'up'}`, '→');
    icon.setAttribute('aria-hidden', 'true');
    const top = element('span', 'card-top', category[card.category]);
    const title = element('strong', 'card-title', card.title);
    const bottom = element('span', 'card-bottom');
    if (card.amount) {
      bottom.append(element('strong', 'card-value', `${card.category === 'lose' ? '−' : '+'}${money(card.amount)}`));
      if (card.category === 'lose') bottom.append(element('small', 'requirement', card.requirement ? `Req. ${money(card.requirement)}` : 'No min.'));
    } else {
      const description = ['inflation', 'deflation'].includes(card.id)
        ? `Set both dice to ${card.id === 'inflation' ? 6 : 1}. Stocks trade at ${money((card.id === 'inflation' ? 12 : 2) * game.rules.pricePerPip)}.`
        : card.description;
      bottom.append(element('small', 'card-description', description));
    }
    face.append(top, icon, title, bottom);
    button.append(face);
    return button;
  }));
  if (!cards.length) hand.append(element('p', 'empty-hand', privateHand ? 'Reveal the hand to begin.' : 'No cards in hand.'));
}

function renderLog() {
  const last = game.log.at(-1);
  if (last === shownLog && game.round === shownRound) return;
  shownLog = last;
  shownRound = game.round;
  $('activity-log').replaceChildren(...game.log.slice(-32).reverse().map((event, index) => {
    const item = element('li', `event event-${event.tone}${index === 0 ? ' latest-event' : ''}`);
    const icon = element('span', 'event-icon', glyph[event.tone]);
    icon.setAttribute('aria-hidden', 'true');
    const details = element('div');
    details.append(element('p', '', event.message), element('small', '', `Round ${event.round}`));
    item.append(icon, details);
    return item;
  }));
  $('activity-log').scrollTop = 0;
}

function render() {
  const focusedCard = document.activeElement?.dataset.card;
  const focusedTarget = document.activeElement?.dataset.target;
  const handScroll = $('hand').parentElement.scrollLeft;
  const human = isHumanTurn();
  const current = currentPlayer(game);
  const home = game.mode === 'ai' ? game.players[0] : current;
  const targetable = selection?.type === 'target' ? legalTargets(game, selection.instance) : [];

  $('mode-label').textContent = game.mode === 'ai' ? 'Solo vs. AI' : 'Pass & Play';
  $('round-label').textContent = `Round ${game.round}`;
  $('opponents').replaceChildren(...game.players.filter(player => player !== home)
    .map(player => renderSeat(player, targetable.includes(player.id))));
  $('self-seat').replaceChildren(renderSeat(home, targetable.includes(home.id), true));

  renderDice();
  const price = marketPrice(game);
  $('market-price').textContent = money(price);
  $('stock-count').textContent = `${stockSupply(game)} / ${STOCK_DECK.copies} stocks available`;
  $('deck-count').textContent = `${game.deck.length} cards left`;
  $('toilet-display').hidden = game.toiletUsedBy === null;
  $('toilet-display').textContent = 'Golden Toilet used';
  const picking = selection?.type === 'cleanup' || selection?.type === 'reinvest';
  const trading = human && game.phase === 'trade' && !picking;
  $('buy-button').disabled = !trading || !canBuyStock(game);
  $('sell-button').disabled = !trading || current.stocks < 1;
  $('sell-all-button').disabled = !trading || current.stocks < 1;
  $('trade-note').textContent = human && game.phase === 'play' ? 'Play or skip a card to trade.'
    : trading && current.stocks >= STOCK_DECK.maxHeld ? 'Five-stock limit reached.'
    : trading && !stockSupply(game) ? 'No stocks available.'
    : `Buy with cash above ${money(price * STOCK_DECK.buyMultiplier)}.`;

  $('undo-button').disabled = !history.length || privateHand || current.bot;
  $('skip-button').disabled = !human || game.phase !== 'play' || picking;
  $('end-button').disabled = !human || picking;
  $('fast-control').hidden = game.mode !== 'ai';
  $('selection-tools').hidden = !picking;
  if (picking) {
    const isCleanup = selection.type === 'cleanup';
    $('confirm-selection').textContent = isCleanup
      ? `Shuffle back ${selection.cards.size}/${selection.limit} & end turn`
      : `Discard & draw ${selection.cards.size}`;
    $('confirm-selection').disabled = isCleanup && selection.cards.size !== selection.limit;
  }

  let message = game.winner !== null ? 'Match complete.'
    : privateHand ? 'Waiting for the next player.'
    : !human ? `${current.name} is playing…`
    : game.phase === 'trade' ? 'Trade stocks or end your turn.'
    : 'Play a card or skip to trade.';
  if (selection?.type === 'target') message = `Choose a highlighted player for ${cardDefinition(selection.instance).title}.`;
  if (selection?.type === 'reinvest') message = `Choose up to ${selection.limit} cards to replace.`;
  if (selection?.type === 'cleanup') message = `Choose ${selection.limit} to return to the deck.`;
  $('turn-message').textContent = message;

  renderHand(home, human);
  $('hand').parentElement.scrollLeft = handScroll;
  if (focusedCard) [...$('hand').children].find(node => node.dataset.card === focusedCard)?.focus({ preventScroll: true });
  if (focusedTarget) document.querySelector(`[data-target="${focusedTarget}"]`)?.focus({ preventScroll: true });
  renderLog();
}

$('skip-button').addEventListener('click', () => {
  if (isHumanTurn() && recordMove(() => skipCard(game))) render();
});
$('end-button').addEventListener('click', askToEndTurn);
$('undo-button').addEventListener('click', () => {
  if (!history.length || privateHand || currentPlayer(game).bot) return;
  clearTimeout(botTimer);
  game = history.pop();
  selection = null;
  render();
});
$('buy-button').addEventListener('click', () => {
  if (isHumanTurn() && recordMove(() => buyStock(game))) {
    render();
    if (game.winner !== null) showWinner();
  }
});
for (const [id, count] of [['sell-button', 1], ['sell-all-button', undefined]]) {
  $(id).addEventListener('click', () => {
    if (isHumanTurn() && recordMove(() => sellStocks(game, count))) {
      render();
      if (game.winner !== null) showWinner();
    }
  });
}
$('cancel-selection').addEventListener('click', () => { selection = null; render(); });
$('confirm-selection').addEventListener('click', () => {
  const { type, cards, instance } = selection;
  if (type === 'cleanup') finishTurn([...cards]);
  else if (type === 'reinvest' && recordMove(() => playCard(game, instance, game.turn, [...cards]))) {
    render();
    if (game.winner !== null) showWinner();
  }
});
$('fast-ai').addEventListener('change', scheduleBot);
$('new-button').addEventListener('click', showSetup);
$('rematch-button').addEventListener('click', () => { $('win-dialog').close(); showSetup(); });
$('rules-button').addEventListener('click', () => {
  $('rule-pip').textContent = money(game.rules.pricePerPip);
  $('rule-dividend').textContent = money(game.rules.dividend);
  $('rule-threshold').textContent = money(game.rules.toiletThreshold);
  $('rule-reset').textContent = money(game.rules.toiletReset);
  openDialog($('rules-dialog'));
});
$('tuner-button').addEventListener('click', () => openDialog($('tuner-dialog')));
for (const button of document.querySelectorAll('.close-dialog')) {
  button.addEventListener('click', () => button.closest('dialog').close());
}
$('pass-dialog').addEventListener('cancel', event => event.preventDefault());
$('reveal-button').addEventListener('click', () => {
  privateHand = false;
  $('pass-dialog').close();
  render();
  const first = $('hand').querySelector('button:not(:disabled)');
  (first ?? $('skip-button')).focus({ preventScroll: true });
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && selection && !document.querySelector('dialog[open]')) {
    selection = null;
    render();
  }
});

function showSetup() {
  $('play-mode').value = game.mode;
  $('player-count').value = game.players.length;
  $('setup-cash').textContent = `Each player starts with ${money(nextRules.startingCash)} and ${nextRules.openingHand} cards.`;
  openDialog($('new-dialog'));
}
$('new-form').addEventListener('submit', event => {
  event.preventDefault();
  $('new-dialog').close();
  startGame($('play-mode').value, Number($('player-count').value));
});

function fillTuner(rules) {
  for (const input of ruleInputs) input.value = rules[input.dataset.rule];
}

function readTuner() {
  const threshold = ruleInputs.find(input => input.dataset.rule === 'toiletThreshold');
  const reset = ruleInputs.find(input => input.dataset.rule === 'toiletReset');
  reset.setCustomValidity(reset.valueAsNumber >= threshold.valueAsNumber ? 'Enter a reset below the threshold.' : '');
  if (!$('tuner-form').reportValidity()) return null;
  return Object.fromEntries(ruleInputs.map(input => [input.dataset.rule, input.valueAsNumber]));
}

function clearResults() {
  $('sim-results').hidden = true;
  $('sim-progress').hidden = true;
  $('sim-status').textContent = '';
}

$('tuner-form').addEventListener('input', () => {
  ruleInputs.find(input => input.dataset.rule === 'toiletReset').setCustomValidity('');
  if (!simulation) clearResults();
});
$('apply-button').addEventListener('click', () => {
  const rules = readTuner();
  if (!rules) return;
  nextRules = { ...DEFAULT_RULES, ...rules };
  $('sim-status').textContent = 'These settings will apply to the next game.';
});
$('reset-tuner').addEventListener('click', () => {
  fillTuner(DEFAULT_RULES);
  $('tuner-form').dispatchEvent(new Event('input'));
});
$('tuner-dialog').addEventListener('close', () => simulation?.abort());
$('tuner-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (simulation) return;
  const rules = readTuner();
  if (!rules) return;
  const controller = new AbortController();
  simulation = controller;
  const fields = [...ruleInputs, $('sim-players'), $('apply-button'), $('reset-tuner'), $('simulate-button')];
  for (const field of fields) field.disabled = true;
  clearResults();
  const progress = $('sim-progress');
  progress.max = SIMULATION_GAMES;
  progress.value = 0;
  progress.hidden = false;
  try {
    const stats = await simulateAsync({ rules, playerCount: Number($('sim-players').value) }, {
      signal: controller.signal,
      onProgress: (done, total) => {
        progress.value = done;
        $('sim-status').textContent = `Simulating ${done} / ${total} games…`;
      },
    });
    if (!stats) { clearResults(); return; }
    $('avg-rounds').textContent = stats.averageRounds?.toFixed(1) ?? '—';
    $('median-rounds').textContent = stats.medianRounds?.toFixed(1) ?? '—';
    $('toilet-rate').textContent = `${(stats.toiletRate * 100).toFixed(1)}%`;
    $('sim-wins').textContent = `${stats.wins} / ${stats.games}`;
    $('sim-results').hidden = false;
    $('sim-status').textContent = stats.timedOut
      ? `${stats.timedOut} games had no winner by round ${ROUND_LIMIT}. Round averages use completed games only.`
      : `${stats.games} games completed.`;
  } catch (error) {
    console.error(error);
    $('sim-status').textContent = 'The simulation could not finish. Try again.';
  } finally {
    simulation = null;
    progress.hidden = true;
    for (const field of fields) field.disabled = false;
  }
});

fillTuner(nextRules);
startGame('ai', 4);
