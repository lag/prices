import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import BarChart from '../components/BarChart';
import { useWebSocket } from '../contexts/WebSocketContext';
import { Helmet } from 'react-helmet-async';

function Asset() {
    const { asset, pair } = useParams();
    const { sendMessage, isConnected, getBars } = useWebSocket();
    const [historicalData, setHistoricalData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const fetchedRef = useRef(false);
    const wsInitializedRef = useRef(false);
    const [metadata, setMetadata] = useState(null);
    const [price, setPrice] = useState(null);
    const [selectedTimeframe, setSelectedTimeframe] = useState('1M');

    const handleTimeRangeChange = async (from, to, direction) => {
        try {
            const response = await fetch(`http://127.0.0.1:8001/historical_prices/${asset}/${pair}?from=${Math.floor(from)}&to=${Math.ceil(to)}`);
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
                    const earliestExisting = Math.min(...prevData.map(bar => bar.time));
                    newBars.forEach(bar => {
                        if (bar.time < earliestExisting) {
                            barMap.set(bar.time, bar);
                        }
                    });
                } else {
                    const latestExisting = Math.max(...prevData.map(bar => bar.time));
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

        const subscriptionKey = `${asset}_${pair.replace('-', '_')}`;
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
    }, [isConnected, asset, pair, sendMessage]);

    useEffect(() => {
        const assetKey = `${asset}_${pair}`;
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
    }, [asset, pair, getBars]);

    useEffect(() => {
        const fetchMetadata = async () => {
            const response = await fetch(`http://127.0.0.1:8001/metadata/${asset}/${pair}`);
            const data = await response.json();
            setMetadata(data);
        };

        const fetchHistoricalData = async () => {
            if (fetchedRef.current) return;
            fetchedRef.current = true;
            
            try {
                setIsLoading(true);
                const response = await fetch(`http://127.0.0.1:8001/historical_prices/${asset}/${pair}`);
                const data = await response.json();

                const timestampMap = new Map();
                data.forEach(item => {
                    const timestamp = item[4];
                    if (!timestampMap.has(timestamp)) {
                        timestampMap.set(timestamp, {
                            time: timestamp,
                            open: item[0],
                            high: item[1],
                            low: item[2],
                            close: item[3]
                        });
                    }
                });

                const sortedData = Array.from(timestampMap.values())
                    .sort((a, b) => a.time - b.time);

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
                            formattedData.push({
                                time: t,
                                open: lastClose,
                                high: lastClose,
                                low: lastClose,
                                close: lastClose
                            });
                        }
                    }
                }
                setPrice(lastClose);
                setHistoricalData(formattedData);
            } catch (error) {
                console.error('Error fetching historical data:', error);
                fetchedRef.current = false;
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetadata();
        fetchHistoricalData();
    }, [asset, pair]);

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

    return (
        <>
            <Helmet>
                <title>{`${metadata?.pair || 'Loading...'} | ${metadata?.pair?.includes('-USD') && price ? '$' + price.toFixed(2) : price} | prices.now`}</title>
            </Helmet>
            <div style={{ width: '100%', background: '#000', color: '#DDD', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                <h1>{metadata?.pair}</h1>
                <h2>Current Price: {metadata?.pair?.includes('-USD') && price ? '$' + price.toFixed(2) : price}</h2>
                <h2>Blockchain: {metadata?.blockchain}</h2>
                <h2 style={{ color: '#DDD' }}>Live Chart</h2>
                {isLoading ? (
                    <div style={{ 
                        height: '400px',
                        color: '#DDD'
                    }}>
                        Loading historical data...
                    </div>
                ) : historicalData && historicalData.length > 0 ? (
                    <div style={{ maxWidth: '2000px', width: '100%'}}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'flex-start',
                            alignItems: 'center',
                            borderRadius: '4px',
                            margin: '10px',

                        }}>
                            <select
                                value={selectedTimeframe}
                                onChange={(e) => setSelectedTimeframe(e.target.value)}
                                style={{
                                    background: '#000',
                                    color: '#DDD',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                <option value="1M">1 Minute</option>
                                <option value="5M">5 Minutes</option>
                                <option value="15M">15 Minutes</option>
                                <option value="30M">30 Minutes</option>
                                <option value="60M">1 Hour</option>
                            </select>
                        </div>
                        <BarChart 
                            data={historicalData}
                            timeScale={selectedTimeframe}
                            chartType="candlestick"
                            timeframe={selectedTimeframe}
                            onTimeRangeChange={handleTimeRangeChange}
                        />
                    </div>
                ) : null}
            </div>
        </>
    );
}

export default Asset;