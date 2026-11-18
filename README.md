# BANKRUPTCY

A satirical card game for three or four players. Go broke first: win as soon as you have **$0 and no stocks**.

## Play locally

Serve the repository root over HTTP. JavaScript modules need an HTTP origin.

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. Start in Solo vs. AI, or choose **New game** to switch to three players or **Pass & Play**. Pass & Play conceals each hand between turns. In Solo mode you can undo the last move, including rewinding a completed round of bot responses. In Pass & Play you can undo until you hand off the device.

For GitHub Pages, put these files on the branch your team wants to publish, then select **Settings → Pages → Deploy from a branch** and choose that branch and the **/(root)** folder. The app uses relative paths and runs directly from the repository with no build tools, external assets, server state, or credentials.

## Rules used by the prototype

- Start with $500M, five cards, and no stocks. Every turn starts with a 2d6 market roll at $10M per pip and a draw of one main-deck card.
- Play up to one card, then trade. A voluntary buy checks that cash is **strictly greater** than twice the price before each purchase. Stocks are identical units drawn from a 30-card supply and returned when sold. Players can hold up to five.
- Gain $10M per stock held at the end of your turn. Shuffle the cards you choose above the seven-card limit back into the main deck. When the draw pile has fewer cards than there are players, shuffle the discard pile into it before the next draw.
- Cash never goes below zero. The first player whose cash reaches $2B or more uses the Golden Toilet, resetting to $100M and keeping their stocks. The Toilet can be used once per match across the whole table. On a simultaneous table effect, resolve tied eligibility in turn order starting with the active player.

Bots play their largest legal loss first. They may use Gain cards or Margin Call on the lowest-cash opponent to protect a lead. They buy at $20M–$40M while above $500M in cash, and sell their holdings at $80M and up.

## Tune the balance

**Balance tuner** runs 500 matches with a bot in every seat. It reports the average and median winning round, the share of all games that activated the Golden Toilet, and the number that reached a winner within 250 rounds. The round statistics exclude timeouts. **Apply to next game** stages your values for the next local deal.

Card copies, effects, thresholds, stock settings, opening rules, and bot tuning live in [`js/cards.js`](js/cards.js). The browser tuner lets you experiment with opening cash, hand size, dividends, and Toilet values without editing code. More extensive changes, such as adjusting the number of cheap Lose cards, belong in the card definitions.

Run the same seeded simulation headlessly with Node.js 24 or newer:

```sh
node js/simulator.js       # four players
node js/simulator.js 3     # three players
```
