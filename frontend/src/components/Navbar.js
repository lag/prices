import React from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';
import { useWebSocket } from '../contexts/WebSocketContext';

function Navbar() {
    const { isConnected } = useWebSocket();
    
    return <>
        <nav className="navbar">
            <div className="nav-brand">
                <div className="connection-status">
                    <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
                </div>
                <Link to="/">prices.now</Link>
            </div>
            <div className="nav-links">
                <Link to="/">Home</Link>
            </div>
        </nav>
    </>;
}

export default Navbar;