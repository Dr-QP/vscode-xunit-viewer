/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // The vendored xunit-viewer subtree ships its own react-scripts test suite.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/xunit-viewer/'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // The project tsconfig targets Bun's bundler; Jest needs plain CommonJS output.
        tsconfig: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          verbatimModuleSyntax: false,
        },
      },
    ],
  },
};
