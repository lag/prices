import React from 'react';
import TabledPriceDisplay from '../components/TabledPriceDisplay';
import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useWebSocket } from '../contexts/WebSocketContext';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function Home() {
  // State to hold the flattened, sorted list of asset-pair combinations
  const [displayList, setDisplayList] = useState([]); 
  const { isConnected } = useWebSocket();

  // Define priority symbols
  const prioritySymbols = ['WBTC', 'WETH', 'WSOL'];

  useEffect(() => {
    fetch('https://prices.now/assets')
      .then(response => response.json())
      .then(data => {
        // 1. Flatten the data into an array of asset-pair objects
        const flatList = Object.values(data).flatMap(assetData => 
          (Array.isArray(assetData.pairs) ? assetData.pairs : []).map(pair => {
            const [symbol, quote] = pair.split('-');
            return {
              key: `${assetData.asset_id}_${pair}`,
              asset_id: assetData.asset_id,
              pair: pair,
              variation: assetData.variation,
              symbol: symbol,
              quote: quote,
              source: assetData.type,
              startPrice: assetData.price // Consider if price needs to be pair-specific
            };
          })
        );

        // 2. Sort the flat list with multiple levels
        flatList.sort((a, b) => {
          const aIsUsdc = a.quote === 'USDC';
          const bIsUsdc = b.quote === 'USDC';
          const aIsPriority = prioritySymbols.includes(a.symbol);
          const bIsPriority = prioritySymbols.includes(b.symbol);

          // 1. Prioritize USDC quotes
          if (aIsUsdc && !bIsUsdc) return -1;
          if (!aIsUsdc && bIsUsdc) return 1;

          // --- At this point, both are USDC or both are non-USDC ---

          // 2. Prioritize priority symbols within the quote group
          if (aIsPriority && !bIsPriority) return -1;
          if (!aIsPriority && bIsPriority) return 1;

          // --- At this point, both are priority OR both are non-priority --- 
          // --- (within the same quote group) ---

          // 3. Sort alphabetically by symbol as the final fallback
          const symbolA = String(a.symbol || ''); 
          const symbolB = String(b.symbol || '');
          return symbolA.localeCompare(symbolB);
        });

        // 3. Set the sorted list for display
        setDisplayList(flatList);
      })
      .catch(error => console.error('Error fetching/processing assets:', error));
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
    <div className="w-full max-w-screen-2xl mx-auto px-0 sm:px-6 lg:px-8 py-10">
      <Helmet>
          <title>prices.now</title>
      </Helmet>
      <div className="mb-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Current Prices</h2>
      </div>
      <Table>
        <TableHeader>
            <TableRow>
                <TableHead className="w-[100px]">Symbol</TableHead>
                <TableHead>Quote</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Price</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
          { displayList.length > 0 ? (
            // 4. Render the sorted flat list
            displayList.map((item) => (
              <TabledPriceDisplay 
                key={item.key} 
                pair={item.pair} 
                asset_id={item.asset_id} 
                variation={item.variation} 
                symbol={item.symbol} 
                quote={item.quote} 
                source={item.source} 
                startPrice={item.startPrice} 
              />
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="text-center h-24">Loading assets...</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default Home;