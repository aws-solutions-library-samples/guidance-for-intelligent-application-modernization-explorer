import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as d3 from 'd3';
import { useTheme } from '../../contexts/ThemeContext';
import { getChartColors } from '../../utils/chartThemeUtils';

/**
 * SVG Doughnut Chart Component
 * 
 * A customizable doughnut chart with configurable legend position, value display, and color schemes.
 */
const DoughnutChart = ({
  data,
  width = 400,
  height = 400,
  innerRadius = 60,
  outerRadius = 120,
  showLegend = true,
  legendPosition = 'E',
  showValues = true,
  colorPalette = 'soft',
  title = '',
  onSliceClick = null,
  totalDisplay = 'chart' // 'chart' or 'title'
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

    // Calculate total
    const total = data.reduce((sum, item) => sum + item.value, 0);

    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);

    // Create tooltip
    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'app-modex-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden');

    // Create pie layout
    const pie = d3.pie()
      .value(d => d.value)
      .sort(null);

    // Create arc generator
    const arc = d3.arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius);

    // Create arcs
    const arcs = svg.selectAll('.arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc')
      .style('cursor', onSliceClick ? 'pointer' : 'default')
      .on('click', (event, d) => {
        if (onSliceClick) onSliceClick(d.data);
      })
      .on('mouseover', (event, d) => {
        const percentage = ((d.data.value / total) * 100).toFixed(1);
        tooltip
          .html(`
            <div><strong>${d.data.label}</strong></div>
            <div>Value: ${d.data.value}</div>
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

    // Add paths
    arcs.append('path')
      .attr('d', arc)
      .attr('fill', (d, i) => colorFn(i))
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .transition()
      .duration(1000)
      .attrTween('d', function(d) {
        const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return function(t) {
          return arc(interpolate(t));
        };
      });

    // Add title
    if (title) {
      // If totalDisplay is 'title', append the total to the title
      const displayTitle = totalDisplay === 'title' ? `${title} (${total})` : title;
      
      svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('y', -outerRadius - 20)
        .attr('class', 'chart-title')
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .style('fill', colors.text)
        .text(displayTitle);
    }

    // Add values
    if (showValues) {
      arcs.append('text')
        .attr('transform', d => {
          const centroid = arc.centroid(d);
          return `translate(${centroid[0]}, ${centroid[1]})`;
        })
        .attr('text-anchor', 'middle')
        .attr('dy', '.35em')
        .style('font-size', '12px')
        .style('fill', '#fff')
        .style('pointer-events', 'none')
        .text(d => d.data.value);
    }

    // Add legend
    if (showLegend) {
      const legendPositions = {
        'N': { x: 0, y: -outerRadius - 30, layout: 'horizontal' },
        'NE': { x: outerRadius + 20, y: -outerRadius, layout: 'vertical' },
        'E': { x: outerRadius + 20, y: 0, layout: 'vertical' },
        'SE': { x: outerRadius + 20, y: outerRadius, layout: 'vertical' },
        'S': { x: 0, y: outerRadius + 30, layout: 'horizontal' },
        'SW': { x: -outerRadius - 20, y: outerRadius, layout: 'vertical' },
        'W': { x: -outerRadius - 20, y: 0, layout: 'vertical' },
        'NW': { x: -outerRadius - 20, y: -outerRadius, layout: 'vertical' }
      };

      const position = legendPositions[legendPosition] || legendPositions.E;
      const isHorizontal = position.layout === 'horizontal';
      
      const legend = svg.append('g')
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

    // Add total in the center if specified
    if (totalDisplay === 'chart') {
      svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.5em')
        .style('font-size', '14px')
        .style('fill', colors.textSecondary)
        .text('Total');

      svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1em')
        .style('font-size', '18px')
        .style('font-weight', 'bold')
        .style('fill', colors.text)
        .text(total);
    }

    // Clean up tooltip when component unmounts
    return () => {
      d3.select('.doughnut-tooltip').remove();
    };

  }, [data, width, height, innerRadius, outerRadius, showLegend, legendPosition, showValues, colorPalette, title, onSliceClick, totalDisplay, isDark]);

  return (
    <div className="doughnut-chart-container" style={{ position: 'relative', width, height }}>
      <svg ref={svgRef} />
    </div>
  );
};

DoughnutChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.number.isRequired
    })
  ).isRequired,
  width: PropTypes.number,
  height: PropTypes.number,
  innerRadius: PropTypes.number,
  outerRadius: PropTypes.number,
  showLegend: PropTypes.bool,
  legendPosition: PropTypes.oneOf(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']),
  showValues: PropTypes.bool,
  colorPalette: PropTypes.oneOf(['soft', 'bright']),
  title: PropTypes.string,
  onSliceClick: PropTypes.func,
  totalDisplay: PropTypes.oneOf(['chart', 'title'])
};

export default DoughnutChart;
