# UDS Core C4 Diagrams

## What is C4?

C4 (Context, Containers, Components, and Code) is a model for visualizing and documenting software architecture. It provides a way to create consistent, hierarchical diagrams that help teams understand and communicate system design. The C4 model was created by Simon Brown and is widely used for documenting software architecture.

In UDS Core, we use C4 diagrams to visualize and document our system architecture, including namespaces, components, and their relationships. This helps developers understand how different parts of the system interact with each other.

## Getting Started with C4 Development

### Prerequisites

- Node.js and npm installed on your system

### Development Workflow

The UDS Core repository includes several predefined tasks to help you work with C4 diagrams:

#### Starting the Development Server

To start a live server for C4 diagram development:

```bash
uds run -f tasks/diagrams.yaml c4-dev
```

This command runs `npx likec4 start` in the `docs/.c4/` directory, which starts a development server that automatically reloads when you make changes to your C4 files.

#### Validating C4 Diagrams

To check for syntax errors and layout drift (outdated manual layout):

```bash
uds run -f tasks/diagrams.yaml c4-validation
```

This runs `npx likec4 validate` to ensure your diagrams are correctly formatted and up-to-date.

#### Generating Diagrams

To generate new PNG diagrams from your C4 files:

```bash
uds run -f tasks/diagrams.yaml c4-update
```

This executes `npx likec4 export png -o diagrams` to create PNG files in the diagrams directory.

### Using VSCode Extension for Local Development

For a more streamlined development experience, you can install the LikeC4 VSCode extension:

1. Open VSCode
2. Go to Extensions (Ctrl+Shift+X or Cmd+Shift+X on macOS)
3. Search for "LikeC4"
4. Install the extension

The extension provides several benefits:

- Syntax highlighting for `.c4` files
- Auto-completion for C4 model elements
- Inline diagram preview
- Quick validation of C4 syntax
- Commands for generating diagrams directly from VSCode

With this extension, you can develop C4 diagrams more efficiently without needing to run the development server separately.

## Additional Resources

- [C4 Model Official Website](https://c4model.com/)
- [LikeC4 Documentation](https://likec4.dev/)
- [UDS Core Architecture Documentation](https://docs.uds.dev/)

## Future Ideas
- Dynamic diagrams for visual walkthroughs
- Interactive embedded diagrams in github or docsite
