
# prices.now

prices.now is a barebones historical prices viewer for Solana assets.

I was experimenting with creating a transaction parser for Solana transactions and noticed that you can subscribe to updates when a Solana program's account data is modified using a WebSocket subscription. With that knowledge, I sought out the data formats for all of the top exchange programs and began creating parsers for their account data.

You can view the live site [here](https://prices.now/).

Just a warning that the UI is intentionally very empty... I was mostly interested in having my own private bar charts. Anything outside of the chart on the front end is as minimal as it gets.

The backend is built with Python (3.11), FastAPI, and SQLite, and it uses the Solana JSON RPC to retrieve price data. The frontend is built with React and uses a WebSocket to obtain price data. It utilizes TradingView's Lightweight Charts for the charts.

The code runs on a small machine I own through a Cloudflare tunnel. Please be kind to it.

## How it works
1. It connects to your Solana websocket RPC.
2. It sends subscription messages like the following:
```json
{
    "jsonrpc": "2.0",
    "id": 0,
    "method": "accountSubscribe",
    "params": [
        "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj",
        {
            "encoding": "jsonParsed",
            "commitment": "confirmed",
        }
    ]
}
```
3. Then, once the subscriptions are established, the new account data is streamed to the backend.
4. Upon receiving a new data update, it sends the data to its proper parser, which I've called "handlers," and then computes the price of the asset pair using the required computation for each exchange's program.
5. The price is then stored in a SQLite database. Any subscription to the pair that is updated will receive a new bar/price update.
6. Every minute, a backend task consolidates the prices into a new bar and stores it in a historical database. All bars align with the 60-second mark based on the Unix timestamp of the machine.

## How to run
1. Clone the repository
2. Install the dependencies for both backend and frontend.
```bash
cd backend
python -m venv .
source bin/activate
pip install -r requirements.txt

cd ../frontend
npm install
```
3. Run the backend
```bash
cd backend
python main.py
```
4. Run the frontend
```bash
cd frontend
npm start
```

The default port for the backend is 8001, and the default port for the frontend is 3000. You'll need to modify these settings on your own if you're trying to set this up in your own environment.

You may have to wait a little while for the first prices to stream in and for the bars to generate, but once that is complete, you should be able to view the prices on the frontend.

## Adding your own asset pairs

Currently, the only way to add your own asset pairs is to edit the `backend/programs.json` file.

```json
{
    "asset_id": 1,
    "type": "raydium",
    "programId": "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj",
    "handler": "parsers.raydium.price_from_clmm",
    "mintA": "So11111111111111111111111111111111111111112",
    "mintB": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "decimalsA": 9,
    "decimalsB": 6,
    "symbolA": "WSOL",
    "symbolB": "USDC",
    "pairs": ["WSOL-USDC","USDC-WSOL"],
    "price": null,
    "nonce": 0
}
```

The handler is the string format of the function call used to parse the incoming account data.

The mintA and mintB are the addresses of the two assets in the pair. Make sure you have the proper order, as the pair price calculations will be based on mintA and mintB, which are not interchangeable.

I intended to automate the generation of this, but the protocols are all different, and it's not worth the effort when I'm the only one using it.

``asset_id`` must be unique and is used to identify the asset pair.

Price and nonce are both initialized to 0 and are used to identify whether the price has been updated. They shouldn't be set to anything except the null and 0 values.

I also can't guarantee that the price will be correct. I've done testing, and the prices align for the program.json that comes out of the box, but there may be issues with other programs if the data is not formatted the way I've parsed it.

## Future plans

- Clean up the UI to be more pleasing to the eye...
- Fix small issues like the favicon and manifest.json not loading in properly. (Such a nonissue to me so I've left it.)
- Add a search bar to the frontend to search for assets by symbol.
- Add line chart and add a plugin system to add things like RSI, MACD, Bollinger Bands, etc.
- Refactoring main.py to be less cluttered and more readable.
- Add more exchanges and in turn more programs to parse.
- Support Ethereum / EVM chains and exchanges.
