import React, { useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import * as d3 from 'd3';
import './ChartTooltip.css';
import { useTheme } from '../../contexts/ThemeContext';
import { getChartColors } from '../../utils/chartThemeUtils';

/**
 * Heatmap Chart Component
 * 
 * A customizable heatmap chart for visualizing correlations between two dimensions.
 */
const HeatmapChart = ({
  data,
  width = 800,
  height = 600,
  margin = { top: 80, right: 50, bottom: 100, left: 100 },
  colorScale = ['#f7fbff', '#08306b'],
  xLabel = 'X Axis',
  yLabel = 'Y Axis',
  title = 'Heatmap Chart',
  onCellClick = null
}) => {
  const { isDark } = useTheme();
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  // Extract unique x and y values from data
  const getUniqueValues = useCallback((data, key) => {
    return [...new Set(data.map(d => d[key]))];
  }, []);

  const renderChart = useCallback(() => {
    if (!data || !data.length || !svgRef.current) {
      return;
    }

    // Get theme colors
    const colors = getChartColors(isDark);

    // Clear any existing chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Get container dimensions if responsive
    let chartWidth = width;
    let chartHeight = height;
    
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      if (containerRect.width > 0) {
        chartWidth = containerRect.width;
        // Maintain aspect ratio
        chartHeight = containerRect.width * (height / width);
      }
    }

    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr('viewBox', `0 0 ${chartWidth} ${chartHeight}`)
      .attr('style', 'max-width: 100%; height: auto;');

    // Calculate inner dimensions
    const innerWidth = chartWidth - margin.left - margin.right;
    const innerHeight = chartHeight - margin.top - margin.bottom;
    
    // Create chart group
    const chart = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Add title
    svg.append('text')
      .attr('x', chartWidth / 2)
      .attr('y', margin.top / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '20px')
      .style('font-weight', 'bold')
      .style('fill', colors.text)
      .text(title);

    // Get unique x and y values
    const xValues = getUniqueValues(data, 'x');
    const yValues = getUniqueValues(data, 'y');

    // Create scales
    const xScale = d3.scaleBand()
      .domain(xValues)
      .range([0, innerWidth])
      .padding(0.05);

    const yScale = d3.scaleBand()
      .domain(yValues)
      .range([0, innerHeight])
      .padding(0.05);

    // Create color scale
    const valueExtent = d3.extent(data, d => d.value);
    const colorScaleFunc = d3.scaleLinear()
      .domain(valueExtent)
      .range(colorScale);

    // Create tooltip
    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'chart-tooltip');

    // Draw heatmap cells
    chart.selectAll('rect')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', d => xScale(d.x))
      .attr('y', d => yScale(d.y))
      .attr('width', xScale.bandwidth())
      .attr('height', yScale.bandwidth())
      .attr('fill', d => colorScaleFunc(d.value))
      .style('cursor', onCellClick ? 'pointer' : 'default')
      .on('mouseover', (event, d) => {
        tooltip
          .html(`
            <div class="chart-tooltip-title">${d.y} - ${d.x}</div>
            <div class="chart-tooltip-value">Value: <strong>${d.value}</strong></div>
            ${d.description ? `<div class="chart-tooltip-description">${d.description}</div>` : ''}
          `)
          .classed('visible', true)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', () => {
        tooltip.classed('visible', false);
      })
      .on('click', (event, d) => {
        if (onCellClick) onCellClick(d);
      });

    // Add x-axis
    const xAxis = chart.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(xScale));
    
    xAxis.selectAll('text')
      .style('text-anchor', 'end')
      .style('fill', colors.axisText)
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');
    
    xAxis.selectAll('.domain, .tick line')
      .style('stroke', colors.axis);

    // Add y-axis
    const yAxis = chart.append('g')
      .call(d3.axisLeft(yScale));
    
    yAxis.selectAll('text')
      .style('fill', colors.axisText);
    
    yAxis.selectAll('.domain, .tick line')
      .style('stroke', colors.axis);

    // Add x-axis label
    chart.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + margin.bottom - 10)
      .attr('text-anchor', 'middle')
      .style('fill', colors.text)
      .text(xLabel);

    // Add y-axis label
    chart.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -margin.left + 20)
      .attr('text-anchor', 'middle')
      .style('fill', colors.text)
      .text(yLabel);

    // Add legend
    const legendWidth = 200;
    const legendHeight = 20;
    const legendX = innerWidth - legendWidth;
    const legendY = -margin.top / 2;

    // Create gradient for legend
    const defs = svg.append('defs');
    const linearGradient = defs.append('linearGradient')
      .attr('id', 'heatmap-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%');

    linearGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', colorScale[0]);

    linearGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', colorScale[1]);

    // Draw legend rectangle
    chart.append('rect')
      .attr('x', legendX)
      .attr('y', legendY)
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .style('fill', 'url(#heatmap-gradient)');

    // Add legend labels
    chart.append('text')
      .attr('x', legendX)
      .attr('y', legendY - 5)
      .attr('text-anchor', 'start')
      .style('fill', colors.text)
      .text(valueExtent[0]);

    chart.append('text')
      .attr('x', legendX + legendWidth)
      .attr('y', legendY - 5)
      .attr('text-anchor', 'end')
      .style('fill', colors.text)
      .text(valueExtent[1]);

    // Add legend title
    chart.append('text')
      .attr('x', legendX + legendWidth / 2)
      .attr('y', legendY - 20)
      .attr('text-anchor', 'middle')
      .style('fill', colors.text)
      .text('Value');

    // Cleanup function to remove tooltip when component unmounts
    return () => {
      d3.select('.app-modex-tooltip').remove();
    };
  }, [data, width, height, margin, colorScale, xLabel, yLabel, title, onCellClick, getUniqueValues, isDark]);

  // Initial render and on data/size changes
  useEffect(() => {
    // Use requestAnimationFrame to avoid ResizeObserver loop issues
    const animationFrame = requestAnimationFrame(() => {
      const cleanup = renderChart();
      return () => {
        if (cleanup) cleanup();
        // Ensure tooltip is removed
        d3.selectAll('.chart-tooltip').remove();
      };
    });
    
    return () => {
      cancelAnimationFrame(animationFrame);
      // Ensure tooltip is removed
      d3.selectAll('.chart-tooltip').remove();
    };
  }, [renderChart]);

  // Handle resize events - TEMPORARILY DISABLED
  useEffect(() => {
    // TODO: Re-enable ResizeObserver with proper error handling later
    // For now, charts will have fixed dimensions but will work without errors
    
    // Initial render only
    renderChart();
  }, [renderChart]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '600px', minHeight: '600px' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }}></svg>
    </div>
  );
};

HeatmapChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      x: PropTypes.string.isRequired,
      y: PropTypes.string.isRequired,
      value: PropTypes.number.isRequired,
      description: PropTypes.string
    })
  ).isRequired,
  width: PropTypes.number,
  height: PropTypes.number,
  margin: PropTypes.shape({
    top: PropTypes.number,
    right: PropTypes.number,
    bottom: PropTypes.number,
    left: PropTypes.number
  }),
  colorScale: PropTypes.arrayOf(PropTypes.string),
  xLabel: PropTypes.string,
  yLabel: PropTypes.string,
  title: PropTypes.string,
  onCellClick: PropTypes.func
};

export default HeatmapChart;
