from parsers.utils import Parser

async def parse_whirlpool_state(decoded_data: bytes) -> dict:
    """Parse Orca Whirlpool state from bytes"""
    try:
        parser = Parser(decoded_data)
        parser.set_format([
            (8, 'skipped'),
            (32, 'whirlpoolsConfig'),
            (1, 'whirlpoolBump'),
            (2, 'tickSpacing'),
            (2, 'tickSpacingSeed'),
            (2, 'feeRate'),
            (2, 'protocolFeeRate'),
            (16, 'liquidity'),
            ('u128', 'sqrtPrice'),
        ])

        pool_state = parser.read()

        return pool_state
        
    except Exception as e:
        print(f"Error parsing Whirlpool state: {e}")
        return None

async def price_from_whirlpool(account: bytes, program: dict):
    """Get price from Orca Whirlpool"""
    try:
        
        pool_state = await parse_whirlpool_state(account)
        if not pool_state:
            return None
        
        Q64 = 2 ** 64
        price = (pool_state['sqrtPrice'] / Q64) * (pool_state['sqrtPrice'] / Q64)
        
        decimal_adjustment = 10 ** (program['decimalsA'] - program['decimalsB'])
        price = price * decimal_adjustment
        
        return price
        
    except Exception as e:
        print(f"Error getting Whirlpool price: {e}")
        return None