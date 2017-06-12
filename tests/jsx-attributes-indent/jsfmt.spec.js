run_spec(__dirname, { jsxAttributesIndent: true, useTabs: false }, ["typescript"]);
run_spec(__dirname, { jsxAttributesIndent: false, useTabs: false }, ["typescript"]);
run_spec(__dirname, { jsxAttributesIndent: true, useTabs: true }, ["typescript"]);
run_spec(__dirname, { jsxAttributesIndent: false, useTabs: true }, ["typescript"]);
