# Etd basetech capl support

A VS Code extension that provides support for Vector CANoe's CAPL language.

## Features

- Syntax highlighting
- Function outline view
- Support for .can and .cin files
- Function sorting (by position or alphabetically)
- Function signature display with parameter types and return types

## Installation

1. Open the Extensions view in VS Code (Ctrl+Shift+X)
2. Search for "CAPL"
3. Click Install

## Usage

1. Open a .can or .cin file
2. Click the "CAPL Outline" icon in the Activity Bar
3. In the function outline view, you can:
   - View all functions with their signatures
   - Click on a function to navigate to its definition
   - Use the menu in the top-right corner to switch sorting methods

## Configuration

The following settings are available in VS Code:

- `caplOutline.sortOrder`: Set the function sorting method
  - `position`: Sort by position (default)
  - `alphabetical`: Sort alphabetically

## Supported Language Features

- Basic data types
- Function definitions
- Variable declarations
- Comments
- Control structures
- Struct types

## Changelog

### v0.0.2
- Added function signature display in outline view
- Enhanced function parameter type recognition
- Added support for struct type parameters
- Improved function sorting options
- Fixed Chinese character display issues

## Contributing

Issues and pull requests are welcome!

## License

MIT 