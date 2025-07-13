import os, time, traceback, json, math
import base58, base64, httpx, sqlite3
import sqlite3, websockets, asyncio, uvicorn

from fastapi.responses import FileResponse
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from dotenv import dotenv_values
from collections import defaultdict

ENV = dotenv_values('.env')

app = FastAPI(docs_url=None,redoc_url=None,)
app.add_middleware(GZipMiddleware,minimum_size=1000,)
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_credentials=True,allow_methods=["*"],allow_headers=["*"],)
app.state.price_store = {}
app.state.programs = None
app.state.valid_tables = set()
app.state.programs_changed = 0

active_connections = []
client = httpx.AsyncClient()

# Load the programs from the programs.json file.
def load_functions(programs: dict):
    global app

    if app.state.programs_changed == os.path.getmtime('programs.json'):
        return

    programs = json.loads(open('programs.json','r').read())
    app.state.programs_changed = os.path.getmtime('programs.json')
    try:
        for program in programs:
            try:
                module_name, function_name = program['handler'].rsplit('.', 1)
                module = __import__(module_name, fromlist=[function_name])
                program['handler'] = getattr(module, function_name)
                for pair in program['pairs']:
                    app.state.valid_tables.add(f'historical_prices_{program["asset_id"]}_{pair.replace("-", "_")}')
                    app.state.valid_tables.add(f'prices_{program["asset_id"]}_{pair.replace("-", "_")}')
                    app.state.valid_tables.add(f'metadata_{program["asset_id"]}_{pair.replace("-", "_")}')
            except Exception as e:
                print(f"Error loading program {program['handler']}: {e}")
    except:pass

    app.state.programs = programs
load_functions(app.state.programs)

app.mount("/static", StaticFiles(directory="../frontend/build/static"), name="static")

