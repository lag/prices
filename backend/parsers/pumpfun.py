from parsers.utils import Parser

async def parse_pump_bonding_curve(decoded_data: bytes) -> dict:
    """Parse Pump.fun bonding curve state"""
    try:
        parser = Parser(decoded_data, 8)
        parser.set_format([
            ('u64', 'virtualTokenReserves'),
            ('u64', 'virtualSolReserves'),
        ])

        state = parser.read()
        return state

    except Exception as e:
        print(f"Error parsing Pump bonding curve: {e}")
        return None
    
async def price_from_curve(account: bytes, program: dict) -> float:
    """Get price from Pump.fun bonding curve"""
        
    state = await parse_pump_bonding_curve(account)
    if not state:
        return None
    
    if state['virtualTokenReserves'] > 0:
        price = (state['virtualSolReserves'] / 1_000_000_000) / (state['virtualTokenReserves'] / 1_000_000)
        state['price'] = price
        return state
    else:
        return None