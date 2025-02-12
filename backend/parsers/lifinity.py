from parsers.utils import Parser

async def parse_lifinity_pool_state(decoded_data: bytes) -> dict:
    """Parse Lifinity pool state from bytes"""
    try:
        
        pool_state = {}
        current_pos = 8  # Skip discriminator

        parser = Parser(decoded_data, current_pos)
        parser.set_format([
            (511, 'skipped'),
            ('u64', 'config.last_price'),
        ])

        pool_state = parser.read()

        return pool_state

    except Exception as e:
        print(f"Error parsing Lifinity pool state: {e}")
        return None

async def price_from_pool(decoded_data: bytes, program: dict):
    try:
        pool_state = await parse_lifinity_pool_state(decoded_data)
        if not pool_state:
            print("Failed to parse pool state")
            return None

        if pool_state['config.last_price'] == 0:
            print("Warning: Price calculated as 0")
            return None
        
        decimal_adjustment = 10 ** program['decimalsA'] # not sure if right, but it gave correct result on HNT-SOL

        return pool_state['config.last_price'] / decimal_adjustment

    except Exception as e:
        print(f"Error getting Lifinity price: {e}")
        return None