# Initialize the price tables and loop for price updates.
async def update_prices():
    conn = sqlite3.connect(f'prices.db')
    conn_historical = sqlite3.connect(f'prices_historical.db')

    for program in app.state.programs:

        asset_id = program['asset_id']
        for pair in program['pairs']:
            flat_pair = pair.replace('-', '_')
            cursor = conn.cursor()
            cursor.execute(f'CREATE TABLE IF NOT EXISTS prices_{asset_id}_{flat_pair} (pair TEXT, price REAL, timestamp INTEGER, source CHAR(16))')
            cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_timestamp_{asset_id}_{flat_pair} ON prices_{asset_id}_{flat_pair}(timestamp)')

            cursor_historical = conn_historical.cursor()
            cursor_historical.execute(f'CREATE TABLE IF NOT EXISTS historical_prices_{asset_id}_{flat_pair} (pair TEXT, high REAL, low REAL, open REAL, close REAL, timestamp INTEGER)')
            cursor_historical.execute(f'CREATE INDEX IF NOT EXISTS idx_timestamp_{asset_id}_{flat_pair} ON  historical_prices_{asset_id}_{flat_pair}(timestamp)')
            
    conn.commit()
    conn_historical.commit()

    del asset_id
    del pair

    conn_historical.cursor()
    conn_historical.close()

    while True:
        try:
            async with websockets.connect(ENV['SOLANA_RPC_WS']) as ws:
                print("Connected to RPC websocket.")

                subscription_to_program = {}

                #subscribe_messages = []
                for x,program in enumerate(app.state.programs):
                    subscribe_msg = {
                        "jsonrpc": "2.0",
                        "id": x,
                        "method": "accountSubscribe",
                        "params": [
                            program['programId'],
                            {"encoding": "jsonParsed","commitment": "confirmed",}
                        ]
                    }
                    await ws.send(json.dumps(subscribe_msg).encode('utf-8'))

                prices_in_usd = {}
                pair_values = {}

                while True:
                    message = json.loads(await ws.recv())

                    if 'result' in message:
                        if 'id' in message:
                            subscription_to_program[message['result']] = app.state.programs[message['id']]
                            continue

                    if 'params' not in message:continue
                    if 'subscription' not in message['params']:continue
                    if message['params']['subscription'] not in subscription_to_program:continue

                    try:
                        if type(message['params']['result']['value']['data']) != list:
                            print(message)
                            continue
                    except:
                        print(message)
                        if 'params' in message and 'error' in message['params'] and 'message' in message['params']['error']:
                            print(message['params']['error']['message'])
                            forced_error_here()
                        continue

                    program = subscription_to_program[message['params']['subscription']]
                    account_data = base64.b64decode(message['params']['result']['value']['data'][0])

                    price = await program['handler'](account_data, program)
                    if price is None:continue

                    program['price'] = price

                    # Get price in USD if possible -- useful for extrapolating prices of other assets.
                    if program['symbolB'] == 'USDC':prices_in_usd[program['symbolA']] = price
                    elif program['symbolA'] == 'USDC':prices_in_usd[program['symbolB']] = 1 / price
                    else:
                        if program['symbolA'] in prices_in_usd:prices_in_usd[program['symbolB']] = prices_in_usd[program['symbolA']] * price
                        elif program['symbolB'] in prices_in_usd:prices_in_usd[program['symbolA']] = prices_in_usd[program['symbolB']] * price

                    # Update the price for all pairs.
                    new_pairs = {}
                    for pair in program['pairs']:
                        pairA, pairB = pair.split("-")
                        
                        if (pairA == program['symbolA'] and pairB == program['symbolB']):new_pairs[pair] = price
                        elif (pairB == program['symbolA'] and pairA == program['symbolB']):new_pairs[pair] = 1 / price

                        elif pairB == 'USDC' and 'WSOL-USDC' in pair_values:
                            if f'{pairA}-WSOL' in pair_values:
                                pair_a_in_wsol = pair_values[f'{pairA}-WSOL']
                                new_pairs[pair] = pair_a_in_wsol * pair_values['WSOL-USDC']

                    # Check if the pair is in the pair_values dictionary. If not, add it. If it is, update it.
                    updated_pairs = set()
                    for pair in new_pairs:
                        if pair not in pair_values:
                            pair_values[pair] = new_pairs[pair]
                            updated_pairs.add(pair)

                        elif pair in pair_values:
                            if pair_values[pair] != new_pairs[pair]:
                                pair_values[pair] = new_pairs[pair]
                                updated_pairs.add(pair)

                    # Update the database if there was a price change.
                    if len(updated_pairs) > 0:
                        for pair in updated_pairs:
                            flat_pair = pair.replace('-', '_')
                            cursor.execute(f'INSERT INTO prices_{program["asset_id"]}_{flat_pair} (pair, price, timestamp, source) VALUES (?, ?, ?, ?)', (pair, pair_values[pair], int(time.time()*1000), 'solana'))
                            if program['asset_id'] not in app.state.price_store:
                                app.state.price_store[program['asset_id']] = {}
                            app.state.price_store[program['asset_id']][pair] = pair_values[pair] 
                        conn.commit()
        except asyncio.CancelledError:
            break
        except:
            traceback.print_exc()
            await asyncio.sleep(1)
            pass

