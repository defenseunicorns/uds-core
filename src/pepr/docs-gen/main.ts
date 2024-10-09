import * as fs from "fs/promises";
import * as handlebars from "handlebars";
import * as path from "path";

// Template for markdown generation, using Markdown for headings and HTML for tables.
// The hybrid approach keeps Markdown for sections and uses HTML for more control over table formatting.
const markdownTemplate = `---
title: {{title}} CR ({{version}})
weight: 6
---
{{#each definitions}}
{{#if this.enum}}
  {{!-- Skip rendering enums here --}}
{{else}}

<a id="{{@key}}"></a>
## {{@key}}
{{#if this.properties}}
<table style="width: 100%; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width: 20%; white-space: nowrap;">Field</th>
      <th style="width: 25%; white-space: nowrap;">Type</th>
      <th style="width: 55%; white-space: nowrap;">Description</th>
    </tr>
  </thead>
  <tbody>
    {{#each properties}}
    <tr>
      <td style="white-space: nowrap;">{{@key}}</td>
      <td style="white-space: nowrap;">
        {{#if this.items}}
          {{#if this.items.$ref}}
            {{getEnumOrType this.items.$ref isArray=true}}
          {{else}}
            {{this.items.type}}[]
          {{/if}}
        {{else if this.$ref}}
          {{getEnumOrType this.$ref isArray=false}}
        {{else}}
          {{this.type}}
        {{/if}}
      </td>
      <td>{{this.description}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
{{/if}}
{{/if}}
{{/each}}
`;

// Handlebars helper to strip '#/definitions/' from references.
// This removes the prefix from JSON Schema references to produce cleaner output.
handlebars.registerHelper("stripRef", (ref: string) => ref?.replace("#/definitions/", "") || "");

// Helper to dynamically insert enum values or generate HTML links for object references.
// This handles object references ($ref), array types, and enums with proper formatting for the output.
handlebars.registerHelper(
  "getEnumOrType",
  function (ref: string, options: handlebars.HelperOptions) {
    const refKey = ref?.replace("#/definitions/", ""); // Clean up the reference key
    const definitions = options.data.root.definitions; // Access the schema definitions

    // If the reference points to an enum, format it as a list of enum values.
    if (definitions[refKey] && definitions[refKey].enum) {
      const enumList = definitions[refKey].enum
        .map((enumValue: string) => `<li><code>${enumValue.replace(/\s/g, "&nbsp;")}</code></li>`)
        .join("");
      const isArray = options.hash.isArray ? "[]" : ""; // Append "[]" if the type is an array
      return `${refKey}${isArray} (enum):<ul>${enumList}</ul>`;
    }

    // For object references, generate an HTML link instead of a Markdown link.
    return `<a href="#${refKey}">${refKey}</a>${options.hash.isArray ? "[]" : ""}`;
  },
);

// Type for schema properties, which includes object references, types, descriptions, etc.
interface SchemaProperty {
  type?: string;
  description?: string;
  $ref?: string; // Reference to another schema definition
  items?: SchemaProperty; // For arrays, it references the type of items
}

// Type for schema definitions, which could include enums, properties, or other custom fields.
interface SchemaDefinition {
  enum?: string[]; // Enum values, if present
  properties?: Record<string, SchemaProperty>; // Map of properties in an object
  [key: string]: SchemaProperty | string[] | undefined; // Support additional fields dynamically
}

// JSON Schema root interface, which contains the full set of definitions.
interface JsonSchema {
  definitions?: Record<string, SchemaDefinition>;
}

// Function to collect all enums from the schema definitions.
async function collectEnums(
  definitions: Record<string, SchemaDefinition> = {},
): Promise<Record<string, string[]>> {
  const enums: Record<string, string[]> = {};
  // Iterate over all definitions to find those that have an enum array.
  for (const [key, definition] of Object.entries(definitions)) {
    if (Array.isArray(definition.enum)) {
      enums[key] = definition.enum;
    }
  }
  return enums; // Return the collected enums as a map of key -> enum values
}

