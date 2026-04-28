import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as d3 from 'd3';
import { useTheme } from '../../contexts/ThemeContext';
import { getChartColors } from '../../utils/chartThemeUtils';

/**
 * SVG Bubble Chart Component
 * 
 * A customizable bubble chart with configurable legend position, color schemes, and axis visibility.
 */
const BubbleChart = ({
  data,
  width = 700,
  height = 500,
  margin = { top: 40, right: 80, bottom: 60, left: 60 },
  showLegend = true,
  legendPosition = 'E',
  colorPalette = 'soft',
  showAxis = true,
  title = '',
  xAxisLabel = '',
  yAxisLabel = '',
  onBubbleClick = null
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
      .attr('height', height);

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

    // Find min and max values for x, y, and size
    const xExtent = d3.extent(data, d => d.x);
    const yExtent = d3.extent(data, d => d.y);
    const sizeExtent = d3.extent(data, d => d.size);

    // Add padding to the domains
    const xPadding = (xExtent[1] - xExtent[0]) * 0.05;
    const yPadding = (yExtent[1] - yExtent[0]) * 0.05;

    // Create scales
    const xScale = d3.scaleLinear()
      .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
      .range([innerHeight, 0]);

    const sizeScale = d3.scaleSqrt()
      .domain(sizeExtent)
      .range([5, 30]);

    // Create and add axes if showAxis is true
    if (showAxis) {
      // X axis
      const xAxis = chart.append('g')
        .attr('transform', `translate(0, ${innerHeight})`)
        .call(d3.axisBottom(xScale));
      
      xAxis.selectAll('text').style('fill', colors.axisText);
      xAxis.selectAll('.domain, .tick line').style('stroke', colors.axis);

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

      // Add grid lines
      const gridY = chart.append('g')
        .attr('class', 'grid')
        .attr('opacity', 0.1)
        .call(d3.axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat('')
        );
      gridY.selectAll('.domain, .tick line').style('stroke', colors.grid);

      const gridX = chart.append('g')
        .attr('class', 'grid')
        .attr('transform', `translate(0, ${innerHeight})`)
        .attr('opacity', 0.1)
        .call(d3.axisBottom(xScale)
          .tickSize(-innerHeight)
          .tickFormat('')
        );
      gridX.selectAll('.domain, .tick line').style('stroke', colors.grid);
    }
    }

    // Create a group for all bubbles
    const bubblesGroup = chart.append('g')
      .attr('class', 'bubbles');

    // Create and add bubbles
    const bubbles = bubblesGroup.selectAll('.bubble')
      .data(data)
      .enter()
      .append('circle')
      .attr('class', 'bubble')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 0) // Start with radius 0 for animation
      .attr('fill', (d, i) => colorFn(d.category || i))
      .attr('fill-opacity', 0.7)
      .attr('stroke', (d, i) => d3.rgb(colorFn(d.category || i)).darker(0.5))
      .attr('stroke-width', 1)
      .style('cursor', onBubbleClick ? 'pointer' : 'default')
      .on('mouseover', (event, d) => {
        d3.select(event.currentTarget)
          .attr('stroke-width', 2)
          .attr('fill-opacity', 0.9);
        
        tooltip
          .html(`
            <div><strong>${d.label}</strong></div>
            <div>${xAxisLabel || 'X'}: ${d.x}</div>
            <div>${yAxisLabel || 'Y'}: ${d.y}</div>
            <div>Size: ${d.size}</div>
            ${d.category ? `<div>Category: ${d.category}</div>` : ''}
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
          .attr('stroke-width', 1)
          .attr('fill-opacity', 0.7);
        
        tooltip.style('visibility', 'hidden');
      })
      .on('click', (event, d) => {
        if (onBubbleClick) onBubbleClick(d);
      });

    // Animate bubbles
    bubbles.transition()
      .duration(800)
      .delay((d, i) => i * 20)
      .attr('r', d => sizeScale(d.size));

    // Add labels to bubbles if they have a label
    bubblesGroup.selectAll('.bubble-label')
      .data(data.filter(d => d.label))
      .enter()
      .append('text')
      .attr('class', 'bubble-label')
      .attr('x', d => xScale(d.x))
      .attr('y', d => yScale(d.y) - sizeScale(d.size) - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('opacity', 0)
      .text(d => d.label)
      .transition()
      .duration(800)
      .delay((d, i) => i * 20 + 400)
      .style('opacity', 1);

    // Add legend if showLegend is true
    if (showLegend) {
      // Get unique categories
      const categories = [...new Set(data.map(d => d.category || 'Default'))];

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
        .data(categories)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => {
          const offset = isHorizontal ? i * 100 - (categories.length * 100) / 2 : i * 20;
          return `translate(${isHorizontal ? offset : 0}, ${isHorizontal ? 0 : offset})`;
        });

      // Add colored circles
      legendItems.append('circle')
        .attr('cx', 7)
        .attr('cy', 7)
        .attr('r', 7)
        .attr('fill', (d, i) => colorFn(d))
        .attr('fill-opacity', 0.7)
        .attr('stroke', (d, i) => d3.rgb(colorFn(d)).darker(0.5))
        .attr('stroke-width', 1);

      // Add labels
      legendItems.append('text')
        .attr('x', 20)
        .attr('y', 10)
        .style('font-size', '12px')
        .style('fill', colors.text)
        .text(d => d);
    }

    // Clean up tooltip when component unmounts
    return () => {
      d3.select('.bubble-chart-tooltip').remove();
    };

  }, [data, width, height, margin, showLegend, legendPosition, colorPalette, showAxis, title, xAxisLabel, yAxisLabel, onBubbleClick, isDark]);

  return (
    <div className="bubble-chart-container" style={{ position: 'relative', width, height }}>
      <svg ref={svgRef} />
    </div>
  );
};

BubbleChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      x: PropTypes.number.isRequired,
      y: PropTypes.number.isRequired,
      size: PropTypes.number.isRequired,
      label: PropTypes.string,
      category: PropTypes.string
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
  colorPalette: PropTypes.oneOf(['soft', 'bright']),
  showAxis: PropTypes.bool,
  title: PropTypes.string,
  xAxisLabel: PropTypes.string,
  yAxisLabel: PropTypes.string,
  onBubbleClick: PropTypes.func
};

export default BubbleChart;
