import React, { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';


const BarChart = ({ 
    height = 800, 
    data,
    timeScale = '1D',
    chartType = 'candlestick',
    timeframe = '5M',
    onTimeRangeChange
}) => {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const lastDataRef = useRef(null);
    const initializedRef = useRef(false);
    const [containerWidth, setContainerWidth] = useState(0);
    const currentDataRangeRef = useRef({ from: null, to: null });

    const formatBar = (bar) => {
        const formattedBar = {
            time: typeof bar.time === 'object' ? bar.time.getTime() / 1000 : parseInt(bar.time),
            open: parseFloat(bar.open),
            high: parseFloat(bar.high),
            low: parseFloat(bar.low),
            close: parseFloat(bar.close)
        };
        return formattedBar;
    };

    useEffect(() => {
        if (data && data.length > 0) {
            const sortedData = [...data].sort((a, b) => a.time - b.time);
            currentDataRangeRef.current = {
                from: sortedData[0].time,
                to: sortedData[sortedData.length - 1].time
            };
        }
    }, [data]);

    const aggregateCandles = (rawData, minutes) => {
      const groupedData = {};
      
      rawData.forEach(bar => {
          const timestamp = Math.floor(bar.time / (minutes * 60)) * (minutes * 60);
          
          if (!groupedData[timestamp]) {
              groupedData[timestamp] = {
                  time: timestamp,
                  open: bar.open,
                  high: bar.high,
                  low: bar.low,
                  close: bar.close
              };
          } else {
              groupedData[timestamp].high = Math.max(groupedData[timestamp].high, bar.high);
              groupedData[timestamp].low = Math.min(groupedData[timestamp].low, bar.low);
              groupedData[timestamp].close = bar.close;
          }
      });

      return Object.values(groupedData);
  };

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                const newWidth = chartContainerRef.current.clientWidth;
                chartRef.current.applyOptions({ width: newWidth });
            }
        };

        if (chartContainerRef.current) {
            setContainerWidth(chartContainerRef.current.clientWidth);
        }

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [containerWidth]);

    useEffect(() => {
        if (!chartRef.current && chartContainerRef.current) {
            chartRef.current = createChart(chartContainerRef.current, {
                width: containerWidth,
                height,
                layout: {
                    background: { color: '#000' },
                    textColor: '#DDD',
                },
                grid: {
                    vertLines: { color: 'rgba(70, 70, 70, 0.5)' },
                    horzLines: { color: 'rgba(70, 70, 70, 0.5)' },
                },
                crosshair: {
                    mode: CrosshairMode.Normal,
                    vertLine: {
                        color: '#555',
                        width: 1,
                        style: 0,
                        labelBackgroundColor: '#1E1E1E',
                    },
                    horzLine: {
                        color: '#555',
                        width: 1,
                        style: 0,
                        labelBackgroundColor: '#1E1E1E',
                    },
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: timeScale === '1S',
                    borderColor: '#333',
                    textColor: '#DDD',
                },
                rightPriceScale: {
                    borderColor: '#333',
                    textColor: '#DDD',
                }
            });

            seriesRef.current = chartType === 'candlestick' 
                ? chartRef.current.addCandlestickSeries({
                    upColor: '#26a69a',
                    downColor: '#ef5350',
                    wickUpColor: '#26a69a',
                    wickDownColor: '#ef5350',
                })
                : chartRef.current.addBarSeries({
                    upColor: '#26a69a',
                    downColor: '#ef5350',
                });

            // Time range handler. Resizing for left and right moves on the chart.
            if (onTimeRangeChange) {
                let isResizing = false;
                let lastRange = null;

                chartRef.current.timeScale().subscribeVisibleTimeRangeChange((visibleRange) => {
                    if (!visibleRange || !data || data.length < 2) return;
                    if (isNaN(visibleRange.from) || isNaN(visibleRange.to)) return;

                    const logicalRange = chartRef.current.timeScale().getVisibleLogicalRange();
                    
                    if (logicalRange) {
                        const unloadedBarsToLeft = Math.abs(Math.floor(logicalRange.from));
                        
                        if (unloadedBarsToLeft > 20) {
                            const timePerBar = (visibleRange.to - visibleRange.from) / 
                                (logicalRange.to - logicalRange.from);
                            const theoreticalEarliestTime = visibleRange.from - 
                                (unloadedBarsToLeft * timePerBar);
                            
                            if (theoreticalEarliestTime < currentDataRangeRef.current.from) {
                                lastRange = {
                                    from: theoreticalEarliestTime,
                                    to: currentDataRangeRef.current.from,
                                    direction: 'left'
                                };
                            }
                            if (!isResizing && lastRange) {
                                isResizing = true;
                                setTimeout(() => {
                                    if (lastRange) {
                                        onTimeRangeChange(lastRange.from, lastRange.to, lastRange.direction);
                                        lastRange = null;
                                    }
                                    isResizing = false;
                                }, 200);
                            }
                        }
                    }
                });
            }

            return () => {
                chartRef.current.remove();
                chartRef.current = null;
                seriesRef.current = null;
                lastDataRef.current = null;
                initializedRef.current = false;
            };
        }
    }, [chartRef]);

    useEffect(() => {
      if (!seriesRef.current || !data || data.length === 0) return;
  
      const minutes = parseInt(timeframe.replace('M', ''));
      const rawData = minutes > 1 ? aggregateCandles(data, minutes) : data;
      const processedData = rawData.map(formatBar);
  
      if (!initializedRef.current) {
          seriesRef.current.setData(processedData);
          chartRef.current.timeScale().fitContent();
          lastDataRef.current = processedData[processedData.length - 1];
          initializedRef.current = true;
          return;
      }
  
      if (processedData.length - (lastDataRef.current ? 1 : 0) > 1 ||
          (processedData[0]?.time < lastDataRef.current?.time)) {
          seriesRef.current.setData(processedData);
          lastDataRef.current = processedData[processedData.length - 1];
          return;
      }
  
      const lastBar = processedData[processedData.length - 1];
      if (!lastDataRef.current || 
          lastBar.time !== lastDataRef.current.time || 
          lastBar.close !== lastDataRef.current.close) {
          seriesRef.current.update(lastBar);
          lastDataRef.current = lastBar;
      }
  }, [data, timeframe]);

    return (
        <div className="w-full rounded-md bg-card text-card-foreground">
            <div ref={chartContainerRef} style={{ width: '100%', height: `${height}px` }} />
        </div>
    );
};

export default BarChart;