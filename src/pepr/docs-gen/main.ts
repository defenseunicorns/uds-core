// Copyright 2024 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import * as fs from "fs/promises";
import * as path from "path";

// Constants for styling and configuration
const INDENT_SIZE = 20;
const MAX_HEADER_LEVEL = 6;
const MAX_DEPTH = 10;
const OUTPUT_DIR = "./docs/reference/operator-and-crds/";
const TABLE_STYLE = 'style="width: 100%; table-layout: fixed;"';

// Utility to capitalize the first letter of a string
const capitalizeFirstLetter = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

// Helper to format a field row (avoiding extra spacing)
const formatRow = (field: string, type: string, description: string): string =>
  `<tr><td style="white-space: nowrap;">${field}</td><td style="white-space: nowrap;">${type}</td><td>${description}</td></tr>`;

// Helper function to generate a header level (capped at MAX_HEADER_LEVEL)
const getHeaderLevel = (depth: number): string => "#".repeat(Math.min(depth, MAX_HEADER_LEVEL));

/**
 * Generates a Markdown table with sections and indentation (non-collapsible)
 */
function generateTable(title: string, rows: string[], currentDepth: number): string {
  const capitalizedTitle = capitalizeFirstLetter(title);
  const headerLevel = getHeaderLevel(currentDepth);
  const indentStyle = `style="margin-left: ${currentDepth * INDENT_SIZE}px; padding-top: 30px;"`;

  return `
<a id="${capitalizedTitle}"></a>
<div ${indentStyle}>

${headerLevel} ${capitalizedTitle}
<table ${TABLE_STYLE}>
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join("")}
  </tbody>
</table>
</div>
`;
}

// Helper to handle arrays
function handleArray(
  schema: SchemaProperty,
  field: string,
  currentDepth: number,
): { type: string; markdown: string } {
  let type = "";
  let markdown = "";

  const capitalizedField = capitalizeFirstLetter(field);
  if (schema.items?.enum) {
    type = `${capitalizedField}[] (enum):<ul>${schema.items.enum.map((value: string) => `<li><code>${value}</code></li>`).join("")}</ul>`;
  } else if (schema.items?.properties) {
    type = `<a href="#${capitalizedField}">${capitalizedField}[]</a>`;
    markdown = generateMarkdownFromSchema(schema.items.properties, field, currentDepth + 1);
  } else if (schema.items?.type) {
    type = `${schema.items.type}[]`;
  }

  return { type, markdown };
}

// Helper to handle objects
function handleObject(
  schema: SchemaProperty,
  field: string,
  currentDepth: number,
): { type: string; markdown: string } {
  let type = "";
  let markdown = "";

  if (schema.properties) {
    const capitalizedField = capitalizeFirstLetter(field);
    type = `<a href="#${capitalizedField}">${capitalizedField}</a>`;
    markdown = generateMarkdownFromSchema(schema.properties, field, currentDepth + 1);
  }

  return { type, markdown };
}

// Recursive function to walk through the schema and generate tables with nested indentation
function generateMarkdownFromSchema(
  properties: Record<string, SchemaProperty>,
  title: string,
  currentDepth: number,
): string {
  let markdown = "";
  const rows: string[] = [];

  // Stop recursion if the current depth exceeds the max depth
  if (currentDepth > MAX_DEPTH) return "";

  for (const [field, schema] of Object.entries(properties)) {
    // Skip the 'status' object
    if (field.toLowerCase() === "status") continue;

    let type = schema.type || "object";
    const description = schema.description || "";
    let childMarkdown = "";

    if (type === "array") {
      const result = handleArray(schema, field, currentDepth);
      type = result.type;
      childMarkdown = result.markdown;
    }

    if (type === "object") {
      const result = handleObject(schema, field, currentDepth);
      type = result.type;
      childMarkdown = result.markdown;
    }

    if (schema.enum) {
      type += ` (enum):<ul>${schema.enum.map((value: string) => `<li><code>${value}</code></li>`).join("")}</ul>`;
    }

    rows.push(formatRow(field, type, description));
    markdown += childMarkdown;
  }

  // Generate the table for this level, and add a new line at the end for proper formatting
  markdown = generateTable(title, rows, currentDepth) + markdown;
  return markdown;
}

// Function to start the Markdown generation process
async function generateMarkdown(jsonSchema: JsonSchema, version: string, schemaFile: string) {
  const title = extractTitleFromFilename(schemaFile);

  // Start generating markdown from the root `properties`
  if (!jsonSchema.properties) throw new Error("The schema does not contain a 'properties' object.");

  const markdownContent = `---
title: ${title} CR (${version})
tableOfContents:
  maxHeadingLevel: 6
sidebar:
  order: 20
---
${generateMarkdownFromSchema(jsonSchema.properties, `${title}`, 1).trim()}`;

  const outputFilename = path.join(OUTPUT_DIR, generateOutputFilename(schemaFile, version));

  // Ensure output directory exists and write markdown file
  await fs.mkdir(path.dirname(outputFilename), { recursive: true });
  await fs.writeFile(outputFilename, markdownContent);

  console.log(`Documentation generated at: ${outputFilename}`);
}

// Utility to extract title from filename
function extractTitleFromFilename(filename: string): string {
  const baseName = path.basename(filename, path.extname(filename));
  const titlePart = baseName.split(".")[0]; // Split at the first dot and take the first part
  return capitalizeFirstLetter(titlePart);
}

// Utility to generate output filename
function generateOutputFilename(schemaFile: string, version: string): string {
  const baseName = path.basename(schemaFile, path.extname(schemaFile));
  const titlePart = baseName.split(".")[0]; // Use only the first part before the dot
  return `${titlePart}-${version}-cr.md`;
}

// Main execution
async function main() {
  const [jsonSchemaPath, version] = process.argv.slice(2);

  if (!jsonSchemaPath || !version) {
    console.error("Usage: ts-node main.ts <path-to-schema-file-input> <version>");
    process.exit(1);
  }

  try {
    const fileContent = await fs.readFile(jsonSchemaPath, "utf-8");
    const jsonSchema: JsonSchema = JSON.parse(fileContent);
    await generateMarkdown(jsonSchema, version, jsonSchemaPath);
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);

// TypeScript interface for JSON Schema properties
interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  $ref?: string; // Reference to another schema definition
  items?: SchemaProperty; // For arrays, defines the item type
  properties?: Record<string, SchemaProperty>; // Nested object properties
}

interface JsonSchema {
  properties?: Record<string, SchemaProperty>;
}
