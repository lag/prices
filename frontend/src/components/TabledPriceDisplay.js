import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useNavigate } from 'react-router-dom';
import { TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function TabledPriceDisplay({ 
    asset_id, 
    pair,
    symbol, 
    quote,
    source, 
    startPrice,
    variation
}) {
    const { getPrice } = useWebSocket();
    const navigate = useNavigate();
    const [currentPrice, setCurrentPrice] = useState(startPrice);
    const [priceChangeClass, setPriceChangeClass] = useState('');
    const [shouldFlash, setShouldFlash] = useState(false);

    useEffect(() => {
    const price = getPrice(asset_id, pair);
        if (price !== null && price !== currentPrice) {
            const change = price - currentPrice;
            setPriceChangeClass(change > 0 ? 'text-green-500' : change < 0 ? 'text-red-500' : '');
            setCurrentPrice(price);
            setShouldFlash(true);
            
            // Remove the flash effect after a short delay
            const timer = setTimeout(() => {
                setShouldFlash(false);
            }, 150); // Flash duration
            
            return () => clearTimeout(timer); // Cleanup timer
        }
    }, [getPrice, asset_id, pair, currentPrice]);

    const handleRowClick = () => {
        navigate(`/asset/${asset_id}/${pair}`);
    };

    const initialColorClass = variation > 0 ? 'text-green-500' : variation < 0 ? 'text-red-500' : '';
    const finalColorClass = priceChangeClass || initialColorClass;

    const formattedPrice = currentPrice !== null 
        ? `${quote === 'USDC' ? '$' : ''}${currentPrice.toFixed(6)}`
        : 'Loading...';

    // Safely convert source to uppercase string
    const formattedSource = String(source || '').toUpperCase();
    
    return (
        <TableRow 
            onClick={handleRowClick} 
            className={cn(
                "cursor-pointer hover:bg-muted/50", 
                shouldFlash ? (priceChangeClass === 'text-green-500' ? 'bg-green-500/20' : 'bg-red-500/20') : ''
            )}
        >
            <TableCell className="font-medium py-2">{symbol}</TableCell>
            <TableCell className="py-2">{quote}</TableCell>
            <TableCell className="py-2">{formattedSource}</TableCell>
            <TableCell className={cn("text-right font-semibold py-2", finalColorClass)}>
                {formattedPrice}
            </TableCell>
        </TableRow>
    );
}

export default TabledPriceDisplay;