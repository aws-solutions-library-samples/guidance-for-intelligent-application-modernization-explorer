import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as d3 from 'd3';
import { useTheme } from '../../contexts/ThemeContext';
import { getChartColors } from '../../utils/chartThemeUtils';

/**
 * Tech Radar Chart Component
 * 
 * A customizable radar chart for visualizing technology adoption phases across different quadrants.
 * Based on the Thoughtworks Tech Radar concept.
 */
const TechRadarChart = ({
  data,
  width = 800,
  height = 800,
  margin = { top: 50, right: 50, bottom: 50, left: 50 },
  colors = {
    adopt: '#5cb85c',    // Green
    trial: '#5bc0de',    // Blue
    assess: '#f0ad4e',   // Orange
    hold: '#d9534f'      // Red
  },
  quadrantLabels = ['Techniques', 'Tools', 'Platforms', 'Languages & Frameworks'],
  ringLabels = ['Hold', 'Assess', 'Trial', 'Adopt'],
  title = 'Technology Radar',
  showItemLabels = true,
  onItemClick = null
}) => {
  const { isDark } = useTheme();
  const svgRef = useRef(null);

  useEffect(() => {
    if (!data || !data.length) return;

    // Get theme colors
    const themeColors = getChartColors(isDark);

    // Use requestAnimationFrame to avoid ResizeObserver loop issues
    const animationFrame = requestAnimationFrame(() => {
      // Clear any existing chart
      d3.select(svgRef.current).selectAll('*').remove();

      // Create SVG
      const svg = d3.select(svgRef.current)
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('style', 'max-width: 100%; height: auto;');

      // Calculate inner dimensions
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;
      const radius = Math.min(innerWidth, innerHeight) / 2;
      
      // Create chart group
      const chart = svg.append('g')
        .attr('transform', `translate(${width / 2}, ${height / 2})`);

      // Add title
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', margin.top / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '20px')
        .style('font-weight', 'bold')
        .style('fill', themeColors.text)
        .text(title);

      // Create rings
      const ringCount = ringLabels.length;
      const ringScale = d3.scaleLinear()
        .domain([0, ringCount])
        .range([0, radius]);

      // Draw rings
      for (let i = 0; i < ringCount; i++) {
        chart.append('circle')
          .attr('cx', 0)
          .attr('cy', 0)
          .attr('r', ringScale(i + 1))
          .attr('fill', 'none')
          .attr('stroke', '#ddd')
          .attr('stroke-width', 1);
      }

      // Draw quadrant lines
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI / 2);
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        
        chart.append('line')
          .attr('x1', 0)
          .attr('y1', 0)
          .attr('x2', x)
          .attr('y2', y)
          .attr('stroke', '#ddd')
          .attr('stroke-width', 1);
      }

      // Add ring labels
      for (let i = 0; i < ringCount; i++) {
        const ringRadius = ringScale(i + 1) - (ringScale(1) / 2);
        
        chart.append('text')
          .attr('x', 5)
          .attr('y', -ringRadius)
          .attr('text-anchor', 'start')
          .style('font-size', '14px')
          .style('fill', themeColors.textSecondary)
          .text(ringLabels[i]);
      }

      // Add quadrant labels
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI / 2) + (Math.PI / 4);
        const labelRadius = radius * 1.1;
        const x = labelRadius * Math.cos(angle);
        const y = labelRadius * Math.sin(angle);
        
        chart.append('text')
          .attr('x', x)
          .attr('y', y)
          .attr('text-anchor', 'middle')
          .style('font-size', '18px')
          .style('font-weight', 'bold')
          .style('fill', themeColors.text)
          .text(quadrantLabels[i]);
      }

      // Group data by quadrant and ring
      const groupedData = {};
      data.forEach(item => {
        // Handle both field naming conventions (name/technology and ring/phase)
        const itemName = item.name || item.technology;
        const itemRing = item.ring || item.phase;
        const itemQuadrant = item.quadrant;
        
        if (!itemName || !itemRing || !itemQuadrant) {
          console.warn('Skipping item with missing required fields:', item);
          return;
        }
        
        const quadrantIndex = quadrantLabels.indexOf(itemQuadrant);
        const ringIndex = ringLabels.indexOf(itemRing);
        
        if (quadrantIndex === -1 || ringIndex === -1) {
          console.warn(`Skipping item with invalid quadrant or ring: ${itemQuadrant}, ${itemRing}`, item);
          return;
        }
        
        const key = `${quadrantIndex}-${ringIndex}`;
        if (!groupedData[key]) {
          groupedData[key] = [];
        }
        groupedData[key].push({
          ...item,
          name: itemName,
          ring: itemRing,
          quadrant: itemQuadrant
        });
      });

      // Create tooltip
      const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'app-modex-tooltip')
        .style('position', 'absolute')
        .style('visibility', 'hidden');

      // Plot items
      Object.entries(groupedData).forEach(([key, items]) => {
        const [quadrantIndex, ringIndex] = key.split('-').map(Number);
        const quadrantAngle = (quadrantIndex * Math.PI / 2);
        const ringRadius = ringScale(ringIndex + 1) - (ringScale(1) / 2);
        
        // Calculate angle step for this ring and quadrant
        const angleStep = (Math.PI / 2) / (items.length + 1);
        
        // Plot each item in the group
        items.forEach((item, i) => {
          const itemAngle = quadrantAngle + (angleStep * (i + 1));
          const x = ringRadius * Math.cos(itemAngle);
          const y = ringRadius * Math.sin(itemAngle);
          
          // Get color based on ring (case-insensitive)
          const ringKey = item.ring.toLowerCase();
          const color = colors[ringKey] || '#999';
          
          // Add item dot
          const dot = chart.append('circle')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', 8)  // Increased from 5 to 8
            .attr('fill', color)
            .style('cursor', onItemClick ? 'pointer' : 'default');
          
          // Add item label if enabled
          if (showItemLabels) {
            // Calculate label position
            const labelDistance = 10; // Distance from dot to label
            const labelX = x + (x > 0 ? labelDistance : -labelDistance);
            const labelY = y + (y > 0 ? labelDistance : -labelDistance);
            
            // Determine text anchor based on quadrant
            const textAnchor = x > 0 ? 'start' : 'end';
            
            // Add label background for better readability
            const label = chart.append('text')
              .attr('x', labelX)
              .attr('y', labelY)
              .attr('text-anchor', textAnchor)
              .attr('dominant-baseline', 'middle')
              .style('font-size', '12px')
              .style('font-weight', 'bold')
              .style('fill', themeColors.text)
              .style('pointer-events', 'none')
              .text(item.name);
            
            // Get the bounding box of the text
            const bbox = label.node().getBBox();
            
            // Add background rectangle
            chart.insert('rect', 'text')
              .attr('x', bbox.x - 2)
              .attr('y', bbox.y - 2)
              .attr('width', bbox.width + 4)
              .attr('height', bbox.height + 4)
              .attr('fill', themeColors.containerBackground)
              .attr('fill-opacity', 0.9)
              .attr('rx', 2)
              .attr('ry', 2)
              .style('pointer-events', 'none');
            
            // Bring the label to front
            label.raise();
          }
          
          // Add tooltip and click event
          dot.on('mouseover', (event, d) => {
              tooltip
                .html(`
                  <div><strong>${item.name}</strong></div>
                  <div>Quadrant: ${item.quadrant}</div>
                  <div>Ring: ${item.ring}</div>
                  ${item.description ? `<div>${item.description}</div>` : ''}
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
            })
            .on('click', () => {
              if (onItemClick) onItemClick(item);
            });
        });
      });
    });

    // Cleanup function to remove tooltip when component unmounts
    return () => {
      d3.select('.app-modex-tooltip').remove();
      cancelAnimationFrame(animationFrame);
    };
  }, [data, width, height, margin, colors, quadrantLabels, ringLabels, title, showItemLabels, onItemClick, isDark]);

  return <svg ref={svgRef}></svg>;
};

TechRadarChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string,
      technology: PropTypes.string,
      quadrant: PropTypes.string.isRequired,
      ring: PropTypes.string,
      phase: PropTypes.string,
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
  colors: PropTypes.shape({
    adopt: PropTypes.string,
    trial: PropTypes.string,
    assess: PropTypes.string,
    hold: PropTypes.string
  }),
  quadrantLabels: PropTypes.arrayOf(PropTypes.string),
  ringLabels: PropTypes.arrayOf(PropTypes.string),
  title: PropTypes.string,
  showItemLabels: PropTypes.bool,
  onItemClick: PropTypes.func
};

export default TechRadarChart;
