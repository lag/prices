/* eslint-disable no-restricted-globals */
let ws = null;
let pingInterval = null;
let reconnectTimeout = null;

function startPingInterval() {
    if (pingInterval) {
        clearInterval(pingInterval);
    }
    pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000);
}

function connect() {
    if (ws) return;

    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    ws = new WebSocket('wss://prices.now/ws');

    ws.onopen = () => {
        self.postMessage({ 
            type: 'connection_status', 
            data: { connected: true } 
        });
        startPingInterval();
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            self.postMessage({ 
                type: 'message', 
                data: data 
            });
        } catch (error) {
            console.error('Failed to parse message:', error);
        }
    };

    ws.onclose = () => {
        self.postMessage({ 
            type: 'connection_status', 
            data: { connected: false } 
        });
        ws = null;

        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
        reconnectTimeout = setTimeout(connect, 5000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
    };
}

self.onmessage = (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'connect':
            connect();
            break;
        case 'send':
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
            }
            break;
        case 'disconnect':
            if (ws) {
                ws.close();
            }
            if (pingInterval) {
                clearInterval(pingInterval);
            }
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
            break;
        default:
            console.error('Unknown message type:', type);
            break;
    }
}; 