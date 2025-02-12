import asyncio
import httpx
from dotenv import dotenv_values

from parsers.utils import Parser

ENV = dotenv_values('.env')
client = httpx.AsyncClient()

async def parse_clmm_pool_state(decoded_data: bytes) -> dict:
    """Parse Raydium CLMM pool state into a dictionary"""

    parser = Parser(decoded_data, 0)
    parser.set_format([
        (8+1+(7*32), 'skipped'),
        ('u8', 'mint0Decimals'),
        ('u8', 'mint1Decimals'),
        (2, 'tickSpacing'),
        (16, 'liquidity'),
        ('u128', 'sqrtPriceX64'),
    ])

    state = parser.read()
    
    return state

async def price_from_clmm(account: bytes, program: dict) -> float:

    pool_state = await parse_clmm_pool_state(account)

    sqrt_price = pool_state['sqrtPriceX64']
    squared = sqrt_price * sqrt_price
    Q64 = 2 ** 64
    price = squared / (Q64 * Q64)
    decimal_adjustment = 10 ** (pool_state['mint0Decimals'] - pool_state['mint1Decimals'])

    final_price = price * decimal_adjustment

    return final_price

async def get_token_holding(accounts: list[str]) -> list[int]:

    holdings = [0]*len(accounts)

    json_datas = []
    for x,account in enumerate(accounts):
        json_datas.append({"jsonrpc": "2.0","id": x,"method": "getTokenAccountBalance","params": [account]})

    while True:
        try:
            responses = await client.post(ENV['SOLANA_RPC_URL'], json=json_datas)
            j = responses.json()
            for x,response in enumerate(j):
                try:holdings[response['id']] = int(response['result']['value']['amount']) // (10 ** response['result']['value']['decimals'])
                except Exception as e:print('holding error:',e)
            break
        except Exception as e:
            print('holding error:',e)
            await asyncio.sleep(1)

    return holdings

async def parse_amm_pool_state(decoded_data: bytes) -> dict:
    """Parse Raydium AMM pool state into a dictionary"""

    parser = Parser(decoded_data, 0)
    parser.set_format([
        (8*32, 'first'),
        ((16*2)+8, 'second'),
        ((16*2)+8, 'second'),
        ('pubkey', 'baseVault'),
        ('pubkey', 'quoteVault'),
        ('pubkey', 'baseMint'),
        ('pubkey', 'quoteMint'),
    ])

    state = parser.read()

    return state

async def price_from_amm(account: bytes, program: dict) -> float:
    """Calculate price from AMM pool state"""
    pool_state = await parse_amm_pool_state(account)
    
    balances = await get_token_holding([pool_state['baseVault'], pool_state['quoteVault']])
    
    if balances[0] == 0 or balances[1] == 0:return None
    
    price = (balances[1] / balances[0])
    
    return price