import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import BarChart from '../components/BarChart';
import { useWebSocket } from '../contexts/WebSocketContext';
import { Helmet } from 'react-helmet-async';
import { Skeleton } from "../components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

// Define StatDisplay helper component
const StatDisplay = ({ label, value, isLoading }) => (
  <div>
    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
    {isLoading ? (
      <Skeleton className="h-6 w-24 mt-1" /> 
    ) : (
      <dd className="mt-1 text-xl font-semibold tracking-tight text-foreground">{value || '--'}</dd>
    )}
  </div>
);

function Asset() {
    const { asset, key } = useParams();
    const { sendMessage, isConnected, getBars } = useWebSocket();
    const [historicalData, setHistoricalData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isMetaLoading, setIsMetaLoading] = useState(true);
    const fetchedRef = useRef(false);
    const wsInitializedRef = useRef(false);
    const [metadata, setMetadata] = useState(null);
    const [price, setPrice] = useState(null);
    const [priceChange24h, setPriceChange24h] = useState(null);
    const [selectedTimeframe, setSelectedTimeframe] = useState('5M');

    const handleTimeRangeChange = async (from, to, direction) => {
        try {
            const response = await fetch(`https://prices.now/historical_prices/${asset}/${key}?from=${Math.floor(from)}&to=${Math.ceil(to)}`);
            const data = await response.json();
            const newBars = data.map(item => ({
                time: item[4],
                open: item[0],
                high: item[1],
                low: item[2],
                close: item[3]
            }));
            setHistoricalData(prevData => {
                if (!prevData) return newBars;

                const barMap = new Map();
                prevData.forEach(bar => barMap.set(bar.time, bar));
                
                if (direction === 'left') {
                    const earliestExisting = prevData.reduce((min, bar) => bar.time < min ? bar.time : min, Infinity);
                    newBars.forEach(bar => {
                        if (bar.time < earliestExisting) {
                            barMap.set(bar.time, bar);
                        }
                    });
                } else {
                    const latestExisting = prevData.reduce((max, bar) => bar.time > max ? bar.time : max, -Infinity);
                    newBars.forEach(bar => {
                        if (bar.time > latestExisting) {
                            barMap.set(bar.time, bar);
                        }
                    });
                }
                
                return Array.from(barMap.values())
                    .sort((a, b) => a.time - b.time);
            });
        } catch (error) {
            console.error('Error fetching additional historical data:', error);
        }
    };

    useEffect(() => {
        if (!isConnected || wsInitializedRef.current) return;
        wsInitializedRef.current = true;

        const subscriptionKey = `${asset}_${key.replace('-', '_')}`;
        const success = sendMessage({
            type: 'subscribe_bars',
            asset_id: subscriptionKey
        });

        if (!success) {
            const retryInterval = setInterval(() => {
                if (sendMessage({
                    type: 'subscribe_bars',
                    asset_id: subscriptionKey
                })) {
                    clearInterval(retryInterval);
                }
            }, 100);

            return () => clearInterval(retryInterval);
        }

        return () => {
            sendMessage({
                type: 'unsubscribe_bars',
                asset_id: subscriptionKey
            });
            wsInitializedRef.current = false;
        };
    }, [isConnected, asset, key, sendMessage]);

    useEffect(() => {
        const assetKey = `${asset}_${key}`;
        const currentBars = getBars(assetKey);
        
        if (currentBars.length === 0) return;

        const latestBar = currentBars[currentBars.length - 1];
        setPrice(latestBar.close);

        setHistoricalData(prevData => {
            if (!prevData) return currentBars;

            const barMap = new Map();
            prevData.forEach(bar => barMap.set(bar.time, bar));
            
            currentBars.forEach(newBar => {
                barMap.set(newBar.time, newBar);
            });

            return Array.from(barMap.values())
                .sort((a, b) => a.time - b.time);
        });
    }, [asset, key, getBars]);

    useEffect(() => {
        // Reset states on param change
        setIsLoading(true); 
        setIsMetaLoading(true); 
        fetchedRef.current = false;
        setHistoricalData(null);
        setMetadata(null);
        setPrice(null);

        if (!asset || !key) {
            setIsLoading(false);
            setIsMetaLoading(false); 
            return; 
        }

        const fetchMetadata = async () => {
            try {
                const response = await fetch(`https://prices.now/metadata/${asset}/${key}`);
                if (!response.ok) throw new Error(`Metadata fetch failed: ${response.statusText}`);
                const data = await response.json();
                setMetadata(data);
            } catch (error) {
                console.error('Error fetching metadata:', error);
                 setMetadata(null); // Clear metadata on error
            } finally {
                setIsMetaLoading(false); 
            }
        };

        const fetchHistoricalData = async () => {
           // Using the reverted fetch logic for historical data
           if (fetchedRef.current) return;
            fetchedRef.current = true;
            try {
                let startTime = Math.floor(Date.now() / 1000) - (60 * 60 * 24);
                const response = await fetch(`https://prices.now/historical_prices/${asset}/${key}?from=${startTime}`);
                if (!response.ok) throw new Error(`Historical data fetch failed: ${response.statusText} (Status: ${response.status})`);
                const data = await response.json();
                if (!Array.isArray(data)) throw new TypeError(`Expected historical data to be an array, but received: ${typeof data}`);
                
                const timestampMap = new Map();
                 data.forEach(item => {
                    // Ensure item[4] is valid before using it
                     const timestamp = Number(item[4]);
                     if (!isNaN(timestamp) && !timestampMap.has(timestamp)) {
                         timestampMap.set(timestamp, {
                             time: timestamp,
                             open: Number(item[0]), // Ensure numbers
                             high: Number(item[1]),
                             low: Number(item[2]),
                             close: Number(item[3])
                         });
                     }
                 });
                const sortedData = Array.from(timestampMap.values()).sort((a, b) => a.time - b.time);

                // Reverted logic for filling gaps (consider simplifying later if needed)
                const formattedData = [];
                let lastClose = null;
                if (sortedData.length > 0) {
                    const startTime = sortedData[0].time;
                    const endTime = sortedData[sortedData.length - 1].time;
                    for (let t = startTime; t <= endTime; t += 60) {
                         const existingBar = sortedData.find(bar => bar.time === t);
                         if (existingBar) {
                             formattedData.push(existingBar);
                             lastClose = existingBar.close;
                         } else if (lastClose !== null) {
                             formattedData.push({ time: t, open: lastClose, high: lastClose, low: lastClose, close: lastClose });
                         }
                    }
                 }

                setPrice(lastClose);
                setHistoricalData(formattedData);
            } catch (error) {
                console.error('Error fetching historical data:', error);
                setHistoricalData([]);
                fetchedRef.current = false; 
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetadata();
        fetchHistoricalData();

    }, [asset, key]);

    useEffect(() => {
        const updateTitle = () => {
            const priceText = metadata?.pair?.includes('-USD') && price 
                ? `$${price.toFixed(2)}` 
                : price;
            document.title = `${metadata?.pair || 'Loading...'} | ${priceText} | prices.now`;
        };

        updateTitle();
        const titleInterval = setInterval(updateTitle, 1000);

        return () => clearInterval(titleInterval);
    }, [metadata, price]);

    // Effect to calculate 24h price change
    useEffect(() => {
        if (historicalData && historicalData.length > 1) {
            const sortedData = historicalData; // Already sorted
            const latestBar = sortedData[sortedData.length - 1];
            const latestPrice = latestBar.close;
            const latestTimestamp = latestBar.time;
            const targetTimestamp24hAgo = latestTimestamp - (24 * 60 * 60);

            // Find the bar with the timestamp closest to 24 hours ago
            let closestBar = null;
            let minDiff = Infinity;

            for (const bar of sortedData) {
                const diff = Math.abs(bar.time - targetTimestamp24hAgo);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestBar = bar;
                }
                // Optimization: If we've gone past the target and the diff starts increasing, we can stop
                // This assumes data is sorted chronologically
                if (bar.time > targetTimestamp24hAgo && diff > minDiff) {
                   // break; // Re-evaluate if this optimization is always safe depending on data density
                }
            }

            if (closestBar && closestBar.close > 0) {
                const price24hAgo = closestBar.close;
                const change = ((latestPrice - price24hAgo) / price24hAgo) * 100;
                setPriceChange24h(change); // Store the percentage change
            } else {
                setPriceChange24h(null); // Not enough data or zero price
            }
        } else {
             setPriceChange24h(null); // Not enough data
        }
    }, [historicalData]); // Recalculate when historicalData changes

    // Format price for display
    const displayPrice = price !== null
        ? metadata?.pair?.includes('-USD') 
            ? `$${price.toFixed(2)}`
            : price.toFixed(6)
        : '--'; 
        
    // Format 24h change for display
    const displayChange24h = priceChange24h !== null
        ? `${priceChange24h > 0 ? '+' : ''}${priceChange24h.toFixed(2)}%`
        : '--';
    const changeColorClass = priceChange24h > 0 ? 'text-green-500' : priceChange24h < 0 ? 'text-red-500' : '';

    return (
        <div className="container max-w-screen-2xl mx-auto">
            <Helmet>
                <title>{`${metadata?.pair || 'Loading...'} | ${displayPrice} | prices.now`}</title>
            </Helmet>
            <div className="w-full mx-auto py-10">
                <div className="flex flex-col items-center text-foreground">
                    <div className="border rounded-md p-4">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4 text-center">
                            {metadata?.pair || key || 'Loading...'} 
                        </h1>
                    
                        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                            <StatDisplay label="Current Price" value={displayPrice} isLoading={isMetaLoading || (price === null && !isLoading)} />
                            <StatDisplay label="Blockchain" value={metadata?.blockchain ? metadata.blockchain.charAt(0).toUpperCase() + metadata.blockchain.slice(1) : '--'} isLoading={isMetaLoading} />
                            <StatDisplay 
                                label="24H Change"
                                value={<span className={changeColorClass}>{displayChange24h}</span>}
                                isLoading={isLoading || priceChange24h === null}
                            />
                        </dl>
                    </div>
                    
                    <div className="flex items-center justify-between w-full py-4"> 
                        <h2 className="text-xl font-semibold tracking-tight">Live Chart</h2> 
                        <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select timeframe" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1M">1 Minute</SelectItem>
                                <SelectItem value="5M">5 Minutes</SelectItem>
                                <SelectItem value="15M">15 Minutes</SelectItem>
                                <SelectItem value="30M">30 Minutes</SelectItem>
                                <SelectItem value="60M">1 Hour</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <div className="w-full border rounded-md p-3">
                        {isLoading ? (
                            <Skeleton className="h-full w-full" />
                        ) : historicalData && historicalData.length > 0 ? (
                            <BarChart 
                                data={historicalData}
                                timeScale={selectedTimeframe}
                                chartType="candlestick"
                                timeframe={selectedTimeframe}
                                onTimeRangeChange={handleTimeRangeChange}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full border rounded text-muted-foreground w-full">
                                No historical data available.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Asset;