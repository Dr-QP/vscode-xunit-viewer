/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
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
