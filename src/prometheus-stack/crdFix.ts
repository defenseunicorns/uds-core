import * as fs from "fs";
import * as path from "path";

// List of files to modify
const filesToModify = [
  path.join(__dirname, "../../src/pepr/operator/crd/generated/prometheus/servicemonitor-v1.ts"),
  path.join(__dirname, "../../src/pepr/operator/crd/generated/prometheus/podmonitor-v1.ts"),
];

// Function to modify a single file
function modifyFile(filePath: string) {
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error(`Error reading file (${filePath}):`, err);
      return;
    }

    // Define regex patterns to match and remove the comment blocks and fields
    const apiVersionPattern = /\/\*\*\s*\n\s*\*\s*APIVersion[\s\S]*?\*\/\s*apiVersion\?: string;/g;
    const kindPattern = /\/\*\*\s*\n\s*\*\s*Kind[\s\S]*?\*\/\s*kind\?: string;/g;
    const metadataPattern = /\s*metadata\?: { \[key: string\]: any };/g; // Match metadata field directly
    const specPattern = /spec: Spec;/g; // Match 'spec: Spec;' to change to 'spec?: Spec;'

    // Remove the matched comment blocks and fields, and modify the spec field
    const modifiedData = data
      .replace(apiVersionPattern, "") // Remove apiVersion comment block and field
      .replace(kindPattern, "") // Remove kind comment block and field
      .replace(metadataPattern, "") // Remove metadata field
      .replace(specPattern, "spec?: Spec;"); // Change 'spec: Spec;' to 'spec?: Spec;'

    // Write the modified content back to the file
    fs.writeFile(filePath, modifiedData, "utf8", err => {
      if (err) {
        console.error(`Error writing file (${filePath}):`, err);
        return;
      }
      console.log(`File successfully modified: ${filePath}`);
    });
  });
}

// Iterate over the files and modify each one
filesToModify.forEach(filePath => {
  modifyFile(filePath);
});
