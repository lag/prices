import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
    const [prices, setPrices] = useState({});
    const [isConnected, setIsConnected] = useState(false);
    const [bars, setBars] = useState({});
    const workerRef = useRef(null);

    const updatePrices = useCallback((newData) => {
        setPrices(currentPrices => {
            const updatedPrices = { ...currentPrices };

            Object.entries(newData).forEach(([asset_id, pairs]) => {
                if(!updatedPrices[asset_id]) {
                    updatedPrices[asset_id] = {};
                }
                Object.entries(pairs).forEach(([pair, currentPrice]) => {
                    updatedPrices[asset_id][pair] = currentPrice;
                });
            });

            return updatedPrices;
        });
    }, []);

    const updateBars = useCallback((data) => {
        setBars(currentBars => {
            const assetKey = `${data.asset.split('_')[0]}_${data.asset.split('_')[1]}-${data.asset.split('_')[2]}`;
            const newBar = {
                time: data.timestamp,
                open: data.bar[0],
                high: data.bar[1],
                low: data.bar[2],
                close: data.bar[3]
            };

            const assetBars = currentBars[assetKey] || [];
            
            const updatedBars = assetBars.length > 0 && assetBars[assetBars.length - 1].time === newBar.time
                ? [...assetBars.slice(0, -1), newBar]
                : [...assetBars, newBar];

            return {
                ...currentBars,
                [assetKey]: updatedBars
            };
        });
    }, []);

    useEffect(() => {
        const worker = new Worker(new URL('../workers/websocket.worker.js', import.meta.url));
        workerRef.current = worker;

        worker.onmessage = (event) => {
            const { type, data } = event.data;
            
            switch (type) {
                case 'connection_status':
                    setIsConnected(data.connected);
                    break;
                case 'message':
                    if (data.type === 'prices') {
                        updatePrices(data.data);
                    } else if (data.type === 'bars') {
                        updateBars(data.data);
                    }
                    break;
                default:
                    console.log('Unknown message type:', type);
            }
        };

        // Start connection
        worker.postMessage({ type: 'connect' });

        return () => {
            worker.postMessage({ type: 'disconnect' });
            worker.terminate();
        };
    }, [updatePrices, updateBars]);

    const sendMessage = useCallback((message) => {
        if (workerRef.current && isConnected) {
            workerRef.current.postMessage({ type: 'send', data: message });
            return true;
        }
        return false;
    }, [isConnected]);

    const getPrice = useCallback((asset_id, pair) => {
        if (!prices[asset_id]) return null;
        if (!prices[asset_id][pair]) return null;
        return prices[asset_id][pair];
    }, [prices]);

    const getLatestBar = useCallback((asset_id) => {
        const assetBars = bars[asset_id];
        if (!assetBars || assetBars.length === 0) return null;
        return assetBars[assetBars.length - 1];
    }, [bars]);

    const getBars = useCallback((asset_id) => {
        return bars[asset_id] || [];
    }, [bars]);

    return (
        <WebSocketContext.Provider value={{ 
            prices, 
            isConnected,
            reconnect: () => workerRef.current?.postMessage({ type: 'connect' }),
            getPrice,
            getLatestBar,
            getBars,
            sendMessage,
        }}>
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocket() {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }
    return context;
}

