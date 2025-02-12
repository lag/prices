import traceback
import base58

class Parser:
    def __init__(self, decoded_data: bytes, current_pos: int = 0):
        self.decoded_data = decoded_data
        self.current_pos = current_pos
        self.formatted = {}

    def set_format(self, format: list):
        self.format = format

    def read(self):
        try:
            for i in self.format:
                if type(i[0]) == int:
                    self.current_pos += i[0]
                elif i[0] == 'pubkey':
                    pubkey_bytes = self.decoded_data[self.current_pos:self.current_pos + 32]
                    pubkey = str(base58.b58encode(pubkey_bytes).decode('utf-8'))
                    self.current_pos += 32
                    self.formatted[i[1]] = pubkey
                elif i[0] == 'u64':
                    value = int.from_bytes(self.decoded_data[self.current_pos:self.current_pos + 8], byteorder='little')
                    self.current_pos += 8
                    self.formatted[i[1]] = value
                elif i[0] == 'u8':
                    value = self.decoded_data[self.current_pos]
                    self.current_pos += 1
                    self.formatted[i[1]] = value
                elif i[0] == 'bool':
                    value = self.decoded_data[self.current_pos]
                    self.current_pos += 1
                    self.formatted[i[1]] = bool(value)
                elif i[0] == 'u16':
                    value = int.from_bytes(self.decoded_data[self.current_pos:self.current_pos + 2], byteorder='little')
                    self.current_pos += 2
                    self.formatted[i[1]] = value
                elif i[0] == 'u24':
                    value = int.from_bytes(self.decoded_data[self.current_pos:self.current_pos + 3], byteorder='little')
                    self.current_pos += 3
                    self.formatted[i[1]] = value
                elif i[0] == 'u32':
                    value = int.from_bytes(self.decoded_data[self.current_pos:self.current_pos + 4], byteorder='little')
                    self.current_pos += 4
                    self.formatted[i[1]] = value
                elif i[0] == 'i32':
                    value = int.from_bytes(self.decoded_data[self.current_pos:self.current_pos + 4], byteorder='little', signed=True)
                    self.current_pos += 4
                    self.formatted[i[1]] = value
                elif i[0] == 'i64':
                    value = int.from_bytes(self.decoded_data[self.current_pos:self.current_pos + 8], byteorder='little', signed=True)
                    self.current_pos += 8
                    self.formatted[i[1]] = value
                elif i[0] == 'u128':
                    value = int.from_bytes(self.decoded_data[self.current_pos:self.current_pos + 16], byteorder='little')
                    self.current_pos += 16
                    self.formatted[i[1]] = value
        except Exception as e:
            print(f"Error parsing data: {e}")
            print(f"Full error traceback: ", traceback.format_exc())
            return None
        return self.formatted