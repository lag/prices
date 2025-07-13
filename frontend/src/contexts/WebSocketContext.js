import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
    const [prices, setPrices] = useState({});
    const [isConnected, setIsConnected] = useState(false);
    const [bars, setBars] = useState({});
    const workerRef = useRef(null);
    const isConnectedRef = useRef(isConnected);
    const sentMessagesRef = useRef([]); // Log of all sent messages

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
                    if (data.connected && workerRef.current) {
                        // Replay all logged messages
                        console.log('Connection re-established. Replaying sent messages:', sentMessagesRef.current);
                        sentMessagesRef.current.forEach(msg => {
                            workerRef.current.postMessage({ type: 'send', data: msg });
                        });
                    }
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

        // Handle page visibility change
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                if (workerRef.current && !isConnectedRef.current) {
                    console.log('Page became visible and WebSocket is likely disconnected. Attempting to reconnect via worker.');
                    workerRef.current.postMessage({ type: 'connect' });
                }
            }
        };

        // Update the ref's current property when isConnected changes
        isConnectedRef.current = isConnected;

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            worker.postMessage({ type: 'disconnect' });
            worker.terminate();
            // Clear sent messages on cleanup? Or keep them for next session if page is just hidden then shown?
            // For now, let's keep them as per "log all messages and replay"
        };
    }, [updatePrices, updateBars, isConnected]);

    const sendMessage = useCallback((message) => {
        if (workerRef.current && isConnected) {
            workerRef.current.postMessage({ type: 'send', data: message });
            // Log the sent message
            sentMessagesRef.current.push(message);
            console.log('Message sent and logged:', message, 'All logged messages:', sentMessagesRef.current);
            return true;
        }
        console.log('Message not sent (worker not ready or not connected):', message);
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

    const clearBars = useCallback((asset_id) => {
        setBars(currentBars => {
            const updatedBars = { ...currentBars };
            delete updatedBars[asset_id];
            return updatedBars;
        });
    }, []);

    return (
        <WebSocketContext.Provider value={{ 
            prices, 
            isConnected,
            reconnect: () => {
                if (workerRef.current) {
                    console.log('Manual reconnect triggered.');
                    workerRef.current.postMessage({ type: 'connect' });
                }
            },
            getPrice,
            getLatestBar,
            getBars,
            clearBars,
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

