import { createGame } from './engine.js';
import { takeBotTurn } from './ai.js';

export const SIMULATION_GAMES = 500;
export const ROUND_LIMIT = 250;

function runGame({ playerCount, rules, maxRounds, seed }) {
  const game = createGame({ playerCount, rules, seed, recordLog: false });
  while (game.winner === null && game.round <= maxRounds) takeBotTurn(game);
  return { rounds: game.winner === null ? null : game.round, toilet: game.toiletUsedBy !== null };
}

function summarize(results) {
  const rounds = results.flatMap(result => result.rounds === null ? [] : [result.rounds]).sort((a, b) => a - b);
  const games = results.length;
  const wins = rounds.length;
  const middle = Math.floor(wins / 2);
  return {
    games, wins, timedOut: games - wins,
    averageRounds: wins ? rounds.reduce((sum, round) => sum + round, 0) / wins : null,
    medianRounds: wins ? (rounds[middle] + rounds[Math.floor((wins - 1) / 2)]) / 2 : null,
    toiletRate: results.filter(result => result.toilet).length / games,
  };
}

function createRun({
  games = SIMULATION_GAMES, playerCount = 4, rules = {},
  maxRounds = ROUND_LIMIT, seed = 2147483647,
} = {}) {
  const results = [];
  return {
    games, results,
    next() {
      const gameSeed = (seed + Math.imul(results.length, 2654435761)) >>> 0;
      results.push(runGame({ playerCount, rules, maxRounds, seed: gameSeed }));
    },
  };
}

export function simulate(options) {
  const run = createRun(options);
  while (run.results.length < run.games) run.next();
  return summarize(run.results);
}

export async function simulateAsync(options, { onProgress, signal } = {}) {
  const run = createRun(options);
  while (run.results.length < run.games) {
    if (signal?.aborted) return null;
    for (let i = 0; i < 10 && run.results.length < run.games; i++) run.next();
    onProgress?.(run.results.length, run.games);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return signal?.aborted ? null : summarize(run.results);
}

// Also runnable headlessly with Node 24+: node js/simulator.js [3|4]
if (import.meta.main) {
  const playerCount = Number(process.argv[2] ?? 4);
  console.log(JSON.stringify(simulate({ playerCount }), null, 2));
}
