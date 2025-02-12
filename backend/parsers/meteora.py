from parsers.utils import Parser

async def parse_dlmm_pool_state(decoded_data: bytes) -> dict:
    """Parse Meteora DLMM pool state from bytes"""
    try:
        parser = Parser(decoded_data)
        parser.set_format([
            (8+32+32+1+2+1,'skipped'),
            ('i32','active_id'),
            ('u16','bin_step'),
        ])
        pool_state = parser.read()

        return pool_state
    except Exception as e:
        print(f"Error parsing DLMM pool state: {e}")
        return None
    
async def price_from_dlmm(decoded_data: bytes, program: dict):
    """Get price from Meteora DLMM pool"""
    
    pool_state = await parse_dlmm_pool_state(decoded_data)
    if not pool_state:
        return None
    
    bin_step = pool_state['bin_step']
    active_id = pool_state['active_id']
    
    base_price = pow(1.0001, bin_step * active_id)

    decimal_adjustment = 10 ** (program['decimalsA'] - program['decimalsB'])
    final_price = base_price * decimal_adjustment
    
    return final_price