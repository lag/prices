import React from 'react';
import { Link } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import { cn } from "@/lib/utils";

function Navbar() {
    const { isConnected } = useWebSocket();
    
    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
                {/* Brand Section */}
                <div className="mr-4 flex items-center">
                    <Link to="/" className="mr-6 flex items-center space-x-2">
                        {/* Connection Status Dot */}
                        {/* Brand Text */}
                        <span className="font-bold">
                            prices.now
                        </span>
                        <span 
                            className={cn(
                                "h-2.5 w-2.5 rounded-full",
                                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
                            )}
                            title={isConnected ? "Connected" : "Disconnected"}
                        />
                    </Link>
                </div>

                {/* Links Section - Simple navigation for now */}
                <nav className="flex items-center gap-6 text-sm">
                    <Link 
                        to="/"
                        className="transition-colors hover:text-foreground/80 text-foreground/60"
                    >
                        Home
                    </Link>
                    {/* Add more links like this if needed
                    <Link
                        to="/about"
                        className="transition-colors hover:text-foreground/80 text-foreground/60"
                    >
                        About
                    </Link>
                    */}
                </nav>
            </div>
        </header>
    );
}

export default Navbar;