# Update the historical prices every minute.
async def historical_prices_manager():
    last_historical_combination = None
    historical_bar_minimum = 60 # 1 minute for historical bars
    last_historical_combination = time.time() // historical_bar_minimum

    conn = sqlite3.connect(f'prices.db')
    conn_historical = sqlite3.connect(f'prices_historical.db')
    cursor_historical = conn_historical.cursor()
    while True:
        try:
            await asyncio.sleep(1)
            load_functions(app.state.programs)
            if last_historical_combination == None or (time.time() // historical_bar_minimum) - last_historical_combination > 1:
                last_historical_combination = time.time() // historical_bar_minimum
                
                cursor = conn.cursor()
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = cursor.fetchall()
                for table in tables:
                    if table[0].startswith('prices_'):

                        asset_id_and_pair = table[0].split('prices_',1)[1]

                        cut_off = last_historical_combination * historical_bar_minimum * 1000*2

                        # only get data from older than the required 2x timeframe to cut off
                        cursor.execute(f'SELECT * FROM {table[0]} WHERE timestamp < ? ORDER BY timestamp ASC', (cut_off,))
                        data = cursor.fetchall()
                        
                        bars = {}
                        for item in data:
                            item = dict(item)
                            # Calculate which bar this price belongs to
                            bar_timestamp = item['timestamp'] - (item['timestamp'] % (historical_bar_minimum * 1000))
                            
                            if bar_timestamp not in bars:
                                bars[bar_timestamp] = {
                                    'pair': item['pair'],
                                    'open': item['price'],
                                    'high': item['price'],
                                    'low': item['price'],
                                    'close': item['price'],
                                    'timestamp': bar_timestamp,
                                }
                            else:
                                bars[bar_timestamp]['high'] = max(bars[bar_timestamp]['high'], item['price'])
                                bars[bar_timestamp]['low'] = min(bars[bar_timestamp]['low'], item['price'])
                                bars[bar_timestamp]['close'] = item['price']

                        # Convert to list if needed
                        bars_list = list(bars.values())
                        for bar in bars_list:
                            cursor_historical.execute(f'SELECT pair, high, low, open, close, timestamp FROM historical_prices_{asset_id_and_pair} WHERE timestamp = ?', (bar['timestamp'],))
                            fetch_result = cursor_historical.fetchone()
                            if fetch_result is not None:
                                bar['high'] = max(bar['high'], fetch_result[1])
                                bar['low'] = min(bar['low'], fetch_result[2])
                                bar['open'] = fetch_result[3]
                                bar['close'] = fetch_result[4]
                                cursor_historical.execute(f'UPDATE historical_prices_{asset_id_and_pair} SET high = ?, low = ?, open = ?, close = ? WHERE timestamp = ?', (bar['high'], bar['low'], bar['open'], bar['close'], bar['timestamp']))
                            else:
                                cursor_historical.execute(f'INSERT INTO historical_prices_{asset_id_and_pair} (pair, high, low, open, close, timestamp) VALUES (?, ?, ?, ?, ?, ?)', (bar['pair'], bar['high'], bar['low'], bar['open'], bar['close'], bar['timestamp']))
                        conn_historical.commit()

                        cursor.execute(f'DELETE FROM {table[0]} WHERE timestamp < ?', (cut_off,))
                        conn.commit()
        except Exception as e:
            traceback.print_exc()


@app.on_event("startup")
async def startup_event():
 
    # Get the most recent price for each pair for the price storage.
    try:
        conn = sqlite3.connect(f'prices.db')
        cursor = conn.cursor()
        for program in app.state.programs:
            for pair in program['pairs']:
                cursor.execute(f'SELECT price FROM prices_{program["asset_id"]}_{pair.replace("-", "_")} ORDER BY timestamp DESC LIMIT 1')
                value = cursor.fetchone()
                if value:
                    if program['asset_id'] not in app.state.price_store:app.state.price_store[program['asset_id']] = {}
                    app.state.price_store[program['asset_id']][pair] = value[0]
    except:
        pass

    # Run the price update and historical prices tasks.
    app.state.price_update_task = asyncio.create_task(update_prices())
    app.state.historical_prices_task = asyncio.create_task(historical_prices_manager())

@app.on_event("shutdown")
async def shutdown_event():
    # Gracefully cancel the tasks.
    app.state.price_update_task.cancel()
    app.state.historical_prices_task.cancel()
    try:
        await app.state.price_update_task
        await app.state.historical_prices_task
    except asyncio.CancelledError:
        pass

@app.get("/historical_prices/{asset_id}/{pair}")
async def get_historical_prices(request: Request, asset_id: int, pair: str, timeframe: int = 1):
    table = f'historical_prices_{asset_id}_{pair.replace("-", "_")}'
    if table not in app.state.valid_tables:return {'error': 'Invalid pair', 'endpoint': '/historical_prices'}

    conn = sqlite3.connect(f'prices_historical.db')
    cursor = conn.cursor()

    from_timestamp = int(request.query_params.get('from', default=int(time.time()) - (60*60*6)))*1000
    to_timestamp = int(request.query_params.get('to',default=int(time.time())))*1000

    if from_timestamp > to_timestamp:
        from_timestamp, to_timestamp = to_timestamp, from_timestamp

    if from_timestamp-to_timestamp > (60*60*24*30)*1000: # 1 month in one query
        return {'error': 'Time range too large', 'endpoint': '/historical_prices'}

    cursor.execute(f'SELECT open, high, low, close, timestamp/1000 FROM {table} WHERE timestamp > ? AND timestamp < ? ORDER BY timestamp ASC', (from_timestamp, to_timestamp))
    prices = cursor.fetchall()

    if timeframe > 1:
        candles = []
        grouped_data = {}
        
        for price in prices:
            timestamp = price[4]
            bar_timestamp = (timestamp // (timeframe * 60)) * (timeframe * 60)
            
            # Group by timeframe intervals -- logic was a bit too complex to do in SQL (at least cleanly for now)
            if bar_timestamp not in grouped_data:
                grouped_data[bar_timestamp] = {
                    'open': price[0],
                    'high': price[1],
                    'low': price[2],
                    'close': price[3],
                    'timestamp': bar_timestamp
                }
            else:
                grouped_data[bar_timestamp]['high'] = max(grouped_data[bar_timestamp]['high'], price[1])
                grouped_data[bar_timestamp]['low'] = min(grouped_data[bar_timestamp]['low'], price[2])
                grouped_data[bar_timestamp]['close'] = price[3]
        
        # Convert grouped data to candles array
        for timestamp in sorted(grouped_data.keys()):
            data = grouped_data[timestamp]
            candles.append([
                data['open'],
                data['high'],
                data['low'],
                data['close'],
                data['timestamp']
            ])
    else:
        candles = prices

    cursor.close()
    conn.close()
    return candles

@app.get("/prices/{asset_id}/{pair}")
async def get_prices(asset_id: str, pair: str):
    table = f'prices_{asset_id}_{pair.replace("-", "_")}'
    if table not in app.state.valid_tables:return {'error': 'Invalid pair', 'endpoint': '/prices'}

    conn = sqlite3.connect(f'prices.db')
    cursor = conn.cursor()

    cursor.execute(f'SELECT * FROM {table} ORDER BY timestamp DESC')
    prices = cursor.fetchall()

    cursor.close()
    conn.close()
    return prices

@app.get("/metadata/{asset_id}/{pair}")
async def get_metadata(asset_id: int, pair: str):

    table = f'metadata_{asset_id}_{pair.replace("-", "_")}'
    if table not in app.state.valid_tables:return {'error': 'Invalid pair', 'endpoint': '/metadata'}

    conn = sqlite3.connect(f'prices.db')
    cursor = conn.cursor()

    table = f'prices_{asset_id}_{pair.replace("-", "_")}'

    cursor.execute(f'SELECT * FROM {table} ORDER BY timestamp DESC LIMIT 1')
    price_data = cursor.fetchone()

    # known bug that if prices were completely flushed in a bar, these will not exist within prices table.
    try:value = {'pair': price_data[0],'blockchain': price_data[3],'price': price_data[1]}
    except:value = {'pair': pair,'blockchain': 'solana','price': None}

    cursor.close()
    conn.close()
    return value

@app.get('/assets')
async def get_assets():
    return app.state.programs

async def handle_subscription_messages(websocket: WebSocket, subscribed_assets: set):
    try:
        while True:
            message = await websocket.receive_json()

            if message['type'] == 'subscribe_bars': # Client wants to subscribe to a new asset.
                asset_id = message['asset_id'].replace('-', '_')
                subscribed_assets.add(asset_id)

            elif message['type'] == 'unsubscribe_bars': # Client wants to unsubscribe from an asset.
                asset_id = message['asset_id'] .replace('-', '_') 
                if asset_id in subscribed_assets:
                    subscribed_assets.remove(asset_id)

    except WebSocketDisconnect:
        raise
    except Exception as e:
        raise


async def send_price_updates(websocket: WebSocket, user_state: dict, user_tick_speed: float, subscribed_assets: set):
    """Send price updates for subscribed assets"""
    try:
        def nested_dict():
            return defaultdict(nested_dict)
        
        while True:

            diff = defaultdict(nested_dict)
            changed_assets = set()

            for asset_id in app.state.price_store:
                for pair in app.state.price_store[asset_id]:
                    if pair not in user_state[asset_id]:
                        diff[asset_id][pair] = app.state.price_store[asset_id][pair]
                        changed_assets.add(f'{asset_id}_{pair.replace("-", "_")}')
                    else:
                        if user_state[asset_id][pair] != app.state.price_store[asset_id][pair]:
                            diff[asset_id][pair] = app.state.price_store[asset_id][pair]
                            changed_assets.add(f'{asset_id}_{pair.replace("-", "_")}')
                            user_state[asset_id][pair] = app.state.price_store[asset_id][pair]

            if len(subscribed_assets) > 0:
                overlap = subscribed_assets.intersection(changed_assets)
                for asset_id in overlap:

                    if f'prices_{asset_id}' not in app.state.valid_tables:
                        subscribed_assets.remove(asset_id)
                        continue

                    historical_bar_minimum = 60
                    current_time = time.time()
                    this_bar_range = math.floor(current_time / historical_bar_minimum) * historical_bar_minimum
                    bottom_timestamp = this_bar_range * 1000
                    top_timestamp = (this_bar_range + historical_bar_minimum) * 1000

                    
                    conn = sqlite3.connect(f'prices.db')
                    cursor = conn.cursor()

                    cursor.execute(f'SELECT * FROM prices_{asset_id} WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC', (bottom_timestamp, top_timestamp))
                    
                    prices_for_range = cursor.fetchall()
                    cursor.close()
                    conn.close()

                    bars = {}
                    for item in prices_for_range:
                        if this_bar_range not in bars: # Create initial bar.
                            bars[this_bar_range] = {
                                'asset': asset_id,
                                'bar': [item[1],item[1],item[1],item[1]], # OHLC all the same for initial bar.
                                'timestamp': this_bar_range,
                            }
                        else: # Update the bar as it goes.
                            bars[this_bar_range]['bar'][1] = max(bars[this_bar_range]['bar'][1], item[1])
                            bars[this_bar_range]['bar'][2] = min(bars[this_bar_range]['bar'][2], item[1])
                            bars[this_bar_range]['bar'][3] = item[1]
                    

                    if this_bar_range in bars: # Send the final bar to subscribed client
                        bar = bars[this_bar_range]
                        await websocket.send_json({'type': 'bars', 'data': bar})

            # Send the price updates to the client.
            if len(diff) > 0:await websocket.send_json({'type': 'prices', 'data': diff})

            await asyncio.sleep(user_tick_speed)
    except:raise

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    print("WebSocket connection started")
    active_connections.append(websocket)

    user_state = {}
    user_tick_speed = 100/1000 # 100ms tick

    cleaned_prices = {}

    for program in app.state.programs:
        user_state[program['asset_id']] = {}
        cleaned_prices[program['asset_id']] = {}
        for pair in program['pairs']:
            user_state[program['asset_id']][pair] = program['nonce']
            if program['asset_id'] in app.state.price_store and pair in app.state.price_store[program['asset_id']]:cleaned_prices[program['asset_id']][pair] = app.state.price_store[program['asset_id']][pair]
            else:cleaned_prices[program['asset_id']][pair] = None

    # Send the initial prices to the client.
    await websocket.send_json({'type': 'prices', 'data': cleaned_prices})

    subscribed_assets = set()
    try:
        task = asyncio.create_task(handle_subscription_messages(websocket, subscribed_assets))
        send_task = asyncio.create_task(send_price_updates(websocket, user_state, user_tick_speed, subscribed_assets))
        await asyncio.gather(task,send_task)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        traceback.print_exc()
    finally:
        active_connections.remove(websocket)
        task.cancel()
        send_task.cancel()

# Redirect to static frontend.
@app.get("/")
async def index():return FileResponse("../frontend/build/index.html")
@app.get("/{full_path:path}")
async def serve_app():return FileResponse("../frontend/build/index.html")

if __name__ == "__main__":
    uvicorn.run(app, host=ENV['HOST'], port=int(ENV['PORT']))

