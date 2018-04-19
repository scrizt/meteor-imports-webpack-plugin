module.exports = function (source) {
  let output = '';

  const config = this.query.config;
  const packages = this.query.packages;

  const clientConfig = config;
  const jsonConfig = JSON.stringify(clientConfig);

  if (config.injectMeteorRuntimeConfig !== false)
    output += 'var config = window.__meteor_runtime_config__ = ' + jsonConfig + ';\n';
  if (!config.DDP_DEFAULT_CONNECTION_URL) {
    const port = config.DDP_DEFAULT_CONNECTION_PORT || 3000;
    output += 'config.DDP_DEFAULT_CONNECTION_URL = window.location.protocol + "\//" + window.location.hostname + ":" + "' + port + '";\n';
  }
  if (!config.ROOT_URL) {
    output += 'config.ROOT_URL = window.location.protocol + "\//" + window.location.host;\n';
  }

  // Require all packages
  for (let pkg of packages) {
    if (pkg.name === 'global-imports' && !config.globalImports)
      continue;
    output += 'require("meteor/' + pkg.name + '");\n';
  }

  return output;
};
