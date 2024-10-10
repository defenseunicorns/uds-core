import * as fs from "fs/promises";
import * as path from "path";

// Constants for styling and configuration
const INDENT_SIZE = 10;
const MAX_HEADER_LEVEL = 6;
const MAX_DEPTH = 10;
const OUTPUT_DIR = "./docs/generated/";
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
 * Generates a Markdown table with collapsible sections and indentation
 */
function generateTable(title: string, rows: string[], currentDepth: number): string {
  const headerLevel = getHeaderLevel(currentDepth);
  const indentStyle = `style="margin-left: ${currentDepth * INDENT_SIZE}px;"`;

  return `
<details ${indentStyle}><summary>${capitalizeFirstLetter(title)}</summary>

<a id="${capitalizeFirstLetter(title)}"></a>
${headerLevel} ${capitalizeFirstLetter(title)}
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
</details>
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

  if (schema.items?.enum) {
    type = `Policy[] (enum):<ul>${schema.items.enum.map((value: string) => `<li><code>${value}</code></li>`).join("")}</ul>`;
  } else if (schema.items?.properties) {
    type = `<a href="#${capitalizeFirstLetter(field)}">${capitalizeFirstLetter(field)}[]</a>`;
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
    type = `<a href="#${capitalizeFirstLetter(field)}">${capitalizeFirstLetter(field)}</a>`;
    markdown = generateMarkdownFromSchema(schema.properties, field, currentDepth + 1);
  }

  return { type, markdown };
}

// Recursive function to walk through the schema and generate tables with collapsible sections
function generateMarkdownFromSchema(
  properties: Record<string, SchemaProperty>,
  title: string,
  currentDepth: number,
): string {
  if (currentDepth > MAX_DEPTH) return ""; // Stop recursion if depth exceeds max

  const rows: string[] = [];
  let markdown = "";

  for (const [field, schema] of Object.entries(properties)) {
    if (field.toLowerCase() === "status") continue; // Skip 'status' object

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

  return generateTable(title, rows, currentDepth) + markdown;
}

// Function to start the Markdown generation process
async function generateMarkdown(jsonSchema: JsonSchema, version: string, schemaFile: string) {
  const title = extractTitleFromFilename(schemaFile);

  if (!jsonSchema.properties) throw new Error("The schema does not contain a 'properties' object.");

  const markdownContent = `---
title: ${title} CR (${version})
weight: 6
tableOfContents:
  maxHeadingLevel: 6
---

${generateMarkdownFromSchema(jsonSchema.properties, title, 1).trim()}`;

  const outputFilename = path.join(OUTPUT_DIR, generateOutputFilename(schemaFile, version));
  await fs.mkdir(path.dirname(outputFilename), { recursive: true });
  await fs.writeFile(outputFilename, markdownContent);

  console.log(`Documentation generated at: ${outputFilename}`);
}

// Utility to extract title from filename
function extractTitleFromFilename(filename: string): string {
  const baseName = path.basename(filename, path.extname(filename));
  return capitalizeFirstLetter(baseName.split(".")[0]); // Take first part before the dot
}

// Utility to generate output filename
function generateOutputFilename(schemaFile: string, version: string): string {
  const baseName = path.basename(schemaFile, path.extname(schemaFile));
  return `${baseName.split(".")[0]}-${version}-cr.md`;
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

// TypeScript interfaces for JSON Schema properties
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