// Extract the title from the filename, typically used for the front matter.
function extractTitleFromFilename(filename: string): string {
  const baseName = path.basename(filename, path.extname(filename)); // Extract base filename without extension
  const titlePart = baseName.split("-")[0]; // Take the first part of the filename (before the first '-')
  return titlePart.charAt(0).toUpperCase() + titlePart.slice(1); // Capitalize the first letter of the title
}

// Generate the output Markdown filename using the schema filename and version.
function generateOutputFilename(schemaFile: string, version: string): string {
  const baseName = path.basename(schemaFile, path.extname(schemaFile)); // Extract base filename
  const titlePart = baseName.split("-")[0]; // Take the first part of the filename (before the first '-')
  return `${titlePart}-${version}-cr.md`; // Generate the filename using the title part and version
}

// Function to sanitize description fields in the schema, replacing "\n" with "<br/>" to support Markdown rendering.
// It recursively processes nested objects within the schema.
function sanitizeSchemaDescriptions(schema: JsonSchema): JsonSchema {
  function sanitizeDescription(obj: unknown): unknown {
    if (typeof obj === "object" && obj !== null) {
      // Ensure the object is a Record and can have string keys
      const sanitizedObj: Record<string, unknown> = obj as Record<string, unknown>;

      // Recursively sanitize all object properties
      for (const key in sanitizedObj) {
        if (Object.prototype.hasOwnProperty.call(sanitizedObj, key)) {
          const value = sanitizedObj[key];
          if (key === "description" && typeof value === "string") {
            // Replace "\n" with "<br/>" to maintain line breaks in HTML.
            sanitizedObj[key] = value.replace(/\n/g, "<br/>");
          } else {
            sanitizedObj[key] = sanitizeDescription(value); // Recursive call for nested objects
          }
        }
      }
      return sanitizedObj; // Return the sanitized object
    }
    return obj;
  }

  return sanitizeDescription(schema) as JsonSchema; // Apply the sanitization to the whole schema
}

// Function to generate the Markdown documentation from the JSON schema.
async function generateMarkdownFromSchema(
  jsonSchema: JsonSchema,
  version: string,
  schemaFile: string,
) {
  // Compile the Handlebars template for generating the Markdown content.
  const template = handlebars.compile(markdownTemplate, { noEscape: true });

  try {
    // Sanitize schema descriptions before generating the Markdown.
    const sanitizedSchema = sanitizeSchemaDescriptions(jsonSchema);

    const enums = await collectEnums(sanitizedSchema.definitions); // Collect enums from the sanitized schema
    const title = extractTitleFromFilename(schemaFile); // Extract the title for the front matter

    const data = {
      title,
      version,
      definitions: sanitizedSchema.definitions || {}, // Pass the sanitized schema definitions to the template
      enums,
    };

    // Generate the Markdown output by applying the data to the Handlebars template.
    const markdownOutput = template(data);
    const outputFilename = path.join(
      "./docs/generated",
      generateOutputFilename(schemaFile, version),
    );

    // Ensure the output directory exists and write the generated Markdown file to it.
    await fs.mkdir(path.dirname(outputFilename), { recursive: true });
    await fs.writeFile(outputFilename, markdownOutput);

    console.log(`Documentation generated at: ${outputFilename}`);
  } catch (error) {
    console.error("Error during markdown generation:", error);
    throw error; // Re-throw to allow main error handling to catch it
  }
}

// Main execution function that reads the JSON schema file and generates the Markdown documentation.
async function main() {
  const [jsonSchemaPath, version] = process.argv.slice(2); // Read schema file path and version from command-line arguments

  if (!jsonSchemaPath || !version) {
    console.error("Usage: ts-node main.ts <path-to-schema-file-input> <version>");
    process.exit(1); // Exit if required arguments are missing
  }

  try {
    console.log(`Reading schema from: ${jsonSchemaPath}`);
    const fileContent = await fs.readFile(jsonSchemaPath, "utf-8"); // Read the JSON schema file
    const jsonSchema: JsonSchema = JSON.parse(fileContent); // Parse the JSON schema file

    await generateMarkdownFromSchema(jsonSchema, version, jsonSchemaPath); // Generate Markdown from the schema
  } catch (error) {
    console.error("Error:", error); // Handle any errors during file reading or Markdown generation
  }
}

// Execute the main function and catch any unhandled errors.
main().catch(console.error);
