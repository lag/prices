import { useWebSocket } from '../contexts/WebSocketContext';
import { useNavigate } from 'react-router-dom';

function TabledPriceDisplay({ asset_id, pair, symbol, quote, source }) {
    const navigate = useNavigate();
    const { getPrice } = useWebSocket();

    const price = getPrice(asset_id, pair);
    
    return (
        <tr onClick={() => navigate(`/asset/${asset_id}/${pair}`)} style={{cursor: 'pointer'}}>
            <td>{symbol}</td>
            <td>{quote}</td>
            <td>{source}</td>
            <td>{price ? (
                <span>{price.toFixed(10)}</span>
            ) : (
                <span>Loading...</span>
            )}</td>
        </tr>
    );
}

export default TabledPriceDisplay;