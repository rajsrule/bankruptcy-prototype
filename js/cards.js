// All monetary values are in millions of dollars. Copies have unique instance IDs.
const lose = (id, title, copies, amount, requirement) => ({
  id, title, copies, amount, requirement, category: 'lose', target: 'self',
});
const gain = (id, title, copies, amount) => ({
  id, title, copies, amount, requirement: 0, category: 'gain', target: 'any',
});
const action = (id, title, copies, target, description) => ({
  id, title, copies, requirement: 0, category: 'action', target, description,
});

export const MAIN_DECK = [
  lose('social', 'Buy Social Media Platform to Delete It', 3, 300, 600),
  lose('cybertrucks', 'Fund a Fleet of Cybertrucks for Demolition Derby', 4, 200, 500),
  lose('data-center', 'AI Data Center in National Park / Bought NFTs', 6, 150, 300),
  lose('bailout', 'Bailing Out a Failing Bank', 3, 100, 200),
  lose('smart-home', 'Overengineered Smart Home', 4, 100, 200),
  lose('pizzas', '1 Million Red Baron Pineapple Pizzas + Hospital Bills', 6, 50, 70),
  lose('temu', 'Bought a House on Temu / Hydro-Powered ATV', 4, 20, 0),
  lose('tungsten', 'Tungsten Cube / 5-Mile Starbucks Receipt / Bet on Red', 4, 10, 0),
  gain('coin', '4000 BC Gold Titanium Trim Coin Found on Sidewalk', 3, 200),
  gain('lottery', 'Powerball Lottery', 4, 150),
  gain('ipo', 'Wild Tech IPO Boom', 5, 100),
  gain('grant', 'Charitable Grant for Struggling Billionaires', 4, 50),
  gain('interest', 'High-Yield Savings Interest / Tax Loophole', 4, 20),
  action('takeover', 'Hostile Takeover', 3, 'opponent', 'Swap your remaining hand with an opponent.'),
  action('reinvest', 'Liquidate & Reinvest', 3, 'self', 'Discard up to four other cards, then draw that many.'),
  action('advisor', 'AI Financial Advisor', 3, 'opponent', 'Force an opponent to buy up to three stocks, limited by cash, holdings and supply.'),
  action('margin', 'Margin Call', 3, 'opponent', 'Force an opponent to sell every stock at the current price.'),
  action('depression', 'Market Depression', 2, 'table', 'Everyone sells every stock at the current price.'),
  action('insider', 'Insider Manipulation', 2, 'table', 'Reroll both market dice.'),
  action('inflation', 'Market Inflation', 1, 'table', 'Set both dice to 6. The market price becomes $120M.'),
  action('deflation', 'Market Deflation', 1, 'table', 'Set both dice to 1. The market price becomes $20M.'),
];

export const STOCK_DECK = Object.freeze({ copies: 30, maxHeld: 5, buyMultiplier: 2 });
export const DEFAULT_RULES = Object.freeze({
  startingCash: 500,
  openingHand: 5,
  pricePerPip: 10,
  dividend: 10,
  handLimit: 7,
  toiletThreshold: 2000,
  toiletReset: 100,
  advisorLimit: 3,
  reinvestLimit: 4,
});
export const BOT_RULES = Object.freeze({
  buyAboveCash: 500, minBuyPrice: 20, maxBuyPrice: 40, sellAtPrice: 80, defendLeadAtCash: 100,
});

export const CARD_BY_ID = Object.fromEntries(MAIN_DECK.map(card => [card.id, card]));
export const cardDefinition = instance => CARD_BY_ID[instance.split(':')[0]];
export const money = value => value === 0 ? '$0' : `$${value.toLocaleString('en-US')}M`;
