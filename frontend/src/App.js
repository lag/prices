import { useEffect } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import { WebSocketProvider } from './contexts/WebSocketContext';

import Navbar from './components/Navbar';
import Home from './pages/Home';
import Asset from './pages/Asset';
import NotFound from './pages/NotFound';

function App() {
  useEffect(() => {
    document.body.classList.add('dark');
    return () => {
      document.body.classList.remove('dark');
    };
  }, []);

  return (
    <HelmetProvider>
      <Router>
        <WebSocketProvider>
          <Navbar />

          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/asset/:asset/:key" element={<Asset />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </WebSocketProvider>
      </Router>
    </HelmetProvider>
  );
}

export default App;
