import React from 'react';
import TabledPriceDisplay from '../components/TabledPriceDisplay';
import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useWebSocket } from '../contexts/WebSocketContext';

function Home() {
  const [assets, setAssets] = useState([]);
  const { isConnected } = useWebSocket();

  useEffect(() => {
    fetch('http://127.0.0.1:8001/assets')
      .then(response => response.json())
      .then(data => setAssets(data))
      .catch(error => console.error('Error fetching assets:', error));
  }, []);

  useEffect(() => {
    const updateTitle = () => {
      document.title = `prices.now${isConnected ? '' : ' (disconnected)'}`;
    };

    updateTitle();
    const titleInterval = setInterval(updateTitle, 1000);

    return () => clearInterval(titleInterval);
  }, [isConnected]);

  return (
    <>
    <Helmet>
        <title>prices.now</title>
    </Helmet>
    <div>
      <h2>Current Prices</h2>
      <table>
        <thead>
            <tr>
                <th>Symbol</th>
                <th>Quote</th>
                <th>Source</th>
                <th>Price</th>
            </tr>
        </thead>
        <tbody>
          { Object.keys(assets).map((asset) => (
            assets[asset]['pairs'].map((pair) => (
              <TabledPriceDisplay key={assets[asset].asset_id+'_'+pair} pair={pair} asset_id={assets[asset].asset_id} variation={assets[asset].variation} symbol={pair.split('-')[0]} quote={pair.split('-')[1]} source={assets[asset].type} startPrice={assets[asset].price} />
            ))
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

export default Home;