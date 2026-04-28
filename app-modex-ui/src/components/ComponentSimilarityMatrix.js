import React, { useState, useEffect, useRef } from 'react';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Alert,
  Button,
  Toggle
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import * as d3 from 'd3';
import { useTheme } from '../contexts/ThemeContext';
import { getChartColors } from '../utils/chartThemeUtils';

/**
 * Component Similarity Matrix Visualization
 * 
 * Displays a heatmap matrix showing similarity scores between all component pairs
 */
const ComponentSimilarityMatrix = ({ data, loading }) => {
  const { t } = useTranslation(['components', 'common']);
  const { isDark } = useTheme();
  const svgRef = useRef();
  const [showLabels, setShowLabels] = useState(true);
  const [selectedCell, setSelectedCell] = useState(null);

  useEffect(() => {
    if (!data || data.length === 0 || loading) return;

    // Get theme colors
    const colors = getChartColors(isDark);

    // Convert the backend data format to the expected 2D array format
    const matrixData = data.map(row => 
      row.similarities.map(sim => sim.score)
    );
    
    // Extract component names for labels
    const componentNames = data.map(row => row.componentName || row.componentId);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 100, right: 50, bottom: 100, left: 150 };
    const cellSize = 25;
    const width = matrixData.length * cellSize + margin.left + margin.right;
    const height = matrixData.length * cellSize + margin.top + margin.bottom;

    svg.attr("width", width).attr("height", height);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Color scale for similarity scores
    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
      .domain([0, 1]);

    // Create tooltip
    const tooltip = d3.select("body").append("div")
      .attr("class", "similarity-tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", colors.tooltipBackground)
      .style("color", colors.tooltipText)
      .style("border", `1px solid ${colors.tooltipBorder}`)
      .style("padding", "10px")
      .style("border-radius", "5px")
      .style("font-size", "12px")
      .style("z-index", "1000");

    // Draw matrix cells
    matrixData.forEach((row, i) => {
      row.forEach((score, j) => {
        const sourceComponent = data[i];
        const targetComponent = data[j];
        
        const rect = g.append("rect")
          .attr("x", j * cellSize)
          .attr("y", i * cellSize)
          .attr("width", cellSize)
          .attr("height", cellSize)
          .attr("fill", colorScale(score))
          .attr("stroke", colors.stroke)
          .attr("stroke-width", 1)
          .style("cursor", "pointer")
          .on("mouseover", function(event) {
            d3.select(this).attr("stroke-width", 2).attr("stroke", colors.strokeHover);
            
            tooltip.style("visibility", "visible")
              .html(`
                <strong>Component 1:</strong> ${sourceComponent.componentName || sourceComponent.componentId}<br/>
                <strong>Application 1:</strong> ${sourceComponent.application}<br/>
                <strong>Component 2:</strong> ${targetComponent.componentName || targetComponent.componentId}<br/>
                <strong>Application 2:</strong> ${targetComponent.application}<br/>
                <strong>Similarity:</strong> ${(score * 100).toFixed(1)}%
              `);
          })
          .on("mousemove", function(event) {
            tooltip.style("top", (event.pageY - 10) + "px")
              .style("left", (event.pageX + 10) + "px");
          })
          .on("mouseout", function() {
            d3.select(this).attr("stroke-width", 1).attr("stroke", colors.stroke);
            tooltip.style("visibility", "hidden");
          })
          .on("click", function() {
            setSelectedCell({
              component1: sourceComponent,
              component2: targetComponent,
              similarity: score
            });
          });

        // Add similarity score text if enabled and cell is large enough
        if (showLabels && cellSize >= 20) {
          g.append("text")
            .attr("x", j * cellSize + cellSize / 2)
            .attr("y", i * cellSize + cellSize / 2)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "10px")
            .attr("fill", score > 0.5 ? "white" : "black")
            .text((score * 100).toFixed(0));
        }
      });
    });

    // Add row labels (component names)
    if (showLabels) {
      componentNames.forEach((name, i) => {
        g.append("text")
          .attr("x", -10)
          .attr("y", i * cellSize + cellSize / 2)
          .attr("text-anchor", "end")
          .attr("dominant-baseline", "middle")
          .attr("font-size", "10px")
          .attr("fill", colors.text)
          .text(name.length > 20 ? `${name.substring(0, 20)}...` : name);
      });

      // Add column labels (component names)
      componentNames.forEach((name, j) => {
        g.append("text")
          .attr("x", j * cellSize + cellSize / 2)
          .attr("y", -10)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .attr("font-size", "10px")
          .attr("fill", colors.text)
          .attr("transform", `rotate(-45, ${j * cellSize + cellSize / 2}, -10)`)
          .text(name.length > 20 ? `${name.substring(0, 20)}...` : name);
      });
    }

    // Add color legend
    const legendWidth = 200;
    const legendHeight = 20;
    const legendScale = d3.scaleLinear()
      .domain([0, 1])
      .range([0, legendWidth]);

    const legendAxis = d3.axisBottom(legendScale)
      .ticks(5)
      .tickFormat(d => `${(d * 100).toFixed(0)}%`);

    const legend = svg.append("g")
      .attr("transform", `translate(${margin.left}, ${height - 40})`);

    // Create gradient for legend
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
      .attr("id", "similarity-gradient");

    gradient.selectAll("stop")
      .data(d3.range(0, 1.1, 0.1))
      .enter().append("stop")
      .attr("offset", d => `${d * 100}%`)
      .attr("stop-color", d => colorScale(d));

    legend.append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .style("fill", "url(#similarity-gradient)");

    legend.append("g")
      .attr("transform", `translate(0, ${legendHeight})`)
      .call(legendAxis);

    legend.append("text")
      .attr("x", legendWidth / 2)
      .attr("y", -5)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text(t('components:componentSimilarity.similarityScore'));

    // Cleanup function
    return () => {
      d3.select("body").selectAll(".similarity-tooltip").remove();
    };

  }, [data, loading, showLabels, isDark]);

  if (loading) {
    return (
      <Container>
        <Box textAlign="center" padding="xl">
          {t('components:componentSimilarity.loadingMatrix')}
        </Box>
      </Container>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Container>
        <Alert type="info">
          {t('components:componentSimilarity.noDataAvailable')}
        </Alert>
      </Container>
    );
  }

  return (
    <Container
      header={
        <Header
          variant="h3"
          actions={
            <SpaceBetween direction="horizontal" size="s">
              <Toggle
                checked={showLabels}
                onChange={({ detail }) => setShowLabels(detail.checked)}
              >
                {t('components:componentSimilarity.showLabels')}
              </Toggle>
              <Button
                variant="normal"
                onClick={() => {
                  const svg = svgRef.current;
                  const svgData = new XMLSerializer().serializeToString(svg);
                  const canvas = document.createElement("canvas");
                  const ctx = canvas.getContext("2d");
                  const img = new Image();
                  img.onload = function() {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    const pngFile = canvas.toDataURL("image/png");
                    const downloadLink = document.createElement("a");
                    downloadLink.download = "component-similarity-matrix.png";
                    downloadLink.href = pngFile;
                    downloadLink.click();
                  };
                  img.src = "data:image/svg+xml;base64," + btoa(svgData);
                }}
              >
                {t('components:componentSimilarity.exportPNG')}
              </Button>
            </SpaceBetween>
          }
        >
          {t('components:componentSimilarity.componentSimilarityMatrix')}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Box variant="p">
          {t('components:componentSimilarity.heatmapDescription')}
        </Box>

        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '600px' }}>
          <svg ref={svgRef}></svg>
        </div>

        {selectedCell && (
          <Container header={<Header variant="h4">{t('components:componentSimilarity.selectedComparison')}</Header>}>
            <SpaceBetween size="s">
              <div>
                <strong>{t('components:componentSimilarity.component1')}:</strong> {selectedCell.component1.componentName} 
                ({selectedCell.component1.applicationName})
              </div>
              <div>
                <strong>{t('components:componentSimilarity.component2')}:</strong> {selectedCell.component2.componentName} 
                ({selectedCell.component2.applicationName})
              </div>
              <div>
                <strong>{t('components:componentSimilarity.similarityScore')}:</strong> {(selectedCell.similarity * 100).toFixed(1)}%
              </div>
              <div>
                <strong>{t('components:componentSimilarity.runtimeMatch')}:</strong> {selectedCell.component1.runtime === selectedCell.component2.runtime ? '✓' : '✗'} 
                ({selectedCell.component1.runtime} vs {selectedCell.component2.runtime})
              </div>
              <div>
                <strong>{t('components:componentSimilarity.frameworkMatch')}:</strong> {selectedCell.component1.framework === selectedCell.component2.framework ? '✓' : '✗'} 
                ({selectedCell.component1.framework} vs {selectedCell.component2.framework})
              </div>
            </SpaceBetween>
          </Container>
        )}
      </SpaceBetween>
    </Container>
  );
};

export default ComponentSimilarityMatrix;
