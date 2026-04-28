import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as d3 from 'd3';
import { useTheme } from '../../contexts/ThemeContext';
import { getChartColors } from '../../utils/chartThemeUtils';

/**
 * SVG Vertical Bar Chart Component
 * 
 * A customizable vertical bar chart with configurable legend position, value display, and color schemes.
 */
const BarChart = ({
  data,
  width = 600,
  height = 400,
  margin = { top: 40, right: 30, bottom: 60, left: 60 },
  showLegend = true,
  legendPosition = 'E',
  showValues = true,
  valuesPosition = 'outside',
  colorPalette = 'soft',
  showAxis = true,
  title = '',
  xAxisLabel = '',
  yAxisLabel = '',
  onBarClick = null
}) => {
  const { isDark } = useTheme();
  const svgRef = useRef(null);

  // Color schemes
  const colorSchemes = {
    soft: d3.scaleOrdinal(d3.schemeSet3),
    bright: d3.scaleOrdinal(d3.schemeSet1)
  };

  // Get color function based on selected palette
  const colorFn = colorSchemes[colorPalette] || colorSchemes.soft;

  useEffect(() => {
    if (!data || data.length === 0) return;

    // Get theme colors
    const colors = getChartColors(isDark);

    // Clear any existing chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Calculate inner dimensions
    const innerWidth = width - margin.left - margin.right;
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

    // Calculate total for percentage
    const total = data.reduce((sum, item) => sum + item.value, 0);

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

    // Create scales
    const categories = data.map(d => d.label);
    
    const xScale = d3.scaleBand()
      .domain(categories)
      .range([0, innerWidth])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) * 1.1]) // Add 10% padding at the top
      .range([innerHeight, 0]);

    // Create and add axes if showAxis is true
    if (showAxis) {
      // X axis
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

      // Y axis
      const yAxis = chart.append('g')
        .call(d3.axisLeft(yScale));
      
      yAxis.selectAll('text')
        .style('fill', colors.axisText);
      
      yAxis.selectAll('.domain, .tick line')
        .style('stroke', colors.axis);

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

    // Create and add bars
    const bars = chart.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.label))
      .attr('width', xScale.bandwidth())
      .attr('y', innerHeight)
      .attr('height', 0)
      .attr('fill', (d, i) => colorFn(i))
      .style('cursor', onBarClick ? 'pointer' : 'default')
      .on('click', (event, d) => {
        if (onBarClick) onBarClick(d);
      })
      .on('mouseover', (event, d) => {
        const percentage = ((d.value / total) * 100).toFixed(1);
        tooltip
          .html(`
            <div><strong>${d.label}</strong></div>
            <div>Value: ${d.value}</div>
            <div>Percentage: ${percentage}%</div>
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
      .on('mouseout', () => {
        tooltip.style('visibility', 'hidden');
      });

    // Animate bars
    bars.transition()
      .duration(800)
      .attr('y', d => yScale(d.value))
      .attr('height', d => innerHeight - yScale(d.value));

    // Add values on bars if showValues is true
    if (showValues) {
      chart.selectAll('.bar-value')
        .data(data)
        .enter()
        .append('text')
        .attr('class', 'bar-value')
        .attr('x', d => xScale(d.label) + xScale.bandwidth() / 2)
        .attr('y', d => {
          if (valuesPosition === 'inside') {
            // Position inside the bar, but only if the bar is tall enough
            const barHeight = innerHeight - yScale(d.value);
            return barHeight > 20 ? yScale(d.value) + 20 : yScale(d.value) - 5;
          } else {
            // Position outside (above) the bar
            return yScale(d.value) - 5;
          }
        })
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', d => {
          if (valuesPosition === 'inside') {
            // Use white text for inside bars
            const barHeight = innerHeight - yScale(d.value);
            return barHeight > 20 ? '#ffffff' : colors.text;
          } else {
            // Use theme text color for outside bars
            return colors.text;
          }
        })
        .style('opacity', 0)
        .text(d => d.value)
        .transition()
        .duration(800)
        .style('opacity', 1);
    }

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
        .data(data)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => {
          const offset = isHorizontal ? i * 80 - (data.length * 80) / 2 : i * 20;
          return `translate(${isHorizontal ? offset : 0}, ${isHorizontal ? 0 : offset})`;
        });

      // Add colored rectangles
      legendItems.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', (d, i) => colorFn(i));

      // Add labels
      legendItems.append('text')
        .attr('x', 20)
        .attr('y', 10)
        .style('font-size', '12px')
        .style('fill', colors.text)
        .text(d => d.label);
    }

    // Clean up tooltip when component unmounts
    return () => {
      d3.select('.bar-chart-tooltip').remove();
    };

  }, [data, width, height, margin, showLegend, legendPosition, showValues, valuesPosition, colorPalette, showAxis, title, xAxisLabel, yAxisLabel, onBarClick, isDark]);

  return (
    <div className="bar-chart-container" style={{ position: 'relative', width: '100%', maxHeight: height, overflow: 'hidden' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', maxHeight: height }} preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${width} ${height}`} />
    </div>
  );
};

BarChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.number.isRequired
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
  showLegend: PropTypes.bool,
  legendPosition: PropTypes.oneOf(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']),
  showValues: PropTypes.bool,
  valuesPosition: PropTypes.oneOf(['inside', 'outside']),
  colorPalette: PropTypes.oneOf(['soft', 'bright']),
  showAxis: PropTypes.bool,
  title: PropTypes.string,
  xAxisLabel: PropTypes.string,
  yAxisLabel: PropTypes.string,
  onBarClick: PropTypes.func
};

export default BarChart;
