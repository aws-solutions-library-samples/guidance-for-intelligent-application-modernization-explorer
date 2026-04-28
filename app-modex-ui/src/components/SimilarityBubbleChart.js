import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as d3 from 'd3';
import { Box, SpaceBetween, Spinner } from '@cloudscape-design/components';
import { useTheme } from '../contexts/ThemeContext';
import { getChartColors } from '../utils/chartThemeUtils';

/**
 * Similarity Bubble Chart Component
 * 
 * Displays a bubble chart visualization of similarity score clusters
 * Each bubble represents a 5% range of similarity scores (0-5%, 5-10%, etc.)
 * The size of each bubble represents the number of application pairs in that range
 * 
 * @param {Object} props - Component props
 * @param {Array} props.data - Array of cluster data objects
 * @param {Function} props.onClusterSelect - Function to call when a cluster is selected
 * @param {boolean} props.loading - Whether the data is loading
 */
const SimilarityBubbleChart = ({ data, onClusterSelect, loading }) => {
  const { t } = useTranslation(['components', 'common']);
  const { isDark } = useTheme();
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Handle window resize and initial sizing
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth || 800;
        setDimensions({
          width: containerWidth,
          height: Math.min(400, containerWidth * 0.4)
        });
      }
    };

    // Initial sizing
    handleResize();
    
    // Add resize listener
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Draw the chart when data or dimensions change
  useEffect(() => {
    if (!data || data.length === 0 || loading || dimensions.width === 0) return;

    // Get theme colors
    const colors = getChartColors(isDark);

    // Clear any existing SVG content
    d3.select(svgRef.current).selectAll("*").remove();

    // Set up dimensions
    const { width, height } = dimensions;
    const margin = { top: 20, right: 20, bottom: 60, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr("width", "100%")
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    // Create a group for the chart
    const chart = svg.append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // X scale for cluster positions
    const xScale = d3.scaleLinear()
      .domain([0, 100])
      .range([0, innerWidth]);

    // Scale for bubble radius based on count
    const maxCount = d3.max(data, d => d.count);
    const radiusScale = d3.scaleSqrt()
      .domain([0, maxCount])
      .range([5, Math.min(innerHeight * 0.4, 60)]);

    // Create X axis
    const xAxis = d3.axisBottom(xScale)
      .tickValues(d3.range(0, 101, 5))
      .tickFormat(d => `${d}%`);

    chart.append("g")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(xAxis)
      .selectAll("text")
      .style("text-anchor", "end")
      .style("fill", colors.axisText)
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .attr("transform", "rotate(-45)");

    // Style axis lines
    chart.selectAll(".domain, .tick line")
      .style("stroke", colors.axis);

    // Add X axis label
    chart.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + margin.bottom - 5)
      .style("text-anchor", "middle")
      .style("font-size", "14px")
      .style("fill", colors.text)
      .text("Similarity Score");

    // Create the bubbles
    const bubbles = chart.selectAll(".bubble")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "bubble")
      .attr("cx", d => xScale((d.lowerBound + d.upperBound) / 2))
      .attr("cy", innerHeight / 2)
      .attr("r", d => radiusScale(d.count))
      .attr("fill", d => d.color)
      .attr("stroke", colors.stroke)
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.8)
      .style("cursor", "pointer")
      .on("mouseover", function(event, d) {
        d3.select(this)
          .attr("stroke", colors.strokeHover)
          .attr("stroke-width", 2)
          .attr("opacity", 1);
        
        // Get the position of the bubble relative to the viewport
        const rect = this.getBoundingClientRect();
        
        // Set tooltip data and position
        setTooltipData({
          range: d.range,
          count: d.count.toLocaleString()
        });
        
        // Position tooltip to the right of the bubble
        setTooltipPosition({
          x: rect.right + 10,
          y: rect.top + (rect.height / 2) - 30
        });
      })
      .on("mouseout", function() {
        d3.select(this)
          .attr("stroke", colors.stroke)
          .attr("stroke-width", 1.5)
          .attr("opacity", 0.8);
        
        // Hide tooltip
        setTooltipData(null);
      })
      .on("click", (event, d) => {
        if (onClusterSelect) {
          onClusterSelect(d.id);
        }
      });

    // Add count labels to larger bubbles
    chart.selectAll(".count-label")
      .data(data.filter(d => radiusScale(d.count) > 20))
      .enter()
      .append("text")
      .attr("class", "count-label")
      .attr("x", d => xScale((d.lowerBound + d.upperBound) / 2))
      .attr("y", innerHeight / 2 + 5)
      .attr("text-anchor", "middle")
      .attr("fill", d => {
        // Determine text color based on background color brightness
        // For clusters 0-9 (blues), use dark text; for clusters 10-19 (reds), use white text
        const clusterIndex = data.findIndex(cluster => cluster.id === d.id);
        return clusterIndex < 10 ? (isDark ? "#FFFFFF" : "#000000") : "#FFFFFF";
      })
      .style("font-size", "10px")
      .style("font-weight", "bold")
      .style("pointer-events", "none")
      .text(d => {
        const count = d.count;
        if (count >= 1000000) {
          return `${(count / 1000000).toFixed(1)}M`;
        } else if (count >= 1000) {
          return `${(count / 1000).toFixed(0)}K`;
        }
        return count;
      });

  }, [data, dimensions, loading, onClusterSelect, isDark]);

  if (loading) {
    return (
      <Box textAlign="center" padding="l">
        <Spinner size="large" />
        <Box variant="p" padding={{ top: "s" }}>
          {t('components:similarityBubbleChart.loadingSimilarityData')}
        </Box>
      </Box>
    );
  }

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
          <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }}></svg>
          
          {/* React-based tooltip instead of D3-based tooltip */}
          {tooltipData && (
            <div 
              style={{
                position: "fixed",
                top: `${tooltipPosition.y}px`,
                left: `${tooltipPosition.x}px`,
                backgroundColor: "var(--color-background-popover, rgba(35, 47, 62, 0.95))",
                color: "var(--color-text-body-default, white)",
                border: "1px solid var(--color-border-divider-default, transparent)",
                borderRadius: "4px",
                padding: "12px",
                boxShadow: "var(--shadow-panel, 0 2px 10px rgba(0,0,0,0.2))",
                fontSize: "13px",
                zIndex: 1000,
                maxWidth: "220px",
                pointerEvents: "none",
                fontFamily: "'Amazon Ember', 'Helvetica Neue', Roboto, Arial, sans-serif"
              }}
            >
              <strong>{t('components:similarityBubbleChart.similarityRange')} {tooltipData.range}</strong><br/>
              Application Pairs: {tooltipData.count}<br/>
              <em>{t('components:charts.clickForDetails')}</em>
            </div>
          )}
        </div>
      </SpaceBetween>
    </Box>
  );
};

export default SimilarityBubbleChart;
