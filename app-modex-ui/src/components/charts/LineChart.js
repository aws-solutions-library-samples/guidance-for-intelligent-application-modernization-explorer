import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import * as d3 from 'd3';
import { useTheme } from '../../contexts/ThemeContext';
import { getChartColors } from '../../utils/chartThemeUtils';

/**
 * SVG Line Chart Component for Timeseries Data
 * 
 * A customizable line chart with configurable legend position, color schemes, and time period selection.
 */
const LineChart = ({
  data,
  width = 800,
  height = 400,
  margin = { top: 40, right: 80, bottom: 60, left: 60 },
  showLegend = true,
  legendPosition = 'E',
  colorPalette = 'soft',
  showAxis = true,
  title = '',
  xAxisLabel = '',
  yAxisLabel = '',
  dateFormat = d3.timeFormat('%b %d'),
  timeframe = 'all', // 'all', '7d', '30d', '90d'
  onPointClick = null
}) => {
  const { isDark } = useTheme();
  const svgRef = useRef(null);
  const [filteredData, setFilteredData] = useState(data);

  // Color schemes
  const colorSchemes = {
    soft: d3.scaleOrdinal(d3.schemeSet3),
    bright: d3.scaleOrdinal(d3.schemeSet1)
  };

  // Get color function based on selected palette
  const colorFn = colorSchemes[colorPalette] || colorSchemes.soft;

  // Filter data based on timeframe
  useEffect(() => {
    if (!data || !data.series || data.series.length === 0) {
      setFilteredData(data);
      return;
    }

    // If timeframe is 'all', use all data
    if (timeframe === 'all') {
      setFilteredData(data);
      return;
    }

    // Calculate cutoff date
    const now = new Date();
    let cutoffDate;
    
    switch (timeframe) {
      case '7d':
        cutoffDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case '30d':
        cutoffDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case '90d':
        cutoffDate = new Date(now.setDate(now.getDate() - 90));
        break;
      default:
        cutoffDate = null;
    }

    if (!cutoffDate) {
      setFilteredData(data);
      return;
    }

    // Filter each series
    const filtered = {
      ...data,
      series: data.series.map(series => ({
        ...series,
        values: series.values.filter(point => new Date(point.date) >= cutoffDate)
      }))
    };

    setFilteredData(filtered);
  }, [data, timeframe]);

  useEffect(() => {
    if (!filteredData || !filteredData.series || filteredData.series.length === 0) return;

    // Get theme colors
    const colors = getChartColors(isDark);

    // Clear any existing chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Get the actual width of the SVG element
    const svgWidth = svgRef.current.clientWidth;

    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr('height', height);

    // Calculate inner dimensions
    const innerWidth = svgWidth - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create chart group
    const chart = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Create tooltip
    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'app-modex-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden');

    // Add title
    if (title) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', margin.top / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .style('fill', colors.text)
        .text(title);
    }

    // Find min and max dates across all series
    let allDates = [];
    filteredData.series.forEach(series => {
      series.values.forEach(point => {
        allDates.push(new Date(point.date));
      });
    });
    
    const minDate = d3.min(allDates);
    const maxDate = d3.max(allDates);

    // Find min and max values across all series
    let allValues = [];
    filteredData.series.forEach(series => {
      series.values.forEach(point => {
        allValues.push(point.value);
      });
    });
    
    const minValue = d3.min(allValues);
    const maxValue = d3.max(allValues);

    // Create scales
    const xScale = d3.scaleTime()
      .domain([minDate, maxDate])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([Math.min(0, minValue * 0.9), maxValue * 1.1]) // Add padding and ensure 0 is included
      .range([innerHeight, 0]);

    // Create and add axes if showAxis is true
    if (showAxis) {
      // X axis
      const xAxis = chart.append('g')
        .attr('transform', `translate(0, ${innerHeight})`)
        .call(d3.axisBottom(xScale).tickFormat(dateFormat));
      
      xAxis.selectAll('text')
        .style('text-anchor', 'end')
        .style('fill', colors.axisText)
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');
      
      xAxis.selectAll('.domain, .tick line')
        .style('stroke', colors.axis);

      // Y axis
      const yAxis = chart.append('g')
        .call(d3.axisLeft(yScale));
      
      yAxis.selectAll('text').style('fill', colors.axisText);
      yAxis.selectAll('.domain, .tick line').style('stroke', colors.axis);

      // X axis label
      if (xAxisLabel) {
        chart.append('text')
          .attr('x', innerWidth / 2)
          .attr('y', innerHeight + margin.bottom - 10)
          .attr('text-anchor', 'middle')
          .style('font-size', '12px')
          .style('fill', colors.text)
          .text(xAxisLabel);
      }

      // Y axis label
      if (yAxisLabel) {
        chart.append('text')
          .attr('transform', 'rotate(-90)')
          .attr('x', -innerHeight / 2)
          .attr('y', -margin.left + 15)
          .attr('text-anchor', 'middle')
          .style('font-size', '12px')
          .style('fill', colors.text)
          .text(yAxisLabel);
      }
    }

    // Create line generator
    const line = d3.line()
      .x(d => xScale(new Date(d.date)))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX); // Smooth curve

    // Add grid lines (optional)
    const gridY = chart.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(d3.axisLeft(yScale)
        .tickSize(-innerWidth)
        .tickFormat('')
      );
    gridY.selectAll('.domain, .tick line').style('stroke', colors.grid);

    // Draw lines for each series
    filteredData.series.forEach((series, i) => {
      // Draw the line
      chart.append('path')
        .datum(series.values)
        .attr('fill', 'none')
        .attr('stroke', colorFn(i))
        .attr('stroke-width', 2)
        .attr('d', line)
        .attr('opacity', 0)
        .transition()
        .duration(1000)
        .attr('opacity', 1);

      // Add points
      const points = chart.selectAll(`.point-${i}`)
        .data(series.values)
        .enter()
        .append('circle')
        .attr('class', `point-${i}`)
        .attr('cx', d => xScale(new Date(d.date)))
        .attr('cy', d => yScale(d.value))
        .attr('r', 4)
        .attr('fill', colorFn(i))
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .style('cursor', onPointClick ? 'pointer' : 'default')
        .attr('opacity', 0)
        .on('mouseover', (event, d) => {
          d3.select(event.currentTarget)
            .attr('r', 6)
            .attr('stroke-width', 2);
          
          tooltip
            .html(`
              <div><strong>${series.name}</strong></div>
              <div>Date: ${dateFormat(new Date(d.date))}</div>
              <div>Value: ${d.value}</div>
            `)
            .style('visibility', 'visible')
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
        })
        .on('mousemove', (event) => {
          tooltip
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', (event) => {
          d3.select(event.currentTarget)
            .attr('r', 4)
            .attr('stroke-width', 1);
          
          tooltip.style('visibility', 'hidden');
        })
        .on('click', (event, d) => {
          if (onPointClick) onPointClick(d, series);
        });

      // Animate points
      points.transition()
        .delay((d, i) => i * 10)
        .duration(500)
        .attr('opacity', 1);
    });

    // Add legend if showLegend is true
    if (showLegend) {
      const legendPositions = {
        'N': { x: innerWidth / 2, y: -margin.top / 2, layout: 'horizontal' },
        'NE': { x: innerWidth, y: 0, layout: 'vertical' },
        'E': { x: innerWidth + 10, y: innerHeight / 2, layout: 'vertical' },
        'SE': { x: innerWidth, y: innerHeight, layout: 'vertical' },
        'S': { x: innerWidth / 2, y: innerHeight + 40, layout: 'horizontal' },
        'SW': { x: -10, y: innerHeight, layout: 'vertical' },
        'W': { x: -margin.left + 10, y: innerHeight / 2, layout: 'vertical' },
        'NW': { x: -10, y: 0, layout: 'vertical' }
      };

      const position = legendPositions[legendPosition] || legendPositions.E;
      const isHorizontal = position.layout === 'horizontal';
      
      const legend = chart.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${position.x}, ${position.y})`);

      const legendItems = legend.selectAll('.legend-item')
        .data(filteredData.series)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => {
          const offset = isHorizontal ? i * 100 - (filteredData.series.length * 100) / 2 : i * 20;
          return `translate(${isHorizontal ? offset : 0}, ${isHorizontal ? 0 : offset})`;
        });

      // Add colored lines
      legendItems.append('line')
        .attr('x1', 0)
        .attr('y1', 7)
        .attr('x2', 15)
        .attr('y2', 7)
        .attr('stroke', (d, i) => colorFn(i))
        .attr('stroke-width', 2);

      // Add colored circles
      legendItems.append('circle')
        .attr('cx', 7.5)
        .attr('cy', 7)
        .attr('r', 3)
        .attr('fill', (d, i) => colorFn(i));

      // Add labels
      legendItems.append('text')
        .attr('x', 20)
        .attr('y', 10)
        .style('font-size', '12px')
        .style('fill', colors.text)
        .text(d => d.name);
    }

    // Clean up tooltip when component unmounts
    return () => {
      d3.select('.line-chart-tooltip').remove();
    };

  }, [filteredData, width, height, margin, showLegend, legendPosition, colorPalette, showAxis, title, xAxisLabel, yAxisLabel, dateFormat, onPointClick, isDark]);

  return (
    <div className="line-chart-container" style={{ position: 'relative', width: '100%', height }}>
      <svg ref={svgRef} width="100%" height={height} />
    </div>
  );
};

LineChart.propTypes = {
  data: PropTypes.shape({
    series: PropTypes.arrayOf(
      PropTypes.shape({
        name: PropTypes.string.isRequired,
        values: PropTypes.arrayOf(
          PropTypes.shape({
            date: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]).isRequired,
            value: PropTypes.number.isRequired
          })
        ).isRequired
      })
    ).isRequired
  }).isRequired,
  width: PropTypes.number,
  height: PropTypes.number,
  margin: PropTypes.shape({
    top: PropTypes.number,
    right: PropTypes.number,
    bottom: PropTypes.number,
    left: PropTypes.number
  }),
  showLegend: PropTypes.bool,
  legendPosition: PropTypes.oneOf(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']),
  colorPalette: PropTypes.oneOf(['soft', 'bright']),
  showAxis: PropTypes.bool,
  title: PropTypes.string,
  xAxisLabel: PropTypes.string,
  yAxisLabel: PropTypes.string,
  dateFormat: PropTypes.func,
  timeframe: PropTypes.oneOf(['all', '7d', '30d', '90d']),
  onPointClick: PropTypes.func
};

export default LineChart;
